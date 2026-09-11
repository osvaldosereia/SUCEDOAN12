create or replace function public.get_whatsapp_flow_v32_owner_homologation_readiness_v3(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_audit jsonb;
  v_cfg public.automation_config%rowtype;
  v_gates_ok boolean:=false;
  v_runtime_ok boolean:=false;
  v_cache_ok boolean:=false;
  v_visual_complete boolean:=false;
  v_manual_action text:=null;
begin
  v_audit:=public.get_whatsapp_flow_v32_live_session_audit_v2(p_session_id);
  select * into v_cfg from public.automation_config where id=1;
  if not found then
    return jsonb_build_object('ok',false,'reason','automation_config_missing','writes_executed',false,'pii_returned',false);
  end if;

  v_gates_ok:=
    coalesce(v_cfg.whatsapp_live_canary_percent,0)=1
    and not coalesce(v_cfg.experience_orchestrator_enabled,false)
    and not coalesce(v_cfg.whatsapp_flow_data_exchange_enabled,false)
    and not coalesce(v_cfg.whatsapp_flow_send_enabled,false)
    and not coalesce(v_cfg.whatsapp_flow_commercial_write_enabled,false)
    and not coalesce(v_cfg.bling_order_sync_enabled,false);

  v_runtime_ok:=coalesce((v_audit->>'current_runtime_ok')::boolean,false)
    and coalesce((v_audit->>'post_v32_error_count')::int,0)=0;
  v_cache_ok:=case
    when coalesce((v_audit->>'post_v32_guard_count')::int,0)=0 then true
    else coalesce((v_audit->>'replay_cache_coverage_complete')::boolean,false)
  end;
  v_visual_complete:=coalesce((v_audit->>'visual_homologation_complete')::boolean,false);

  if v_runtime_ok and v_gates_ok and v_cache_ok and not v_visual_complete then
    v_manual_action:='continue_owner_flow_from_'||coalesce(v_audit->>'current_screen','unknown');
  end if;

  return jsonb_build_object(
    'ok',v_runtime_ok and v_gates_ok and v_cache_ok,
    'runtime_ok',v_runtime_ok,
    'rollout_gates_preserved',v_gates_ok,
    'replay_cache_ready',v_cache_ok,
    'visual_homologation_complete',v_visual_complete,
    'current_screen',v_audit->>'current_screen',
    'next_expected',v_audit->>'next_expected',
    'post_v32_guard_count',coalesce((v_audit->>'post_v32_guard_count')::int,0),
    'post_v32_cached_response_count',coalesce((v_audit->>'post_v32_cached_response_count')::int,0),
    'post_v32_uncached_response_count',coalesce((v_audit->>'post_v32_uncached_response_count')::int,0),
    'post_v32_error_count',coalesce((v_audit->>'post_v32_error_count')::int,0),
    'manual_action_required',v_manual_action is not null,
    'manual_action',v_manual_action,
    'gates',jsonb_build_object(
      'whatsapp_live_canary_percent',v_cfg.whatsapp_live_canary_percent,
      'experience_orchestrator_enabled',v_cfg.experience_orchestrator_enabled,
      'whatsapp_flow_data_exchange_enabled',v_cfg.whatsapp_flow_data_exchange_enabled,
      'whatsapp_flow_send_enabled',v_cfg.whatsapp_flow_send_enabled,
      'whatsapp_flow_commercial_write_enabled',v_cfg.whatsapp_flow_commercial_write_enabled,
      'bling_order_sync_enabled',v_cfg.bling_order_sync_enabled
    ),
    'writes_executed',false,
    'pii_returned',false
  );
end;
$function$;

revoke all on function public.get_whatsapp_flow_v32_owner_homologation_readiness_v3(uuid) from public, anon, authenticated;
grant execute on function public.get_whatsapp_flow_v32_owner_homologation_readiness_v3(uuid) to service_role;
