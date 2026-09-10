begin;

create or replace function public.get_agent_core_round4_parity_report_v6(p_hours integer default 168)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with cfg as (
  select greatest(1,least(coalesce(p_hours,168),720)) hours
), ranked as (
  select t.*,j.result job_result,c.automation_cohort,m.body_text,m.transcript,m.ai_interpretation,
         row_number() over(partition by t.message_id order by t.created_at desc,t.id desc) rn
  from public.agent_core_turns t
  left join public.ai_jobs j on j.id=t.ai_job_id
  left join public.conversations c on c.id=t.conversation_id
  left join public.messages m on m.id=t.message_id
  cross join cfg
  where t.model is not null and t.status='planned' and t.created_at>=now()-(cfg.hours||' hours')::interval
), sample0 as (
  select r.*,
    coalesce((r.metadata->>'replay')::boolean,false) replay,
    case when coalesce((r.metadata->>'replay')::boolean,false) and coalesce(r.automation_cohort,'')='homologation'
      then coalesce((public.is_agent_core_stateless_historical_replay_job_v3(r.ai_job_id)->>'safe')::boolean,false)
      else false end replay_sample_safe
  from ranked r where r.rn=1
), excluded_live as (
  select count(*)::int n from sample0 where not replay
), excluded_unsafe as (
  select count(*)::int n from sample0 where replay and not replay_sample_safe
), sample as (
  select s.*,
    public.resolve_whatsapp_agent_core_topic_v4(
      coalesce(s.body_text,s.transcript,''),'','',coalesce(s.ai_interpretation->>'id','')
    ) expected_topic
  from sample0 s
  where s.replay and s.replay_sample_safe
), scored as (
  select s.*,
    case
      when expected_topic in ('basket','baskets') and lower(coalesce(decision_intent,'')) in ('basket','baskets') then true
      when expected_topic in ('search','product_search','product_detail','product') and lower(coalesce(decision_intent,'')) in ('search','product_search','product_detail','product') then true
      when expected_topic in ('cart','cart_change','cart_review') and lower(coalesce(decision_intent,'')) in ('cart','cart_change','cart_review') then true
      when expected_topic in ('general','clarify') and lower(coalesce(decision_intent,'')) in ('general','clarify') then true
      when expected_topic in ('checkout','payment','delivery','delivery_time','delivery_fee','delivery_promise','delivery_area','post_sale','human','greeting')
        and expected_topic=lower(coalesce(decision_intent,'')) then true
      else false end policy_intent_match,
    case
      when lower(coalesce(baseline_intent,'')) in ('baskets','basket') and lower(coalesce(decision_intent,'')) in ('baskets','basket') then true
      when lower(coalesce(baseline_intent,'')) in ('search','product_search','product_detail','product') and lower(coalesce(decision_intent,'')) in ('search','product_search','product_detail','product') then true
      when nullif(lower(coalesce(baseline_intent,'')),'') is null then null
      else lower(coalesce(baseline_intent,''))=lower(coalesce(decision_intent,'')) end legacy_intent_match,
    case
      when nullif(lower(coalesce(planned_tool,'')),'') is null then true
      when lower(coalesce(decision_intent,'')) in ('basket','baskets') then lower(coalesce(planned_tool,'')) in ('wa_list_baskets','wa_get_basket_state','wa_get_checkout_contact','wa_get_basket_customer_status','wa_get_cart','wa_get_recommendations','wa_add_product','wa_set_quantity','wa_replace_product','wa_select_basket','wa_start_basket_checkout','wa_create_basket_replacement','wa_add_more_products','wa_request_basket_payment','wa_prepare_basket_confirmation','wa_finalize_basket_order','wa_confirm_order','wa_get_policy','wa_handoff_human')
      when lower(coalesce(decision_intent,'')) in ('search','product_search','product_detail','product') then lower(coalesce(planned_tool,'')) in ('wa_search_products','wa_get_product','wa_get_cart','wa_add_product','wa_set_quantity','wa_get_policy','wa_handoff_human')
      when lower(coalesce(decision_intent,'')) in ('cart','cart_change','cart_review') then lower(coalesce(planned_tool,'')) in ('wa_get_cart','wa_set_quantity','wa_replace_product','wa_confirm_order','wa_get_recommendations','wa_search_products','wa_get_product','wa_add_product','wa_get_policy','wa_handoff_human')
      when lower(coalesce(decision_intent,''))='checkout' then lower(coalesce(planned_tool,'')) in ('wa_get_cart','wa_get_basket_state','wa_get_checkout_contact','wa_get_basket_customer_status','wa_start_basket_checkout','wa_start_order_checkout','wa_request_basket_payment','wa_prepare_basket_confirmation','wa_finalize_basket_order','wa_save_checkout_customer_data','wa_set_delivery_locator','wa_request_address_flow','wa_cancel_address_flow','wa_confirm_order','wa_get_policy','wa_handoff_human')
      when lower(coalesce(decision_intent,''))='payment' then lower(coalesce(planned_tool,'')) in ('wa_get_policy','wa_get_cart','wa_get_basket_state','wa_get_checkout_contact','wa_get_basket_customer_status','wa_request_basket_payment','wa_prepare_basket_confirmation','wa_finalize_basket_order','wa_handoff_human')
      when lower(coalesce(decision_intent,'')) in ('delivery','post_sale','human','general','greeting','clarify') then true
      else false end decision_tool_coherent
  from sample s
), agg as (
  select count(*)::int total,
    count(*) filter(where policy_intent_match)::int policy_matches,
    count(*) filter(where not policy_intent_match)::int policy_mismatches,
    count(*) filter(where legacy_intent_match is true)::int legacy_matches,
    count(*) filter(where legacy_intent_match is false)::int legacy_mismatches,
    count(*) filter(where legacy_intent_match is not null)::int legacy_comparable,
    count(*) filter(where decision_tool_coherent)::int coherent_tools,
    count(*) filter(where not decision_tool_coherent)::int incoherent_tools,
    count(*) filter(where escalated)::int escalations,
    count(*)::int replay_count,
    count(*) filter(where expected_topic='basket')::int basket_count,
    count(*) filter(where expected_topic in ('search','product_search','product_detail','product'))::int product_search_count,
    count(*) filter(where expected_topic='greeting')::int greeting_count,
    round(avg(coalesce(decision_confidence,0)::numeric),4) avg_confidence
  from scored
), rates as (
  select *,case when total>0 then round(policy_matches::numeric/total,4) else 0 end policy_rate,
    case when legacy_comparable>0 then round(legacy_matches::numeric/legacy_comparable,4) else 0 end legacy_rate,
    case when total>0 then round(coherent_tools::numeric/total,4) else 0 end coherence_rate from agg
)
select jsonb_build_object(
  'version',6,'window_hours',(select hours from cfg),'planned_sample',total,'deduplicated_by_message_id',true,
  'stateless_replay_only',true,'live_stateful_samples_excluded',(select n from excluded_live),
  'unsafe_historical_replays_excluded',(select n from excluded_unsafe),'replay_count',replay_count,
  'policy_intent_matches',policy_matches,'policy_intent_mismatches',policy_mismatches,'policy_intent_match_rate',policy_rate,
  'legacy_comparable',legacy_comparable,'legacy_intent_matches',legacy_matches,'legacy_intent_mismatches',legacy_mismatches,'legacy_intent_match_rate',legacy_rate,
  'decision_tool_coherent',coherent_tools,'decision_tool_incoherent',incoherent_tools,'decision_tool_coherence_rate',coherence_rate,
  'escalations',escalations,'average_confidence',coalesce(avg_confidence,0),
  'coverage',jsonb_build_object('basket',basket_count,'product_search',product_search_count,'greeting',greeting_count,'minimum_basket_required',6,'minimum_product_search_required',6),
  'minimum_sample_required',20,'minimum_policy_match_rate_required',0.95,'minimum_tool_coherence_rate_required',0.95,
  'candidate_retirement_ready',(total>=20 and policy_rate>=0.95 and coherence_rate>=0.95 and basket_count>=6 and product_search_count>=6),
  'reason',case when total<20 then 'insufficient_unique_semantic_shadow_sample' when basket_count<6 then 'insufficient_basket_coverage' when product_search_count<6 then 'insufficient_product_search_coverage' when policy_rate<0.95 then 'policy_intent_below_threshold' when coherence_rate<0.95 then 'decision_tool_coherence_below_threshold' else 'candidate_parity_threshold_met' end,
  'historical_expected_topic_recomputed',true,'legacy_is_informational',true,
  'stateful_quality_source','get_agent_core_round4_action_tool_parity_v1 + get_agent_core_round4_stateful_evidence_report_v1'
) from rates;
$$;

revoke all on function public.get_agent_core_round4_parity_report_v6(integer) from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_parity_report_v6(integer) to service_role;

create or replace function public.get_agent_core_round4_parity_report_v5(p_hours integer default 168)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select public.get_agent_core_round4_parity_report_v6(p_hours);
$$;

revoke all on function public.get_agent_core_round4_parity_report_v5(integer) from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_parity_report_v5(integer) to service_role;

commit;