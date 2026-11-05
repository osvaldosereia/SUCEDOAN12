begin;

alter table public.orders
  add column if not exists delivery_paid_ahead boolean not null default false,
  add column if not exists delivery_paid_ahead_method text,
  add column if not exists delivery_paid_ahead_reference text,
  add column if not exists delivery_paid_ahead_at timestamptz,
  add column if not exists delivery_paid_ahead_by text;

alter table public.orders
  drop constraint if exists orders_delivery_paid_ahead_method_check;
alter table public.orders
  add constraint orders_delivery_paid_ahead_method_check
  check (delivery_paid_ahead_method is null or delivery_paid_ahead_method in ('pix', 'credit_card'));

alter table public.ops_delivery_runs
  drop constraint if exists ops_delivery_runs_vehicle_key_check;
alter table public.ops_delivery_runs
  add constraint ops_delivery_runs_vehicle_key_check
  check (
    vehicle_key in ('car_1', 'car_2')
    or vehicle_key ~* '^driver_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

create table if not exists public.delivery_driver_access_v1 (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.delivery_drivers_v1(id) on delete cascade,
  token_hash text not null unique,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  constraint delivery_driver_access_v1_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint delivery_driver_access_v1_expiry_check check (expires_at > issued_at)
);

alter table public.order_separation_whatsapp_settings_v1
  drop constraint if exists order_separation_whatsapp_settings_v1_notification_kind_check;
alter table public.order_separation_whatsapp_settings_v1
  add constraint order_separation_whatsapp_settings_v1_notification_kind_check
  check (notification_kind in ('prepared_ok', 'prepared_adjusted', 'driver_next_stop'));

insert into public.order_separation_whatsapp_settings_v1
  (notification_kind, channel, is_enabled, draft_body, active_template_name, pending_template_name)
values
  ('driver_next_stop', '0975', false,
   E'Olá! O pedido {{1}} é nossa próxima entrega. A previsão é chegar em até {{2}} minutos.\n\nSeu entregador é {{3}}, WhatsApp {{4}}.\n\nValor do pedido: {{5}}.\nForma de pagamento: {{6}}.',
   'proximaentregadiante0975v1', null),
  ('driver_next_stop', '1018', false,
   E'Olá! O pedido {{1}} é nossa próxima entrega. A previsão é chegar em até {{2}} minutos.\n\nSeu entregador é {{3}}, WhatsApp {{4}}.\n\nValor do pedido: {{5}}.\nForma de pagamento: {{6}}.',
   'proximaentregadiante1018v1', null)
on conflict (notification_kind, channel) do nothing;

create table if not exists public.delivery_customer_notifications_v1 (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ops_delivery_runs(id) on delete restrict,
  stop_id uuid not null references public.ops_delivery_stops(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  driver_id uuid not null references public.delivery_drivers_v1(id) on delete restrict,
  channel text not null check (channel in ('0975', '1018')),
  template_name text not null,
  eta_minutes integer not null check (eta_minutes between 5 and 120),
  status text not null check (status in ('sending', 'accepted', 'uncertain', 'failed')),
  provider_message_id text,
  last_error text,
  attempt_count integer not null default 1 check (attempt_count between 1 and 10),
  payload jsonb not null default '{}'::jsonb,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, stop_id)
);

alter table public.delivery_customer_notifications_v1 enable row level security;
revoke all on table public.delivery_customer_notifications_v1 from public, anon, authenticated;
grant all on table public.delivery_customer_notifications_v1 to service_role;

drop policy if exists delivery_customer_notifications_v1_service_role_all on public.delivery_customer_notifications_v1;
create policy delivery_customer_notifications_v1_service_role_all
  on public.delivery_customer_notifications_v1
  for all to service_role using (true) with check (true);

create index if not exists delivery_driver_access_v1_active_idx
  on public.delivery_driver_access_v1 (driver_id, expires_at desc)
  where revoked_at is null;

alter table public.delivery_driver_access_v1 enable row level security;
revoke all on table public.delivery_driver_access_v1 from public, anon, authenticated;
grant all on table public.delivery_driver_access_v1 to service_role;

drop policy if exists delivery_driver_access_v1_service_role_all on public.delivery_driver_access_v1;
create policy delivery_driver_access_v1_service_role_all
  on public.delivery_driver_access_v1
  for all to service_role
  using (true) with check (true);

create or replace function public.ops_plan_delivery_run_v1(
  p_vehicle_key text,
  p_order_ids uuid[],
  p_operator_label text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run_id uuid := gen_random_uuid();
  v_today date := (now() at time zone 'America/Cuiaba')::date;
  v_order_ids uuid[] := '{}'::uuid[];
  v_order_id uuid;
  v_seq integer := 0;
  v_order public.orders%rowtype;
  v_existing_run uuid;
  v_existing_status text;
  v_existing_run_row public.ops_delivery_runs%rowtype;
  v_existing_order_id uuid;
  v_vehicle_key text := lower(trim(coalesce(p_vehicle_key, '')));
begin
  if v_vehicle_key !~ '^(car_[12]|driver_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$' then
    raise exception 'invalid_vehicle';
  end if;
  if coalesce(array_length(p_order_ids, 1), 0) < 1 or array_length(p_order_ids, 1) > 30 then
    raise exception 'invalid_route_size';
  end if;
  if (select count(distinct x) from unnest(p_order_ids) x) <> array_length(p_order_ids, 1) then
    raise exception 'duplicate_order_in_route';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('ops_delivery_run:' || v_today::text || ':' || v_vehicle_key, 0)
  );

  if exists (
    select 1 from public.ops_delivery_runs
    where service_date = v_today and vehicle_key = v_vehicle_key and status = 'dispatched'
  ) then
    raise exception 'vehicle_already_dispatched';
  end if;

  if left(v_vehicle_key, 7) = 'driver_' then
    for v_existing_run_row in
      select * from public.ops_delivery_runs
      where service_date = v_today and vehicle_key = v_vehicle_key and status = 'planned'
      order by created_at, id
      for update
    loop
      if v_existing_run_row.loading_started_at is not null
         or v_existing_run_row.loaded_at is not null
         or exists (
           select 1 from public.ops_delivery_stops
           where run_id = v_existing_run_row.id
             and (loaded_at is not null or custody_confirmed_at is not null)
         ) then
        raise exception 'route_locked';
      end if;

      for v_existing_order_id in
        select order_id from public.ops_delivery_stops
        where run_id = v_existing_run_row.id and status = 'planned'
        order by sequence, created_at, id
      loop
        if array_position(v_order_ids, v_existing_order_id) is null then
          v_order_ids := array_append(v_order_ids, v_existing_order_id);
        end if;
      end loop;
    end loop;

    foreach v_order_id in array p_order_ids loop
      if array_position(v_order_ids, v_order_id) is null then
        v_order_ids := array_append(v_order_ids, v_order_id);
      end if;
    end loop;

    if array_length(v_order_ids, 1) > 30 then
      raise exception 'invalid_route_size';
    end if;
  else
    v_order_ids := p_order_ids;
  end if;

  update public.ops_delivery_runs
     set status = 'cancelled', updated_at = now()
   where service_date = v_today and vehicle_key = v_vehicle_key and status = 'planned';

  insert into public.ops_delivery_runs(id, service_date, vehicle_key, status, operator_label)
  values(v_run_id, v_today, v_vehicle_key, 'planned', nullif(trim(coalesce(p_operator_label, '')), ''));

  foreach v_order_id in array v_order_ids loop
    select * into v_order from public.orders
     where id = v_order_id and status = 'ready'
     for update;
    if not found then raise exception 'order_not_ready:%', v_order_id; end if;

    if exists (
      select 1 from public.order_delivery_return_cases
      where order_id = v_order_id and status = 'returned_review'
    ) then raise exception 'delivery_return_review_open:%', v_order_id; end if;

    select r.id, r.status into v_existing_run, v_existing_status
    from public.ops_delivery_stops s
    join public.ops_delivery_runs r on r.id = s.run_id
    where s.order_id = v_order_id
      and r.service_date = v_today
      and r.status in ('planned', 'dispatched')
      and r.id <> v_run_id
    order by case r.status when 'dispatched' then 0 else 1 end, r.created_at desc
    limit 1;

    if v_existing_run is not null and v_existing_status = 'dispatched' then
      raise exception 'order_already_dispatched:%', v_order_id;
    end if;

    if v_existing_run is not null then
      delete from public.ops_delivery_stops where run_id = v_existing_run and order_id = v_order_id;
      update public.ops_delivery_runs
         set status = 'cancelled', updated_at = now()
       where id = v_existing_run and status = 'planned'
         and not exists (select 1 from public.ops_delivery_stops where run_id = v_existing_run);
    end if;

    v_seq := v_seq + 1;
    insert into public.ops_delivery_stops(
      run_id, order_id, sequence, status, address_snapshot, phone_snapshot,
      customer_name_snapshot, order_number_snapshot, total_cents, payment_method_snapshot, maps_url_snapshot
    ) values (
      v_run_id, v_order.id, v_seq, 'planned', coalesce(v_order.delivery_address, '{}'::jsonb),
      coalesce(v_order.phone_e164, v_order.delivery_address->>'phone'),
      coalesce(v_order.customer_snapshot->>'name', v_order.delivery_address->>'customer_name', v_order.delivery_address->>'recipient_name'),
      v_order.order_number, round(coalesce(v_order.total, 0) * 100)::bigint, v_order.payment_method,
      v_order.delivery_address->>'google_maps_url'
    );
    v_existing_run := null;
    v_existing_status := null;
  end loop;

  return v_run_id;
end;
$function$;

create or replace function public.smart_delivery_plan_run_v1(
  p_vehicle_key text,
  p_order_ids uuid[],
  p_operator_label text default null,
  p_region_id uuid default null,
  p_driver_id uuid default null,
  p_vehicle_id uuid default null,
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_run_id uuid;
  v_assignment jsonb;
  v_order_ids uuid[] := '{}'::uuid[];
  v_region_id uuid := p_region_id;
  v_regions integer;
  v_route_key text := lower(trim(coalesce(p_vehicle_key, '')));
begin
  if v_route_key in ('car_1', 'car_2') then
    if p_driver_id is not null then
      raise exception 'legacy_route_key_cannot_be_bound_to_driver' using errcode = '22023';
    end if;
  else
    if p_driver_id is null or v_route_key <> 'driver_' || lower(p_driver_id::text) then
      raise exception 'invalid_driver_route_key' using errcode = '22023';
    end if;
  end if;

  v_run_id := public.ops_plan_delivery_run_v1(v_route_key, p_order_ids, p_operator_label);

  if v_region_id is null then
    select count(distinct o.delivery_region_id), min(o.delivery_region_id::text)::uuid
      into v_regions, v_region_id
    from public.ops_delivery_stops s
    join public.orders o on o.id = s.order_id
    where s.run_id = v_run_id and o.delivery_region_id is not null;
    if v_regions <> 1 then v_region_id := null; end if;
  end if;

  select coalesce(array_agg(s.order_id order by s.sequence), '{}'::uuid[])
    into v_order_ids
  from public.ops_delivery_stops s
  where s.run_id = v_run_id;

  v_assignment := public.smart_delivery_assign_run_v1(
    v_run_id, v_region_id, p_driver_id, p_vehicle_id, p_operator_label, p_actor_user_id
  );

  update public.ops_delivery_stops s
  set customer_address_id = o.delivery_customer_address_id,
      location_evidence_id = o.delivery_location_evidence_id,
      region_id = coalesce(o.delivery_region_id, v_region_id),
      destination_latitude = coalesce(e.latitude, a.latitude),
      destination_longitude = coalesce(e.longitude, a.longitude),
      destination_confidence = case
        when e.confidence = 'confirmed' then 'confirmed'
        when a.latitude is not null and a.longitude is not null then 'saved'
        else null
      end,
      updated_at = now()
  from public.orders o
  left join public.customer_addresses a on a.id = o.delivery_customer_address_id
  left join public.customer_location_evidence_v1 e on e.id = o.delivery_location_evidence_id
  where s.run_id = v_run_id and s.order_id = o.id;

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, details)
  values(p_actor_user_id, 'smart_delivery.run_planned', 'delivery_run', v_run_id::text,
    jsonb_build_object('vehicle_key', v_route_key, 'region_id', v_region_id, 'driver_id', p_driver_id,
      'vehicle_id', p_vehicle_id, 'order_ids', to_jsonb(v_order_ids),
      'order_count', coalesce(array_length(v_order_ids, 1), 0)));

  return jsonb_build_object('ok', true, 'run_id', v_run_id, 'vehicle_key', v_route_key,
    'region_id', v_region_id, 'driver_id', p_driver_id, 'vehicle_id', p_vehicle_id,
    'order_count', coalesce(array_length(v_order_ids, 1), 0), 'assignment', v_assignment);
end;
$function$;

create or replace function public.smart_delivery_confirm_order_location_v1(
  p_order_id uuid,
  p_location_evidence_id uuid,
  p_region_id uuid default null,
  p_confirmation_source text default 'delivery_admin',
  p_actor_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_order public.orders%rowtype;
  v_evidence public.customer_location_evidence_v1%rowtype;
  v_address_doc jsonb;
  v_address_id uuid;
  v_street text;
  v_number text;
  v_neighborhood text;
  v_city text;
  v_state text;
  v_postal_code text;
  v_label text;
  v_created boolean := false;
  v_result jsonb;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_order.customer_id is null then raise exception 'order_customer_required' using errcode = '22023'; end if;

  select * into v_evidence from public.customer_location_evidence_v1
   where id = p_location_evidence_id for update;
  if not found then raise exception 'location_evidence_not_found' using errcode = 'P0002'; end if;
  if v_evidence.latitude is null or v_evidence.longitude is null
     or v_evidence.latitude < -90 or v_evidence.latitude > 90
     or v_evidence.longitude < -180 or v_evidence.longitude > 180
     or (v_evidence.latitude = 0 and v_evidence.longitude = 0) then
    raise exception 'location_coordinates_invalid' using errcode = '22023';
  end if;
  if v_evidence.customer_id is not null and v_evidence.customer_id <> v_order.customer_id then
    raise exception 'location_customer_mismatch' using errcode = '22023';
  end if;
  if v_evidence.customer_id is null and (v_order.conversation_id is null or v_evidence.conversation_id is distinct from v_order.conversation_id) then
    raise exception 'location_conversation_mismatch' using errcode = '22023';
  end if;
  if v_evidence.order_id is not null and v_evidence.order_id <> p_order_id then
    raise exception 'location_order_mismatch' using errcode = '22023';
  end if;

  v_address_doc := coalesce(v_order.delivery_address, '{}'::jsonb);
  v_street := coalesce(
    nullif(trim(v_address_doc->>'street'), ''),
    nullif(trim(v_address_doc->>'address_line'), '')
  );
  v_number := nullif(trim(v_address_doc->>'number'), '');
  v_neighborhood := nullif(trim(coalesce(v_address_doc->>'neighborhood', v_address_doc->>'district')), '');
  v_city := nullif(trim(v_address_doc->>'city'), '');
  v_state := nullif(upper(trim(v_address_doc->>'state')), '');
  v_postal_code := nullif(trim(coalesce(v_address_doc->>'postal_code', v_address_doc->>'zip_code')), '');
  v_address_id := coalesce(v_order.delivery_customer_address_id, v_evidence.customer_address_id);

  if v_address_id is null and v_street is not null then
    select a.id into v_address_id
      from public.customer_addresses a
     where a.customer_id = v_order.customer_id and a.is_active
       and lower(trim(coalesce(a.street, ''))) = lower(v_street)
       and lower(trim(coalesce(a.number, ''))) = lower(coalesce(v_number, ''))
       and lower(trim(coalesce(a.neighborhood, ''))) = lower(coalesce(v_neighborhood, ''))
       and lower(trim(coalesce(a.city, ''))) = lower(coalesce(v_city, ''))
       and lower(trim(coalesce(a.state, ''))) = lower(coalesce(v_state, ''))
       and lower(trim(coalesce(a.postal_code, ''))) = lower(coalesce(v_postal_code, ''))
     order by a.is_default desc, a.updated_at desc
     limit 1 for update;
  end if;

  if v_address_id is null then
    v_label := coalesce(
      nullif(trim(v_address_doc->>'label'), ''),
      nullif(concat_ws(', ', v_street, v_number, v_neighborhood), ''),
      'Endereço confirmado do pedido ' || coalesce(v_order.order_number::text, left(p_order_id::text, 8))
    );
    insert into public.customer_addresses(
      customer_id, label, street, number, complement, neighborhood, city, state,
      postal_code, reference, is_default, is_active, google_maps_url, latitude, longitude
    ) values (
      v_order.customer_id, v_label, v_street, v_number,
      nullif(trim(v_address_doc->>'complement'), ''), v_neighborhood, v_city, v_state,
      v_postal_code, nullif(trim(v_address_doc->>'reference'), ''), false, true,
      'https://www.google.com/maps/search/?api=1&query=' || v_evidence.latitude::text || '%2C' || v_evidence.longitude::text,
      v_evidence.latitude, v_evidence.longitude
    ) returning id into v_address_id;
    v_created := true;
  end if;

  v_result := public.smart_delivery_confirm_location_v1(
    p_order_id, v_address_id, p_location_evidence_id, p_region_id,
    coalesce(nullif(trim(coalesce(p_confirmation_source, '')), ''), 'delivery_admin'), p_actor_user_id
  );
  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'customer_address_id', v_address_id,
    'customer_address_created', v_created
  );
end;
$function$;

update public.order_separation_whatsapp_settings_v1
set draft_body = E'✅ Pedido {{1}} preparado\n\nEncontramos todos os produtos do seu pedido.\n\n💰 Total confirmado: {{2}}\n\n🚚 Seu pedido está pronto e seguirá para a rota de entrega.\n\nDona Antônia agradece a preferência.',
    updated_at = now()
where notification_kind = 'prepared_ok'
  and draft_body = E'✅ Pedido {{1}} preparado\n\nEncontramos todos os produtos do seu pedido.\n\n💰 Total confirmado: {{2}}\n\n🚚 Seu pedido está pronto e seguirá para a rota de entrega.\n\nConfira os detalhes:\n{{3}}\n\nDona Antônia agradece a preferência.';

update public.order_separation_whatsapp_settings_v1
set draft_body = E'⚠️ Pedido {{1}} preparado com ajuste\n\nDurante a separação, alguns produtos não estavam disponíveis:\n\n{{2}}\n\n💰 RESUMO DO PEDIDO\nValor original: {{3}}\nAbatimento: - {{4}}\nNovo total: {{5}}\n\nOs demais produtos foram separados normalmente e seu pedido está pronto para seguir para a rota de entrega.\n\nDona Antônia agradece a compreensão.',
    updated_at = now()
where notification_kind = 'prepared_adjusted'
  and draft_body = E'⚠️ Pedido {{1}} preparado com ajuste\n\nDurante a separação, alguns produtos não estavam disponíveis:\n\n{{2}}\n\n💰 RESUMO DO PEDIDO\nValor original: {{3}}\nAbatimento: - {{4}}\nNovo total: {{5}}\n\nOs demais produtos foram separados normalmente e seu pedido está pronto para seguir para a rota de entrega.\n\nConfira os detalhes:\n{{6}}\n\nDona Antônia agradece a compreensão.';

create or replace function public.smart_delivery_reorder_stops_v1(
  p_run_id uuid,
  p_stop_ids uuid[],
  p_actor_label text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_run public.ops_delivery_runs%rowtype;
  v_count integer;
  v_unique integer;
  v_changed integer;
begin
  select * into v_run from public.ops_delivery_runs where id = p_run_id for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status <> 'planned' or v_run.loading_started_at is not null or v_run.loaded_at is not null then
    raise exception 'route_locked';
  end if;

  select count(*) into v_count from public.ops_delivery_stops where run_id = p_run_id and status = 'planned';
  select count(distinct x) into v_unique from unnest(coalesce(p_stop_ids, '{}'::uuid[])) x;
  if v_count < 1 or array_length(p_stop_ids, 1) is distinct from v_count or v_unique <> v_count then
    raise exception 'invalid_route_order';
  end if;
  if exists (
    select 1 from unnest(p_stop_ids) x
    left join public.ops_delivery_stops s on s.id = x and s.run_id = p_run_id and s.status = 'planned'
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

  update public.ops_delivery_runs
     set optimizer_provider = null, optimizer_job_ref = null, optimizer_payload = null, updated_at = now()
   where id = p_run_id;

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, details)
  values(null, 'smart_delivery.route_reordered', 'delivery_run', p_run_id::text,
    jsonb_build_object('actor', left(nullif(trim(coalesce(p_actor_label, '')), ''), 80), 'stop_ids', to_jsonb(p_stop_ids)));

  return jsonb_build_object('ok', true, 'run_id', p_run_id, 'stop_ids', to_jsonb(p_stop_ids));
end;
$function$;

create or replace function public.smart_delivery_dispatch_run_v1(
  p_run_id uuid,
  p_operator_label text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_run public.ops_delivery_runs%rowtype;
  v_stop public.ops_delivery_stops%rowtype;
  v_count integer := 0;
  v_result jsonb;
begin
  select * into v_run from public.ops_delivery_runs where id = p_run_id for update;
  if not found then raise exception 'run_not_found'; end if;
  if v_run.status = 'dispatched' then
    return jsonb_build_object('ok', true, 'run_id', p_run_id, 'status', v_run.status, 'already_dispatched', true);
  end if;
  if v_run.status <> 'planned' or v_run.driver_id is null then raise exception 'run_not_ready_for_dispatch'; end if;

  select count(*) into v_count from public.ops_delivery_stops
   where run_id = p_run_id and status = 'planned' and loaded_at is not null and custody_confirmed_at is not null;
  if v_count = 0 or exists (
    select 1 from public.ops_delivery_stops
     where run_id = p_run_id and status = 'planned'
       and (loaded_at is null or custody_confirmed_at is null)
  ) then raise exception 'delivery_loading_confirmation_required'; end if;

  for v_stop in
    select * from public.ops_delivery_stops where run_id = p_run_id and status = 'planned' order by sequence for update
  loop
    v_result := public.ops4_start_dispatch_v1(v_stop.order_id,
      coalesce(nullif(trim(coalesce(p_operator_label, '')), ''), 'Operação'),
      'dispatch-v4:' || v_stop.order_id::text);
    perform public.ops_sync_delivery_stop_v1(v_stop.order_id, 'out_for_delivery');
  end loop;

  update public.ops_delivery_runs
     set status = 'dispatched', dispatched_at = coalesce(dispatched_at, now()), updated_at = now()
   where id = p_run_id;

  return jsonb_build_object('ok', true, 'run_id', p_run_id, 'status', 'dispatched', 'order_count', v_count);
end;
$function$;

create or replace function public.ops3_mark_delivery_prepaid_v1(
  p_order_id uuid,
  p_method text,
  p_reference text default null,
  p_operator_label text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_order public.orders%rowtype;
  v_settlement public.order_payment_settlements%rowtype;
  v_method text := lower(trim(coalesce(p_method, '')));
  v_expected bigint;
  v_existing_method text;
  v_existing_amount bigint;
  v_now timestamptz := now();
  v_settlement_id uuid;
begin
  if p_order_id is null then raise exception 'invalid_order'; end if;
  if v_method not in ('pix', 'credit_card') then raise exception 'invalid_prepaid_method'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status not in ('ready', 'out_for_delivery') then raise exception 'order_not_ready_for_prepaid'; end if;
  v_expected := round(coalesce(v_order.total, 0) * 100)::bigint;
  if v_expected <= 0 then raise exception 'invalid_order_total'; end if;

  select * into v_settlement from public.order_payment_settlements where order_id = p_order_id for update;
  if found then
    select method, amount_cents into v_existing_method, v_existing_amount
      from public.order_payment_parts where settlement_id = v_settlement.id order by sequence limit 1;
    if v_settlement.status not in ('captured', 'synced')
       or v_settlement.expected_total_cents <> v_expected
       or v_settlement.captured_total_cents <> v_expected
       or v_existing_method is distinct from v_method
       or v_existing_amount is distinct from v_expected
       or (select count(*) from public.order_payment_parts where settlement_id = v_settlement.id) <> 1 then
      raise exception 'prepaid_settlement_mismatch';
    end if;
    v_settlement_id := v_settlement.id;
    update public.order_payment_settlements
       set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'prepaid_verified', true, 'prepaid_verified_at', v_now,
         'prepaid_reference', nullif(left(trim(coalesce(p_reference, '')), 120), ''),
         'prepaid_operator', nullif(left(trim(coalesce(p_operator_label, '')), 80), '')
       ), updated_at = v_now
     where id = v_settlement.id;
  else
    insert into public.order_payment_settlements(
      order_id, status, expected_total_cents, captured_total_cents, planned_method,
      operator_label, source, bling_sync_state, idempotency_key, metadata, captured_at
    ) values (
      p_order_id, 'captured', v_expected, v_expected, v_method,
      nullif(left(trim(coalesce(p_operator_label, '')), 80), ''), 'admin_prepaid_verification',
      'blocked_homologation', 'prepaid-verify:' || p_order_id::text,
      jsonb_build_object('prepaid_verified', true, 'prepaid_verified_at', v_now,
        'prepaid_reference', nullif(left(trim(coalesce(p_reference, '')), 120), ''),
        'prepaid_operator', nullif(left(trim(coalesce(p_operator_label, '')), 80), '')),
      v_now
    ) returning id into v_settlement_id;
    insert into public.order_payment_parts(settlement_id, sequence, method, amount_cents, detail)
    values(v_settlement_id, 1, v_method, v_expected,
      jsonb_build_object('source', 'admin_prepaid_verification'));
  end if;

  update public.orders
     set delivery_paid_ahead = true,
         delivery_paid_ahead_method = v_method,
         delivery_paid_ahead_reference = nullif(left(trim(coalesce(p_reference, '')), 120), ''),
         delivery_paid_ahead_at = coalesce(delivery_paid_ahead_at, v_now),
         delivery_paid_ahead_by = coalesce(nullif(left(trim(coalesce(p_operator_label, '')), 80), ''), delivery_paid_ahead_by),
         payment_method = v_method,
         updated_at = v_now
   where id = p_order_id;

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, details)
  values(null, 'order.delivery_marked_prepaid', 'order', p_order_id::text,
    jsonb_build_object('method', v_method, 'reference', nullif(left(trim(coalesce(p_reference, '')), 120), ''),
      'settlement_id', v_settlement_id, 'operator', nullif(left(trim(coalesce(p_operator_label, '')), 80), '')));

  perform public.ops2_refresh_order_public_snapshot_v1(p_order_id);
  return jsonb_build_object('ok', true, 'order_id', p_order_id, 'method', v_method,
    'settlement_id', v_settlement_id, 'amount_cents', v_expected, 'delivery_paid_ahead', true);
end;
$function$;

create or replace function public.smart_delivery_complete_stop_v1(
  p_stop_id uuid,
  p_method text,
  p_amount_cents bigint,
  p_operator_label text default null,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_stop public.ops_delivery_stops%rowtype;
  v_run public.ops_delivery_runs%rowtype;
  v_result jsonb;
begin
  select * into v_stop from public.ops_delivery_stops where id = p_stop_id for update;
  if not found then raise exception 'stop_not_found'; end if;
  select * into v_run from public.ops_delivery_runs where id = v_stop.run_id for update;
  if not found or v_run.status <> 'dispatched' then raise exception 'run_not_dispatched'; end if;
  if v_stop.status = 'delivered' then
    return jsonb_build_object('ok', true, 'stop_id', p_stop_id, 'order_id', v_stop.order_id, 'status', 'delivered', 'already_delivered', true);
  end if;
  if v_stop.status <> 'out_for_delivery' then raise exception 'stop_not_out_for_delivery'; end if;

  v_result := public.ops3_complete_delivery_v1(
    v_stop.order_id, p_method, p_amount_cents, p_operator_label,
    coalesce(nullif(trim(coalesce(p_idempotency_key, '')), ''), 'driver-delivery-v1:' || v_stop.order_id::text)
  );
  perform public.ops_sync_delivery_stop_v1(v_stop.order_id, 'delivered');
  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('stop_id', p_stop_id, 'status', 'delivered');
end;
$function$;

revoke all on function public.smart_delivery_reorder_stops_v1(uuid, uuid[], text) from public, anon, authenticated;
revoke all on function public.smart_delivery_confirm_order_location_v1(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.smart_delivery_dispatch_run_v1(uuid, text) from public, anon, authenticated;
revoke all on function public.ops3_mark_delivery_prepaid_v1(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.smart_delivery_complete_stop_v1(uuid, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.smart_delivery_reorder_stops_v1(uuid, uuid[], text) to service_role;
grant execute on function public.smart_delivery_confirm_order_location_v1(uuid, uuid, uuid, text, uuid) to service_role;
grant execute on function public.smart_delivery_dispatch_run_v1(uuid, text) to service_role;
grant execute on function public.ops3_mark_delivery_prepaid_v1(uuid, text, text, text) to service_role;
grant execute on function public.smart_delivery_complete_stop_v1(uuid, text, bigint, text, text) to service_role;

commit;
