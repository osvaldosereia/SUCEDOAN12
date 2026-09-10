begin;

-- Rodada 4/6: paridade v2.
-- Baseline legado deixa de ser tratado como verdade absoluta.
-- O gate mede: decisão vs tópico/política determinística, decisão vs legado (informativo)
-- e coerência entre intenção escolhida e família da ferramenta.

create or replace function public.get_agent_core_round4_parity_report_v2(p_hours integer default 168)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with cfg as (
  select greatest(1,least(coalesce(p_hours,168),720)) as hours
), sample as (
  select
    t.created_at,
    lower(coalesce(t.topic,'')) as topic,
    lower(coalesce(t.baseline_intent,'')) as baseline_intent,
    lower(coalesce(t.decision_intent,'')) as decision_intent,
    lower(coalesce(t.planned_tool,'')) as planned_tool,
    coalesce(t.decision_confidence,0)::numeric as confidence,
    coalesce(t.escalated,false) as escalated,
    case
      when lower(coalesce(t.topic,'')) in ('basket','baskets')
        and lower(coalesce(t.decision_intent,'')) in ('basket','baskets') then true
      when lower(coalesce(t.topic,'')) in ('search','product_search','product_detail','product')
        and lower(coalesce(t.decision_intent,'')) in ('search','product_search','product_detail','product') then true
      when lower(coalesce(t.topic,'')) in ('cart','cart_change','cart_review')
        and lower(coalesce(t.decision_intent,'')) in ('cart','cart_change','cart_review') then true
      when lower(coalesce(t.topic,'')) in ('checkout','payment','delivery','post_sale','human','general','greeting','clarify')
        and lower(coalesce(t.topic,''))=lower(coalesce(t.decision_intent,'')) then true
      else false
    end as policy_intent_match,
    case
      when lower(coalesce(t.baseline_intent,'')) in ('baskets','basket')
        and lower(coalesce(t.decision_intent,'')) in ('baskets','basket') then true
      when lower(coalesce(t.baseline_intent,'')) in ('search','product_search','product_detail','product')
        and lower(coalesce(t.decision_intent,'')) in ('search','product_search','product_detail','product') then true
      when nullif(lower(coalesce(t.baseline_intent,'')),'') is null then null
      else lower(coalesce(t.baseline_intent,''))=lower(coalesce(t.decision_intent,''))
    end as legacy_intent_match,
    case
      when nullif(lower(coalesce(t.planned_tool,'')),'') is null then true
      when lower(coalesce(t.decision_intent,'')) in ('basket','baskets') then
        lower(coalesce(t.planned_tool,'')) in ('wa_list_baskets','wa_get_cart','wa_get_recommendations','wa_add_product','wa_set_quantity','wa_replace_product','wa_confirm_order','wa_get_policy','wa_handoff_human')
      when lower(coalesce(t.decision_intent,'')) in ('search','product_search','product_detail','product') then
        lower(coalesce(t.planned_tool,'')) in ('wa_search_products','wa_get_product','wa_get_cart','wa_add_product','wa_set_quantity','wa_get_policy','wa_handoff_human')
      when lower(coalesce(t.decision_intent,'')) in ('cart','cart_change','cart_review') then
        lower(coalesce(t.planned_tool,'')) in ('wa_get_cart','wa_set_quantity','wa_replace_product','wa_confirm_order','wa_get_recommendations','wa_search_products','wa_get_product','wa_add_product','wa_get_policy','wa_handoff_human')
      when lower(coalesce(t.decision_intent,''))='checkout' then
        lower(coalesce(t.planned_tool,'')) in ('wa_get_cart','wa_confirm_order','wa_get_policy','wa_handoff_human')
      when lower(coalesce(t.decision_intent,'')) in ('payment','delivery','post_sale','human','general','greeting','clarify') then true
      else false
    end as decision_tool_coherent
  from public.agent_core_turns t,cfg
  where t.model is not null
    and t.created_at>=now()-(cfg.hours||' hours')::interval
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
  'version',2,
  'window_hours',(select hours from cfg),
  'planned_sample',total,
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
  'minimum_sample_required',20,
  'minimum_policy_match_rate_required',0.95,
  'minimum_tool_coherence_rate_required',0.95,
  'retirement_ready',(total>=20 and policy_rate>=0.95 and coherence_rate>=0.95),
  'reason',case
    when total<20 then 'insufficient_shadow_sample'
    when policy_rate<0.95 then 'policy_intent_below_threshold'
    when coherence_rate<0.95 then 'decision_tool_coherence_below_threshold'
    else 'parity_threshold_met'
  end,
  'note','legacy agreement is informational; current deterministic topic/policy is the primary gate'
)
from rates;
$$;

revoke all on function public.get_agent_core_round4_parity_report_v2(integer) from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_parity_report_v2(integer) to service_role;

create or replace function public.get_agent_core_round4_mismatch_sample_v2(p_hours integer default 168,p_limit integer default 20)
returns table(created_at timestamptz,topic text,baseline_intent text,decision_intent text,planned_tool text,issue text,decision_confidence numeric,escalated boolean)
language sql
stable
security definer
set search_path=''
as $$
with cfg as (
  select greatest(1,least(coalesce(p_hours,168),720)) as hours,
         greatest(1,least(coalesce(p_limit,20),100)) as lim
), scored as (
  select t.created_at,t.topic,t.baseline_intent,t.decision_intent,t.planned_tool,t.decision_confidence,t.escalated,
    case
      when lower(coalesce(t.topic,'')) in ('basket','baskets')
        and lower(coalesce(t.decision_intent,'')) not in ('basket','baskets') then 'policy_intent_mismatch'
      when lower(coalesce(t.topic,'')) in ('search','product_search','product_detail','product')
        and lower(coalesce(t.decision_intent,'')) not in ('search','product_search','product_detail','product') then 'policy_intent_mismatch'
      when lower(coalesce(t.decision_intent,'')) in ('search','product_search','product_detail','product')
        and nullif(lower(coalesce(t.planned_tool,'')),'') is not null
        and lower(coalesce(t.planned_tool,'')) not in ('wa_search_products','wa_get_product','wa_get_cart','wa_add_product','wa_set_quantity','wa_get_policy','wa_handoff_human') then 'decision_tool_incoherent'
      when lower(coalesce(t.decision_intent,'')) in ('basket','baskets')
        and nullif(lower(coalesce(t.planned_tool,'')),'') is not null
        and lower(coalesce(t.planned_tool,'')) not in ('wa_list_baskets','wa_get_cart','wa_get_recommendations','wa_add_product','wa_set_quantity','wa_replace_product','wa_confirm_order','wa_get_policy','wa_handoff_human') then 'decision_tool_incoherent'
      else null
    end as issue
  from public.agent_core_turns t,cfg
  where t.model is not null and t.created_at>=now()-(cfg.hours||' hours')::interval
)
select s.created_at,s.topic,s.baseline_intent,s.decision_intent,s.planned_tool,s.issue,s.decision_confidence,s.escalated
from scored s,cfg
where s.issue is not null
order by s.created_at desc
limit (select lim from cfg);
$$;

revoke all on function public.get_agent_core_round4_mismatch_sample_v2(integer,integer) from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_mismatch_sample_v2(integer,integer) to service_role;

commit;
