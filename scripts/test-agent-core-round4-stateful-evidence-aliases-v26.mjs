import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260910214333_dona_antonia_agent_core_round4_stateful_evidence_aliases_v26.sql','utf8').toLowerCase();
const workflow=fs.readFileSync('.github/workflows/ci-dona-antonia-agent-core.yml','utf8').toLowerCase();

function must(body,needle,label){
  if(!body.includes(needle.toLowerCase())) throw new Error(`missing:${label}`);
}
function mustNot(body,needle,label){
  if(body.includes(needle.toLowerCase())) throw new Error(`forbidden:${label}`);
}

must(migration,"when 'change_basket_delivery_address' then 'change_basket_delivery_address_flow'",'address_alias');
must(migration,"when 'basket_payment_selected' then 'basket_payment_selection'",'payment_selection_alias');
must(migration,"when 'basket_payment_confirmation' then 'basket_final_confirmation'",'payment_confirmation_alias');
must(migration,"('change_basket_delivery_address_flow'::text,3)",'canonical_core_target');
must(migration,"'version',2",'evidence_schema_v2');
must(migration,"'historical_backfill_allowed',false",'no_historical_backfill');
must(migration,"'execution_authorized',false",'execution_off');
must(migration,"'retirement_authorized',false",'retirement_off');
must(migration,"'pii_payload_in_report',false",'no_pii');
must(migration,'get_agent_core_round4_consolidated_readiness_v17','consolidated_v17');
must(migration,"'stateful_execution_permitted_now',false",'stateful_execution_off');
must(migration,"'retirement_execution_permitted',false",'retirement_execution_off');
mustNot(migration,'insert into public.agent_core_pre_router_snapshots','no_synthetic_snapshots');
mustNot(migration,'update public.agent_core_legacy_router_observations','no_observation_rewrite');
must(workflow,'test-agent-core-round4-stateful-evidence-aliases-v26.mjs','workflow_v26_contract');

console.log('Agent Core Round 4 V26 OK: stateful evidence aliases are canonicalized without synthetic evidence or execution/retirement enablement.');
