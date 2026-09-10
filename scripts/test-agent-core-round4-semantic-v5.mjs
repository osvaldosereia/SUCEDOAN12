import fs from 'node:fs';

const files=[
  'supabase/migrations/20260910175644_dona_antonia_agent_core_round4_canonical_product_search_v1.sql',
  'supabase/migrations/20260910180838_dona_antonia_agent_core_round4_product_vocabulary_topic_v4.sql',
  'supabase/migrations/20260910180911_dona_antonia_agent_core_round4_product_vocabulary_topic_v4_fix.sql',
  'supabase/migrations/20260910181140_dona_antonia_agent_core_round4_semantic_safe_replay_v3.sql',
  'supabase/migrations/20260910181233_dona_antonia_agent_core_round4_product_search_relevance_v2.sql',
  'supabase/migrations/20260910181316_dona_antonia_agent_core_round4_product_search_relevance_v3.sql',
  'supabase/migrations/20260910182049_dona_antonia_agent_core_round4_semantic_parity_gate_v5.sql',
  'supabase/migrations/20260910184503_dona_antonia_agent_core_round4_historical_packet_state_neutral_v6.sql',
  'supabase/migrations/20260910184555_dona_antonia_agent_core_round4_historical_packet_readiness_v7_fix.sql',
  'supabase/migrations/20260910184955_dona_antonia_agent_core_round4_per_router_retirement_gate_v8.sql'
];
const body=files.map(f=>fs.readFileSync(f,'utf8')).join('\n').toLowerCase();
const edge=fs.readFileSync('supabase/functions/dona-antonia-agent-core-v1/index.ts','utf8').toLowerCase();
const liveWorker=fs.readFileSync('supabase/functions/conversation-worker-v3/index.ts','utf8').toLowerCase();
const must=(s,label)=>{if(!body.includes(s.toLowerCase()))throw new Error(`missing:${label}`)};
const mustEdge=(s,label)=>{if(!edge.includes(s.toLowerCase()))throw new Error(`missing_edge:${label}`)};

must('match_whatsapp_product_vocabulary_v1','central_product_vocabulary');
must('whatsapp_flow_search_terms','vocabulary_source');
must('canonicalize_whatsapp_product_query_v2','canonical_query_v2');
must('search_whatsapp_sellable_products_agent_v1','isolated_agent_search');
must('resolve_whatsapp_agent_core_topic_v4','topic_resolver_v4');
must('is_agent_core_stateless_historical_replay_job_v3','semantic_replay_v3');
must("'historical_semantic_family_mismatch'",'semantic_replay_fail_closed');
must('get_agent_core_round4_product_search_readiness_v1','product_search_readiness');
must('get_agent_core_round4_parity_report_v5','parity_v5');
must('get_agent_core_round4_consolidated_readiness_v5','consolidated_v5');
must("'minimum_sample_required',20",'minimum_sample_20');
must("'minimum_policy_match_rate_required',0.95",'policy_95');
must("'minimum_tool_coherence_rate_required',0.95",'tool_95');
must("'live_search_unchanged',true",'live_search_isolation_contract');
must("'intent_and_availability_separated',true",'intent_availability_separation');
must("'feijao_unavailable_not_substituted'",'no_false_feijao_substitute');
must("'customer_data_not_product'",'customer_data_not_product');

// Replays históricos precisam ser realmente stateless, não apenas marcados como replay.
must('get_agent_core_round4_historical_packet_readiness_v1','historical_packet_readiness');
must("topic:=public.resolve_whatsapp_agent_core_topic_v4(msg,'','',interactive_id)",'historical_topic_without_current_state');
must("hist:='[]'::jsonb",'historical_history_omitted');
must("selective:=jsonb_build_object('summary','','memories','[]'::jsonb)",'historical_memory_omitted');
must("'sales_state',case when v_is_historical then '{}'::jsonb",'historical_sales_state_omitted');
must("'customer',case when v_is_historical then null",'historical_customer_omitted');
must("'cart',case when v_is_historical then jsonb_build_object('exists',false,'items','[]'::jsonb)",'historical_cart_omitted');
must("coalesce(packet->'customer','null'::jsonb)='null'::jsonb",'json_null_readiness_fix');
must("coalesce(jsonb_array_length(packet->'customer_memory'),0)=0",'historical_customer_memory_readiness');
must("coalesce(packet->>'conversation_summary','')=''",'historical_summary_readiness');
must('get_agent_core_round4_consolidated_readiness_v6','consolidated_v6');

// Aposentadoria é por router e exige modo de execução, não só paridade agregada.
must('get_agent_core_round4_router_retirement_readiness_v1','per_router_retirement_gate');
must('get_agent_core_round4_consolidated_readiness_v7','consolidated_v7');
must("cfg.execution_mode in ('homologation','canary','live')",'execution_cutover_mode_guard');
must("cfg.legacy_router_policy in ('bypass','retired')",'legacy_policy_cutover_guard');
must("'execution_cutover_permitted'",'execution_cutover_telemetry');
must("'disable_now_count'",'disable_count_telemetry');
must("'a1_whatsapp_simple_product_query_v1'",'simple_product_router_specific_gate');
must("'evidence_ready',search_ready",'simple_product_evidence_gate');
must("'can_disable_now',search_ready and execution_cutover",'simple_product_disable_guard');
for(const blocked of [
  'aa_whatsapp_sales_greeting_fastpath',
  'trg_00_route_whatsapp_basket_swap_v1',
  'trg_01_whatsapp_basket_personalization_choice_v1',
  'trg_whatsapp_sales_multi_search_cta_v1'
]) must(`'${blocked}'`,`blocked_router_${blocked}`);
must("set retirement_state='blocked'",'stateful_candidates_reblocked');
must("'agent_core_observe_only'",'observe_mode_must_not_disable_router');

if(body.includes('legacy_mismatchess'))throw new Error('parity_v5_typo_regression');
if(!body.includes("where not q.vocab_matched"))throw new Error('vocabulary_query_must_not_fuzzy_substitute');
mustEdge('search_whatsapp_sellable_products_agent_v1','agent_edge_uses_isolated_search');
if(!liveWorker.includes('search_whatsapp_sellable_products_v1'))throw new Error('live_worker_search_contract_changed_unexpectedly');
if(liveWorker.includes('search_whatsapp_sellable_products_agent_v1'))throw new Error('agent_search_must_not_leak_to_live_worker');

for(const unsafe of [
  'whatsapp_live_canary_percent=100',
  'whatsapp_live_canary_percent = 100',
  'experience_orchestrator_enabled=true',
  'experience_orchestrator_enabled = true',
  'whatsapp_flow_data_exchange_enabled=true',
  'whatsapp_flow_send_enabled=true',
  'whatsapp_flow_commercial_write_enabled=true',
  'bling_order_sync_enabled=true'
]){
  if(body.includes(unsafe))throw new Error(`unsafe_rollout_change:${unsafe}`);
}

console.log('Agent Core Round 4 semantic V8 OK: vocabulary/search isolation, state-neutral replay, parity and per-router retirement gates are protected.');
