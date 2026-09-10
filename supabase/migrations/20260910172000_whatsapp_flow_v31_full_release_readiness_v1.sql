-- WhatsApp Flow V31: unified release-readiness gate for owner-only homologation.
-- Additive/read-only. It does not enable any rollout gate or create sessions/jobs.

create or replace function public.get_whatsapp_flow_v31_full_release_readiness_v1(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_conversation_id uuid;
  v_commercial jsonb;
  v_terminal jsonb;
  v_preflight jsonb;
  v_audit jsonb;
  v_cfg public.automation_config%rowtype;
  v_runtime text:=coalesce(pg_get_functiondef('public.handle_whatsapp_flow_commercial_exchange_v23(uuid,uuid,text,text,jsonb)'::regprocedure),'');
  v_nfm text:=coalesce(pg_get_functiondef('public.process_whatsapp_flow_nfm_reply_v1(uuid,uuid,jsonb)'::regprocedure),'');
  checks jsonb:='[]'::jsonb;
  passed int:=0;
  total int:=0;
  c jsonb;
begin
  select conversation_id into v_conversation_id
    from public.experience_sessions
   where id=p_session_id;

  if v_conversation_id is null then
    return jsonb_build_object('ok',false,'reason','session_not_found','session_id',p_session_id);
  end if;

  select * into v_cfg from public.automation_config where id=1;
  v_commercial:=public.get_whatsapp_flow_v31_commercial_journey_readiness_v1();
  v_terminal:=public.get_whatsapp_flow_v31_terminal_readiness_v1();
  v_preflight:=public.get_whatsapp_flow_v31_homologation_preflight_v3(p_session_id,v_conversation_id);
  v_audit:=public.get_whatsapp_flow_v31_journey_audit_v4(p_session_id);

  checks:=jsonb_build_array(
    jsonb_build_object('name','commercial_journey_ready','ok',coalesce((v_commercial->>'ok')::boolean,false)),
    jsonb_build_object('name','terminal_bridge_ready','ok',coalesce((v_terminal->>'ok')::boolean,false)),
    jsonb_build_object('name','journey_healthy','ok',coalesce((v_audit->>'healthy')::boolean,false)),
    jsonb_build_object('name','canary_locked_1','ok',coalesce(v_cfg.whatsapp_live_canary_percent,0)=1),
    jsonb_build_object('name','orchestrator_off','ok',not coalesce(v_cfg.experience_orchestrator_enabled,false)),
    jsonb_build_object('name','data_exchange_global_off','ok',not coalesce(v_cfg.whatsapp_flow_data_exchange_enabled,false)),
    jsonb_build_object('name','flow_send_global_off','ok',not coalesce(v_cfg.whatsapp_flow_send_enabled,false)),
    jsonb_build_object('name','commercial_write_off','ok',not coalesce(v_cfg.whatsapp_flow_commercial_write_enabled,false)),
    jsonb_build_object('name','bling_off','ok',not coalesce(v_cfg.bling_order_sync_enabled,false)),
    jsonb_build_object('name','runtime_v23_present','ok',position('handle_whatsapp_flow_commercial_exchange_v22' in v_runtime)>0 and position('get_whatsapp_checkout_contact_v1' in v_runtime)>0),
    jsonb_build_object('name','nfm_reply_present','ok',length(v_nfm)>0),
    jsonb_build_object('name','owner_target_authorized','ok',coalesce((v_preflight#>>'{checks,19,ok}')::boolean,false)),
    jsonb_build_object('name','owner_conversation_ai','ok',coalesce((v_preflight#>>'{checks,29,ok}')::boolean,false)),
    jsonb_build_object('name','owner_service_window_open','ok',coalesce((v_preflight#>>'{checks,30,ok}')::boolean,false)),
    jsonb_build_object('name','owner_handoff_clear','ok',coalesce((v_preflight#>>'{checks,31,ok}')::boolean,false))
  );

  total:=jsonb_array_length(checks);
  for c in select value from jsonb_array_elements(checks) loop
    if coalesce((c->>'ok')::boolean,false) then passed:=passed+1; end if;
  end loop;

  return jsonb_build_object(
    'ok',passed=total,
    'healthy',coalesce((v_commercial->>'ok')::boolean,false)
              and coalesce((v_terminal->>'ok')::boolean,false)
              and coalesce((v_audit->>'healthy')::boolean,false),
    'homologation_ready',coalesce((v_preflight->>'ok')::boolean,false),
    'passed',passed,
    'total',total,
    'checks',checks,
    'session_id',p_session_id,
    'conversation_id',v_conversation_id,
    'next_expected',v_audit->>'next_expected',
    'commercial',v_commercial,
    'terminal',v_terminal,
    'preflight',v_preflight,
    'audit',v_audit,
    'checked_at',now()
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v31_full_release_readiness_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_whatsapp_flow_v31_full_release_readiness_v1(uuid) to service_role;
