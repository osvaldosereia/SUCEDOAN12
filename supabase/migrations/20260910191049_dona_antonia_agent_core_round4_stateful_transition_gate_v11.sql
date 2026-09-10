begin;

create or replace function public.get_agent_core_round4_stateful_transition_readiness_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  pre jsonb:=public.get_agent_core_round4_stateful_precondition_readiness_v1();
  cfg public.agent_core_runtime_config%rowtype;
  rollout jsonb;
  hard_invalid integer:=0;
  stateful_non_observe integer:=0;
  safe_shadow boolean:=false;
  future_homologation_ready boolean:=false;
begin
  select * into cfg from public.agent_core_runtime_config where id=1;

  select jsonb_build_object(
    'whatsapp_live_canary_percent',whatsapp_live_canary_percent,
    'experience_orchestrator_enabled',experience_orchestrator_enabled,
    'whatsapp_flow_data_exchange_enabled',whatsapp_flow_data_exchange_enabled,
    'whatsapp_flow_send_enabled',whatsapp_flow_send_enabled,
    'whatsapp_flow_commercial_write_enabled',whatsapp_flow_commercial_write_enabled,
    'bling_order_sync_enabled',bling_order_sync_enabled,
    'gates_preserved',(
      whatsapp_live_canary_percent=1
      and not experience_orchestrator_enabled
      and not whatsapp_flow_data_exchange_enabled
      and not whatsapp_flow_send_enabled
      and not whatsapp_flow_commercial_write_enabled
      and not bling_order_sync_enabled
    )
  ) into rollout
  from public.automation_config where id=1;

  select count(*) filter(where classification='hard_safety' and retirement_state<>'keep')::integer
    into hard_invalid
  from public.agent_core_router_inventory;

  select count(*)::integer into stateful_non_observe
  from public.ai_action_registry
  where enabled=true
    and 'whatsapp'=any(allowed_channels)
    and risk_class in ('reversible_write','commitment')
    and execution_mode<>'observe';

  safe_shadow:=coalesce(cfg.enabled,false)
    and cfg.execution_mode='observe'
    and cfg.legacy_router_policy='shadow'
    and coalesce((pre->>'ready')::boolean,false)
    and coalesce((pre->>'all_stateful_still_observe')::boolean,false)
    and coalesce((pre->>'pii_returned')::boolean,true)=false
    and coalesce((rollout->>'gates_preserved')::boolean,false)
    and hard_invalid=0
    and stateful_non_observe=0;

  future_homologation_ready:=safe_shadow
    and coalesce((pre->>'declared_precondition_count')::integer,0)=19
    and coalesce((pre->>'supported_precondition_count')::integer,0)=19;

  return jsonb_build_object(
    'version',1,
    'safe_shadow',safe_shadow,
    'future_homologation_ready',future_homologation_ready,
    'manual_authorization_required',true,
    'stateful_execution_permitted_now',false,
    'execution_mode',cfg.execution_mode,
    'legacy_router_policy',cfg.legacy_router_policy,
    'stateful_non_observe_count',stateful_non_observe,
    'hard_safety_invalid_count',hard_invalid,
    'preconditions',pre,
    'rollout',rollout,
    'reason',case
      when not coalesce(cfg.enabled,false) then 'agent_core_disabled'
      when cfg.execution_mode<>'observe' then 'agent_core_not_observe'
      when cfg.legacy_router_policy<>'shadow' then 'legacy_router_policy_not_shadow'
      when not coalesce((pre->>'ready')::boolean,false) then 'stateful_preconditions_not_ready'
      when coalesce((pre->>'pii_returned')::boolean,true) then 'precondition_guard_exposes_pii'
      when not coalesce((rollout->>'gates_preserved')::boolean,false) then 'rollout_gate_not_preserved'
      when hard_invalid>0 then 'hard_safety_invalid'
      when stateful_non_observe>0 then 'stateful_action_left_observe'
      when coalesce((pre->>'declared_precondition_count')::integer,0)<>19 then 'declared_precondition_count_changed'
      when coalesce((pre->>'supported_precondition_count')::integer,0)<>19 then 'supported_precondition_count_changed'
      else 'shadow_stateful_guard_ready' end
  );
end
$$;

revoke all on function public.get_agent_core_round4_stateful_transition_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_stateful_transition_readiness_v1() to service_role;

create or replace function public.get_agent_core_round4_consolidated_readiness_v8()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  base jsonb:=public.get_agent_core_round4_consolidated_readiness_v7();
  st jsonb:=public.get_agent_core_round4_stateful_transition_readiness_v1();
begin
  return base || jsonb_build_object(
    'version',8,
    'stateful_transition',st,
    'stateful_shadow_ready',coalesce((st->>'safe_shadow')::boolean,false),
    'future_homologation_ready',coalesce((st->>'future_homologation_ready')::boolean,false),
    'manual_authorization_required',true,
    'retirement_execution_permitted',false,
    'global_retirement_ready',false,
    'reason',case
      when not coalesce((st->>'safe_shadow')::boolean,false) then st->>'reason'
      else base->>'reason' end
  );
end
$$;

revoke all on function public.get_agent_core_round4_consolidated_readiness_v8() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_consolidated_readiness_v8() to service_role;

commit;