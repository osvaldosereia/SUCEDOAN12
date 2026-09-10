begin;

-- Rodada 4/6: evidência objetiva antes de aposentar interpretação legada.
-- Somente leitura/agregação; não altera atendimento nem rollout.

create or replace function public.get_agent_core_round4_parity_report_v1(p_hours integer default 168)
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
    lower(coalesce(t.baseline_intent,'')) as baseline_intent,
    lower(coalesce(t.decision_intent,'')) as decision_intent,
    lower(coalesce(t.planned_tool,'')) as planned_tool,
    coalesce(t.decision_confidence,0)::numeric as confidence,
    coalesce(t.escalated,false) as escalated,
    case
      when lower(coalesce(t.baseline_intent,'')) in ('baskets','basket')
        and lower(coalesce(t.decision_intent,'')) in ('baskets','basket') then true
      when lower(coalesce(t.baseline_intent,'')) in ('search','product_search','product')
        and lower(coalesce(t.decision_intent,'')) in ('search','product_search','product') then true
      when nullif(lower(coalesce(t.baseline_intent,'')),'') is not null
        and lower(coalesce(t.baseline_intent,''))=lower(coalesce(t.decision_intent,'')) then true
      else false
    end as intent_match,
    case
      when lower(coalesce(t.baseline_intent,'')) in ('baskets','basket')
        then lower(coalesce(t.planned_tool,''))='wa_list_baskets'
      when lower(coalesce(t.baseline_intent,'')) in ('search','product_search','product')
        then lower(coalesce(t.planned_tool,'')) in ('wa_search_products','wa_get_product')
      else null
    end as expected_tool_match
  from public.agent_core_turns t,cfg
  where t.model is not null
    and t.created_at>=now()-(cfg.hours||' hours')::interval
), agg as (
  select
    count(*)::int as total,
    count(*) filter(where intent_match)::int as intent_matches,
    count(*) filter(where intent_match is false)::int as intent_mismatches,
    count(*) filter(where expected_tool_match is true)::int as tool_matches,
    count(*) filter(where expected_tool_match is false)::int as tool_mismatches,
    count(*) filter(where expected_tool_match is not null)::int as tool_comparable,
    count(*) filter(where escalated)::int as escalations,
    round(avg(confidence),4) as avg_confidence
  from sample
), rates as (
  select *,
    case when total>0 then round(intent_matches::numeric/total,4) else 0::numeric end as intent_match_rate,
    case when tool_comparable>0 then round(tool_matches::numeric/tool_comparable,4) else 0::numeric end as tool_match_rate
  from agg
)
select jsonb_build_object(
  'window_hours',(select hours from cfg),
  'planned_sample',total,
  'intent_matches',intent_matches,
  'intent_mismatches',intent_mismatches,
  'intent_match_rate',intent_match_rate,
  'tool_comparable',tool_comparable,
  'tool_matches',tool_matches,
  'tool_mismatches',tool_mismatches,
  'tool_match_rate',tool_match_rate,
  'escalations',escalations,
  'average_confidence',coalesce(avg_confidence,0),
  'minimum_sample_required',20,
  'minimum_match_rate_required',0.95,
  'retirement_ready',(
    total>=20
    and intent_match_rate>=0.95
    and (tool_comparable=0 or tool_match_rate>=0.95)
  ),
  'reason',case
    when total<20 then 'insufficient_shadow_sample'
    when intent_match_rate<0.95 then 'intent_parity_below_threshold'
    when tool_comparable>0 and tool_match_rate<0.95 then 'tool_parity_below_threshold'
    else 'parity_threshold_met'
  end
)
from rates;
$$;

revoke all on function public.get_agent_core_round4_parity_report_v1(integer) from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_parity_report_v1(integer) to service_role;

create or replace function public.get_agent_core_round4_mismatch_sample_v1(p_hours integer default 168,p_limit integer default 20)
returns table(created_at timestamptz,baseline_intent text,decision_intent text,planned_tool text,decision_confidence numeric,escalated boolean)
language sql
stable
security definer
set search_path=''
as $$
with cfg as (
  select greatest(1,least(coalesce(p_hours,168),720)) as hours,
         greatest(1,least(coalesce(p_limit,20),100)) as lim
), scored as (
  select t.created_at,t.baseline_intent,t.decision_intent,t.planned_tool,t.decision_confidence,t.escalated,
    case
      when lower(coalesce(t.baseline_intent,'')) in ('baskets','basket')
        and lower(coalesce(t.decision_intent,'')) in ('baskets','basket') then true
      when lower(coalesce(t.baseline_intent,'')) in ('search','product_search','product')
        and lower(coalesce(t.decision_intent,'')) in ('search','product_search','product') then true
      when nullif(lower(coalesce(t.baseline_intent,'')),'') is not null
        and lower(coalesce(t.baseline_intent,''))=lower(coalesce(t.decision_intent,'')) then true
      else false
    end as intent_match,
    case
      when lower(coalesce(t.baseline_intent,'')) in ('baskets','basket') then lower(coalesce(t.planned_tool,''))='wa_list_baskets'
      when lower(coalesce(t.baseline_intent,'')) in ('search','product_search','product') then lower(coalesce(t.planned_tool,'')) in ('wa_search_products','wa_get_product')
      else null
    end as tool_match
  from public.agent_core_turns t,cfg
  where t.model is not null and t.created_at>=now()-(cfg.hours||' hours')::interval
)
select s.created_at,s.baseline_intent,s.decision_intent,s.planned_tool,s.decision_confidence,s.escalated
from scored s,cfg
where s.intent_match is false or s.tool_match is false
order by s.created_at desc
limit (select lim from cfg);
$$;

revoke all on function public.get_agent_core_round4_mismatch_sample_v1(integer,integer) from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_mismatch_sample_v1(integer,integer) to service_role;

commit;
