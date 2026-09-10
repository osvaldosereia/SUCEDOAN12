import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260910221500_dona_antonia_agent_core_round4_address_change_alignment_v28.sql','utf8');
const workflow=fs.readFileSync('.github/workflows/ci-dona-antonia-agent-core.yml','utf8');

function must(haystack,needle,label){
  if(!haystack.includes(needle)) throw new Error(`missing_${label}`);
}
function mustNot(haystack,needle,label){
  if(haystack.includes(needle)) throw new Error(`forbidden_${label}`);
}

must(migration,'is_whatsapp_address_change_request_v1','address_change_detector');
must(migration,"(alterar|mudar|corrigir)( o)? endereco",'router_parity_regex');
must(migration,'evaluate_whatsapp_agent_action_preconditions_v2','preconditions_v2');
must(migration,"p_action_key='wa_request_address_flow'",'address_flow_scope');
must(migration,'precondition_semantics_version', 'semantics_version');
must(migration,"pre:=public.evaluate_whatsapp_agent_action_preconditions_v2",'preview_uses_v2');
must(migration,"'precondition_version',3",'preview_version_3');
must(migration,"when 'address_flow_reopened' then 'change_basket_delivery_address_flow'",'reopened_alias');
must(migration,"when 'address_flow_from_legacy_state' then 'change_basket_delivery_address_flow'",'legacy_state_alias');
must(migration,"'version',3",'evidence_schema_v3');
must(migration,"'stateful_execution_permitted_now',false",'stateful_off');
must(migration,"'retirement_execution_permitted',false",'retirement_off');
must(migration,"'synthetic_backfill_allowed',false",'no_synthetic_backfill');
mustNot(migration,'update public.conversations','no_conversation_mutation');
mustNot(migration,'insert into public.agent_core_pre_router_snapshots','no_fake_snapshots');
must(workflow,'test-agent-core-round4-address-change-v28.mjs','workflow_v28_contract');

console.log('agent_core_round4_address_change_v28_contract_ok');
