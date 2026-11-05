begin;

create table if not exists public.customer_address_reference_photos_v1 (
  id uuid primary key default gen_random_uuid(),
  customer_address_id uuid not null references public.customer_addresses(id) on delete cascade,
  stop_id uuid not null references public.ops_delivery_stops(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  driver_id uuid not null references public.delivery_drivers_v1(id) on delete restrict,
  storage_path text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists customer_address_reference_photos_v1_latest_idx
  on public.customer_address_reference_photos_v1 (customer_address_id, captured_at desc, id desc);

alter table public.customer_address_reference_photos_v1 enable row level security;
revoke all on table public.customer_address_reference_photos_v1 from public, anon, authenticated;
grant all on table public.customer_address_reference_photos_v1 to service_role;

drop policy if exists customer_address_reference_photos_v1_service_role_all on public.customer_address_reference_photos_v1;
create policy customer_address_reference_photos_v1_service_role_all
  on public.customer_address_reference_photos_v1
  for all to service_role using (true) with check (true);

create or replace function public.smart_delivery_driver_save_location_v1(
  p_stop_id uuid,
  p_driver_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_accuracy_m numeric,
  p_mode text,
  p_label text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_stop public.ops_delivery_stops%rowtype;
  v_run public.ops_delivery_runs%rowtype;
  v_order public.orders%rowtype;
  v_address public.customer_addresses%rowtype;
  v_address_doc jsonb;
  v_address_id uuid;
  v_evidence_id uuid;
  v_next_stop_id uuid;
  v_street text;
  v_number text;
  v_neighborhood text;
  v_city text;
  v_state text;
  v_postal_code text;
  v_label text;
  v_mode text := lower(trim(coalesce(p_mode, '')));
  v_point_label text := nullif(trim(coalesce(p_label, '')), '');
  v_created boolean := false;
begin
  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180
     or (p_latitude = 0 and p_longitude = 0) then
    raise exception 'invalid_location_coordinates' using errcode = '22023';
  end if;
  if p_accuracy_m is null or p_accuracy_m < 0 or p_accuracy_m > 100000 then
    raise exception 'invalid_location_accuracy' using errcode = '22023';
  end if;
  if v_mode not in ('primary', 'alternate') then
    raise exception 'invalid_location_mode' using errcode = '22023';
  end if;
  if v_mode = 'alternate' and (v_point_label is null or char_length(v_point_label) > 80) then
    raise exception 'alternate_location_label_required' using errcode = '22023';
  end if;

  select s.* into v_stop
    from public.ops_delivery_stops s
    join public.ops_delivery_runs r on r.id = s.run_id
   where s.id = p_stop_id and r.driver_id = p_driver_id and r.status = 'dispatched'
   for update of s;
  if not found then raise exception 'driver_stop_not_found' using errcode = 'P0002'; end if;
  if v_stop.status <> 'out_for_delivery' then
    raise exception 'stop_not_out_for_delivery' using errcode = '22023';
  end if;

  select * into v_run from public.ops_delivery_runs where id = v_stop.run_id for update;
  if not found or v_run.driver_id <> p_driver_id or v_run.status <> 'dispatched' then
    raise exception 'driver_run_not_dispatched' using errcode = '22023';
  end if;
  select s.id into v_next_stop_id
    from public.ops_delivery_stops s
   where s.run_id = v_run.id and s.status = 'out_for_delivery'
   order by s.sequence, s.created_at, s.id
   limit 1;
  if v_next_stop_id is distinct from p_stop_id then
    raise exception 'stop_is_not_next' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = v_stop.order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_order.customer_id is null then raise exception 'order_customer_required' using errcode = '22023'; end if;

  v_address_id := coalesce(v_stop.customer_address_id, v_order.delivery_customer_address_id);
  if v_address_id is null and v_stop.location_evidence_id is not null then
    select e.customer_address_id into v_address_id
      from public.customer_location_evidence_v1 e
     where e.id = v_stop.location_evidence_id;
  end if;
  if v_address_id is not null then
    select * into v_address from public.customer_addresses a
     where a.id = v_address_id and a.customer_id = v_order.customer_id and a.is_active
     for update;
    if not found then raise exception 'customer_address_mismatch' using errcode = '22023'; end if;
  else
    v_address_doc := coalesce(v_order.delivery_address, '{}'::jsonb);
    v_street := coalesce(nullif(trim(v_address_doc->>'street'), ''), nullif(trim(v_address_doc->>'address_line'), ''));
    v_number := nullif(trim(v_address_doc->>'number'), '');
    v_neighborhood := nullif(trim(coalesce(v_address_doc->>'neighborhood', v_address_doc->>'district')), '');
    v_city := nullif(trim(v_address_doc->>'city'), '');
    v_state := nullif(upper(trim(v_address_doc->>'state')), '');
    v_postal_code := nullif(trim(coalesce(v_address_doc->>'postal_code', v_address_doc->>'zip_code')), '');

    if v_street is not null then
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

    if v_address_id is null and v_mode = 'alternate' then
      raise exception 'primary_location_required' using errcode = '22023';
    end if;
    if v_address_id is null then
      v_label := coalesce(
        nullif(trim(v_address_doc->>'label'), ''),
        nullif(concat_ws(', ', v_street, v_number, v_neighborhood), ''),
        'Endereço do pedido ' || coalesce(v_order.order_number::text, left(v_order.id::text, 8))
      );
      insert into public.customer_addresses(
        customer_id, label, street, number, complement, neighborhood, city, state,
        postal_code, reference, is_default, is_active, google_maps_url, latitude, longitude
      ) values (
        v_order.customer_id, v_label, v_street, v_number,
        nullif(trim(v_address_doc->>'complement'), ''), v_neighborhood, v_city, v_state,
        v_postal_code, nullif(trim(v_address_doc->>'reference'), ''), false, true,
        'https://www.google.com/maps/search/?api=1&query=' || p_latitude::text || '%2C' || p_longitude::text,
        p_latitude, p_longitude
      ) returning id into v_address_id;
      v_created := true;
      select * into v_address from public.customer_addresses where id = v_address_id for update;
    end if;
  end if;

  if v_address_id is not null and v_address.id is null then
    select * into v_address from public.customer_addresses a
     where a.id = v_address_id and a.customer_id = v_order.customer_id and a.is_active
     for update;
    if not found then raise exception 'customer_address_mismatch' using errcode = '22023'; end if;
  end if;

  if v_mode = 'alternate' and (v_address.latitude is null or v_address.longitude is null) then
    raise exception 'primary_location_required' using errcode = '22023';
  end if;

  insert into public.customer_location_evidence_v1(
    customer_id, customer_address_id, order_id, conversation_id,
    source, direction, latitude, longitude, label, address_text,
    confidence, confirmation_source, confirmed_at, captured_at, metadata
  ) values (
    v_order.customer_id, v_address_id, v_order.id, v_order.conversation_id,
    'driver', 'internal', p_latitude, p_longitude,
    coalesce(v_point_label, 'Localização principal confirmada pelo entregador'),
    nullif(concat_ws(', ', v_address.street, v_address.number, v_address.neighborhood, v_address.city), ''),
    'confirmed', 'delivery_driver', now(), now(),
    jsonb_build_object(
      'capture_mode', v_mode,
      'accuracy_m', p_accuracy_m,
      'driver_id', p_driver_id,
      'stop_id', p_stop_id,
      'previous_primary_location', case
        when v_mode = 'primary' and not v_created and v_address.latitude is not null and v_address.longitude is not null
          then jsonb_build_object('latitude', v_address.latitude, 'longitude', v_address.longitude)
        else null
      end
    )
  ) returning id into v_evidence_id;

  if v_mode = 'primary' then
    perform public.smart_delivery_confirm_location_v1(
      v_order.id, v_address_id, v_evidence_id, v_stop.region_id, 'delivery_driver', null
    );
    update public.customer_addresses
       set google_maps_url = 'https://www.google.com/maps/search/?api=1&query=' || p_latitude::text || '%2C' || p_longitude::text,
           updated_at = now()
     where id = v_address_id;
  else
    update public.orders
       set delivery_customer_address_id = v_address_id,
           delivery_location_evidence_id = v_evidence_id,
           updated_at = now()
     where id = v_order.id;
    update public.ops_delivery_stops
       set customer_address_id = v_address_id,
           location_evidence_id = v_evidence_id,
           destination_latitude = p_latitude,
           destination_longitude = p_longitude,
           destination_confidence = 'confirmed',
           updated_at = now()
     where id = p_stop_id;
    insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, details)
    values(null, 'smart_delivery.alternate_location_saved', 'order', v_order.id::text,
      jsonb_build_object('customer_address_id', v_address_id, 'location_evidence_id', v_evidence_id,
        'stop_id', p_stop_id, 'driver_id', p_driver_id, 'label', v_point_label, 'accuracy_m', p_accuracy_m));
  end if;

  return jsonb_build_object(
    'ok', true,
    'stop_id', p_stop_id,
    'order_id', v_order.id,
    'customer_address_id', v_address_id,
    'location_evidence_id', v_evidence_id,
    'mode', v_mode,
    'latitude', p_latitude,
    'longitude', p_longitude,
    'customer_address_created', v_created
  );
end;
$function$;

create or replace function public.smart_delivery_driver_select_location_v1(
  p_stop_id uuid,
  p_driver_id uuid,
  p_location_evidence_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_stop public.ops_delivery_stops%rowtype;
  v_run public.ops_delivery_runs%rowtype;
  v_order public.orders%rowtype;
  v_evidence public.customer_location_evidence_v1%rowtype;
  v_address_id uuid;
  v_next_stop_id uuid;
begin
  select s.* into v_stop
    from public.ops_delivery_stops s
    join public.ops_delivery_runs r on r.id = s.run_id
   where s.id = p_stop_id and r.driver_id = p_driver_id and r.status = 'dispatched'
   for update of s;
  if not found then raise exception 'driver_stop_not_found' using errcode = 'P0002'; end if;
  if v_stop.status <> 'out_for_delivery' then
    raise exception 'stop_not_out_for_delivery' using errcode = '22023';
  end if;

  select * into v_run from public.ops_delivery_runs where id = v_stop.run_id for update;
  if not found or v_run.driver_id <> p_driver_id or v_run.status <> 'dispatched' then
    raise exception 'driver_run_not_dispatched' using errcode = '22023';
  end if;
  select s.id into v_next_stop_id
    from public.ops_delivery_stops s
   where s.run_id = v_run.id and s.status = 'out_for_delivery'
   order by s.sequence, s.created_at, s.id
   limit 1;
  if v_next_stop_id is distinct from p_stop_id then
    raise exception 'stop_is_not_next' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = v_stop.order_id for update;
  if not found or v_order.customer_id is null then raise exception 'order_customer_required' using errcode = '22023'; end if;
  v_address_id := coalesce(v_stop.customer_address_id, v_order.delivery_customer_address_id);
  if v_address_id is null then raise exception 'customer_address_required' using errcode = '22023'; end if;
  select * into v_evidence from public.customer_location_evidence_v1
   where id = p_location_evidence_id
     and source = 'driver'
     and confidence = 'confirmed'
     and metadata->>'capture_mode' = 'alternate'
     and customer_id = v_order.customer_id
     and customer_address_id = v_address_id
   for share;
  if not found then raise exception 'saved_location_not_available' using errcode = '22023'; end if;

  update public.ops_delivery_stops
     set location_evidence_id = v_evidence.id,
         destination_latitude = v_evidence.latitude,
         destination_longitude = v_evidence.longitude,
         destination_confidence = 'confirmed',
         updated_at = now()
   where id = p_stop_id;
  update public.orders set delivery_location_evidence_id = v_evidence.id, updated_at = now()
   where id = v_order.id;
  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, details)
  values(null, 'smart_delivery.alternate_location_selected', 'order', v_order.id::text,
    jsonb_build_object('location_evidence_id', v_evidence.id, 'stop_id', p_stop_id, 'driver_id', p_driver_id));

  return jsonb_build_object('ok', true, 'stop_id', p_stop_id, 'location_evidence_id', v_evidence.id,
    'latitude', v_evidence.latitude, 'longitude', v_evidence.longitude, 'label', v_evidence.label);
end;
$function$;

revoke all on function public.smart_delivery_driver_save_location_v1(uuid, uuid, numeric, numeric, numeric, text, text) from public, anon, authenticated;
revoke all on function public.smart_delivery_driver_select_location_v1(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.smart_delivery_driver_save_location_v1(uuid, uuid, numeric, numeric, numeric, text, text) to service_role;
grant execute on function public.smart_delivery_driver_select_location_v1(uuid, uuid, uuid) to service_role;

commit;
