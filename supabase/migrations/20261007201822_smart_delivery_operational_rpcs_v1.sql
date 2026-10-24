create or replace function public.smart_delivery_confirm_location_v1(
  p_order_id uuid,
  p_customer_address_id uuid,
  p_location_evidence_id uuid,
  p_region_id uuid default null,
  p_confirmation_source text default 'admin',
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
  v_address public.customer_addresses%rowtype;
  v_evidence public.customer_location_evidence_v1%rowtype;
  v_region public.delivery_regions_v1%rowtype;
  v_source text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if v_order.customer_id is null then raise exception 'Pedido sem cliente vinculado' using errcode = '22023'; end if;

  select * into v_address from public.customer_addresses where id = p_customer_address_id for update;
  if not found then raise exception 'Endereço não encontrado' using errcode = 'P0002'; end if;
  if v_address.customer_id <> v_order.customer_id then raise exception 'Endereço não pertence ao cliente do pedido' using errcode = '22023'; end if;
  if not v_address.is_active then raise exception 'Endereço está inativo' using errcode = '22023'; end if;

  select * into v_evidence from public.customer_location_evidence_v1 where id = p_location_evidence_id for update;
  if not found then raise exception 'Evidência de localização não encontrada' using errcode = 'P0002'; end if;

  if v_evidence.customer_id is null then
    if v_order.conversation_id is null or v_evidence.conversation_id is distinct from v_order.conversation_id then
      raise exception 'Evidência sem vínculo seguro com o cliente do pedido' using errcode = '22023';
    end if;
  elsif v_evidence.customer_id <> v_order.customer_id then
    raise exception 'Evidência pertence a outro cliente' using errcode = '22023';
  end if;

  if v_evidence.customer_address_id is not null and v_evidence.customer_address_id <> p_customer_address_id then
    raise exception 'Evidência já vinculada a outro endereço' using errcode = '22023';
  end if;
  if v_evidence.order_id is not null and v_evidence.order_id <> p_order_id then
    raise exception 'Evidência já vinculada a outro pedido' using errcode = '22023';
  end if;

  if p_region_id is not null then
    select * into v_region from public.delivery_regions_v1 where id = p_region_id for share;
    if not found or not v_region.is_active then
      raise exception 'Região de entrega inexistente ou inativa' using errcode = '22023';
    end if;
  end if;

  v_source := coalesce(nullif(btrim(p_confirmation_source), ''), 'admin');

  update public.customer_location_evidence_v1
  set customer_id = v_order.customer_id,
      customer_address_id = p_customer_address_id,
      order_id = p_order_id,
      confidence = 'confirmed',
      confirmation_source = v_source,
      confirmed_at = coalesce(confirmed_at, now()),
      updated_at = now()
  where id = p_location_evidence_id;

  update public.customer_addresses
  set latitude = v_evidence.latitude,
      longitude = v_evidence.longitude,
      last_confirmed_at = now(),
      updated_at = now()
  where id = p_customer_address_id;

  update public.orders
  set delivery_customer_address_id = p_customer_address_id,
      delivery_location_evidence_id = p_location_evidence_id,
      delivery_region_id = coalesce(p_region_id, delivery_region_id),
      updated_at = now()
  where id = p_order_id;

  update public.ops_delivery_stops
  set customer_address_id = p_customer_address_id,
      location_evidence_id = p_location_evidence_id,
      region_id = coalesce(p_region_id, region_id),
      destination_latitude = v_evidence.latitude,
      destination_longitude = v_evidence.longitude,
      destination_confidence = 'confirmed',
      updated_at = now()
  where order_id = p_order_id and status not in ('delivered', 'cancelled');

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, details)
  values (p_actor_user_id,'smart_delivery.location_confirmed','order',p_order_id::text,
    jsonb_build_object('customer_address_id',p_customer_address_id,'location_evidence_id',p_location_evidence_id,'region_id',p_region_id,'confirmation_source',v_source));

  return jsonb_build_object('ok',true,'order_id',p_order_id,'customer_address_id',p_customer_address_id,
    'location_evidence_id',p_location_evidence_id,'region_id',coalesce(p_region_id,v_order.delivery_region_id),
    'latitude',v_evidence.latitude,'longitude',v_evidence.longitude,'confidence','confirmed');
end;
$$;
revoke all on function public.smart_delivery_confirm_location_v1(uuid,uuid,uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.smart_delivery_confirm_location_v1(uuid,uuid,uuid,uuid,text,uuid) to service_role;

create or replace function public.smart_delivery_assign_run_v1(
  p_run_id uuid,
  p_region_id uuid default null,
  p_driver_id uuid default null,
  p_vehicle_id uuid default null,
  p_operator_label text default null,
  p_actor_user_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_run public.ops_delivery_runs%rowtype;
  v_region public.delivery_regions_v1%rowtype;
  v_driver public.delivery_drivers_v1%rowtype;
  v_vehicle public.delivery_vehicles_v1%rowtype;
  v_new_region uuid;
  v_new_driver uuid;
  v_new_vehicle uuid;
begin
  select * into v_run from public.ops_delivery_runs where id = p_run_id for update;
  if not found then raise exception 'Rota não encontrada' using errcode = 'P0002'; end if;
  if v_run.status in ('completed','cancelled') then raise exception 'Rota encerrada não pode ser reatribuída' using errcode = '22023'; end if;

  v_new_region := coalesce(p_region_id,v_run.region_id);
  v_new_driver := coalesce(p_driver_id,v_run.driver_id);
  v_new_vehicle := coalesce(p_vehicle_id,v_run.vehicle_id);

  if v_new_region is not null then
    select * into v_region from public.delivery_regions_v1 where id = v_new_region for share;
    if not found or not v_region.is_active then raise exception 'Região inexistente ou inativa' using errcode = '22023'; end if;
  end if;
  if v_new_driver is not null then
    select * into v_driver from public.delivery_drivers_v1 where id = v_new_driver for share;
    if not found or not v_driver.is_active then raise exception 'Entregador inexistente ou inativo' using errcode = '22023'; end if;
  end if;
  if v_new_vehicle is not null then
    select * into v_vehicle from public.delivery_vehicles_v1 where id = v_new_vehicle for share;
    if not found or not v_vehicle.is_active then raise exception 'Veículo inexistente ou inativo' using errcode = '22023'; end if;
  end if;

  update public.ops_delivery_runs
  set region_id=v_new_region,driver_id=v_new_driver,vehicle_id=v_new_vehicle,
      operator_label=coalesce(nullif(btrim(p_operator_label),''),operator_label),updated_at=now()
  where id=p_run_id;

  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
  values (p_actor_user_id,'smart_delivery.run_assignment_changed','delivery_run',p_run_id::text,
    jsonb_build_object('before',jsonb_build_object('region_id',v_run.region_id,'driver_id',v_run.driver_id,'vehicle_id',v_run.vehicle_id),
                       'after',jsonb_build_object('region_id',v_new_region,'driver_id',v_new_driver,'vehicle_id',v_new_vehicle)));

  return jsonb_build_object('ok',true,'run_id',p_run_id,'status',v_run.status,'region_id',v_new_region,'driver_id',v_new_driver,'vehicle_id',v_new_vehicle);
end;
$$;
revoke all on function public.smart_delivery_assign_run_v1(uuid,uuid,uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.smart_delivery_assign_run_v1(uuid,uuid,uuid,uuid,text,uuid) to service_role;

create or replace function public.smart_delivery_confirm_loading_v1(
  p_run_id uuid,
  p_stop_id uuid default null,
  p_actor_user_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_run public.ops_delivery_runs%rowtype;
  v_stop public.ops_delivery_stops%rowtype;
  v_touched integer := 0;
  v_remaining integer := 0;
  v_loaded_at timestamptz;
begin
  select * into v_run from public.ops_delivery_runs where id=p_run_id for update;
  if not found then raise exception 'Rota não encontrada' using errcode='P0002'; end if;
  if v_run.status in ('completed','cancelled') then raise exception 'Rota encerrada não pode receber confirmação de carregamento' using errcode='22023'; end if;

  update public.ops_delivery_runs set loading_started_at=coalesce(loading_started_at,now()),updated_at=now() where id=p_run_id;

  if p_stop_id is not null then
    select * into v_stop from public.ops_delivery_stops where id=p_stop_id and run_id=p_run_id for update;
    if not found then raise exception 'Entrega não pertence à rota informada' using errcode='22023'; end if;
    if v_stop.status not in ('planned','out_for_delivery') then raise exception 'Entrega não está em estado carregável' using errcode='22023'; end if;
    update public.ops_delivery_stops set loaded_at=coalesce(loaded_at,now()),custody_confirmed_at=coalesce(custody_confirmed_at,now()),updated_at=now() where id=p_stop_id;
    v_touched := 1;
  else
    update public.ops_delivery_stops set loaded_at=coalesce(loaded_at,now()),custody_confirmed_at=coalesce(custody_confirmed_at,now()),updated_at=now()
    where run_id=p_run_id and status in ('planned','out_for_delivery');
    get diagnostics v_touched = row_count;
  end if;

  select count(*) into v_remaining from public.ops_delivery_stops
  where run_id=p_run_id and status in ('planned','out_for_delivery') and loaded_at is null;

  if v_remaining=0 and exists(select 1 from public.ops_delivery_stops where run_id=p_run_id and status in ('planned','out_for_delivery')) then
    update public.ops_delivery_runs set loaded_at=coalesce(loaded_at,now()),updated_at=now() where id=p_run_id returning loaded_at into v_loaded_at;
  else
    select loaded_at into v_loaded_at from public.ops_delivery_runs where id=p_run_id;
  end if;

  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
  values (p_actor_user_id,'smart_delivery.loading_confirmed','delivery_run',p_run_id::text,
    jsonb_build_object('stop_id',p_stop_id,'touched_stops',v_touched,'remaining_unloaded_stops',v_remaining,'run_loaded_at',v_loaded_at));

  return jsonb_build_object('ok',true,'run_id',p_run_id,'stop_id',p_stop_id,'touched_stops',v_touched,'remaining_unloaded_stops',v_remaining,'run_loaded_at',v_loaded_at);
end;
$$;
revoke all on function public.smart_delivery_confirm_loading_v1(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.smart_delivery_confirm_loading_v1(uuid,uuid,uuid) to service_role;

create or replace function public.smart_delivery_move_stop_v1(
  p_stop_id uuid,
  p_target_run_id uuid,
  p_actor_user_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_stop public.ops_delivery_stops%rowtype;
  v_source_run public.ops_delivery_runs%rowtype;
  v_target_run public.ops_delivery_runs%rowtype;
  v_next_sequence integer;
begin
  select * into v_stop from public.ops_delivery_stops where id=p_stop_id for update;
  if not found then raise exception 'Entrega não encontrada' using errcode='P0002'; end if;

  if v_stop.run_id=p_target_run_id then
    return jsonb_build_object('ok',true,'stop_id',p_stop_id,'source_run_id',v_stop.run_id,'target_run_id',p_target_run_id,'sequence',v_stop.sequence,'unchanged',true);
  end if;
  if v_stop.status<>'planned' then raise exception 'Somente entregas ainda planejadas podem mudar de rota diretamente' using errcode='22023'; end if;

  select * into v_source_run from public.ops_delivery_runs where id=v_stop.run_id for update;
  if not found or v_source_run.status in ('completed','cancelled') then raise exception 'Rota de origem inválida para movimentação' using errcode='22023'; end if;

  select * into v_target_run from public.ops_delivery_runs where id=p_target_run_id for update;
  if not found then raise exception 'Rota de destino não encontrada' using errcode='P0002'; end if;
  if v_target_run.status in ('completed','cancelled') then raise exception 'Rota de destino está encerrada' using errcode='22023'; end if;
  if v_target_run.service_date<>v_source_run.service_date then raise exception 'Mudança entre datas diferentes exige reagendamento explícito' using errcode='22023'; end if;

  select coalesce(max(sequence),0)+1 into v_next_sequence from public.ops_delivery_stops where run_id=p_target_run_id;
  if v_next_sequence>100 then raise exception 'Rota de destino atingiu o limite de 100 paradas' using errcode='22023'; end if;

  update public.ops_delivery_stops
  set run_id=p_target_run_id,sequence=v_next_sequence,loaded_at=null,custody_confirmed_at=null,updated_at=now()
  where id=p_stop_id;

  update public.ops_delivery_runs set loaded_at=null,updated_at=now() where id=p_target_run_id;

  insert into public.admin_audit_logs(admin_user_id,action,entity_type,entity_id,details)
  values (p_actor_user_id,'smart_delivery.stop_moved','delivery_stop',p_stop_id::text,
    jsonb_build_object('source_run_id',v_source_run.id,'target_run_id',v_target_run.id,'old_sequence',v_stop.sequence,'new_sequence',v_next_sequence,'order_id',v_stop.order_id));

  return jsonb_build_object('ok',true,'stop_id',p_stop_id,'order_id',v_stop.order_id,'source_run_id',v_source_run.id,'target_run_id',v_target_run.id,'sequence',v_next_sequence,'unchanged',false);
end;
$$;
revoke all on function public.smart_delivery_move_stop_v1(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.smart_delivery_move_stop_v1(uuid,uuid,uuid) to service_role;
