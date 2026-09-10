import fs from 'node:fs';

const inventory=fs.readFileSync('supabase/migrations/20260910160252_dona_antonia_agent_core_round4_router_inventory_v1.sql','utf8');
const dispatch=fs.readFileSync('supabase/migrations/20260910160512_dona_antonia_agent_core_round4_worker_dispatch_v3_v1.sql','utf8');
const parity=fs.readFileSync('supabase/migrations/20260910161028_dona_antonia_agent_core_round4_parity_gate_v1.sql','utf8');
const recovery=fs.readFileSync('supabase/migrations/20260910161803_dona_antonia_agent_core_round4_worker_recovery_v3_v1.sql','utf8');
const parityV2=fs.readFileSync('supabase/migrations/20260910162313_dona_antonia_agent_core_round4_parity_gate_v2.sql','utf8');
const policy=fs.readFileSync('supabase/migrations/20260910163217_dona_antonia_agent_core_round4_shadow_policy_normalizer_v1.sql','utf8');
const body=(inventory+'\n'+dispatch+'\n'+parity+'\n'+recovery+'\n'+parityV2+'\n'+policy).toLowerCase();
const must=(text,label)=>{if(!body.includes(text.toLowerCase()))throw new Error(`missing:${label}`)};
const forbid=(text,label)=>{if(body.includes(text.toLowerCase()))throw new Error(`forbidden:${label}`)};

must('agent_core_router_inventory','router_inventory');
for(const klass of ['hard_safety','transport','deterministic_policy','compatibility','legacy']) must(`'${klass}'`,`classification_${klass}`);
must('get_agent_core_round4_readiness_v1','round4_readiness');
must('trg_agent_core_shadow_postprocess_v1','single_shadow_postprocess');
must('drop trigger if exists trg_agent_core_shadow_dispatch_ai_job_v1','drop_old_shadow_dispatch_trigger');
must('drop trigger if exists trg_agent_core_shadow_observe_ai_job_v1','drop_old_shadow_observe_trigger');
must('drop function if exists public.agent_core_shadow_dispatch_trigger_v1()','retire_old_shadow_dispatch_function');
must('drop function if exists public.agent_core_shadow_observe_ai_job_v1()','retire_old_shadow_observe_function');
must('drop trigger if exists trg_conversations_updated_at','remove_duplicate_updated_at');

const observeIndex=inventory.indexOf('observe_whatsapp_agent_core_turn_v1');
const dispatchIndex=inventory.indexOf('dispatch_whatsapp_agent_core_shadow_v1');
if(observeIndex<0||dispatchIndex<0||observeIndex>=dispatchIndex) throw new Error('shadow_postprocess_order');

must('dispatch_conversation_worker_job_v3','canonical_worker_v3_dispatch');
must("functions/v1/conversation-worker-v3",'worker_v3_endpoint');
must('ai_job_event_dispatch_v3','worker_v3_trigger');
must('select public.dispatch_conversation_worker_job_v3(p_job_id)','v2_compat_wrapper');
must('drop function if exists public.ai_job_dispatch_trigger_v2()','retire_v2_trigger_function');
must('recover_conversation_worker_dispatch_v3','canonical_worker_v3_recovery');
must("'dona-antonia-conversation-worker-recovery-v3'",'worker_v3_recovery_cron');
must('select public.recover_conversation_worker_dispatch_v3()','v2_recovery_compat_wrapper');
must("where jobname='dona-antonia-conversation-worker-recovery-v2'",'retire_v2_recovery_cron');

must('get_agent_core_round4_parity_report_v1','parity_report_v1');
must('get_agent_core_round4_mismatch_sample_v1','mismatch_sample_v1');
must("'minimum_sample_required',20",'minimum_shadow_sample_v1');
must("'minimum_match_rate_required',0.95",'minimum_parity_rate_v1');
must("'retirement_ready'",'retirement_gate');
must("'insufficient_shadow_sample'",'sample_fail_closed');

must('get_agent_core_round4_parity_report_v2','parity_report_v2');
must('get_agent_core_round4_mismatch_sample_v2','mismatch_sample_v2');
must("'minimum_policy_match_rate_required',0.95",'policy_match_threshold');
must("'minimum_tool_coherence_rate_required',0.95",'tool_coherence_threshold');
must("'legacy agreement is informational; current deterministic topic/policy is the primary gate'",'legacy_not_ground_truth');

must('agent_core_canonical_intent_for_topic_v1','canonical_topic_intent');
must('agent_core_shadow_decision_anchor_v1','strong_action_anchor');
must('normalize_agent_core_shadow_turn_policy_v1','shadow_policy_normalizer');
must('trg_agent_core_shadow_policy_normalize_v1','shadow_policy_trigger');
must("coalesce(new.execution_mode,'')<>'observe'",'normalizer_observe_only');
must("'raw_decision_intent'",'raw_decision_preserved');
must("'normalized_decision_intent'",'normalized_decision_audited');
must("'secondary_intents'",'secondary_intents_preserved');
must('if not p_replay and exists','authorized_replay_can_replace_shadow_plan');
must("'authorized_replay'",'replay_reason');
must('get_agent_core_round4_policy_guard_readiness_v1','policy_guard_readiness');

for(const guard of [
  'release gate; deve permanecer fora do modelo',
  'handoff humano por erro/held',
  'rate guard de outbound'
]) must(guard,`guard_${guard.slice(0,12)}`);

for(const unsafe of [
  'whatsapp_live_canary_percent=100',
  'whatsapp_live_canary_percent = 100',
  'experience_orchestrator_enabled=true',
  'experience_orchestrator_enabled = true',
  'whatsapp_flow_data_exchange_enabled=true',
  'whatsapp_flow_send_enabled=true',
  'whatsapp_flow_commercial_write_enabled=true',
  'bling_order_sync_enabled=true'
]) forbid(unsafe,unsafe);

console.log('Agent Core Rodada 4: inventário, worker v3, paridade v2, normalização shadow auditável, replay autorizado e guardrails de rollout OK.');
