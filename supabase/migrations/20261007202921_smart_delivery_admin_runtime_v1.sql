create or replace function public.smart_delivery_catalog_v1()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'regions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'code',r.code,'name',r.name,'city',r.city,'state',r.state,
        'is_active',r.is_active,'priority',r.priority,'notes',r.notes,'polygon_geojson',r.polygon_geojson
      ) order by r.is_active desc,r.priority,r.name)
      from public.delivery_regions_v1 r
    ), '[]'::jsonb),
    'drivers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',d.id,'name',d.name,'phone_e164',d.phone_e164,'is_active',d.is_active,
        'home_region_id',d.home_region_id,'metadata',d.metadata
      ) order by d.is_active desc,d.name)
      from public.delivery_drivers_v1 d
    ), '[]'::jsonb),
    'vehicles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',v.id,'label',v.label,'plate',v.plate,'vehicle_type',v.vehicle_type,
        'capacity_units',v.capacity_units,'is_active',v.is_active,'metadata',v.metadata
      ) order by v.is_active desc,v.label)
      from public.delivery_vehicles_v1 v
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.smart_delivery_catalog_v1() from public, anon, authenticated;
grant execute on function public.smart_delivery_catalog_v1() to service_role;

create or replace function public.smart_delivery_region_save_v1(
  p_id uuid,p_code text,p_name text,p_city text default null,p_state text default 'MT',
  p_priority integer default 100,p_is_active boolean default true,p_notes text default null,
  p_polygon_geojson jsonb default null,p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_code text := lower(regexp_replace(btrim(coalesce(p_code,'')), '[^a-zA-Z0-9_-]+', '-', 'g'));
  v_name text := btrim(coalesce(p_name,''));
begin
  if v_code = '' or length(v_code) > 60 then raise exception 'Código da região inválido' using errcode='22023'; end if;
  if v_name = '' or length(v_name) > 120 then raise exception 'Nome da região inválido' using errcode='22023'; end if;
  if coalesce(p_priority,100) < 0 or coalesce(p_priority,100) > 10000 then raise exception 'Prioridade inválida' using errcode='22023'; end if;

  insert into public.delivery_regions_v1(id,code,name,city,state,is_active,priority,polygon_geojson,notes,created_at,updated_at)
  values(v_id,v_code,v_name,nullif(btrim(coalesce(p_city,'')),''),coalesce(nullif(upper(btrim(coalesce(p_state,''))),''),'MT'),
         coalesce(p_is_active,true),coalesce(p_priority,100),p_polygon_geojson,nullif(btrim(coalesce(p_notes,'')),''),now(),now())
  on conflict(id) do update set
    code=excluded.code,name=excluded.name,city=excluded.city,state=excluded.state,is_active=excluded.is_active,
    priority=excluded.priority,polygon_geojson=excluded.polygon_geojson,notes=excluded.notes,updated_at=now();

  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
  values(p_actor_user_id,'smart_delivery.region_saved','delivery_region',v_id::text,
    jsonb_build_object('code',v_code,'name',v_name,'active',coalesce(p_is_active,true)));
  return v_id;
end;
$$;
revoke all on function public.smart_delivery_region_save_v1(uuid,text,text,text,text,integer,boolean,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.smart_delivery_region_save_v1(uuid,text,text,text,text,integer,boolean,text,jsonb,uuid) to service_role;

create or replace function public.smart_delivery_driver_save_v1(
  p_id uuid,p_name text,p_phone_e164 text default null,p_home_region_id uuid default null,
  p_is_active boolean default true,p_metadata jsonb default '{}'::jsonb,p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_name text := btrim(coalesce(p_name,''));
  v_phone text := nullif(regexp_replace(coalesce(p_phone_e164,''), '[^0-9+]', '', 'g'),'');
begin
  if v_name = '' or length(v_name) > 120 then raise exception 'Nome do entregador inválido' using errcode='22023'; end if;
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Telefone deve estar em E.164' using errcode='22023'; end if;
  if p_home_region_id is not null and not exists(select 1 from public.delivery_regions_v1 where id=p_home_region_id) then
    raise exception 'Região base inexistente' using errcode='22023';
  end if;

  insert into public.delivery_drivers_v1(id,name,phone_e164,is_active,home_region_id,metadata,created_at,updated_at)
  values(v_id,v_name,v_phone,coalesce(p_is_active,true),p_home_region_id,coalesce(p_metadata,'{}'::jsonb),now(),now())
  on conflict(id) do update set
    name=excluded.name,phone_e164=excluded.phone_e164,is_active=excluded.is_active,
    home_region_id=excluded.home_region_id,metadata=excluded.metadata,updated_at=now();

  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
  values(p_actor_user_id,'smart_delivery.driver_saved','delivery_driver',v_id::text,
    jsonb_build_object('name',v_name,'active',coalesce(p_is_active,true),'home_region_id',p_home_region_id));
  return v_id;
end;
$$;
revoke all on function public.smart_delivery_driver_save_v1(uuid,text,text,uuid,boolean,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.smart_delivery_driver_save_v1(uuid,text,text,uuid,boolean,jsonb,uuid) to service_role;

create or replace function public.smart_delivery_vehicle_save_v1(
  p_id uuid,p_label text,p_plate text default null,p_vehicle_type text default null,
  p_capacity_units integer default null,p_is_active boolean default true,p_metadata jsonb default '{}'::jsonb,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_label text := btrim(coalesce(p_label,''));
  v_plate text := nullif(upper(regexp_replace(coalesce(p_plate,''), '[^A-Za-z0-9]', '', 'g')),'');
begin
  if v_label = '' or length(v_label) > 120 then raise exception 'Nome do veículo inválido' using errcode='22023'; end if;
  if p_capacity_units is not null and (p_capacity_units < 1 or p_capacity_units > 10000) then raise exception 'Capacidade inválida' using errcode='22023'; end if;

  insert into public.delivery_vehicles_v1(id,label,plate,vehicle_type,capacity_units,is_active,metadata,created_at,updated_at)
  values(v_id,v_label,v_plate,nullif(btrim(coalesce(p_vehicle_type,'')),''),p_capacity_units,coalesce(p_is_active,true),coalesce(p_metadata,'{}'::jsonb),now(),now())
  on conflict(id) do update set
    label=excluded.label,plate=excluded.plate,vehicle_type=excluded.vehicle_type,
    capacity_units=excluded.capacity_units,is_active=excluded.is_active,metadata=excluded.metadata,updated_at=now();

  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
  values(p_actor_user_id,'smart_delivery.vehicle_saved','delivery_vehicle',v_id::text,
    jsonb_build_object('label',v_label,'plate',v_plate,'active',coalesce(p_is_active,true)));
  return v_id;
end;
$$;
revoke all on function public.smart_delivery_vehicle_save_v1(uuid,text,text,text,integer,boolean,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.smart_delivery_vehicle_save_v1(uuid,text,text,text,integer,boolean,jsonb,uuid) to service_role;

create or replace function public.smart_delivery_plan_run_v1(
  p_vehicle_key text,p_order_ids uuid[],p_operator_label text default null,p_region_id uuid default null,
  p_driver_id uuid default null,p_vehicle_id uuid default null,p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_run_id uuid;
  v_assignment jsonb;
  v_region_id uuid := p_region_id;
  v_regions integer;
begin
  if p_vehicle_key not in ('car_1','car_2') then raise exception 'Slot de rota inválido' using errcode='22023'; end if;
  v_run_id := public.ops_plan_delivery_run_v1(p_vehicle_key,p_order_ids,p_operator_label);

  if v_region_id is null then
    select count(distinct o.delivery_region_id), min(o.delivery_region_id::text)::uuid
      into v_regions,v_region_id
    from public.orders o
    where o.id = any(p_order_ids) and o.delivery_region_id is not null;
    if v_regions <> 1 then v_region_id := null; end if;
  end if;

  v_assignment := public.smart_delivery_assign_run_v1(
    v_run_id,v_region_id,p_driver_id,p_vehicle_id,p_operator_label,p_actor_user_id
  );

  update public.ops_delivery_stops s
  set customer_address_id = o.delivery_customer_address_id,
      location_evidence_id = o.delivery_location_evidence_id,
      region_id = coalesce(o.delivery_region_id,v_region_id),
      destination_latitude = coalesce(e.latitude,a.latitude),
      destination_longitude = coalesce(e.longitude,a.longitude),
      destination_confidence = case
        when e.confidence='confirmed' then 'confirmed'
        when a.latitude is not null and a.longitude is not null then 'saved'
        else null
      end,
      updated_at = now()
  from public.orders o
  left join public.customer_addresses a on a.id=o.delivery_customer_address_id
  left join public.customer_location_evidence_v1 e on e.id=o.delivery_location_evidence_id
  where s.run_id=v_run_id and s.order_id=o.id;

  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
  values(p_actor_user_id,'smart_delivery.run_planned','delivery_run',v_run_id::text,
    jsonb_build_object('vehicle_key',p_vehicle_key,'region_id',v_region_id,'driver_id',p_driver_id,'vehicle_id',p_vehicle_id,
      'order_ids',to_jsonb(p_order_ids),'order_count',coalesce(array_length(p_order_ids,1),0)));

  return jsonb_build_object(
    'ok',true,'run_id',v_run_id,'vehicle_key',p_vehicle_key,'region_id',v_region_id,
    'driver_id',p_driver_id,'vehicle_id',p_vehicle_id,'order_count',coalesce(array_length(p_order_ids,1),0),
    'assignment',v_assignment
  );
end;
$$;
revoke all on function public.smart_delivery_plan_run_v1(text,uuid[],text,uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.smart_delivery_plan_run_v1(text,uuid[],text,uuid,uuid,uuid,uuid) to service_role;

create or replace function public.get_ops_delivery_runs_today_v2()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
select jsonb_build_object(
  'generated_at',now(),
  'catalog',public.smart_delivery_catalog_v1(),
  'runs',coalesce((
    select jsonb_agg(run_json order by (run_json->>'created_at')::timestamptz desc)
    from (
      select jsonb_build_object(
        'id',r.id,'service_date',r.service_date,'vehicle_key',r.vehicle_key,'status',r.status,
        'operator_label',r.operator_label,'created_at',r.created_at,'dispatched_at',r.dispatched_at,'completed_at',r.completed_at,
        'region_id',r.region_id,'driver_id',r.driver_id,'vehicle_id',r.vehicle_id,
        'optimizer_provider',r.optimizer_provider,'optimizer_job_ref',r.optimizer_job_ref,'optimizer_payload',r.optimizer_payload,
        'loading_started_at',r.loading_started_at,'loaded_at',r.loaded_at,
        'region',case when rg.id is null then null else jsonb_build_object('id',rg.id,'code',rg.code,'name',rg.name,'city',rg.city) end,
        'driver',case when dr.id is null then null else jsonb_build_object('id',dr.id,'name',dr.name,'phone_e164',dr.phone_e164) end,
        'vehicle',case when vh.id is null then null else jsonb_build_object('id',vh.id,'label',vh.label,'plate',vh.plate,'vehicle_type',vh.vehicle_type,'capacity_units',vh.capacity_units) end,
        'stops',coalesce((
          select jsonb_agg(jsonb_build_object(
            'stop_id',s.id,'order_id',s.order_id,'sequence',s.sequence,'status',s.status,
            'address',s.address_snapshot,'phone',s.phone_snapshot,'customer_name',s.customer_name_snapshot,
            'order_number',s.order_number_snapshot,'total_cents',s.total_cents,'payment_method',s.payment_method_snapshot,
            'maps_url',s.maps_url_snapshot,'customer_address_id',s.customer_address_id,
            'location_evidence_id',s.location_evidence_id,'region_id',s.region_id,
            'destination_latitude',s.destination_latitude,'destination_longitude',s.destination_longitude,
            'destination_confidence',s.destination_confidence,'loaded_at',s.loaded_at,
            'custody_confirmed_at',s.custody_confirmed_at,'failed_at',s.failed_at,
            'failure_reason',s.failure_reason,'returned_at',s.returned_at,'proof_metadata',s.proof_metadata
          ) order by s.sequence)
          from public.ops_delivery_stops s where s.run_id=r.id
        ),'[]'::jsonb)
      ) as run_json
      from public.ops_delivery_runs r
      left join public.delivery_regions_v1 rg on rg.id=r.region_id
      left join public.delivery_drivers_v1 dr on dr.id=r.driver_id
      left join public.delivery_vehicles_v1 vh on vh.id=r.vehicle_id
      where r.service_date=(now() at time zone 'America/Cuiaba')::date and r.status<>'cancelled'
    ) q
  ),'[]'::jsonb)
);
$$;
revoke all on function public.get_ops_delivery_runs_today_v2() from public, anon, authenticated;
grant execute on function public.get_ops_delivery_runs_today_v2() to service_role;
