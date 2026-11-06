-- Simplifica a distribuição e o acompanhamento das entregas no Admin.
-- A atribuição cria a rota direto; a primeira ação de entrega inicia a rota sem conferência de carga.

create or replace function public.smart_delivery_admin_dispatch_run_v1(
  p_run_id uuid,
  p_operator_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, public
as $function$
declare
  v_run public.ops_delivery_runs%rowtype;
  v_stop public.ops_delivery_stops%rowtype;
  v_started integer := 0;
  v_operator text := coalesce(nullif(left(trim(coalesce(p_operator_label, '')), 80), ''), 'Admin');
begin
  if p_run_id is null then raise exception 'invalid_run'; end if;
  select * into v_run from public.ops_delivery_runs where id = p_run_id for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status = 'dispatched' then
    return jsonb_build_object('ok', true, 'run_id', p_run_id, 'status', 'dispatched', 'already_dispatched', true);
  end if;
  if v_run.status <> 'planned' or v_run.driver_id is null then
    raise exception 'run_not_ready_for_dispatch';
  end if;
  if v_run.service_date <> (now() at time zone 'America/Cuiaba')::date then
    raise exception 'delivery_not_due';
  end if;

  for v_stop in
    select * from public.ops_delivery_stops
    where run_id = p_run_id and status = 'planned'
    order by sequence
    for update
  loop
    perform public.ops4_start_dispatch_v1(
      v_stop.order_id,
      v_operator,
      'dispatch-v4:' || v_stop.order_id::text
    );
    perform public.ops_sync_delivery_stop_v1(v_stop.order_id, 'out_for_delivery');
    v_started := v_started + 1;
  end loop;

  if v_started = 0 then raise exception 'run_has_no_pending_stops'; end if;
  update public.ops_delivery_runs
     set status = 'dispatched',
         dispatched_at = coalesce(dispatched_at, now()),
         updated_at = now()
   where id = p_run_id;

  return jsonb_build_object(
    'ok', true, 'run_id', p_run_id, 'status', 'dispatched', 'order_count', v_started
  );
end;
$function$;

create or replace function public.smart_delivery_admin_assign_order_v1(
  p_order_id uuid,
  p_driver_id uuid,
  p_operator_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, public
as $function$
declare
  v_order public.orders%rowtype;
  v_driver public.delivery_drivers_v1%rowtype;
  v_run public.ops_delivery_runs%rowtype;
  v_existing_run public.ops_delivery_runs%rowtype;
  v_stop public.ops_delivery_stops%rowtype;
  v_today date := (now() at time zone 'America/Cuiaba')::date;
  v_service_date date;
  v_raw_date text;
  v_operator text := coalesce(nullif(left(trim(coalesce(p_operator_label, '')), 80), ''), 'Admin');
  v_sequence integer;
  v_count integer;
  v_status text := 'planned';
  v_name text;
begin
  if p_order_id is null or p_driver_id is null then raise exception 'invalid_order_or_driver'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.source not in ('vitrine', 'storefront_v2', 'manual_whatsapp', 'papoai', 'reorder') then
    raise exception 'order_not_found';
  end if;
  if v_order.status not in ('ready', 'out_for_delivery') then raise exception 'order_not_ready'; end if;

  v_raw_date := nullif(trim(v_order.checkout_snapshot #>> '{delivery,date}'), '');
  if v_raw_date is null then
    v_service_date := (v_order.created_at at time zone 'America/Cuiaba')::date;
  else
    if v_raw_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_delivery_date'; end if;
    begin
      v_service_date := v_raw_date::date;
    exception when others then
      raise exception 'invalid_delivery_date';
    end;
  end if;
  if v_service_date < v_today then raise exception 'delivery_date_in_past'; end if;
  if extract(dow from v_service_date) = 0 then raise exception 'delivery_not_available_sunday'; end if;

  select * into v_driver from public.delivery_drivers_v1 where id = p_driver_id for update;
  if not found or not v_driver.is_active then raise exception 'driver_not_active'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended('ops_delivery_run:' || v_service_date::text || ':driver_' || lower(p_driver_id::text), 0)
  );

  select s.* into v_stop
    from public.ops_delivery_stops s
   where s.order_id = p_order_id and s.status in ('planned', 'out_for_delivery')
   order by s.created_at desc
   limit 1
   for update;

  if found then
    select * into v_existing_run from public.ops_delivery_runs where id = v_stop.run_id for update;
    if not found then raise exception 'run_not_found'; end if;
    if v_existing_run.driver_id <> p_driver_id then raise exception 'order_already_assigned'; end if;
    if v_existing_run.service_date <> v_service_date then raise exception 'order_delivery_date_mismatch'; end if;
    if v_stop.status = 'out_for_delivery' then
      return jsonb_build_object(
        'ok', true, 'order_id', p_order_id, 'stop_id', v_stop.id, 'run_id', v_existing_run.id,
        'driver_id', p_driver_id, 'service_date', v_service_date, 'status', 'out_for_delivery', 'already_assigned', true
      );
    end if;
    if v_existing_run.status not in ('planned', 'dispatched') then raise exception 'order_already_assigned'; end if;
    if v_existing_run.status = 'dispatched' then
      perform public.ops4_start_dispatch_v1(
        p_order_id, v_operator, 'dispatch-v4:' || p_order_id::text
      );
      perform public.ops_sync_delivery_stop_v1(p_order_id, 'out_for_delivery');
      v_status := 'out_for_delivery';
    end if;
    return jsonb_build_object(
      'ok', true, 'order_id', p_order_id, 'stop_id', v_stop.id, 'run_id', v_existing_run.id,
      'driver_id', p_driver_id, 'service_date', v_service_date, 'status', v_status, 'already_assigned', true
    );
  end if;

  if v_order.status = 'out_for_delivery' then raise exception 'order_already_dispatched'; end if;

  select * into v_run
    from public.ops_delivery_runs r
   where r.service_date = v_service_date
     and r.driver_id = p_driver_id
     and r.status in ('planned', 'dispatched')
   order by case when r.status = 'dispatched' then 0 else 1 end, r.created_at desc
   limit 1
   for update;

  if not found then
    insert into public.ops_delivery_runs(
      service_date, vehicle_key, status, operator_label, region_id, driver_id
    ) values (
      v_service_date, 'driver_' || lower(p_driver_id::text), 'planned', v_operator,
      coalesce(v_order.delivery_region_id, v_driver.home_region_id), p_driver_id
    ) returning * into v_run;
  end if;

  select count(*) into v_count
    from public.ops_delivery_stops
   where run_id = v_run.id and status <> 'cancelled';
  if v_count >= 30 then raise exception 'route_too_many_orders'; end if;

  select coalesce(max(sequence), 0) + 1 into v_sequence
    from public.ops_delivery_stops where run_id = v_run.id;

  v_name := coalesce(
    nullif(trim(v_order.customer_snapshot->>'display_name'), ''),
    nullif(trim(v_order.customer_snapshot->>'name'), ''),
    nullif(trim(v_order.delivery_address->>'customer_name'), ''),
    nullif(trim(v_order.delivery_address->>'recipient_name'), ''),
    'Cliente'
  );

  insert into public.ops_delivery_stops(
    run_id, order_id, sequence, status, address_snapshot, phone_snapshot,
    customer_name_snapshot, order_number_snapshot, total_cents, payment_method_snapshot,
    maps_url_snapshot, customer_address_id, location_evidence_id, region_id
  ) values (
    v_run.id, p_order_id, v_sequence, 'planned', coalesce(v_order.delivery_address, '{}'::jsonb),
    v_order.phone_e164, v_name, v_order.order_number, round(coalesce(v_order.total, 0) * 100)::bigint,
    coalesce(v_order.delivery_paid_ahead_method, v_order.payment_method),
    nullif(trim(coalesce(v_order.delivery_address->>'google_maps_url', '')), ''),
    v_order.delivery_customer_address_id, v_order.delivery_location_evidence_id,
    coalesce(v_order.delivery_region_id, v_run.region_id, v_driver.home_region_id)
  ) returning * into v_stop;

  if v_run.status = 'dispatched' then
    perform public.ops4_start_dispatch_v1(
      p_order_id, v_operator, 'dispatch-v4:' || p_order_id::text
    );
    perform public.ops_sync_delivery_stop_v1(p_order_id, 'out_for_delivery');
    v_status := 'out_for_delivery';
  end if;

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, details)
  values (
    null, 'delivery.order_assigned', 'order', p_order_id::text,
    jsonb_build_object(
      'stop_id', v_stop.id, 'run_id', v_run.id, 'driver_id', p_driver_id,
      'service_date', v_service_date, 'operator', v_operator
    )
  );

  return jsonb_build_object(
    'ok', true, 'order_id', p_order_id, 'stop_id', v_stop.id, 'run_id', v_run.id,
    'driver_id', p_driver_id, 'service_date', v_service_date, 'status', v_status,
    'already_assigned', false
  );
end;
$function$;

create or replace function public.smart_delivery_admin_fail_stop_v1(
  p_stop_id uuid,
  p_operator_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, public
as $function$
declare
  v_stop public.ops_delivery_stops%rowtype;
  v_run public.ops_delivery_runs%rowtype;
  v_order public.orders%rowtype;
  v_case public.order_delivery_return_cases%rowtype;
  v_attempt integer;
  v_operator text := coalesce(nullif(left(trim(coalesce(p_operator_label, '')), 80), ''), 'Admin');
begin
  if p_stop_id is null then raise exception 'invalid_stop'; end if;
  select * into v_stop from public.ops_delivery_stops where id = p_stop_id for update;
  if not found then raise exception 'stop_not_found'; end if;
  select * into v_run from public.ops_delivery_runs where id = v_stop.run_id for update;
  if not found or v_run.status <> 'dispatched' then raise exception 'run_not_dispatched'; end if;
  select * into v_order from public.orders where id = v_stop.order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status <> 'out_for_delivery' then raise exception 'order_not_in_delivery'; end if;

  select * into v_case
    from public.order_delivery_return_cases
   where order_id = v_order.id and status in ('returning', 'returned_review')
   order by failed_at desc limit 1 for update;

  if v_stop.status = 'failed' and v_case.id is not null then
    return jsonb_build_object(
      'ok', true, 'stop_id', v_stop.id, 'order_id', v_order.id,
      'case_id', v_case.id, 'status', 'failed', 'already_failed', true
    );
  end if;
  if v_stop.status <> 'out_for_delivery' then raise exception 'stop_not_out_for_delivery'; end if;

  select coalesce(max(attempt_number), 0) + 1 into v_attempt
    from public.order_delivery_return_cases where order_id = v_order.id;
  insert into public.order_delivery_return_cases(
    order_id, attempt_number, reason_code, reason_label, note, status,
    recommended_disposition, failed_by, idempotency_key, metadata
  ) values (
    v_order.id, v_attempt, 'other', 'Não entregue', null, 'returning',
    'review', v_operator, 'delivery-return:' || v_order.id::text || ':' || v_attempt::text,
    jsonb_build_object('stock_already_consumed', true, 'return_stock_to_general_automatically', false)
  ) returning * into v_case;

  update public.ops_delivery_stops
     set status = 'failed', failed_at = coalesce(failed_at, now()),
         failure_reason = 'Não entregue', updated_at = now()
   where id = v_stop.id;

  perform public.ops_sync_delivery_stop_v1(v_order.id, 'out_for_delivery');
  perform public.ops_record_event_v1(
    'delivery', 'delivery.failed', 'Entrega não concluída.', 'human', 'order',
    v_order.id::text, v_order.id::text, null, v_operator, 'dona_antonia', 'warning',
    jsonb_build_object('case_id', v_case.id, 'attempt_number', v_attempt, 'reason_code', 'other'),
    null, 'delivery-failed:' || v_case.id::text, now()
  );

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, details)
  values(null, 'delivery.stop_not_delivered', 'order', v_order.id::text,
    jsonb_build_object('stop_id', v_stop.id, 'case_id', v_case.id, 'operator', v_operator));

  return jsonb_build_object(
    'ok', true, 'stop_id', v_stop.id, 'order_id', v_order.id,
    'case_id', v_case.id, 'attempt_number', v_attempt, 'status', 'failed'
  );
end;
$function$;

create or replace function public.smart_delivery_reorder_stops_v1(
  p_run_id uuid,
  p_stop_ids uuid[],
  p_actor_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, public
as $function$
declare
  v_run public.ops_delivery_runs%rowtype;
  v_active_status text;
  v_count integer;
  v_unique integer;
  v_changed integer;
  v_terminal_count integer;
begin
  select * into v_run from public.ops_delivery_runs where id = p_run_id for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status not in ('planned', 'dispatched') then raise exception 'route_locked'; end if;
  v_active_status := case when v_run.status = 'dispatched' then 'out_for_delivery' else 'planned' end;

  select count(*) into v_count
    from public.ops_delivery_stops
   where run_id = p_run_id and status = v_active_status;
  select count(distinct x) into v_unique from unnest(coalesce(p_stop_ids, '{}'::uuid[])) x;
  if v_count < 1 or coalesce(array_length(p_stop_ids, 1), 0) <> v_count or v_unique <> v_count then
    raise exception 'invalid_route_order';
  end if;
  if exists (
    select 1 from unnest(p_stop_ids) x
    left join public.ops_delivery_stops s on s.id = x and s.run_id = p_run_id and s.status = v_active_status
    where s.id is null
  ) then raise exception 'invalid_route_order'; end if;

  set constraints all deferred;
  with ordered as (
    select stop_id, ordinality::integer as sequence
      from unnest(p_stop_ids) with ordinality as x(stop_id, ordinality)
  )
  update public.ops_delivery_stops s
     set sequence = ordered.sequence, updated_at = now()
    from ordered
   where s.id = ordered.stop_id and s.run_id = p_run_id;
  get diagnostics v_changed = row_count;
  if v_changed <> v_count then raise exception 'invalid_route_order'; end if;

  select count(*) into v_terminal_count
    from public.ops_delivery_stops
   where run_id = p_run_id and status in ('delivered', 'failed', 'cancelled');
  with terminal as (
    select id, v_count + row_number() over (order by sequence, id)::integer as sequence
      from public.ops_delivery_stops
     where run_id = p_run_id and status in ('delivered', 'failed', 'cancelled')
  )
  update public.ops_delivery_stops s
     set sequence = terminal.sequence, updated_at = now()
    from terminal
   where s.id = terminal.id;

  update public.ops_delivery_runs
     set optimizer_provider = null, optimizer_job_ref = null, optimizer_payload = null, updated_at = now()
   where id = p_run_id;

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, details)
  values(null, 'smart_delivery.route_reordered', 'delivery_run', p_run_id::text,
    jsonb_build_object('actor', left(nullif(trim(coalesce(p_actor_label, '')), ''), 80), 'stop_ids', to_jsonb(p_stop_ids)));

  return jsonb_build_object('ok', true, 'run_id', p_run_id, 'stop_ids', to_jsonb(p_stop_ids),
    'terminal_stops', v_terminal_count);
end;
$function$;

create or replace function public.smart_delivery_guard_route_resequence_v1()
returns trigger
language plpgsql
set search_path to pg_catalog, public
as $function$
declare
  v_source public.ops_delivery_runs%rowtype;
  v_target public.ops_delivery_runs%rowtype;
begin
  if new.run_id is not distinct from old.run_id and new.sequence is not distinct from old.sequence then
    return new;
  end if;
  select * into v_source from public.ops_delivery_runs where id = old.run_id;

  if new.run_id is not distinct from old.run_id then
    if new.status is distinct from old.status then raise exception 'smart_delivery_route_locked_after_loading'; end if;
    if v_source.status = 'planned' and old.status in ('planned', 'delivered', 'failed', 'cancelled') then
      return new;
    end if;
    if v_source.status = 'dispatched' and old.status in ('out_for_delivery', 'delivered', 'failed', 'cancelled') then
      return new;
    end if;
    raise exception 'smart_delivery_route_locked_after_loading';
  end if;

  if v_source.status <> 'planned' or old.status <> 'planned' then
    raise exception 'smart_delivery_route_locked_after_loading';
  end if;
  select * into v_target from public.ops_delivery_runs where id = new.run_id;
  if not found or v_target.status <> 'planned' then raise exception 'smart_delivery_target_route_locked'; end if;
  return new;
end;
$function$;

create or replace function public.ops_sync_delivery_stop_v1(p_order_id uuid, p_order_status text)
returns integer
language plpgsql
security definer
set search_path to public
as $function$
declare
  v_status text;
  v_count integer;
begin
  v_status := case p_order_status
    when 'out_for_delivery' then 'out_for_delivery'
    when 'delivered' then 'delivered'
    when 'ready' then 'planned'
    when 'cancelled' then 'cancelled'
    else null
  end;
  if v_status is null then return 0; end if;

  update public.ops_delivery_stops s
     set status = v_status, updated_at = now()
   where s.order_id = p_order_id
     and s.status not in ('failed', 'cancelled', 'delivered')
     and exists (
       select 1 from public.ops_delivery_runs r
        where r.id = s.run_id and r.status in ('planned', 'dispatched')
     );
  get diagnostics v_count = row_count;

  if p_order_status = 'out_for_delivery' then
    update public.ops_delivery_runs r
       set status = 'dispatched',
           dispatched_at = coalesce(dispatched_at, now()),
           updated_at = now()
     where r.id in (
       select run_id from public.ops_delivery_stops
        where order_id = p_order_id and status = 'out_for_delivery'
     )
       and r.status = 'planned';
  end if;

  update public.ops_delivery_runs r
     set status = 'completed',
         completed_at = coalesce(completed_at, now()),
         updated_at = now()
   where r.status = 'dispatched'
     and not exists (
       select 1 from public.ops_delivery_stops s
        where s.run_id = r.id and s.status not in ('delivered', 'failed', 'cancelled')
     );

  return v_count;
end;
$function$;

-- Reassigning and rescheduling stops no longer depends on load-confirmation fields.
create or replace function public.smart_delivery_admin_reassign_stop_v1(
  p_stop_id uuid,
  p_new_driver_id uuid,
  p_operator_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, public
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
  select * into v_source from public.ops_delivery_runs where id = v_run_id;
  if not found then raise exception 'run_not_found'; end if;
  if v_source.driver_id is null then raise exception 'route_driver_missing'; end if;
  if v_source.driver_id = p_new_driver_id then raise exception 'driver_same_as_current'; end if;

  v_source_key := 'driver_' || lower(v_source.driver_id::text);
  v_target_key := 'driver_' || lower(p_new_driver_id::text);
  for v_lock_key in
    select key_value from unnest(array[v_source_key, v_target_key]) as keys(key_value) order by key_value
  loop
    perform pg_advisory_xact_lock(hashtextextended('ops_delivery_run:' || v_source.service_date::text || ':' || v_lock_key, 0));
  end loop;

  select * into v_source from public.ops_delivery_runs where id = v_run_id for update;
  if v_source.status <> 'planned' then raise exception 'route_locked'; end if;
  select * into v_stop from public.ops_delivery_stops where id = p_stop_id and run_id = v_source.id for update;
  if not found then raise exception 'stop_not_found'; end if;
  if v_stop.status <> 'planned' then raise exception 'stop_not_planned'; end if;
  select * into v_order from public.orders where id = v_stop.order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status <> 'ready' then raise exception 'order_not_ready'; end if;

  select * into v_driver from public.delivery_drivers_v1 where id = p_new_driver_id for update;
  if not found or not v_driver.is_active then raise exception 'driver_not_active'; end if;
  if exists (
    select 1 from public.ops_delivery_runs r
     where r.service_date = v_source.service_date and r.driver_id = p_new_driver_id and r.status = 'dispatched'
  ) then raise exception 'driver_already_dispatched'; end if;

  select * into v_target
    from public.ops_delivery_runs r
   where r.service_date = v_source.service_date and r.driver_id = p_new_driver_id and r.status = 'planned'
   order by r.created_at desc limit 1 for update;

  select count(*) into v_target_count
    from public.ops_delivery_stops s where s.run_id = v_target.id and s.status <> 'cancelled';
  if v_target_count >= 30 then raise exception 'route_too_many_orders'; end if;

  if v_target.id is null then
    insert into public.ops_delivery_runs(service_date, vehicle_key, status, operator_label, region_id, driver_id)
    values(v_source.service_date, v_target_key, 'planned', coalesce(v_operator, 'Admin'),
      coalesce(v_stop.region_id, v_driver.home_region_id), p_new_driver_id)
    returning * into v_target;
  elsif v_target.region_id is null then
    update public.ops_delivery_runs
       set region_id = coalesce(v_stop.region_id, v_driver.home_region_id), updated_at = now()
     where id = v_target.id returning * into v_target;
  end if;

  select coalesce(max(s.sequence), 0) + 1 into v_next_sequence
    from public.ops_delivery_stops s where s.run_id = v_target.id;
  update public.ops_delivery_stops
     set run_id = v_target.id, sequence = v_next_sequence,
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
    jsonb_build_object('stop_id', v_stop.id, 'source_run_id', v_source.id, 'target_run_id', v_target.id,
      'source_driver_id', v_source.driver_id, 'target_driver_id', p_new_driver_id,
      'service_date', v_source.service_date, 'operator', coalesce(v_operator, 'Admin')));

  return jsonb_build_object('ok', true, 'stop_id', v_stop.id, 'order_id', v_order.id,
    'source_run_id', v_source.id, 'run_id', v_target.id, 'driver_id', p_new_driver_id,
    'service_date', v_source.service_date);
end;
$function$;

create or replace function public.smart_delivery_admin_release_stop_v1(
  p_stop_id uuid,
  p_service_date date default null,
  p_operator_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, public
as $function$
declare
  v_run_id uuid;
  v_run public.ops_delivery_runs%rowtype;
  v_stop public.ops_delivery_stops%rowtype;
  v_order public.orders%rowtype;
  v_today date := (now() at time zone 'America/Cuiaba')::date;
  v_operator text := nullif(left(trim(coalesce(p_operator_label, '')), 80), '');
begin
  if p_stop_id is null then raise exception 'invalid_stop'; end if;
  if p_service_date is not null then
    if p_service_date < v_today then raise exception 'delivery_date_in_past'; end if;
    if extract(dow from p_service_date) = 0 then raise exception 'delivery_not_available_sunday'; end if;
  end if;

  select s.run_id into v_run_id from public.ops_delivery_stops s where s.id = p_stop_id;
  if not found then raise exception 'stop_not_found'; end if;
  select * into v_run from public.ops_delivery_runs where id = v_run_id for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status <> 'planned' then raise exception 'route_locked'; end if;
  select * into v_stop from public.ops_delivery_stops where id = p_stop_id and run_id = v_run.id for update;
  if not found then raise exception 'stop_not_found'; end if;
  if v_stop.status <> 'planned' then raise exception 'stop_not_planned'; end if;
  select * into v_order from public.orders where id = v_stop.order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status <> 'ready' then raise exception 'order_not_ready'; end if;
  if p_service_date is not null and p_service_date = v_run.service_date then
    return jsonb_build_object('ok', true, 'stop_id', v_stop.id, 'order_id', v_order.id,
      'service_date', p_service_date, 'released_from_route', false, 'unchanged', true);
  end if;

  if p_service_date is not null then
    update public.orders
       set checkout_snapshot = jsonb_set(
         coalesce(checkout_snapshot, '{}'::jsonb), '{delivery}',
         case when jsonb_typeof(checkout_snapshot->'delivery') = 'object'
           then (checkout_snapshot->'delivery') || jsonb_build_object('date', p_service_date::text)
           else jsonb_build_object('date', p_service_date::text)
         end, true
       ),
       updated_at = now()
     where id = v_order.id;
    perform public.ops2_refresh_order_public_snapshot_v1(v_order.id);
  end if;

  update public.ops_delivery_stops set status = 'cancelled', updated_at = now() where id = v_stop.id;
  update public.ops_delivery_runs r
     set status = 'cancelled', updated_at = now()
   where r.id = v_run.id
     and not exists (
       select 1 from public.ops_delivery_stops s
        where s.run_id = r.id and s.status in ('planned', 'out_for_delivery')
     );

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, details)
  values(null,
    case when p_service_date is null then 'delivery.stop_cancelled' else 'delivery.stop_rescheduled' end,
    'order', v_order.id::text,
    jsonb_build_object('stop_id', v_stop.id, 'run_id', v_run.id,
      'previous_service_date', v_run.service_date, 'service_date', coalesce(p_service_date, v_run.service_date),
      'operator', coalesce(v_operator, 'Admin')));

  return jsonb_build_object('ok', true, 'stop_id', v_stop.id, 'order_id', v_order.id,
    'service_date', coalesce(p_service_date, v_run.service_date), 'released_from_route', true);
end;
$function$;

revoke all on function public.smart_delivery_admin_dispatch_run_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.smart_delivery_admin_dispatch_run_v1(uuid, text) to service_role;
revoke all on function public.smart_delivery_admin_assign_order_v1(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.smart_delivery_admin_assign_order_v1(uuid, uuid, text) to service_role;
revoke all on function public.smart_delivery_admin_fail_stop_v1(uuid, text) from public, anon, authenticated;
grant execute on function public.smart_delivery_admin_fail_stop_v1(uuid, text) to service_role;

-- Repeat explicit grants after replacing functions whose callers are the service role.
revoke all on function public.smart_delivery_admin_reassign_stop_v1(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.smart_delivery_admin_reassign_stop_v1(uuid, uuid, text) to service_role;
revoke all on function public.smart_delivery_admin_release_stop_v1(uuid, date, text) from public, anon, authenticated;
grant execute on function public.smart_delivery_admin_release_stop_v1(uuid, date, text) to service_role;
revoke all on function public.smart_delivery_reorder_stops_v1(uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.smart_delivery_reorder_stops_v1(uuid, uuid[], text) to service_role;
