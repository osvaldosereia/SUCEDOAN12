import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260910222500_dona_antonia_agent_core_round4_contract_evidence_epoch_v29.sql','utf8');
const workflow=fs.readFileSync('.github/workflows/ci-dona-antonia-agent-core.yml','utf8');

function must(h,n,l){if(!h.includes(n))throw new Error(`missing_${l}`)}
function mustNot(h,n,l){if(h.includes(n))throw new Error(`forbidden_${l}`)}

must(migration,'add column if not exists evidence_valid_since timestamptz','epoch_column');
must(migration,"name='dona_antonia_agent_core_round4_address_change_alignment_v28'",'v28_epoch_source');
must(migration,"legacy_action in ('change_basket_delivery_address_flow','address_flow_reopened','address_flow_from_legacy_state')",'address_contract_scope');
must(migration,'get_agent_core_round4_action_tool_parity_v2','parity_v2');
must(migration,'effective_valid_since','effective_epoch');
must(migration,'s.observed_at>=c.effective_valid_since','sample_epoch_filter');
must(migration,"'per_contract_evidence_epoch',true",'epoch_flag');
must(migration,"'historical_failures_preserved',true",'history_preserved');
must(migration,"select public.get_agent_core_round4_action_tool_parity_v2(p_hours)",'v1_bridge');
must(migration,"'execution_authorized',false",'execution_off');
must(migration,"'retirement_authorized',false",'retirement_off');
mustNot(migration,'delete from public.agent_core_legacy_router_observations','no_history_delete');
mustNot(migration,'delete from public.agent_core_turns','no_turn_delete');
must(workflow,'test-agent-core-round4-contract-evidence-epoch-v29.mjs','workflow_v29_contract');

console.log('agent_core_round4_contract_evidence_epoch_v29_contract_ok');
