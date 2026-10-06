-- Corrige etiquetas quando o checkout salva a data estruturada no snapshot
-- em vez de delivery_address. A função é reexecutável e preserva etiquetas humanas.
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

revoke all on function public.ops2_attendance_refresh_delivery_day_labels_v1(uuid) from public,anon,authenticated;
grant execute on function public.ops2_attendance_refresh_delivery_day_labels_v1(uuid) to service_role;

drop trigger if exists trg_attendance_delivery_day_labels_v1 on public.orders;
create trigger trg_attendance_delivery_day_labels_v1
after insert or update of conversation_id,status,delivery_address,checkout_snapshot or delete
on public.orders
for each row execute function public.ops2_attendance_orders_refresh_delivery_labels_trigger_v1();

-- Recalcula projeções existentes para pedidos ainda ativos e agendados.
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
