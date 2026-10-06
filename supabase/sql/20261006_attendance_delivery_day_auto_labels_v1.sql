-- Etiquetas de dia da entrega geradas pela data estruturada do pedido.
-- A tabela existente continua sendo a projeção consultada pelo Admin; origens humana e automática são mantidas separadas.

create table if not exists public.attendance_conversation_manual_labels_v1 (
  conversation_id uuid not null,
  label_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (conversation_id,label_id),
  constraint attendance_conversation_manual_labels_v1_conversation_fk
    foreign key (conversation_id) references public.conversations(id) on delete cascade,
  constraint attendance_conversation_manual_labels_v1_label_fk
    foreign key (label_id) references public.attendance_labels_v1(id) on delete cascade
);

create table if not exists public.attendance_conversation_auto_labels_v1 (
  conversation_id uuid not null,
  label_id uuid not null,
  source_kind text not null,
  source_ref uuid not null,
  created_at timestamptz not null default now(),
  primary key (conversation_id,label_id,source_kind,source_ref),
  constraint attendance_conversation_auto_labels_v1_source_check
    check (source_kind = 'delivery_schedule'),
  constraint attendance_conversation_auto_labels_v1_conversation_fk
    foreign key (conversation_id) references public.conversations(id) on delete cascade,
  constraint attendance_conversation_auto_labels_v1_label_fk
    foreign key (label_id) references public.attendance_labels_v1(id) on delete cascade
);
create index if not exists attendance_conversation_auto_labels_v1_conversation_idx
  on public.attendance_conversation_auto_labels_v1(conversation_id,label_id);

alter table public.attendance_conversation_manual_labels_v1 enable row level security;
alter table public.attendance_conversation_auto_labels_v1 enable row level security;
revoke all on table public.attendance_conversation_manual_labels_v1 from public,anon,authenticated;
revoke all on table public.attendance_conversation_auto_labels_v1 from public,anon,authenticated;
grant all on table public.attendance_conversation_manual_labels_v1 to service_role;
grant all on table public.attendance_conversation_auto_labels_v1 to service_role;

-- As etiquetas existentes pertencem à equipe; o backfill protege essa origem ao habilitar automação.
insert into public.attendance_conversation_manual_labels_v1(conversation_id,label_id)
select conversation_id,label_id
from public.attendance_conversation_labels_v1
on conflict (conversation_id,label_id) do nothing;

-- Completa o conjunto semanal. Os três nomes já existentes são preservados.
insert into public.attendance_labels_v1(name,color,sort_order,is_active)
select v.name,v.color,v.sort_order,true
from (values
  ('Segunda','#0dd3c6',300),
  ('Terça','#3f89e4',301),
  ('Quarta','#9c3589',302),
  ('Quinta','#e78b2f',303),
  ('Sexta','#327b64',304),
  ('Sábado','#c34d82',305),
  ('Domingo','#7652a8',306)
) as v(name,color,sort_order)
where not exists (
  select 1 from public.attendance_labels_v1 l
  where lower(btrim(l.name))=lower(btrim(v.name)) and l.is_active=true
);

update public.attendance_labels_v1 l
set color=v.color,sort_order=v.sort_order,updated_at=now()
from (values
  ('Segunda','#0dd3c6',300),
  ('Terça','#3f89e4',301),
  ('Quarta','#9c3589',302),
  ('Quinta','#e78b2f',303),
  ('Sexta','#327b64',304),
  ('Sábado','#c34d82',305),
  ('Domingo','#7652a8',306)
) as v(name,color,sort_order)
where lower(btrim(l.name))=lower(btrim(v.name)) and l.is_active=true;

create or replace function public.ops2_attendance_delivery_date_v1(p_value text)
returns date
language plpgsql
immutable
security definer
set search_path to ''
as $$
declare
  v_date date;
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  begin
    v_date:=p_value::date;
  exception when others then
    return null;
  end;
  return v_date;
end;
$$;

create or replace function public.ops2_attendance_refresh_delivery_day_labels_v1(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_created integer:=0;
  v_removed integer:=0;
begin
  if p_conversation_id is null or not exists (
    select 1 from public.conversations c where c.id=p_conversation_id
  ) then
    return jsonb_build_object('ok',false,'error','conversation_not_found');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,6801));

  delete from public.attendance_conversation_auto_labels_v1 a
  where a.conversation_id=p_conversation_id and a.source_kind='delivery_schedule';
  get diagnostics v_removed = row_count;

  insert into public.attendance_conversation_auto_labels_v1(conversation_id,label_id,source_kind,source_ref)
  select distinct o.conversation_id,l.id,'delivery_schedule',o.id
  from public.orders o
  cross join lateral (
    select public.ops2_attendance_delivery_date_v1(
      coalesce(
        nullif(btrim(o.delivery_address->>'delivery_date'),''),
        nullif(btrim(o.checkout_snapshot->'delivery'->>'date'),'')
      )
    ) as delivery_date
  ) d
  cross join lateral (
    select case extract(isodow from d.delivery_date)::integer
      when 1 then 'Segunda'
      when 2 then 'Terça'
      when 3 then 'Quarta'
      when 4 then 'Quinta'
      when 5 then 'Sexta'
      when 6 then 'Sábado'
      when 7 then 'Domingo'
    end as label_name
  ) w
  join public.attendance_labels_v1 l
    on lower(btrim(l.name))=lower(btrim(w.label_name)) and l.is_active=true
  where o.conversation_id=p_conversation_id
    and o.status in ('storefront_received','confirmed','processing','ready')
    and d.delivery_date >= (now() at time zone 'America/Cuiaba')::date
  on conflict (conversation_id,label_id,source_kind,source_ref) do nothing;
  get diagnostics v_created = row_count;

  delete from public.attendance_conversation_labels_v1 current_label
  where current_label.conversation_id=p_conversation_id
    and not exists (
      select 1 from public.attendance_conversation_manual_labels_v1 manual_label
      where manual_label.conversation_id=current_label.conversation_id
        and manual_label.label_id=current_label.label_id
    )
    and not exists (
      select 1 from public.attendance_conversation_auto_labels_v1 auto_label
      where auto_label.conversation_id=current_label.conversation_id
        and auto_label.label_id=current_label.label_id
    );

  insert into public.attendance_conversation_labels_v1(conversation_id,label_id)
  select p_conversation_id,owned.label_id
  from (
    select label_id from public.attendance_conversation_manual_labels_v1
    where conversation_id=p_conversation_id
    union
    select label_id from public.attendance_conversation_auto_labels_v1
    where conversation_id=p_conversation_id
  ) owned
  on conflict (conversation_id,label_id) do nothing;

  return jsonb_build_object('ok',true,'conversation_id',p_conversation_id,'automatic_sources',v_created,'stale_sources_removed',v_removed);
end;
$$;

create or replace function public.ops2_admin_attendance_set_labels_v1(
  p_conversation_id uuid,
  p_label_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ids uuid[]:=coalesce(p_label_ids,'{}'::uuid[]);
  v_old_manual_ids uuid[]:='{}'::uuid[];
  v_distinct integer;
  v_valid integer;
  v_labels jsonb;
begin
  if p_conversation_id is null or not exists(select 1 from public.conversations c where c.id=p_conversation_id) then
    return jsonb_build_object('ok',false,'error','conversation_not_found');
  end if;
  if coalesce(array_length(v_ids,1),0)>20 then
    return jsonb_build_object('ok',false,'error','too_many_labels');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_conversation_id::text,6801));

  select count(distinct x)::integer into v_distinct from unnest(v_ids) x;
  select count(*)::integer into v_valid
  from public.attendance_labels_v1 l
  where l.id=any(v_ids) and l.is_active=true;
  if coalesce(v_distinct,0)<>coalesce(v_valid,0) then
    return jsonb_build_object('ok',false,'error','invalid_or_inactive_label');
  end if;

  select coalesce(array_agg(label_id),'{}'::uuid[]) into v_old_manual_ids
  from public.attendance_conversation_manual_labels_v1
  where conversation_id=p_conversation_id;

  delete from public.attendance_conversation_manual_labels_v1
  where conversation_id=p_conversation_id;
  insert into public.attendance_conversation_manual_labels_v1(conversation_id,label_id)
  select p_conversation_id,x
  from (select distinct unnest(v_ids) as x) selected
  where x is not null
    and (
      not exists (
        select 1 from public.attendance_conversation_auto_labels_v1 automatic_label
        where automatic_label.conversation_id=p_conversation_id
          and automatic_label.label_id=x
      )
      or x=any(v_old_manual_ids)
    )
  on conflict (conversation_id,label_id) do nothing;

  delete from public.attendance_conversation_labels_v1 current_label
  where current_label.conversation_id=p_conversation_id
    and not exists (
      select 1 from public.attendance_conversation_manual_labels_v1 manual_label
      where manual_label.conversation_id=current_label.conversation_id
        and manual_label.label_id=current_label.label_id
    )
    and not exists (
      select 1 from public.attendance_conversation_auto_labels_v1 automatic_label
      where automatic_label.conversation_id=current_label.conversation_id
        and automatic_label.label_id=current_label.label_id
    );

  insert into public.attendance_conversation_labels_v1(conversation_id,label_id)
  select p_conversation_id,owned.label_id
  from (
    select label_id from public.attendance_conversation_manual_labels_v1 where conversation_id=p_conversation_id
    union
    select label_id from public.attendance_conversation_auto_labels_v1 where conversation_id=p_conversation_id
  ) owned
  on conflict (conversation_id,label_id) do nothing;

  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'color',l.color,'sort_order',l.sort_order) order by l.sort_order,l.name),'[]'::jsonb)
  into v_labels
  from public.attendance_conversation_labels_v1 cl
  join public.attendance_labels_v1 l on l.id=cl.label_id
  where cl.conversation_id=p_conversation_id and l.is_active=true;

  return jsonb_build_object('ok',true,'conversation_id',p_conversation_id,'labels',v_labels);
end;
$$;

create or replace function public.ops2_attendance_orders_refresh_delivery_labels_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op='INSERT' then
    if new.conversation_id is not null then
      perform public.ops2_attendance_refresh_delivery_day_labels_v1(new.conversation_id);
    end if;
    return new;
  elsif tg_op='DELETE' then
    if old.conversation_id is not null then
      perform public.ops2_attendance_refresh_delivery_day_labels_v1(old.conversation_id);
    end if;
    return old;
  end if;

  if old.conversation_id is distinct from new.conversation_id and old.conversation_id is not null then
    perform public.ops2_attendance_refresh_delivery_day_labels_v1(old.conversation_id);
  end if;
  if new.conversation_id is not null then
    perform public.ops2_attendance_refresh_delivery_day_labels_v1(new.conversation_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_attendance_delivery_day_labels_v1 on public.orders;
create trigger trg_attendance_delivery_day_labels_v1
after insert or update of conversation_id,status,delivery_address,checkout_snapshot or delete
on public.orders
for each row execute function public.ops2_attendance_orders_refresh_delivery_labels_trigger_v1();

-- Atualiza a projeção para todas as conversas ligadas a pedidos atuais.
do $$
declare
  v_conversation_id uuid;
begin
  for v_conversation_id in
    select distinct o.conversation_id from public.orders o where o.conversation_id is not null
  loop
    perform public.ops2_attendance_refresh_delivery_day_labels_v1(v_conversation_id);
  end loop;
end;
$$;

revoke all on function public.ops2_attendance_delivery_date_v1(text) from public,anon,authenticated;
revoke all on function public.ops2_attendance_refresh_delivery_day_labels_v1(uuid) from public,anon,authenticated;
revoke all on function public.ops2_attendance_orders_refresh_delivery_labels_trigger_v1() from public,anon,authenticated;
revoke all on function public.ops2_admin_attendance_set_labels_v1(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.ops2_attendance_delivery_date_v1(text) to service_role;
grant execute on function public.ops2_attendance_refresh_delivery_day_labels_v1(uuid) to service_role;
grant execute on function public.ops2_attendance_orders_refresh_delivery_labels_trigger_v1() to service_role;
grant execute on function public.ops2_admin_attendance_set_labels_v1(uuid,uuid[]) to service_role;
