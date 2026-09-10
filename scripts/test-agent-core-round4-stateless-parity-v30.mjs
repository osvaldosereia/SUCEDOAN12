import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260910221643_dona_antonia_agent_core_round4_stateless_parity_scope_v30.sql','utf8');
const workflow=fs.readFileSync('.github/workflows/ci-dona-antonia-agent-core.yml','utf8');

function must(h,n,l){if(!h.includes(n))throw new Error(`missing_${l}`)}
function mustNot(h,n,l){if(h.includes(n))throw new Error(`forbidden_${l}`)}

must(migration,'get_agent_core_round4_parity_report_v6','parity_v6');
must(migration,'where s.replay and s.replay_sample_safe','safe_replay_only');
must(migration,"'stateless_replay_only',true",'stateless_flag');
must(migration,"'live_stateful_samples_excluded'",'live_stateful_excluded_metric');
must(migration,"'unsafe_historical_replays_excluded'",'unsafe_replay_metric');
must(migration,"'stateful_quality_source'",'stateful_quality_source');
must(migration,"select public.get_agent_core_round4_parity_report_v6(p_hours)",'v5_bridge');
must(migration,"'wa_start_order_checkout'",'standalone_checkout_coherence');
mustNot(migration,'update public.conversations','no_conversation_mutation');
mustNot(migration,'insert into public.agent_core_pre_router_snapshots','no_fake_snapshots');
mustNot(migration,'delete from public.agent_core_turns','no_history_delete');
must(workflow,'test-agent-core-round4-stateless-parity-v30.mjs','workflow_v30_contract');

console.log('agent_core_round4_stateless_parity_v30_contract_ok');
