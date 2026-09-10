import fs from 'node:fs';

const inventory=fs.readFileSync('supabase/migrations/20260910160252_dona_antonia_agent_core_round4_router_inventory_v1.sql','utf8');
const dispatch=fs.readFileSync('supabase/migrations/20260910160512_dona_antonia_agent_core_round4_worker_dispatch_v3_v1.sql','utf8');
const body=(inventory+'\n'+dispatch).toLowerCase();
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

console.log('Agent Core Rodada 4: inventário/classificação, pós-processamento shadow único, dispatcher v3 explícito e guardrails de rollout OK.');
