-- Smart Delivery route optimization transactional contract v1
-- Runtime migration: 20261008002721

create or replace function public.smart_delivery_prepare_optimization_v1(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_run public.ops_delivery_runs%rowtype; v_stops jsonb; v_fingerprint text;
begin
  select * into v_run from public.ops_delivery_runs where id=p_run_id for update;
  if not found then raise exception 'Rota não encontrada' using errcode='P0002'; end if;
  if v_run.status <> 'planned' then raise exception 'Somente rota planejada pode ser otimizada' using errcode='22023'; end if;
  if exists(select 1 from public.ops_delivery_stops where run_id=p_run_id and status <> 'planned') then raise exception 'Rota já possui parada em execução' using errcode='22023'; end if;
  if exists(select 1 from public.ops_delivery_stops where run_id=p_run_id and (destination_latitude is null or destination_longitude is null)) then raise exception 'Todas as entregas precisam de localização antes da otimização' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id::text,'order_id',s.order_id::text,'sequence',s.sequence,'lat',s.destination_latitude,'lng',s.destination_longitude) order by s.sequence),'[]'::jsonb)
    into v_stops from public.ops_delivery_stops s where s.run_id=p_run_id;
  if jsonb_array_length(v_stops)=0 then raise exception 'Rota sem entregas' using errcode='22023'; end if;
  if jsonb_array_length(v_stops)>100 then raise exception 'Rota excede 100 entregas' using errcode='22023'; end if;
  v_fingerprint := md5(v_stops::text || '|' || v_run.updated_at::text);
  return jsonb_build_object('ok',true,'run_id',v_run.id,'service_date',v_run.service_date,'vehicle_key',v_run.vehicle_key,'fingerprint',v_fingerprint,'stops',v_stops);
end; $$;

create or replace function public.smart_delivery_apply_optimization_v1(p_run_id uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.ops_delivery_runs%rowtype; v_current jsonb; v_fingerprint text;
  v_expected text := nullif(p_result->>'fingerprint','');
  v_provider text := coalesce(nullif(p_result->>'provider',''),'google_route_optimization');
  v_job_ref text := nullif(p_result->>'job_ref',''); v_order jsonb := p_result->'stop_ids';
  v_count integer; v_distinct integer;
begin
  select * into v_run from public.ops_delivery_runs where id=p_run_id for update;
  if not found then raise exception 'Rota não encontrada' using errcode='P0002'; end if;
  if v_run.status <> 'planned' then raise exception 'Rota mudou de estado durante a otimização' using errcode='40001'; end if;
  if v_expected is null or not jsonb_typeof(v_order)='array' then raise exception 'Resultado do otimizador inválido' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id::text,'order_id',s.order_id::text,'sequence',s.sequence,'lat',s.destination_latitude,'lng',s.destination_longitude) order by s.sequence),'[]'::jsonb)
    into v_current from public.ops_delivery_stops s where s.run_id=p_run_id;
  v_fingerprint := md5(v_current::text || '|' || v_run.updated_at::text);
  if v_fingerprint <> v_expected then raise exception 'Rota mudou durante a otimização; refaça o cálculo' using errcode='40001'; end if;
  v_count := jsonb_array_length(v_order);
  if v_count <> jsonb_array_length(v_current) then raise exception 'Resultado incompleto do otimizador' using errcode='22023'; end if;
  select count(distinct x.value) into v_distinct from jsonb_array_elements_text(v_order) x;
  if v_distinct <> v_count then raise exception 'Resultado contém entrega duplicada' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements_text(v_order) x where not exists(select 1 from public.ops_delivery_stops s where s.run_id=p_run_id and s.id::text=x.value)) then raise exception 'Resultado contém entrega de outra rota' using errcode='22023'; end if;
  with desired as (select value::uuid stop_id,ordinality::integer seq from jsonb_array_elements_text(v_order) with ordinality)
  update public.ops_delivery_stops s set sequence=d.seq,updated_at=now() from desired d where s.id=d.stop_id and s.run_id=p_run_id;
  update public.ops_delivery_runs set optimizer_provider=v_provider,optimizer_job_ref=v_job_ref,optimizer_payload=p_result,updated_at=now() where id=p_run_id;
  return jsonb_build_object('ok',true,'run_id',p_run_id,'provider',v_provider,'stop_count',v_count);
end; $$;

revoke execute on function public.smart_delivery_prepare_optimization_v1(uuid) from public,anon,authenticated;
revoke execute on function public.smart_delivery_apply_optimization_v1(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.smart_delivery_prepare_optimization_v1(uuid) to service_role;
grant execute on function public.smart_delivery_apply_optimization_v1(uuid,jsonb) to service_role;
