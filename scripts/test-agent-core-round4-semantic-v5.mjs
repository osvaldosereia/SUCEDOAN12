import fs from 'node:fs';

const files=[
  'supabase/migrations/20260910175644_dona_antonia_agent_core_round4_canonical_product_search_v1.sql',
  'supabase/migrations/20260910180838_dona_antonia_agent_core_round4_product_vocabulary_topic_v4.sql',
  'supabase/migrations/20260910180911_dona_antonia_agent_core_round4_product_vocabulary_topic_v4_fix.sql',
  'supabase/migrations/20260910181140_dona_antonia_agent_core_round4_semantic_safe_replay_v3.sql',
  'supabase/migrations/20260910181233_dona_antonia_agent_core_round4_product_search_relevance_v2.sql',
  'supabase/migrations/20260910181316_dona_antonia_agent_core_round4_product_search_relevance_v3.sql',
  'supabase/migrations/20260910182049_dona_antonia_agent_core_round4_semantic_parity_gate_v5.sql'
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

if(body.includes('legacy_mismatchess'))throw new Error('parity_v5_typo_regression');
if(!body.includes("where not q.vocab_matched"))throw new Error('vocabulary_query_must_not_fuzzy_substitute');
mustEdge('search_whatsapp_sellable_products_agent_v1','agent_edge_uses_isolated_search');
if(!liveWorker.includes('search_whatsapp_sellable_products_v1'))throw new Error('live_worker_search_contract_changed_unexpectedly');
if(liveWorker.includes('search_whatsapp_sellable_products_agent_v1'))throw new Error('agent_search_must_not_leak_to_live_worker');

console.log('Agent Core Round 4 semantic V5 OK: vocabulary/intention, availability isolation, safe replay and parity gates are protected.');
