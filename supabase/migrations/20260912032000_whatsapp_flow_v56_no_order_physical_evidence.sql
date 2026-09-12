begin;

create or replace function public.get_whatsapp_flow_v56_no_order_physical_terminal_evidence_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v54 jsonb;
  v_session_id uuid;
  v_context jsonb := '{}'::jsonb;
  v_upsell_at timestamptz;
  v_review_at timestamptz;
  v_customer_at timestamptz;
  v_finalize_at timestamptz;
  v_no_order_nfm_at timestamptz;
  v_location_at timestamptz;
  v_markers_ok boolean := false;
  v_ordered boolean := false;
  v_ok boolean := false;
  v_next_required text;
  v_checks jsonb;
begin
  v54 := public.get_whatsapp_flow_v54_ordered_physical_terminal_evidence_v1();

  begin
    v_session_id := nullif(v54#>>'{session,id}','')::uuid;
  exception when others then
    v_session_id := null;
  end;
  begin v_upsell_at := nullif(v54#>>'{ordered_timestamps,upsell_at}','')::timestamptz; exception when others then v_upsell_at := null; end;
  begin v_review_at := nullif(v54#>>'{ordered_timestamps,review_at}','')::timestamptz; exception when others then v_review_at := null; end;
  begin v_customer_at := nullif(v54#>>'{ordered_timestamps,customer_at}','')::timestamptz; exception when others then v_customer_at := null; end;
  begin v_finalize_at := nullif(v54#>>'{ordered_timestamps,finalize_at}','')::timestamptz; exception when others then v_finalize_at := null; end;

  if v_session_id is not null then
    select coalesce(es.context,'{}'::jsonb)
      into v_context
    from public.experience_sessions es
    where es.id = v_session_id;

    v_markers_ok :=
      coalesce((v_context->>'homologation_test')::boolean,false)
      and coalesce((v_context->>'requested_by_owner')::boolean,false)
      and coalesce((v_context->>'homologation_terminal_preview')::boolean,false)
      and coalesce((v_context->>'homologation_terminal_no_order')::boolean,false)
      and nullif(trim(coalesce(v_context->>'flow_order_id','')),'') is null;

    if v_finalize_at is not null then
      select min(ev.created_at)
        into v_no_order_nfm_at
      from public.experience_events ev
      where ev.session_id = v_session_id
        and ev.event_type = 'flow_nfm_reply'
        and ev.interface_type = 'whatsapp_flow'
        and ev.created_at >= v_finalize_at
        and coalesce((ev.event_data->>'homologation_no_order')::boolean,false)
        and not coalesce((ev.event_data->>'has_confirmed_order')::boolean,false);
    end if;

    if v_no_order_nfm_at is not null then
      select min(m.created_at)
        into v_location_at
      from public.messages m
      join public.experience_sessions es on es.id = v_session_id
      where m.conversation_id = es.conversation_id
        and m.direction = 'inbound'
        and lower(coalesce(m.message_type,'')) = 'location'
        and m.created_at > v_no_order_nfm_at;
    end if;
  end if;

  v_ordered := v_upsell_at is not null
    and v_review_at is not null and v_review_at >= v_upsell_at
    and v_customer_at is not null and v_customer_at >= v_review_at
    and v_finalize_at is not null and v_finalize_at >= v_customer_at
    and v_markers_ok
    and v_no_order_nfm_at is not null and v_no_order_nfm_at >= v_finalize_at
    and v_location_at is not null and v_location_at > v_no_order_nfm_at;

  v_checks := jsonb_build_array(
    jsonb_build_object('name','v48_preflight_green','ok',coalesce((v54->>'preflight_ok')::boolean,false)),
    jsonb_build_object('name','owner_homologation_session_present','ok',v_session_id is not null),
    jsonb_build_object('name','upsell_physically_observed','ok',v_upsell_at is not null),
    jsonb_build_object('name','review_after_upsell','ok',v_review_at is not null and v_upsell_at is not null and v_review_at >= v_upsell_at),
    jsonb_build_object('name','customer_after_review','ok',v_customer_at is not null and v_review_at is not null and v_customer_at >= v_review_at),
    jsonb_build_object('name','finalize_after_customer','ok',v_finalize_at is not null and v_customer_at is not null and v_finalize_at >= v_customer_at),
    jsonb_build_object('name','owner_no_order_terminal_markers','ok',v_markers_ok),
    jsonb_build_object('name','nfm_reply_no_order_after_finalize','ok',v_no_order_nfm_at is not null and v_finalize_at is not null and v_no_order_nfm_at >= v_finalize_at),
    jsonb_build_object('name','location_strictly_after_no_order_nfm','ok',v_location_at is not null and v_no_order_nfm_at is not null and v_location_at > v_no_order_nfm_at),
    jsonb_build_object('name','terminal_no_order_sequence_ordered','ok',v_ordered)
  );

  v_ok := not exists(
    select 1 from jsonb_array_elements(v_checks) x
    where not coalesce((x->>'ok')::boolean,false)
  );

  v_next_required := case
    when v_upsell_at is null then 'UPSELL'
    when v_review_at is null or v_review_at < v_upsell_at then 'REVISAO'
    when v_customer_at is null or v_customer_at < v_review_at then 'CLIENTE_EXISTENTE|CLIENTE_NOVO'
    when v_finalize_at is null or v_finalize_at < v_customer_at then 'FINALIZAR'
    when not v_markers_ok then 'FINALIZAR_NO_ORDER_MARKER'
    when v_no_order_nfm_at is null or v_no_order_nfm_at < v_finalize_at then 'nfm_reply_no_order'
    when v_location_at is null or v_location_at <= v_no_order_nfm_at then 'location'
    else 'complete'
  end;

  return v54 || jsonb_build_object(
    'ok',v_ok,
    'checks',v_checks,
    'ordered_timestamps',coalesce(v54->'ordered_timestamps','{}'::jsonb) || jsonb_build_object(
      'nfm_reply_no_order_at',v_no_order_nfm_at,
      'location_after_no_order_nfm_at',v_location_at
    ),
    'required_sequence',jsonb_build_array('UPSELL','REVISAO','CLIENTE_EXISTENTE|CLIENTE_NOVO','FINALIZAR_NO_ORDER','nfm_reply_no_order','location'),
    'next_required',v_next_required,
    'sequence_strict',true,
    'requires_homologation_no_order_marker',true,
    'requires_has_confirmed_order_false',true,
    'writes_performed',false,
    'evidence_version','v56-no-order-terminal'
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v56_no_order_physical_terminal_evidence_v1() from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_v56_no_order_physical_terminal_evidence_v1() to service_role;

create or replace function public.get_whatsapp_flow_v56_homologation_control_plane_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v54 jsonb;
  evidence jsonb;
  evidence_ok boolean := false;
  eligible_count integer := 0;
  active_count integer := 0;
  safe_v9 boolean := false;
  next_action text;
begin
  v54 := public.get_whatsapp_flow_v54_homologation_control_plane_v1();
  evidence := public.get_whatsapp_flow_v56_no_order_physical_terminal_evidence_v1();
  evidence_ok := coalesce((evidence->>'ok')::boolean,false);
  eligible_count := coalesce((v54->>'eligible_owner_conversations')::integer,0);
  active_count := coalesce((v54->>'active_owner_homologation_sessions')::integer,0);

  safe_v9 := coalesce((v54->>'runtime_readiness_ok')::boolean,false)
    and not evidence_ok
    and eligible_count = 1
    and active_count = 0
    and to_regprocedure('public.queue_and_dispatch_whatsapp_flow_owner_homologation_v9(uuid,text,text)') is not null;

  if evidence_ok then
    next_action := 'physical_terminal_no_order_evidence_complete';
  elsif not coalesce((v54->>'runtime_readiness_ok')::boolean,false) then
    next_action := 'fix_runtime_readiness';
  elsif active_count > 0 then
    next_action := 'continue_existing_owner_homologation_session';
  elsif eligible_count = 0 then
    next_action := 'wait_for_owner_service_window';
  elsif eligible_count = 1 then
    next_action := 'owner_conversation_ready_for_v9';
  else
    next_action := 'select_one_owner_conversation_explicitly';
  end if;

  return v54 || jsonb_build_object(
    'physical_evidence_ok',evidence_ok,
    'physical_next_required',coalesce(evidence->>'next_required',''),
    'physical_sequence_strict',true,
    'physical_requires_no_order_proof',true,
    'safe_to_launch_owner_v8',false,
    'safe_to_launch_owner_v9',safe_v9,
    'next_action',next_action,
    'control_plane_version','v56-no-order-terminal-evidence'
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v56_homologation_control_plane_v1() from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_v56_homologation_control_plane_v1() to service_role;

commit;
