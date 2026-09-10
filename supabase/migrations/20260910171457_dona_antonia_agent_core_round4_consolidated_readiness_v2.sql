create or replace function public.get_agent_core_round4_consolidated_readiness_v2()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with cfg as (
  select whatsapp_live_canary_percent,
         experience_orchestrator_enabled,
         whatsapp_flow_data_exchange_enabled,
         whatsapp_flow_send_enabled,
         whatsapp_flow_commercial_write_enabled,
         bling_order_sync_enabled
  from public.automation_config
  limit 1
), r as (
  select public.get_agent_core_round4_parity_report_v2() as parity,
         public.get_agent_core_round4_basket_tool_readiness_v1() as basket_tools,
         public.get_agent_core_round4_checkout_transition_readiness_v1() as checkout_tools,
         public.get_agent_core_round4_router_observability_v1() as router_observability
), inv as (
  select count(*) filter (where retirement_state='candidate') as candidate_count,
         count(*) filter (where retirement_state='blocked') as blocked_count,
         count(*) filter (where retirement_state='retired') as retired_count,
         count(*) filter (where classification='hard_safety' and retirement_state<>'keep') as unsafe_safety_state
  from public.agent_core_router_inventory
), calc as (
  select r.*,
         cfg.*,
         inv.*,
         coalesce((r.parity->>'retirement_ready')::boolean,false) as parity_ready,
         coalesce((r.basket_tools->>'observe_only')::boolean,false)
           and coalesce((r.basket_tools->>'risk_mismatches')::int,999)=0
           and coalesce((r.basket_tools->>'commitment_confirmation_guard')::boolean,false) as basket_tools_safe,
         coalesce((r.checkout_tools->>'observe_only')::boolean,false)
           and coalesce((r.checkout_tools->>'reversible_only')::boolean,false)
           and not coalesce((r.checkout_tools->>'pii_in_tool_arguments')::boolean,true) as checkout_tools_safe,
         coalesce((r.router_observability#>>'{privacy,message_body_stored}')::boolean,true)=false
           and coalesce((r.router_observability#>>'{privacy,pii_payload_stored}')::boolean,true)=false as router_observability_private,
         coalesce(cfg.whatsapp_live_canary_percent,100)=1
           and not coalesce(cfg.experience_orchestrator_enabled,true)
           and not coalesce(cfg.whatsapp_flow_data_exchange_enabled,true)
           and not coalesce(cfg.whatsapp_flow_send_enabled,true)
           and not coalesce(cfg.whatsapp_flow_commercial_write_enabled,true)
           and not coalesce(cfg.bling_order_sync_enabled,true) as rollout_gates_preserved
  from r cross join cfg cross join inv
)
select jsonb_build_object(
  'version',2,
  'round','4/6',
  'retirement_ready',
    parity_ready and basket_tools_safe and checkout_tools_safe and router_observability_private and rollout_gates_preserved and unsafe_safety_state=0,
  'reason',case
    when not rollout_gates_preserved then 'rollout_gates_not_preserved'
    when unsafe_safety_state<>0 then 'hard_safety_inventory_invalid'
    when not basket_tools_safe then 'basket_tools_not_safe'
    when not checkout_tools_safe then 'checkout_tools_not_safe'
    when not router_observability_private then 'router_observability_privacy_invalid'
    when not parity_ready then coalesce(parity->>'reason','parity_not_ready')
    else 'ready_for_controlled_router_retirement'
  end,
  'parity',parity,
  'basket_tools',basket_tools,
  'checkout_tools',checkout_tools,
  'router_observability',router_observability,
  'router_inventory',jsonb_build_object(
    'candidate_count',candidate_count,
    'blocked_count',blocked_count,
    'retired_count',retired_count,
    'hard_safety_invalid_count',unsafe_safety_state
  ),
  'rollout',jsonb_build_object(
    'whatsapp_live_canary_percent',whatsapp_live_canary_percent,
    'experience_orchestrator_enabled',experience_orchestrator_enabled,
    'whatsapp_flow_data_exchange_enabled',whatsapp_flow_data_exchange_enabled,
    'whatsapp_flow_send_enabled',whatsapp_flow_send_enabled,
    'whatsapp_flow_commercial_write_enabled',whatsapp_flow_commercial_write_enabled,
    'bling_order_sync_enabled',bling_order_sync_enabled,
    'gates_preserved',rollout_gates_preserved
  )
)
from calc;
$$;

revoke all on function public.get_agent_core_round4_consolidated_readiness_v2() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_consolidated_readiness_v2() to service_role;