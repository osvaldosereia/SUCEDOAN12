-- Short public order identity.
-- Customer-facing code format: [A-Z][A-Z][0-9]{3} (two letters + three numbers).
-- The canonical order UUID/order_number remain internal and unchanged.

create sequence if not exists public.order_public_code_seq_v1
  as bigint
  minvalue 0
  maxvalue 675999
  start with 0
  increment by 1
  no cycle;

create or replace function public.ops2_format_order_public_code_v1(p_value bigint)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select chr(65 + (((p_value / 1000) / 26) % 26)::int)
      || chr(65 + ((p_value / 1000) % 26)::int)
      || lpad((p_value % 1000)::text, 3, '0')
$$;

alter table public.order_public_snapshots_v1
  add column if not exists public_token text,
  add column if not exists public_code text;

update public.order_public_snapshots_v1
set public_token = substr(md5(order_id::text || ':' || gen_random_uuid()::text), 1, 16)
where public_token is null or btrim(public_token) = '';

with ranked as (
  select order_id, row_number() over(order by created_at, order_id) - 1 as n
  from public.order_public_snapshots_v1
  where public_code is null or btrim(public_code) = ''
)
update public.order_public_snapshots_v1 s
set public_code = public.ops2_format_order_public_code_v1(r.n)
from ranked r
where r.order_id = s.order_id;

select setval(
  'public.order_public_code_seq_v1',
  (select count(*)::bigint from public.order_public_snapshots_v1),
  false
);

alter table public.order_public_snapshots_v1
  alter column public_token set default substr(md5(gen_random_uuid()::text || ':' || clock_timestamp()::text || ':' || random()::text), 1, 16),
  alter column public_code set default public.ops2_format_order_public_code_v1(nextval('public.order_public_code_seq_v1'));

alter table public.order_public_snapshots_v1
  alter column public_token set not null,
  alter column public_code set not null;

create unique index if not exists order_public_snapshots_v1_public_token_uidx
  on public.order_public_snapshots_v1(public_token);
create unique index if not exists order_public_snapshots_v1_public_code_uidx
  on public.order_public_snapshots_v1(public_code);

DO $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_public_snapshots_v1_public_code_format_chk'
  ) then
    alter table public.order_public_snapshots_v1
      add constraint order_public_snapshots_v1_public_code_format_chk
      check (public_code ~ '^[A-Z]{2}[0-9]{3}$');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'order_public_snapshots_v1_public_token_format_chk'
  ) then
    alter table public.order_public_snapshots_v1
      add constraint order_public_snapshots_v1_public_token_format_chk
      check (public_token ~ '^[a-f0-9]{16}$');
  end if;
end
$$;

create or replace function public.ops2_order_public_link_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.order_public_snapshots_v1%rowtype;
begin
  select * into v_row
  from public.order_public_snapshots_v1
  where order_id = p_order_id;

  if not found then
    perform public.ops2_refresh_order_public_snapshot_v1(p_order_id);
    select * into v_row
    from public.order_public_snapshots_v1
    where order_id = p_order_id;
  end if;

  if not found then return null; end if;

  return jsonb_build_object(
    'order_id', v_row.order_id,
    'public_token', v_row.public_token,
    'public_code', v_row.public_code,
    'public_url', 'https://donaantonia.com.br/p/?k=' || v_row.public_token
  );
end;
$$;

revoke all on function public.ops2_order_public_link_v1(uuid) from public, anon, authenticated;
grant execute on function public.ops2_order_public_link_v1(uuid) to service_role;
