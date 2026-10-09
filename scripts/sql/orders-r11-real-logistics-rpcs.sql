-- Real canonical RPCs captured READ-ONLY for PostgreSQL17 lab; NOT production migration.
-- ops_sync_delivery_stop_v1 MD5 9fc7bd0b75faa999110efc831868621e
CREATE OR REPLACE FUNCTION public.ops_sync_delivery_stop_v1(p_order_id uuid, p_order_status text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
  v_count integer;
begin
  v_status:=case p_order_status
    when 'out_for_delivery' then 'out_for_delivery'
    when 'delivered' then 'delivered'
    when 'ready' then 'planned'
    when 'cancelled' then 'cancelled'
    else null
  end;
  if v_status is null then return 0; end if;

  update public.ops_delivery_stops s
     set status=v_status,updated_at=now()
   where s.order_id=p_order_id
     and s.status<>'failed'
     and exists (
       select 1 from public.ops_delivery_runs r
       where r.id=s.run_id and r.status in ('planned','dispatched')
     );

  get diagnostics v_count=row_count;

  if p_order_status='out_for_delivery' then
    update public.ops_delivery_runs r
       set status='dispatched',
           dispatched_at=coalesce(dispatched_at,now()),
           updated_at=now()
     where r.id in (
       select run_id from public.ops_delivery_stops
       where order_id=p_order_id and status='out_for_delivery'
     )
       and r.status='planned';
  end if;

  update public.ops_delivery_runs r
     set status='completed',
         completed_at=coalesce(completed_at,now()),
         updated_at=now()
   where r.status='dispatched'
     and not exists (
       select 1 from public.ops_delivery_stops s
       where s.run_id=r.id
         and s.status not in ('delivered','failed','cancelled')
     );

  return v_count;
end;
$function$
;

-- smart_delivery_confirm_loading_v1 MD5 b29e68820523773b6324466430b71a89
CREATE OR REPLACE FUNCTION public.smart_delivery_confirm_loading_v1(p_run_id uuid, p_stop_id uuid DEFAULT NULL::uuid, p_actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_run public.ops_delivery_runs%rowtype;
  v_stop public.ops_delivery_stops%rowtype;
  v_touched integer := 0;
  v_remaining integer := 0;
  v_loaded_at timestamptz;
begin
  select * into v_run
  from public.ops_delivery_runs
  where id = p_run_id
  for update;

  if not found then
    raise exception 'Rota não encontrada' using errcode = 'P0002';
  end if;
  if v_run.status in ('completed', 'cancelled') then
    raise exception 'Rota encerrada não pode receber confirmação de carregamento' using errcode = '22023';
  end if;

  update public.ops_delivery_runs
  set loading_started_at = coalesce(loading_started_at, now()),
      updated_at = now()
  where id = p_run_id;

  if p_stop_id is not null then
    select * into v_stop
    from public.ops_delivery_stops
    where id = p_stop_id and run_id = p_run_id
    for update;

    if not found then
      raise exception 'Entrega não pertence à rota informada' using errcode = '22023';
    end if;
    if v_stop.status not in ('planned', 'out_for_delivery') then
      raise exception 'Entrega não está em estado carregável' using errcode = '22023';
    end if;

    update public.ops_delivery_stops
    set loaded_at = coalesce(loaded_at, now()),
        custody_confirmed_at = coalesce(custody_confirmed_at, now()),
        updated_at = now()
    where id = p_stop_id;

    v_touched := 1;
  else
    update public.ops_delivery_stops
    set loaded_at = coalesce(loaded_at, now()),
        custody_confirmed_at = coalesce(custody_confirmed_at, now()),
        updated_at = now()
    where run_id = p_run_id
      and status in ('planned', 'out_for_delivery');

    get diagnostics v_touched = row_count;
  end if;

  select count(*) into v_remaining
  from public.ops_delivery_stops
  where run_id = p_run_id
    and status in ('planned', 'out_for_delivery')
    and loaded_at is null;

  if v_remaining = 0 and exists (
    select 1 from public.ops_delivery_stops
    where run_id = p_run_id
      and status in ('planned', 'out_for_delivery')
  ) then
    update public.ops_delivery_runs
    set loaded_at = coalesce(loaded_at, now()),
        updated_at = now()
    where id = p_run_id
    returning loaded_at into v_loaded_at;
  else
    select loaded_at into v_loaded_at
    from public.ops_delivery_runs
    where id = p_run_id;
  end if;

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, details)
  values (
    p_actor_user_id,
    'smart_delivery.loading_confirmed',
    'delivery_run',
    p_run_id::text,
    jsonb_build_object(
      'stop_id', p_stop_id,
      'touched_stops', v_touched,
      'remaining_unloaded_stops', v_remaining,
      'run_loaded_at', v_loaded_at
    )
  );

  return jsonb_build_object(
    'ok', true,
    'run_id', p_run_id,
    'stop_id', p_stop_id,
    'touched_stops', v_touched,
    'remaining_unloaded_stops', v_remaining,
    'run_loaded_at', v_loaded_at
  );
end;
$function$
;

-- smart_delivery_move_stop_v1 MD5 8d41993940d7dd30316c49c482401e3f
CREATE OR REPLACE FUNCTION public.smart_delivery_move_stop_v1(p_stop_id uuid, p_target_run_id uuid, p_actor_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_stop public.ops_delivery_stops%rowtype;
  v_source_run public.ops_delivery_runs%rowtype;
  v_target_run public.ops_delivery_runs%rowtype;
  v_next_sequence integer;
begin
  select * into v_stop
  from public.ops_delivery_stops
  where id = p_stop_id
  for update;

  if not found then
    raise exception 'Entrega não encontrada' using errcode = 'P0002';
  end if;

  if v_stop.run_id = p_target_run_id then
    return jsonb_build_object(
      'ok', true,
      'stop_id', p_stop_id,
      'source_run_id', v_stop.run_id,
      'target_run_id', p_target_run_id,
      'sequence', v_stop.sequence,
      'unchanged', true
    );
  end if;

  if v_stop.status <> 'planned' then
    raise exception 'Somente entregas ainda planejadas podem mudar de rota diretamente' using errcode = '22023';
  end if;

  select * into v_source_run
  from public.ops_delivery_runs
  where id = v_stop.run_id
  for update;

  if not found or v_source_run.status in ('completed', 'cancelled') then
    raise exception 'Rota de origem inválida para movimentação' using errcode = '22023';
  end if;

  select * into v_target_run
  from public.ops_delivery_runs
  where id = p_target_run_id
  for update;

  if not found then
    raise exception 'Rota de destino não encontrada' using errcode = 'P0002';
  end if;
  if v_target_run.status in ('completed', 'cancelled') then
    raise exception 'Rota de destino está encerrada' using errcode = '22023';
  end if;
  if v_target_run.service_date <> v_source_run.service_date then
    raise exception 'Mudança entre datas diferentes exige reagendamento explícito' using errcode = '22023';
  end if;

  select coalesce(max(sequence), 0) + 1 into v_next_sequence
  from public.ops_delivery_stops
  where run_id = p_target_run_id;

  if v_next_sequence > 100 then
    raise exception 'Rota de destino atingiu o limite de 100 paradas' using errcode = '22023';
  end if;

  update public.ops_delivery_stops
  set run_id = p_target_run_id,
      sequence = v_next_sequence,
      loaded_at = null,
      custody_confirmed_at = null,
      updated_at = now()
  where id = p_stop_id;

  update public.ops_delivery_runs
  set loaded_at = null,
      updated_at = now()
  where id = p_target_run_id;

  insert into public.admin_audit_logs(admin_user_id, action, entity_type, entity_id, details)
  values (
    p_actor_user_id,
    'smart_delivery.stop_moved',
    'delivery_stop',
    p_stop_id::text,
    jsonb_build_object(
      'source_run_id', v_source_run.id,
      'target_run_id', v_target_run.id,
      'old_sequence', v_stop.sequence,
      'new_sequence', v_next_sequence,
      'order_id', v_stop.order_id
    )
  );

  return jsonb_build_object(
    'ok', true,
    'stop_id', p_stop_id,
    'order_id', v_stop.order_id,
    'source_run_id', v_source_run.id,
    'target_run_id', v_target_run.id,
    'sequence', v_next_sequence,
    'unchanged', false
  );
end;
$function$
;
