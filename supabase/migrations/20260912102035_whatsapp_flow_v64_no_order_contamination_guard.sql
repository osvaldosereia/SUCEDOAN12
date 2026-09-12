begin;

create or replace function public.get_whatsapp_flow_v64_no_order_contamination_guard_v1()
returns jsonb
language plpgsql
stable
security invoker
set search_path to ''
as $function$
declare
  evidence jsonb;
  v_session_id uuid;
  v_conversation_id uuid;
  v_session_created_at timestamptz;
  v_window_end timestamptz;
  v_finalize_at timestamptz;
  v_v56_ok boolean := false;
  v_order_count integer := 0;
  v_confirmed_nfm_count integer := 0;
  v_order_bound_job_count integer := 0;
  v_contaminated boolean := false;
  v_ok boolean := false;
  v_next_required text;
begin
  evidence := public.get_whatsapp_flow_v56_no_order_physical_terminal_evidence_v1();
  v_v56_ok := coalesce((evidence->>'ok')::boolean,false);

  begin
    v_session_id := nullif(evidence#>>'{session,id}','')::uuid;
  exception when others then
    v_session_id := null;
  end;
  begin
    v_finalize_at := nullif(evidence#>>'{ordered_timestamps,finalize_at}','')::timestamptz;
  exception when others then
    v_finalize_at := null;
  end;
  begin
    v_window_end := nullif(evidence#>>'{ordered_timestamps,location_after_no_order_nfm_at}','')::timestamptz;
  exception when others then
    v_window_end := null;
  end;

  if v_session_id is not null then
    select es.conversation_id, es.created_at
      into v_conversation_id, v_session_created_at
    from public.experience_sessions es
    where es.id = v_session_id;

    if v_conversation_id is not null and v_session_created_at is not null then
      select count(*)::integer
        into v_order_count
      from public.orders o
      where o.conversation_id = v_conversation_id
        and o.created_at >= v_session_created_at
        and o.created_at <= coalesce(v_window_end, now());

      select count(*)::integer
        into v_order_bound_job_count
      from public.outbound_jobs j
      where j.conversation_id = v_conversation_id
        and j.order_id is not null
        and j.created_at >= v_session_created_at
        and j.created_at <= coalesce(v_window_end, now());
    end if;

    if v_finalize_at is not null then
      select count(*)::integer
        into v_confirmed_nfm_count
      from public.experience_events ev
      where ev.session_id = v_session_id
        and ev.event_type = 'flow_nfm_reply'
        and ev.interface_type = 'whatsapp_flow'
        and ev.created_at >= v_finalize_at
        and coalesce((ev.event_data->>'has_confirmed_order')::boolean,false);
    end if;
  end if;

  v_contaminated := v_order_count > 0
    or v_confirmed_nfm_count > 0
    or v_order_bound_job_count > 0;
  v_ok := v_v56_ok and not v_contaminated;

  v_next_required := case
    when v_contaminated then 'BLOCKED_ORDER_CONTAMINATION'
    else coalesce(evidence->>'next_required','')
  end;

  return evidence || jsonb_build_object(
    'ok', v_ok,
    'v56_evidence_ok', v_v56_ok,
    'order_contamination_detected', v_contaminated,
    'orders_created_in_homologation_window', v_order_count,
    'confirmed_order_nfm_events_after_finalize', v_confirmed_nfm_count,
    'order_bound_outbound_jobs_in_homologation_window', v_order_bound_job_count,
    'no_real_order_created', v_order_count = 0,
    'no_confirmed_order_nfm_reply', v_confirmed_nfm_count = 0,
    'no_order_bound_outbound_job', v_order_bound_job_count = 0,
    'next_required', v_next_required,
    'writes_performed', false,
    'evidence_version', 'v64-no-order-contamination-guard'
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v64_no_order_contamination_guard_v1() from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_v64_no_order_contamination_guard_v1() to service_role;

create or replace function public.get_whatsapp_flow_owner_homologation_preflight_v8(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  base jsonb;
  evidence jsonb;
  contamination boolean := false;
  all_ok boolean := false;
begin
  base := public.get_whatsapp_flow_owner_homologation_preflight_v7(p_conversation_id);
  evidence := public.get_whatsapp_flow_v64_no_order_contamination_guard_v1();
  contamination := coalesce((evidence->>'order_contamination_detected')::boolean,false);
  all_ok := coalesce((base->>'ok')::boolean,false) and not contamination;

  return base || jsonb_build_object(
    'ok', all_ok,
    'order_contamination_detected', contamination,
    'no_real_order_created', coalesce((evidence->>'no_real_order_created')::boolean,true),
    'no_confirmed_order_nfm_reply', coalesce((evidence->>'no_confirmed_order_nfm_reply')::boolean,true),
    'no_order_bound_outbound_job', coalesce((evidence->>'no_order_bound_outbound_job')::boolean,true),
    'physical_evidence_version', coalesce(evidence->>'evidence_version',''),
    'physical_next_required', coalesce(evidence->>'next_required',''),
    'preflight_version', 'v8-v64-no-order-contamination-guard',
    'writes_performed', false
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_owner_homologation_preflight_v8(uuid) from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_owner_homologation_preflight_v8(uuid) to service_role;

create or replace function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v11(
  p_conversation_id uuid,
  p_idempotency_key text,
  p_body_text text default 'TESTE — Flow Dona Antônia. Toque em Montar pedido.'::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  preflight jsonb;
  result jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dona_antonia_whatsapp_flow_owner_homologation_launch_v11'));

  preflight := public.get_whatsapp_flow_owner_homologation_preflight_v8(p_conversation_id);
  if not coalesce((preflight->>'ok')::boolean,false) then
    return jsonb_build_object(
      'ok', false,
      'reason', case
        when coalesce((preflight->>'order_contamination_detected')::boolean,false)
          then 'owner_homologation_blocked_by_order_contamination'
        else 'owner_conversation_preflight_v8_failed'
      end,
      'preflight', preflight,
      'dispatch_version', 'v11-v64-contamination-guard-runtime-v26-edge49'
    );
  end if;

  result := public.queue_and_dispatch_whatsapp_flow_owner_homologation_v10(
    p_conversation_id, p_idempotency_key, p_body_text
  );

  return result || jsonb_build_object(
    'preflight_v8', preflight,
    'serialized_launch', true,
    'physical_evidence_authority', 'v64-no-order-contamination-guard',
    'runtime_handler', 'v26',
    'edge_version', 49,
    'dispatch_version', 'v11-v64-contamination-guard-runtime-v26-edge49'
  );
end;
$function$;

revoke all on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v11(uuid,text,text) from public, anon, authenticated;
grant execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v11(uuid,text,text) to service_role;
revoke execute on function public.queue_and_dispatch_whatsapp_flow_owner_homologation_v10(uuid,text,text) from service_role;

create or replace function public.get_whatsapp_flow_v64_homologation_control_plane_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  base jsonb;
  evidence jsonb;
  eligible_count integer := 0;
  active_count integer := 0;
  evidence_ok boolean := false;
  contamination boolean := false;
  v10_service_role_disabled boolean := false;
  v11_exists boolean := false;
  safe_v11 boolean := false;
  next_action text;
begin
  base := public.get_whatsapp_flow_v57_homologation_control_plane_v1();
  evidence := public.get_whatsapp_flow_v64_no_order_contamination_guard_v1();
  eligible_count := coalesce((base->>'eligible_owner_conversations')::integer,0);
  active_count := coalesce((base->>'active_owner_homologation_sessions')::integer,0);
  evidence_ok := coalesce((evidence->>'ok')::boolean,false);
  contamination := coalesce((evidence->>'order_contamination_detected')::boolean,false);
  v11_exists := to_regprocedure('public.queue_and_dispatch_whatsapp_flow_owner_homologation_v11(uuid,text,text)') is not null;
  v10_service_role_disabled := not pg_catalog.has_function_privilege('service_role','public.queue_and_dispatch_whatsapp_flow_owner_homologation_v10(uuid,text,text)','EXECUTE');

  safe_v11 := coalesce((base->>'runtime_readiness_ok')::boolean,false)
    and not evidence_ok
    and not contamination
    and eligible_count = 1
    and active_count = 0
    and v11_exists
    and v10_service_role_disabled;

  if contamination then
    next_action := 'investigate_physical_order_contamination';
  elsif evidence_ok then
    next_action := 'physical_terminal_no_order_evidence_complete';
  elsif not coalesce((base->>'runtime_readiness_ok')::boolean,false) then
    next_action := 'fix_runtime_readiness';
  elsif not v10_service_role_disabled then
    next_action := 'disable_legacy_owner_launcher_v10';
  elsif active_count > 0 then
    next_action := 'continue_existing_owner_homologation_session';
  elsif eligible_count = 0 then
    next_action := 'wait_for_owner_service_window';
  elsif eligible_count = 1 then
    next_action := 'owner_conversation_ready_for_v11';
  else
    next_action := 'select_one_owner_conversation_explicitly';
  end if;

  return base || jsonb_build_object(
    'physical_evidence_ok', evidence_ok,
    'physical_next_required', coalesce(evidence->>'next_required',''),
    'physical_evidence_authority', 'v64-no-order-contamination-guard',
    'order_contamination_detected', contamination,
    'orders_created_in_homologation_window', coalesce((evidence->>'orders_created_in_homologation_window')::integer,0),
    'confirmed_order_nfm_events_after_finalize', coalesce((evidence->>'confirmed_order_nfm_events_after_finalize')::integer,0),
    'order_bound_outbound_jobs_in_homologation_window', coalesce((evidence->>'order_bound_outbound_jobs_in_homologation_window')::integer,0),
    'safe_to_launch_owner_v8', false,
    'safe_to_launch_owner_v9', false,
    'safe_to_launch_owner_v10', false,
    'safe_to_launch_owner_v11', safe_v11,
    'direct_v10_service_role_disabled', v10_service_role_disabled,
    'launcher_preflight_version', 'v8-v64-no-order-contamination-guard',
    'dispatch_version', 'v11-v64-contamination-guard-runtime-v26-edge49',
    'next_action', next_action,
    'writes_performed', false,
    'control_plane_version', 'v64-no-order-contamination-guard'
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v64_homologation_control_plane_v1() from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_v64_homologation_control_plane_v1() to service_role;

commit;
