import fs from 'node:fs';

const edge=fs.readFileSync('supabase/functions/dona-antonia-agent-core-v1/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20260910213421_dona_antonia_agent_core_round4_runtime_surface_v24.sql','utf8');
const workflow=fs.readFileSync('.github/workflows/ci-dona-antonia-agent-core.yml','utf8');

function must(haystack,needle,label){
  if(!haystack.includes(needle)) throw new Error(`missing_${label}`);
}
function mustNot(haystack,needle,label){
  if(haystack.includes(needle)) throw new Error(`forbidden_${label}`);
}

must(edge,'"wa_start_order_checkout"','edge_checkout_tool');
must(edge,'Para checkout de produtos avulsos, use wa_start_order_checkout','prompt_checkout_split');
must(edge,'reason:"observe_no_side_effects"','observe_simulation');
mustNot(edge,'start_whatsapp_order_checkout_agent_v1','no_direct_write_executor');

must(migration,"'edge_allowlist_pending',false",'allowlist_cleared');
must(migration,"'executor_mapping_pending',false",'executor_pending_cleared');
must(migration,"'edge_surface_verified_version',8",'edge_version_marker');
must(migration,"'observe_simulation_only',true",'simulation_only_marker');
must(migration,'get_agent_core_round4_runtime_surface_readiness_v1','runtime_readiness');
must(migration,'get_agent_core_round4_consolidated_readiness_v15','consolidated_v15');
must(migration,"'stateful_execution_permitted_now',false",'stateful_stays_off');
must(migration,"'retirement_execution_permitted',false",'retirement_stays_off');

must(workflow,'test-agent-core-round4-runtime-surface-v24.mjs','workflow_v24_contract');

console.log('agent_core_round4_runtime_surface_v24_contract_ok');
