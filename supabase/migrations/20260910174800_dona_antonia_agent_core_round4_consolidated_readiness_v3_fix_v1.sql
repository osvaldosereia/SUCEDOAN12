begin;

-- Mantem o mesmo contrato final do gate V3, corrigindo a chamada do relatorio de observabilidade sem argumentos.
create or replace function public.get_agent_core_round4_consolidated_readiness_v3()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  p jsonb:=public.get_agent_core_round4_parity_report_v3(168);
  b jsonb:=public.get_agent_core_round4_basket_tool_readiness_v1();
  c jsonb:=public.get_agent_core_round4_checkout_transition_readiness_v1();
  o jsonb:=public.get_agent_core_round4_router_observability_v1();
  h jsonb:=public.get_agent_core_round4_historical_replay_readiness_v1();
  s jsonb:=public.get_agent_core_round4_structured_topic_readiness_v1();
  rp jsonb:=public.get_agent_core_round4_replay_policy_readiness_v1();
  inv jsonb;
  rollout jsonb;
  blocked_count integer;
  hard_invalid integer;
  candidate_ready boolean;
  global_ready boolean;
begin
  select jsonb_build_object(
    'candidate_count',count(*) filter(where retirement_state='candidate'),
    'blocked_count',count(*) filter(where retirement_state='blocked'),
    'retired_count',count(*) filter(where retirement_state='retired'),
    'hard_safety_invalid_count',count(*) filter(where classification='hard_safety' and retirement_state<>'keep')
  ),count(*) filter(where retirement_state='blocked'),count(*) filter(where classification='hard_safety' and retirement_state<>'keep')
  into inv,blocked_count,hard_invalid
  from public.agent_core_router_inventory;

  select jsonb_build_object(
    'whatsapp_live_canary_percent',whatsapp_live_canary_percent,
    'experience_orchestrator_enabled',experience_orchestrator_enabled,
    'whatsapp_flow_data_exchange_enabled',whatsapp_flow_data_exchange_enabled,
    'whatsapp_flow_send_enabled',whatsapp_flow_send_enabled,
    'whatsapp_flow_commercial_write_enabled',whatsapp_flow_commercial_write_enabled,
    'bling_order_sync_enabled',bling_order_sync_enabled,
    'gates_preserved',(whatsapp_live_canary_percent=1 and not experience_orchestrator_enabled and not whatsapp_flow_data_exchange_enabled and not whatsapp_flow_send_enabled and not whatsapp_flow_commercial_write_enabled and not bling_order_sync_enabled)
  ) into rollout from public.automation_config limit 1;

  candidate_ready:=coalesce((p->>'candidate_retirement_ready')::boolean,false)
    and coalesce((rollout->>'gates_preserved')::boolean,false)
    and hard_invalid=0
    and coalesce((b->>'observe_only')::boolean,false)
    and coalesce((c->>'observe_only')::boolean,false);
  global_ready:=candidate_ready and blocked_count=0;

  return jsonb_build_object(
    'version',3,'round','4/6','candidate_retirement_ready',candidate_ready,'global_retirement_ready',global_ready,
    'reason',case
      when not coalesce((p->>'candidate_retirement_ready')::boolean,false) then p->>'reason'
      when not coalesce((rollout->>'gates_preserved')::boolean,false) then 'rollout_gate_not_preserved'
      when hard_invalid>0 then 'hard_safety_invalid'
      when not coalesce((b->>'observe_only')::boolean,false) then 'basket_tools_not_observe'
      when not coalesce((c->>'observe_only')::boolean,false) then 'checkout_tools_not_observe'
      when blocked_count>0 then 'blocked_routers_remain'
      else 'global_retirement_ready'
    end,
    'parity',p,'basket_tools',b,'checkout_tools',c,'router_observability',o,'historical_replay',h,'structured_topic',s,'replay_policy',rp,'router_inventory',inv,'rollout',rollout
  );
end
$$;

revoke all on function public.get_agent_core_round4_consolidated_readiness_v3() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_consolidated_readiness_v3() to service_role;

commit;