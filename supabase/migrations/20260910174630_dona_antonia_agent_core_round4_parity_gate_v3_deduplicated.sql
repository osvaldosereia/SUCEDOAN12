begin;

create or replace function public.get_agent_core_round4_parity_report_v3(p_hours integer default 168)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with cfg as (
  select greatest(1,least(coalesce(p_hours,168),720)) as hours
), ranked as (
  select t.*,
         row_number() over(partition by t.message_id order by t.created_at desc,t.id desc) as rn
  from public.agent_core_turns t,cfg
  where t.model is not null
    and t.status='planned'
    and t.created_at>=now()-(cfg.hours||' hours')::interval
), sample as (
  select
    r.message_id,
    r.ai_job_id,
    lower(coalesce(r.topic,'')) as topic,
    lower(coalesce(r.baseline_intent,'')) as baseline_intent,
    lower(coalesce(r.decision_intent,'')) as decision_intent,
    lower(coalesce(r.planned_tool,'')) as planned_tool,
    coalesce(r.decision_confidence,0)::numeric as confidence,
    coalesce(r.escalated,false) as escalated,
    coalesce((r.metadata->>'replay')::boolean,false) as replay,
    case
      when lower(coalesce(r.topic,'')) in ('basket','baskets')
        and lower(coalesce(r.decision_intent,'')) in ('basket','baskets') then true
      when lower(coalesce(r.topic,'')) in ('search','product_search','product_detail','product')
        and lower(coalesce(r.decision_intent,'')) in ('search','product_search','product_detail','product') then true
      when lower(coalesce(r.topic,'')) in ('cart','cart_change','cart_review')
        and lower(coalesce(r.decision_intent,'')) in ('cart','cart_change','cart_review') then true
      when lower(coalesce(r.topic,'')) in ('checkout','payment','delivery','post_sale','human','general','greeting','clarify')
        and lower(coalesce(r.topic,''))=lower(coalesce(r.decision_intent,'')) then true
      else false
    end as policy_intent_match,
    case
      when lower(coalesce(r.baseline_intent,'')) in ('baskets','basket')
        and lower(coalesce(r.decision_intent,'')) in ('baskets','basket') then true
      when lower(coalesce(r.baseline_intent,'')) in ('search','product_search','product_detail','product')
        and lower(coalesce(r.decision_intent,'')) in ('search','product_search','product_detail','product') then true
      when nullif(lower(coalesce(r.baseline_intent,'')),'') is null then null
      else lower(coalesce(r.baseline_intent,''))=lower(coalesce(r.decision_intent,''))
    end as legacy_intent_match,
    case
      when nullif(lower(coalesce(r.planned_tool,'')),'') is null then true
      when lower(coalesce(r.decision_intent,'')) in ('basket','baskets') then
        lower(coalesce(r.planned_tool,'')) in (
          'wa_list_baskets','wa_get_basket_state','wa_get_checkout_contact','wa_get_basket_customer_status','wa_get_cart',
          'wa_get_recommendations','wa_add_product','wa_set_quantity','wa_replace_product','wa_select_basket','wa_start_basket_checkout',
          'wa_create_basket_replacement','wa_add_more_products','wa_request_basket_payment','wa_prepare_basket_confirmation',
          'wa_finalize_basket_order','wa_confirm_order','wa_get_policy','wa_handoff_human'
        )
      when lower(coalesce(r.decision_intent,'')) in ('search','product_search','product_detail','product') then
        lower(coalesce(r.planned_tool,'')) in ('wa_search_products','wa_get_product','wa_get_cart','wa_add_product','wa_set_quantity','wa_get_policy','wa_handoff_human')
      when lower(coalesce(r.decision_intent,'')) in ('cart','cart_change','cart_review') then
        lower(coalesce(r.planned_tool,'')) in ('wa_get_cart','wa_set_quantity','wa_replace_product','wa_confirm_order','wa_get_recommendations','wa_search_products','wa_get_product','wa_add_product','wa_get_policy','wa_handoff_human')
      when lower(coalesce(r.decision_intent,''))='checkout' then
        lower(coalesce(r.planned_tool,'')) in ('wa_get_cart','wa_get_basket_state','wa_get_checkout_contact','wa_get_basket_customer_status','wa_start_basket_checkout','wa_request_basket_payment','wa_prepare_basket_confirmation','wa_finalize_basket_order','wa_save_checkout_customer_data','wa_set_delivery_locator','wa_request_address_flow','wa_cancel_address_flow','wa_confirm_order','wa_get_policy','wa_handoff_human')
      when lower(coalesce(r.decision_intent,''))='payment' then
        lower(coalesce(r.planned_tool,'')) in ('wa_get_policy','wa_get_cart','wa_get_basket_state','wa_get_checkout_contact','wa_get_basket_customer_status','wa_request_basket_payment','wa_prepare_basket_confirmation','wa_finalize_basket_order','wa_handoff_human')
      when lower(coalesce(r.decision_intent,'')) in ('delivery','post_sale','human','general','greeting','clarify') then true
      else false
    end as decision_tool_coherent
  from ranked r
  where r.rn=1
), agg as (
  select
    count(*)::int as total,
    count(*) filter(where policy_intent_match)::int as policy_matches,
    count(*) filter(where policy_intent_match is false)::int as policy_mismatches,
    count(*) filter(where legacy_intent_match is true)::int as legacy_matches,
    count(*) filter(where legacy_intent_match is false)::int as legacy_mismatches,
    count(*) filter(where legacy_intent_match is not null)::int as legacy_comparable,
    count(*) filter(where decision_tool_coherent)::int as coherent_tools,
    count(*) filter(where decision_tool_coherent is false)::int as incoherent_tools,
    count(*) filter(where escalated)::int as escalations,
    count(*) filter(where replay)::int as replay_count,
    count(*) filter(where topic='basket')::int as basket_count,
    count(*) filter(where topic in ('search','product_search','product_detail','product'))::int as product_search_count,
    count(*) filter(where topic='greeting')::int as greeting_count,
    round(avg(confidence),4) as avg_confidence
  from sample
), rates as (
  select *,
    case when total>0 then round(policy_matches::numeric/total,4) else 0::numeric end as policy_rate,
    case when legacy_comparable>0 then round(legacy_matches::numeric/legacy_comparable,4) else 0::numeric end as legacy_rate,
    case when total>0 then round(coherent_tools::numeric/total,4) else 0::numeric end as coherence_rate
  from agg
)
select jsonb_build_object(
  'version',3,
  'window_hours',(select hours from cfg),
  'planned_sample',total,
  'deduplicated_by_message_id',true,
  'replay_count',replay_count,
  'policy_intent_matches',policy_matches,
  'policy_intent_mismatches',policy_mismatches,
  'policy_intent_match_rate',policy_rate,
  'legacy_comparable',legacy_comparable,
  'legacy_intent_matches',legacy_matches,
  'legacy_intent_mismatches',legacy_mismatches,
  'legacy_intent_match_rate',legacy_rate,
  'decision_tool_coherent',coherent_tools,
  'decision_tool_incoherent',incoherent_tools,
  'decision_tool_coherence_rate',coherence_rate,
  'escalations',escalations,
  'average_confidence',coalesce(avg_confidence,0),
  'coverage',jsonb_build_object(
    'basket',basket_count,
    'product_search',product_search_count,
    'greeting',greeting_count,
    'minimum_basket_required',6,
    'minimum_product_search_required',6
  ),
  'minimum_sample_required',20,
  'minimum_policy_match_rate_required',0.95,
  'minimum_tool_coherence_rate_required',0.95,
  'candidate_retirement_ready',(
    total>=20 and policy_rate>=0.95 and coherence_rate>=0.95
    and basket_count>=6 and product_search_count>=6
  ),
  'reason',case
    when total<20 then 'insufficient_unique_shadow_sample'
    when basket_count<6 then 'insufficient_basket_coverage'
    when product_search_count<6 then 'insufficient_product_search_coverage'
    when policy_rate<0.95 then 'policy_intent_below_threshold'
    when coherence_rate<0.95 then 'decision_tool_coherence_below_threshold'
    else 'candidate_parity_threshold_met'
  end,
  'note','legacy agreement is informational; sample is deduplicated and structured topic/policy is the primary gate'
) from rates;
$$;

revoke all on function public.get_agent_core_round4_parity_report_v3(integer) from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_parity_report_v3(integer) to service_role;

create or replace function public.get_agent_core_round4_mismatch_sample_v3(p_hours integer default 168,p_limit integer default 20)
returns table(ai_job_id uuid,message_id uuid,topic text,baseline_intent text,decision_intent text,planned_tool text,confidence numeric,replay boolean,policy_match boolean)
language sql
stable
security definer
set search_path=''
as $$
with ranked as (
  select t.*,row_number() over(partition by t.message_id order by t.created_at desc,t.id desc) rn
  from public.agent_core_turns t
  where t.model is not null and t.status='planned'
    and t.created_at>=now()-(greatest(1,least(coalesce(p_hours,168),720))||' hours')::interval
), scored as (
  select r.*,
    case
      when lower(coalesce(r.topic,'')) in ('basket','baskets') and lower(coalesce(r.decision_intent,'')) in ('basket','baskets') then true
      when lower(coalesce(r.topic,'')) in ('search','product_search','product_detail','product') and lower(coalesce(r.decision_intent,'')) in ('search','product_search','product_detail','product') then true
      when lower(coalesce(r.topic,'')) in ('cart','cart_change','cart_review') and lower(coalesce(r.decision_intent,'')) in ('cart','cart_change','cart_review') then true
      when lower(coalesce(r.topic,'')) in ('checkout','payment','delivery','post_sale','human','general','greeting','clarify') and lower(coalesce(r.topic,''))=lower(coalesce(r.decision_intent,'')) then true
      else false
    end as policy_match
  from ranked r where rn=1
)
select s.ai_job_id,s.message_id,s.topic,s.baseline_intent,s.decision_intent,s.planned_tool,s.decision_confidence::numeric,
       coalesce((s.metadata->>'replay')::boolean,false),s.policy_match
from scored s
where s.policy_match=false
order by s.created_at desc
limit greatest(1,least(coalesce(p_limit,20),100));
$$;

revoke all on function public.get_agent_core_round4_mismatch_sample_v3(integer,integer) from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_mismatch_sample_v3(integer,integer) to service_role;

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