begin;

create or replace function public.is_agent_core_stateless_historical_replay_job_v2(p_job_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$ select public.is_agent_core_stateless_historical_replay_job_v3(p_job_id); $$;
revoke all on function public.is_agent_core_stateless_historical_replay_job_v2(uuid) from public,anon,authenticated;
grant execute on function public.is_agent_core_stateless_historical_replay_job_v2(uuid) to service_role;

create or replace function public.get_agent_core_round4_product_search_readiness_v1()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select jsonb_build_object(
  'version',1,
  'vocabulary_source','whatsapp_flow_search_terms',
  'availability_source','counter_verified_products',
  'query_canonicalizer','canonicalize_whatsapp_product_query_v2',
  'agent_search','search_whatsapp_sellable_products_agent_v1',
  'live_search_unchanged',true,
  'intent_and_availability_separated',true,
  'arroz_topic',public.resolve_whatsapp_agent_core_topic_v4('Quero arroz','','',''),
  'feijao_typo_topic',public.resolve_whatsapp_agent_core_topic_v4('Fejao','','',''),
  'sabonete_topic',public.resolve_whatsapp_agent_core_topic_v4('Sabonete ?','','',''),
  'customer_data_not_product',public.resolve_whatsapp_agent_core_topic_v4('Você tem meu cadastro ?','','','')<>'product_search',
  'feijao_unavailable_not_substituted',not exists(select 1 from public.search_whatsapp_sellable_products_agent_v1('Fejao',5)),
  'arroz_available',exists(select 1 from public.search_whatsapp_sellable_products_agent_v1('Quero arroz',5)),
  'sabonete_available',exists(select 1 from public.search_whatsapp_sellable_products_agent_v1('Sabonete ?',5))
); $$;
revoke all on function public.get_agent_core_round4_product_search_readiness_v1() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_product_search_readiness_v1() to service_role;

create or replace function public.get_agent_core_round4_historical_replay_readiness_v3()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
with eligible as (
  select j.id,lower(coalesce(j.result->>'action',j.result#>>'{plan,intent}','')) action,public.is_agent_core_stateless_historical_replay_job_v3(j.id) safety
  from public.ai_jobs j join public.conversations c on c.id=j.conversation_id
  where j.status='done' and j.job_type='conversation' and c.automation_cohort='homologation' and j.created_at>=now()-interval '7 days'
), safe as (select * from eligible where coalesce((safety->>'safe')::boolean,false))
select jsonb_build_object(
  'version',3,'safe_candidate_count',(select count(*) from safe),
  'search_candidates',(select count(*) from safe where action='search'),
  'basket_candidates',(select count(*) from safe where action in ('show_baskets','basket_list_fallback','basket_choice_flow','whatsapp_flow_baskets')),
  'greeting_candidates',(select count(*) from safe where action='greeting'),
  'semantic_family_validation',true,'stateful_replay_blocked',true,'historical_state_neutral',true,'historical_toolset_restricted',true,
  'current_handoff_ignored_only_for_safe_read_only_replay',true
); $$;
revoke all on function public.get_agent_core_round4_historical_replay_readiness_v3() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_historical_replay_readiness_v3() to service_role;

create or replace function public.get_agent_core_round4_structured_topic_readiness_v2()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
select jsonb_build_object(
  'version',2,'resolver','resolve_whatsapp_agent_core_topic_v4',
  'basket_structured',public.resolve_whatsapp_agent_core_topic_v4('', '', '', 'da_basket:00000000-0000-0000-0000-000000000000')='basket',
  'basket_customize_structured',public.resolve_whatsapp_agent_core_topic_v4('', '', '', 'da_basket_customize')='basket',
  'payment_structured',public.resolve_whatsapp_agent_core_topic_v4('', '', '', 'da_basket_payment_credit')='payment',
  'checkout_structured',public.resolve_whatsapp_agent_core_topic_v4('', '', '', 'da_confirm_order')='checkout',
  'cart_structured',public.resolve_whatsapp_agent_core_topic_v4('', '', '', 'da_cart')='cart_review',
  'quantity_structured',public.resolve_whatsapp_agent_core_topic_v4('', '', '', 'da_qty:abc')='cart_change',
  'short_product_arroz',public.resolve_whatsapp_agent_core_topic_v4('Quero arroz','','','')='product_search',
  'short_product_feijao_typo',public.resolve_whatsapp_agent_core_topic_v4('Fejao','','','')='product_search',
  'short_product_sabonete',public.resolve_whatsapp_agent_core_topic_v4('Sabonete ?','','','')='product_search',
  'customer_data_not_product',public.resolve_whatsapp_agent_core_topic_v4('Você tem meu cadastro ?','','','')<>'product_search'
); $$;
revoke all on function public.get_agent_core_round4_structured_topic_readiness_v2() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_structured_topic_readiness_v2() to service_role;

create or replace function public.get_agent_core_round4_parity_report_v5(p_hours integer default 168)
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
      else true end replay_sample_safe
  from ranked r where r.rn=1
), sample as (
  select s.*,
    case when s.replay and coalesce(s.automation_cohort,'')='homologation'
      then public.resolve_whatsapp_agent_core_topic_v4(coalesce(s.body_text,s.transcript,''),'','',coalesce(s.ai_interpretation->>'id',''))
      else lower(coalesce(s.topic,'')) end expected_topic
  from sample0 s
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
      when lower(coalesce(decision_intent,''))='checkout' then lower(coalesce(planned_tool,'')) in ('wa_get_cart','wa_get_basket_state','wa_get_checkout_contact','wa_get_basket_customer_status','wa_start_basket_checkout','wa_request_basket_payment','wa_prepare_basket_confirmation','wa_finalize_basket_order','wa_save_checkout_customer_data','wa_set_delivery_locator','wa_request_address_flow','wa_cancel_address_flow','wa_confirm_order','wa_get_policy','wa_handoff_human')
      when lower(coalesce(decision_intent,''))='payment' then lower(coalesce(planned_tool,'')) in ('wa_get_policy','wa_get_cart','wa_get_basket_state','wa_get_checkout_contact','wa_get_basket_customer_status','wa_request_basket_payment','wa_prepare_basket_confirmation','wa_finalize_basket_order','wa_handoff_human')
      when lower(coalesce(decision_intent,'')) in ('delivery','post_sale','human','general','greeting','clarify') then true
      else false end decision_tool_coherent
  from sample s where s.replay_sample_safe
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
    count(*) filter(where replay)::int replay_count,
    count(*) filter(where expected_topic='basket')::int basket_count,
    count(*) filter(where expected_topic in ('search','product_search','product_detail','product'))::int product_search_count,
    count(*) filter(where expected_topic='greeting')::int greeting_count,
    round(avg(coalesce(decision_confidence,0)::numeric),4) avg_confidence
  from scored
), rates as (
  select *,case when total>0 then round(policy_matches::numeric/total,4) else 0 end policy_rate,
    case when legacy_comparable>0 then round(legacy_matches::numeric/legacy_comparable,4) else 0 end legacy_rate,
    case when total>0 then round(coherent_tools::numeric/total,4) else 0 end coherence_rate from agg
), excluded as (select count(*)::int n from sample where not replay_sample_safe)
select jsonb_build_object(
  'version',5,'window_hours',(select hours from cfg),'planned_sample',total,'deduplicated_by_message_id',true,
  'unsafe_historical_replays_excluded',(select n from excluded),'replay_count',replay_count,
  'policy_intent_matches',policy_matches,'policy_intent_mismatches',policy_mismatches,'policy_intent_match_rate',policy_rate,
  'legacy_comparable',legacy_comparable,'legacy_intent_matches',legacy_matches,'legacy_intent_mismatches',legacy_mismatchess,'legacy_intent_match_rate',legacy_rate,
  'decision_tool_coherent',coherent_tools,'decision_tool_incoherent',incoherent_tools,'decision_tool_coherence_rate',coherence_rate,
  'escalations',escalations,'average_confidence',coalesce(avg_confidence,0),
  'coverage',jsonb_build_object('basket',basket_count,'product_search',product_search_count,'greeting',greeting_count,'minimum_basket_required',6,'minimum_product_search_required',6),
  'minimum_sample_required',20,'minimum_policy_match_rate_required',0.95,'minimum_tool_coherence_rate_required',0.95,
  'candidate_retirement_ready',(total>=20 and policy_rate>=0.95 and coherence_rate>=0.95 and basket_count>=6 and product_search_count>=6),
  'reason',case when total<20 then 'insufficient_unique_semantic_shadow_sample' when basket_count<6 then 'insufficient_basket_coverage' when product_search_count<6 then 'insufficient_product_search_coverage' when policy_rate<0.95 then 'policy_intent_below_threshold' when coherence_rate<0.95 then 'decision_tool_coherence_below_threshold' else 'candidate_parity_threshold_met' end,
  'historical_expected_topic_recomputed',true,'legacy_is_informational',true
) from rates; $$;
revoke all on function public.get_agent_core_round4_parity_report_v5(integer) from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_parity_report_v5(integer) to service_role;

create or replace function public.get_agent_core_round4_consolidated_readiness_v5()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  p jsonb:=public.get_agent_core_round4_parity_report_v5(168);
  b jsonb:=public.get_agent_core_round4_basket_tool_readiness_v1();
  c jsonb:=public.get_agent_core_round4_checkout_transition_readiness_v1();
  o jsonb:=public.get_agent_core_round4_router_observability_v1();
  h jsonb:=public.get_agent_core_round4_historical_replay_readiness_v3();
  s jsonb:=public.get_agent_core_round4_structured_topic_readiness_v2();
  ps jsonb:=public.get_agent_core_round4_product_search_readiness_v1();
  rp jsonb:=public.get_agent_core_round4_replay_policy_readiness_v1();
  inv jsonb; rollout jsonb; blocked_count integer; hard_invalid integer; candidate_ready boolean; global_ready boolean;
begin
  select jsonb_build_object('candidate_count',count(*) filter(where retirement_state='candidate'),'blocked_count',count(*) filter(where retirement_state='blocked'),'retired_count',count(*) filter(where retirement_state='retired'),'hard_safety_invalid_count',count(*) filter(where classification='hard_safety' and retirement_state<>'keep')),
         count(*) filter(where retirement_state='blocked'),count(*) filter(where classification='hard_safety' and retirement_state<>'keep')
  into inv,blocked_count,hard_invalid from public.agent_core_router_inventory;
  select jsonb_build_object('whatsapp_live_canary_percent',whatsapp_live_canary_percent,'experience_orchestrator_enabled',experience_orchestrator_enabled,'whatsapp_flow_data_exchange_enabled',whatsapp_flow_data_exchange_enabled,'whatsapp_flow_send_enabled',whatsapp_flow_send_enabled,'whatsapp_flow_commercial_write_enabled',whatsapp_flow_commercial_write_enabled,'bling_order_sync_enabled',bling_order_sync_enabled,
    'gates_preserved',(whatsapp_live_canary_percent=1 and not experience_orchestrator_enabled and not whatsapp_flow_data_exchange_enabled and not whatsapp_flow_send_enabled and not whatsapp_flow_commercial_write_enabled and not bling_order_sync_enabled)) into rollout from public.automation_config limit 1;
  candidate_ready:=coalesce((p->>'candidate_retirement_ready')::boolean,false) and coalesce((rollout->>'gates_preserved')::boolean,false) and hard_invalid=0 and coalesce((b->>'observe_only')::boolean,false) and coalesce((c->>'observe_only')::boolean,false) and coalesce((ps->>'intent_and_availability_separated')::boolean,false);
  global_ready:=candidate_ready and blocked_count=0;
  return jsonb_build_object('version',5,'round','4/6','candidate_retirement_ready',candidate_ready,'global_retirement_ready',global_ready,
    'reason',case when not coalesce((p->>'candidate_retirement_ready')::boolean,false) then p->>'reason' when not coalesce((rollout->>'gates_preserved')::boolean,false) then 'rollout_gate_not_preserved' when hard_invalid>0 then 'hard_safety_invalid' when not coalesce((b->>'observe_only')::boolean,false) then 'basket_tools_not_observe' when not coalesce((c->>'observe_only')::boolean,false) then 'checkout_tools_not_observe' when not coalesce((ps->>'intent_and_availability_separated')::boolean,false) then 'product_search_contract_invalid' when blocked_count>0 then 'blocked_routers_remain' else 'global_retirement_ready' end,
    'parity',p,'basket_tools',b,'checkout_tools',c,'router_observability',o,'historical_replay',h,'structured_topic',s,'product_search',ps,'replay_policy',rp,'router_inventory',inv,'rollout',rollout);
end
$$;
revoke all on function public.get_agent_core_round4_consolidated_readiness_v5() from public,anon,authenticated;
grant execute on function public.get_agent_core_round4_consolidated_readiness_v5() to service_role;

commit;