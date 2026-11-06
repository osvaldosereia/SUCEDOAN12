begin;

create or replace function public.smart_delivery_admin_release_stop_v1(
  p_stop_id uuid,
  p_service_date date default null,
  p_operator_label text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_run_id uuid;
  v_run public.ops_delivery_runs%rowtype;
  v_stop public.ops_delivery_stops%rowtype;
  v_order public.orders%rowtype;
  v_today date := (now() at time zone 'America/Cuiaba')::date;
  v_operator text := nullif(left(trim(coalesce(p_operator_label, '')), 80), '');
  v_released boolean := false;
begin
  if p_stop_id is null then raise exception 'invalid_stop'; end if;
  if p_service_date is not null then
    if p_service_date < v_today then raise exception 'delivery_date_in_past'; end if;
    if extract(dow from p_service_date) = 0 then raise exception 'delivery_not_available_sunday'; end if;
  end if;

  select s.run_id into v_run_id
    from public.ops_delivery_stops s
   where s.id = p_stop_id;
  if not found then raise exception 'stop_not_found'; end if;

  select * into v_run
    from public.ops_delivery_runs r
   where r.id = v_run_id
   for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status <> 'planned'
     or v_run.loading_started_at is not null
     or v_run.loaded_at is not null then
    raise exception 'route_locked';
  end if;

  select * into v_stop
    from public.ops_delivery_stops s
   where s.id = p_stop_id and s.run_id = v_run.id
   for update;
  if not found then raise exception 'stop_not_found'; end if;
  if v_stop.status <> 'planned'
     or v_stop.loaded_at is not null
     or v_stop.custody_confirmed_at is not null then
    raise exception 'stop_not_planned';
  end if;

  select * into v_order
    from public.orders o
   where o.id = v_stop.order_id
   for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status <> 'ready' then raise exception 'order_not_ready'; end if;

  if p_service_date is not null and p_service_date = v_run.service_date then
    return jsonb_build_object(
      'ok', true, 'stop_id', v_stop.id, 'order_id', v_order.id,
      'service_date', p_service_date, 'released_from_route', false, 'unchanged', true
    );
  end if;

  if p_service_date is not null then
    update public.orders o
       set checkout_snapshot = jsonb_set(
             coalesce(o.checkout_snapshot, '{}'::jsonb),
             '{delivery}',
             case when jsonb_typeof(o.checkout_snapshot->'delivery') = 'object'
               then (o.checkout_snapshot->'delivery') || jsonb_build_object('date', p_service_date::text)
               else jsonb_build_object('date', p_service_date::text)
             end,
             true
           ),
           updated_at = now()
     where o.id = v_order.id;
    perform public.ops2_refresh_order_public_snapshot_v1(v_order.id);
  end if;

  update public.ops_delivery_stops
     set status = 'cancelled', updated_at = now()
   where id = v_stop.id;

  update public.ops_delivery_runs r
     set status = 'cancelled', updated_at = now()
   where r.id = v_run.id
     and not exists (
       select 1 from public.ops_delivery_stops s
        where s.run_id = r.id and s.status in ('planned', 'out_for_delivery')
     );

  v_released := true;
  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, details)
  values(
    null,
    case when p_service_date is null then 'delivery.stop_cancelled' else 'delivery.stop_rescheduled' end,
    'order', v_order.id::text,
    jsonb_build_object(
      'stop_id', v_stop.id,
      'run_id', v_run.id,
      'previous_service_date', v_run.service_date,
      'service_date', coalesce(p_service_date, v_run.service_date),
      'operator', coalesce(v_operator, 'Admin')
    )
  );

  return jsonb_build_object(
    'ok', true, 'stop_id', v_stop.id, 'order_id', v_order.id,
    'service_date', coalesce(p_service_date, v_run.service_date),
    'released_from_route', v_released
  );
end;
$function$;

create or replace function public.smart_delivery_admin_reassign_stop_v1(
  p_stop_id uuid,
  p_new_driver_id uuid,
  p_operator_label text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_run_id uuid;
  v_source public.ops_delivery_runs%rowtype;
  v_target public.ops_delivery_runs%rowtype;
  v_stop public.ops_delivery_stops%rowtype;
  v_order public.orders%rowtype;
  v_driver public.delivery_drivers_v1%rowtype;
  v_source_key text;
  v_target_key text;
  v_lock_key text;
  v_next_sequence integer;
  v_target_count integer;
  v_operator text := nullif(left(trim(coalesce(p_operator_label, '')), 80), '');
begin
  if p_stop_id is null or p_new_driver_id is null then raise exception 'invalid_stop_or_driver'; end if;
  select s.run_id into v_run_id from public.ops_delivery_stops s where s.id = p_stop_id;
  if not found then raise exception 'stop_not_found'; end if;
  select * into v_source from public.ops_delivery_runs r where r.id = v_run_id;
  if not found then raise exception 'run_not_found'; end if;
  if v_source.driver_id is null then raise exception 'route_driver_missing'; end if;
  if v_source.driver_id = p_new_driver_id then raise exception 'driver_same_as_current'; end if;

  v_source_key := 'driver_' || lower(v_source.driver_id::text);
  v_target_key := 'driver_' || lower(p_new_driver_id::text);
  for v_lock_key in
    select key_value from unnest(array[v_source_key, v_target_key]) as keys(key_value) order by key_value
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('ops_delivery_run:' || v_source.service_date::text || ':' || v_lock_key, 0)
    );
  end loop;

  select * into v_source
    from public.ops_delivery_runs r
   where r.id = v_run_id
   for update;
  if not found or v_source.status <> 'planned'
     or v_source.loading_started_at is not null
     or v_source.loaded_at is not null then
    raise exception 'route_locked';
  end if;

  select * into v_stop
    from public.ops_delivery_stops s
   where s.id = p_stop_id and s.run_id = v_source.id
   for update;
  if not found then raise exception 'stop_not_found'; end if;
  if v_stop.status <> 'planned'
     or v_stop.loaded_at is not null
     or v_stop.custody_confirmed_at is not null then
    raise exception 'stop_not_planned';
  end if;

  select * into v_order from public.orders o where o.id = v_stop.order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status <> 'ready' then raise exception 'order_not_ready'; end if;

  select * into v_driver
    from public.delivery_drivers_v1 d
   where d.id = p_new_driver_id
   for update;
  if not found or not v_driver.is_active or nullif(trim(coalesce(v_driver.phone_e164, '')), '') is null then
    raise exception 'driver_not_active';
  end if;

  if exists (
    select 1 from public.ops_delivery_runs r
     where r.service_date = v_source.service_date
       and r.driver_id = p_new_driver_id
       and r.status = 'dispatched'
  ) then
    raise exception 'driver_already_dispatched';
  end if;

  select * into v_target
    from public.ops_delivery_runs r
   where r.service_date = v_source.service_date
     and r.driver_id = p_new_driver_id
     and r.status = 'planned'
   order by r.created_at desc
   limit 1
   for update;

  if found and (v_target.loading_started_at is not null or v_target.loaded_at is not null or exists (
    select 1 from public.ops_delivery_stops s
     where s.run_id = v_target.id and (s.loaded_at is not null or s.custody_confirmed_at is not null)
  )) then
    raise exception 'target_driver_route_locked';
  end if;

  select count(*) into v_target_count
    from public.ops_delivery_stops s
   where s.run_id = v_target.id and s.status <> 'cancelled';
  if v_target_count >= 30 then raise exception 'route_too_many_orders'; end if;

  if v_target.id is null then
    insert into public.ops_delivery_runs(
      service_date, vehicle_key, status, operator_label, region_id, driver_id
    ) values (
      v_source.service_date, v_target_key, 'planned', coalesce(v_operator, 'Admin'),
      coalesce(v_stop.region_id, v_driver.home_region_id), p_new_driver_id
    ) returning * into v_target;
  elsif v_target.region_id is null then
    update public.ops_delivery_runs
       set region_id = coalesce(v_stop.region_id, v_driver.home_region_id), updated_at = now()
     where id = v_target.id
     returning * into v_target;
  end if;

  select coalesce(max(s.sequence), 0) + 1 into v_next_sequence
    from public.ops_delivery_stops s where s.run_id = v_target.id;
  update public.ops_delivery_stops
     set run_id = v_target.id,
         sequence = v_next_sequence,
         region_id = coalesce(v_target.region_id, v_stop.region_id, v_driver.home_region_id),
         updated_at = now()
   where id = v_stop.id;

  update public.ops_delivery_runs r
     set status = 'cancelled', updated_at = now()
   where r.id = v_source.id
     and not exists (
       select 1 from public.ops_delivery_stops s
        where s.run_id = r.id and s.status in ('planned', 'out_for_delivery')
     );

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, details)
  values(null, 'delivery.stop_reassigned', 'order', v_order.id::text,
    jsonb_build_object(
      'stop_id', v_stop.id,
      'source_run_id', v_source.id,
      'target_run_id', v_target.id,
      'source_driver_id', v_source.driver_id,
      'target_driver_id', p_new_driver_id,
      'service_date', v_source.service_date,
      'operator', coalesce(v_operator, 'Admin')
    ));

  return jsonb_build_object(
    'ok', true, 'stop_id', v_stop.id, 'order_id', v_order.id,
    'source_run_id', v_source.id, 'run_id', v_target.id,
    'driver_id', p_new_driver_id, 'service_date', v_source.service_date
  );
end;
$function$;

revoke all on function public.smart_delivery_admin_release_stop_v1(uuid, date, text) from public, anon, authenticated;
revoke all on function public.smart_delivery_admin_reassign_stop_v1(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.smart_delivery_admin_release_stop_v1(uuid, date, text) to service_role;
grant execute on function public.smart_delivery_admin_reassign_stop_v1(uuid, uuid, text) to service_role;

commit;
