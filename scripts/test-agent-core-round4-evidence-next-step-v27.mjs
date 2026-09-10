import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260910220256_dona_antonia_agent_core_round4_evidence_next_step_v27.sql','utf8');
const workflow=fs.readFileSync('.github/workflows/ci-dona-antonia-agent-core.yml','utf8');

function must(haystack,needle,label){
  if(!haystack.includes(needle)) throw new Error(`missing_${label}`);
}
function mustNot(haystack,needle,label){
  if(haystack.includes(needle)) throw new Error(`forbidden_${label}`);
}

must(migration,'get_agent_core_round4_evidence_next_step_v1','next_step_function');
must(migration,'get_agent_core_round4_consolidated_readiness_v18','consolidated_v18');
must(migration,"c.automation_cohort='homologation'",'homologation_only');
must(migration,"c.mode='ai'",'ai_mode_required');
must(migration,"h.status in ('open','claimed')",'handoff_guard');
must(migration,'c.service_window_expires_at>now()','service_window_required');
must(migration,"'change_basket_delivery_address_flow'",'address_target');
must(migration,"'basket_ready_for_human'",'basket_ready_target');
must(migration,"'basket_customer_data_processed'",'customer_data_target');
must(migration,"'confirm_order'",'confirm_order_target');
must(migration,"'Quero mudar o endereço de entrega'",'address_hint');
must(migration,"'synthetic_backfill_allowed',false",'no_synthetic_backfill');
must(migration,"'writes_permitted',false",'writes_off');
must(migration,"'retirement_permitted',false",'retirement_off');
must(migration,"'stateful_execution_permitted_now',false",'stateful_off');
must(migration,"'retirement_execution_permitted',false",'retirement_execution_off');
mustNot(migration,'insert into public.agent_core_pre_router_snapshots','no_fake_snapshots');
mustNot(migration,'update public.conversations','no_conversation_mutation');
must(workflow,'test-agent-core-round4-evidence-next-step-v27.mjs','workflow_v27_contract');

console.log('agent_core_round4_evidence_next_step_v27_contract_ok');
