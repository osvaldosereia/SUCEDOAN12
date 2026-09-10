import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260910222037_dona_antonia_agent_core_round4_safe_replay_dispatcher_v31.sql','utf8');
const workflow=fs.readFileSync('.github/workflows/ci-dona-antonia-agent-core.yml','utf8');

function must(h,n,l){if(!h.includes(n))throw new Error(`missing_${l}`)}
function mustNot(h,n,l){if(h.includes(n))throw new Error(`forbidden_${l}`)}

must(migration,'dispatch_whatsapp_agent_core_historical_replay_v1','dispatcher');
must(migration,'is_whatsapp_agent_core_shadow_eligible_v2(p_job_id,true)','eligibility_v2_replay');
must(migration,"authorized_homologation_historical_replay_v3",'strict_replay_reason');
must(migration,"v_cfg.execution_mode<>'observe'",'observe_guard');
must(migration,'message_already_evaluated','duplicate_guard');
must(migration,"from vault.decrypted_secrets",'vault_internal');
must(migration,"'replay',true",'replay_true');
must(migration,"'commercial_side_effects_permitted',false",'commercial_side_effects_off');
must(migration,"'message_body_stored',false",'no_message_body_log');
must(migration,"'stateful_execution_permitted_now',false",'stateful_off');
must(migration,"'retirement_execution_permitted',false",'retirement_off');
mustNot(migration,'update public.conversations','no_conversation_mutation');
mustNot(migration,'update public.carts','no_cart_mutation');
mustNot(migration,'insert into public.orders','no_order_creation');
must(workflow,'test-agent-core-round4-safe-replay-dispatcher-v31.mjs','workflow_v31_contract');

console.log('agent_core_round4_safe_replay_dispatcher_v31_contract_ok');
