begin;

create or replace function public.get_agent_core_round2_report_v1(p_hours integer default 24)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with turns as (
  select t.*,
    case
      when t.metadata->>'next_action' in ('show_baskets','start_basket_flow') then 'basket'
      when t.metadata->>'next_action'='show_products' then 'product_search'
      when t.metadata->>'next_action' in ('cart','checkout','request_confirmation') then 'checkout'
      when t.metadata->>'next_action'='handoff' then 'human'
      else t.decision_intent
    end as effective_intent
  from public.agent_core_turns t
  where t.created_at>=now()-make_interval(hours=>least(168,greatest(1,coalesce(p_hours,24))))
    and coalesce((t.metadata->>'openai_shadow')::boolean,false)=true
    and t.model is not null
), calls as (
  select c.* from public.agent_core_tool_calls c join turns t on t.id=c.turn_id
), agg as (
  select
    count(*) as planned,
    count(*) filter(where status='failed') as failed,
    count(*) filter(where metadata->>'comparison'='intent_match') as raw_intent_matches,
    count(*) filter(where metadata->>'comparison'='intent_mismatch') as raw_intent_mismatches,
    count(*) filter(where baseline_intent is not null and
      case
        when lower(baseline_intent) in ('baskets','basket') then 'basket'
        when lower(baseline_intent) in ('search','product_search','product_detail') then 'product_search'
        when lower(baseline_intent) in ('cart','cart_change','cart_review') then 'cart'
        when lower(baseline_intent) in ('confirm_order','checkout') then 'checkout'
        when lower(baseline_intent) in ('answer','general') then 'general'
        else lower(baseline_intent)
      end = effective_intent
    ) as effective_matches,
    count(*) filter(where escalated) as escalated,
    round(avg(decision_confidence)::numeric,4) as avg_confidence,
    round(avg(latency_ms)::numeric,0) as avg_latency_ms,
    coalesce(sum(input_tokens),0) as input_tokens,
    coalesce(sum(cached_input_tokens),0) as cached_input_tokens,
    coalesce(sum(cache_write_tokens),0) as cache_write_tokens,
    coalesce(sum(output_tokens),0) as output_tokens
  from turns
), callagg as (
  select count(*) as tool_calls,
    count(*) filter(where executed) as executed_calls,
    count(*) filter(where executed and risk_class<>'read_only') as unsafe_write_executions,
    count(*) filter(where policy_decision='reused_same_turn') as same_turn_reuses,
    count(distinct tool_key) as distinct_tools
  from calls
)
select jsonb_build_object(
  'window_hours',least(168,greatest(1,coalesce(p_hours,24))),
  'planned',a.planned,
  'failed',a.failed,
  'raw_intent_matches',a.raw_intent_matches,
  'raw_intent_mismatches',a.raw_intent_mismatches,
  'effective_matches',a.effective_matches,
  'escalated',a.escalated,
  'avg_confidence',a.avg_confidence,
  'avg_latency_ms',a.avg_latency_ms,
  'input_tokens',a.input_tokens,
  'cached_input_tokens',a.cached_input_tokens,
  'cache_write_tokens',a.cache_write_tokens,
  'output_tokens',a.output_tokens,
  'cache_read_ratio',case when a.input_tokens>0 then round(a.cached_input_tokens::numeric/a.input_tokens,4) else 0 end,
  'tool_calls',c.tool_calls,
  'executed_calls',c.executed_calls,
  'unsafe_write_executions',c.unsafe_write_executions,
  'same_turn_reuses',c.same_turn_reuses,
  'distinct_tools',c.distinct_tools,
  'shadow_only',true
)
from agg a cross join callagg c;
$$;

revoke all on function public.get_agent_core_round2_report_v1(integer) from public,anon,authenticated;
grant execute on function public.get_agent_core_round2_report_v1(integer) to service_role;

comment on function public.get_agent_core_round2_report_v1(integer) is 'Round 2 shadow metrics. Raw model intent remains preserved; effective intent is derived only for behavioral comparison.';

commit;