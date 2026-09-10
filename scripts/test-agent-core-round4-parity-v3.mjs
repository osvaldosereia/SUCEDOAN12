import fs from 'node:fs';

const structured=fs.readFileSync('supabase/migrations/20260910174210_dona_antonia_agent_core_round4_structured_topic_v3.sql','utf8').toLowerCase();
const parity=fs.readFileSync('supabase/migrations/20260910174630_dona_antonia_agent_core_round4_parity_gate_v3_deduplicated.sql','utf8').toLowerCase();
const fix=fs.readFileSync('supabase/migrations/20260910174800_dona_antonia_agent_core_round4_consolidated_readiness_v3_fix_v1.sql','utf8').toLowerCase();
const all=`${structured}\n${parity}\n${fix}`;
const must=(body,text,label)=>{if(!body.includes(text.toLowerCase()))throw new Error(`missing:${label}`)};
const forbid=(body,text,label)=>{if(body.includes(text.toLowerCase()))throw new Error(`forbidden:${label}`)};

must(structured,'resolve_whatsapp_agent_core_topic_v3','structured_topic_v3');
for(const key of ['da_basket','da_basket_customize','da_basket_payment_credit','da_confirm_order','da_cart','da_qty']) must(structured,key,`structured_${key}`);
must(structured,"interactive_id:=coalesce(m.ai_interpretation->>'id','')",'historical_interactive_id');
must(structured,"interactive_id:=coalesce(base#>>'{message,interactive,id}','')",'live_interactive_id');
must(structured,"'structured_topic_v3',true",'structured_topic_marker');

must(parity,'get_agent_core_round4_parity_report_v3','parity_v3');
must(parity,'row_number() over(partition by t.message_id','dedup_by_message');
must(parity,"t.status='planned'",'planned_only');
must(parity,"'deduplicated_by_message_id',true",'dedup_reported');
must(parity,"'minimum_basket_required',6",'basket_coverage_gate');
must(parity,"'minimum_product_search_required',6",'product_coverage_gate');
must(parity,"'minimum_policy_match_rate_required',0.95",'policy_threshold');
must(parity,"'minimum_tool_coherence_rate_required',0.95",'tool_threshold');
must(parity,"'candidate_retirement_ready'",'candidate_gate');
must(parity,"global_ready:=candidate_ready and blocked_count=0",'blocked_routers_prevent_global_ready');
must(parity,"'global_retirement_ready',global_ready",'global_gate_reported');
must(fix,'get_agent_core_round4_router_observability_v1()','observability_signature_fixed');

for(const unsafe of [
  'whatsapp_live_canary_percent=100',
  'experience_orchestrator_enabled=true',
  'whatsapp_flow_data_exchange_enabled=true',
  'whatsapp_flow_send_enabled=true',
  'whatsapp_flow_commercial_write_enabled=true',
  'bling_order_sync_enabled=true'
]) forbid(all,unsafe,unsafe);

console.log('Agent Core parity V3 OK: structured topics, unique-message sampling, coverage thresholds and blocked-router global fail-closed.');
