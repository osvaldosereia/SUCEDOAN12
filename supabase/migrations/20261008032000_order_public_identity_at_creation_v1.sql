-- New orders receive one public identity at INSERT; legacy codes are preserved.
create sequence if not exists public.order_public_code_4d_seq_v1
  as bigint minvalue 1000 maxvalue 9999 start with 1000 increment by 1 no cycle;

create or replace function public.ops2_next_order_public_code_4d_v1()
returns text language plpgsql volatile set search_path = public, pg_temp as $$
declare v_number bigint; v_code text;
begin
  loop
    begin
      v_number := nextval('public.order_public_code_4d_seq_v1');
    exception when sqlstate '2200H' then
      raise exception 'order_public_code_space_exhausted';
    end;
    v_code := lpad(v_number::text,4,'0');
    exit when not exists (select 1 from public.order_public_snapshots_v1 where public_code=v_code);
  end loop;
  return v_code;
end $$;
revoke all on function public.ops2_next_order_public_code_4d_v1() from public, anon, authenticated;
grant execute on function public.ops2_next_order_public_code_4d_v1() to service_role;
grant usage on sequence public.order_public_code_4d_seq_v1 to service_role;

alter table public.order_public_snapshots_v1
  drop constraint if exists order_public_snapshots_v1_public_code_format_chk;
alter table public.order_public_snapshots_v1
  add constraint order_public_snapshots_v1_public_code_format_chk
  check (public_code ~ '^[A-Z]{2}[0-9]{3}$' or public_code ~ '^[0-9]{4}$');

-- Do not put nextval() in a snapshot INSERT default: ON CONFLICT refresh
-- evaluates INSERT defaults even when it only updates the existing row.
alter table public.order_public_snapshots_v1
  alter column public_code drop default;
-- BEFORE INSERT resolves the existing identity for refreshes, or allocates
-- a new identity if the order does not yet have a public snapshot.
create or replace function public.ops2_resolve_snapshot_public_identity_v1()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_existing text;
begin
  -- Serialize simultaneous first snapshot writes for the same order UUID.
  perform pg_advisory_xact_lock(hashtextextended(new.order_id::text, 0));
  select s.public_code into v_existing
  from public.order_public_snapshots_v1 s where s.order_id=new.order_id;
  if v_existing is not null then
    new.public_code := v_existing;
  elsif new.public_code is null then
    new.public_code := public.ops2_next_order_public_code_4d_v1();
  end if;
  return new;
end $$;
revoke all on function public.ops2_resolve_snapshot_public_identity_v1() from public,anon,authenticated;
grant execute on function public.ops2_resolve_snapshot_public_identity_v1() to service_role;
drop trigger if exists trg_ops2_resolve_snapshot_public_identity_v1 on public.order_public_snapshots_v1;
create trigger trg_ops2_resolve_snapshot_public_identity_v1
before insert on public.order_public_snapshots_v1 for each row
execute function public.ops2_resolve_snapshot_public_identity_v1();

create or replace function public.ops2_assign_order_public_identity_v1()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  insert into public.order_public_snapshots_v1(order_id,snapshot,public_code)
  values(new.id,'{}'::jsonb,default)
  on conflict(order_id) do nothing;
  return new;
end $$;
revoke all on function public.ops2_assign_order_public_identity_v1() from public,anon,authenticated;
grant execute on function public.ops2_assign_order_public_identity_v1() to service_role;

drop trigger if exists trg_ops2_assign_order_public_identity_v1 on public.orders;
create trigger trg_ops2_assign_order_public_identity_v1
after insert on public.orders for each row
execute function public.ops2_assign_order_public_identity_v1();

create or replace function public.ops2_guard_order_public_identity_v1()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' and
     (new.public_code is distinct from old.public_code or
      new.order_id is distinct from old.order_id) then
    raise exception 'order_public_identity_immutable';
  end if;
  return new;
end $$;
revoke all on function public.ops2_guard_order_public_identity_v1() from public,anon,authenticated;

drop trigger if exists trg_ops2_guard_order_public_identity_v1 on public.order_public_snapshots_v1;
create trigger trg_ops2_guard_order_public_identity_v1
before update on public.order_public_snapshots_v1 for each row
execute function public.ops2_guard_order_public_identity_v1();

comment on column public.order_public_snapshots_v1.public_code is
  'Public order identity allocated once at order creation. Historical AA000 codes are unchanged.';
