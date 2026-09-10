import fs from 'node:fs';
import path from 'node:path';

const read=p=>fs.readFileSync(p,'utf8').toLowerCase();
const must=(body,s,label)=>{if(!body.includes(s.toLowerCase()))throw new Error(`missing:${label}`)};
const mustNot=(body,s,label)=>{if(body.includes(s.toLowerCase()))throw new Error(`forbidden:${label}`)};
const hasV2UrlAssignment=body=>/url\s*:?=\s*'https:\/\/[^']+\/functions\/v1\/conversation-worker-v2'/.test(body);

const dispatcher=read('supabase/migrations/20260910160512_dona_antonia_agent_core_round4_worker_dispatch_v3_v1.sql');
const recovery=read('supabase/migrations/20260910161803_dona_antonia_agent_core_round4_worker_recovery_v3_v1.sql');
const v15=read('supabase/migrations/20260910194125_dona_antonia_agent_core_round4_worker_v2_retirement_readiness_v15.sql');
const v16=read('supabase/migrations/20260910194217_dona_antonia_agent_core_round4_worker_v2_retirement_readiness_hardening_v16.sql');
const workerV3=read('supabase/functions/conversation-worker-v3/index.ts');
const config=read('supabase/config.toml');

// Caminho canônico deve permanecer V3; wrappers V2 são somente compatibilidade de nome.
must(dispatcher,'functions/v1/conversation-worker-v3','canonical_dispatch_endpoint_v3');
must(dispatcher,'select public.dispatch_conversation_worker_job_v3(p_job_id)','v2_dispatch_wrapper_forwards_to_v3');
must(dispatcher,'ai_job_event_dispatch_v3','canonical_dispatch_trigger_v3');
if(hasV2UrlAssignment(dispatcher))throw new Error('forbidden:canonical_dispatch_must_not_call_v2');

must(recovery,'dona-antonia-conversation-worker-recovery-v3','canonical_recovery_schedule_v3');
must(recovery,"select public.recover_conversation_worker_dispatch_v3();",'canonical_recovery_calls_v3');
must(recovery,"where jobname='dona-antonia-conversation-worker-recovery-v2'",'legacy_recovery_unscheduled');
mustNot(recovery,"cron.schedule(\n  'dona-antonia-conversation-worker-recovery-v2'",'legacy_recovery_must_not_be_scheduled');

must(workerV3,'worker_version:3','worker_v3_health_identity');
must(workerV3,'claim_conversation_job_v2','claim_rpc_compatibility_preserved');
must(workerV3,'conversation_worker_webhook_v2','existing_server_secret_preserved');
mustNot(workerV3,'functions/v1/conversation-worker-v2','worker_v3_must_not_call_worker_v2');

must(config,'# compatibilidade histórica. o dispatcher/cron canônicos já usam conversation-worker-v3.','v2_config_marked_historical');
must(config,'[functions.conversation-worker-v2]','v2_config_kept_for_rollback');
must(config,'[functions.conversation-worker-v3]','v3_config_present');

// V15/V16: readiness de runtime não pode confundir sua própria busca com dependência real.
must(v15,'get_agent_core_round4_worker_v2_retirement_readiness_v1','worker_v2_readiness_v15');
must(v15,"'edge_v2_removal_authorized',false",'v15_edge_removal_off');
must(v15,"'automatic_removal_allowed',false",'v15_auto_removal_off');
must(v16,"p.proname<>'get_agent_core_round4_worker_v2_retirement_readiness_v1'",'v16_excludes_self');
must(v16,"'endpoint_detector','url_assignment_only'",'v16_url_assignment_detector');
must(v16,"'current_db_functions_calling_v2_endpoint'",'v16_reports_current_v2_endpoint_refs');
must(v16,'get_agent_core_round4_consolidated_readiness_v12','consolidated_v12');
must(v16,"'worker_v2_edge_removal_authorized',false",'v16_edge_removal_off');
must(v16,"'retirement_execution_permitted',false",'v16_retirement_off');
must(v16,"'global_retirement_ready',false",'v16_global_retirement_off');
if(hasV2UrlAssignment(v15)||hasV2UrlAssignment(v16))throw new Error('forbidden:readiness_migration_must_not_call_v2_endpoint');

// Depois da migration que tornou V3 canônico, nenhuma migration nova pode reintroduzir uma
// atribuição real de URL ao endpoint V2 nem reagendar o recovery V2. Referências de auditoria
// à string V2 são permitidas; chamadas reais não.
const migrationDir='supabase/migrations';
const canonicalCutover='20260910160512';
const laterMigrations=fs.readdirSync(migrationDir)
  .filter(name=>name.endsWith('.sql') && name.slice(0,14)>=canonicalCutover)
  .sort();
for(const name of laterMigrations){
  const body=read(path.join(migrationDir,name));
  if(hasV2UrlAssignment(body))throw new Error(`forbidden:post_cutover_v2_endpoint_${name}`);
  if(name!=='20260910161803_dona_antonia_agent_core_round4_worker_recovery_v3_v1.sql'){
    mustNot(body,"cron.schedule(\n  'dona-antonia-conversation-worker-recovery-v2'",`post_cutover_v2_recovery_${name}`);
  }
}

// Edges atuais, exceto a própria pasta histórica V2, não podem chamar o endpoint antigo.
function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const p=path.join(dir,entry.name);
    if(entry.isDirectory())return walk(p);
    return [p];
  });
}
for(const file of walk('supabase/functions')){
  if(file.includes(`${path.sep}conversation-worker-v2${path.sep}`))continue;
  if(!/\.(ts|js|mjs)$/.test(file))continue;
  const body=read(file);
  if(hasV2UrlAssignment(body)||body.includes('functions/v1/conversation-worker-v2')){
    throw new Error(`forbidden:active_edge_v2_endpoint_${file}`);
  }
}

console.log(`Agent Core Round 4 worker retirement V16 OK: V3 is canonical; ${laterMigrations.length} post-cutover migrations and active Edges cannot regress to the V2 endpoint.`);
