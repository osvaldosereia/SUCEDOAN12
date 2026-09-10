import fs from 'node:fs';
import path from 'node:path';

const read=p=>fs.readFileSync(p,'utf8').toLowerCase();
const must=(body,s,label)=>{if(!body.includes(s.toLowerCase()))throw new Error(`missing:${label}`)};
const mustNot=(body,s,label)=>{if(body.includes(s.toLowerCase()))throw new Error(`forbidden:${label}`)};

const dispatcher=read('supabase/migrations/20260910160512_dona_antonia_agent_core_round4_worker_dispatch_v3_v1.sql');
const recovery=read('supabase/migrations/20260910161803_dona_antonia_agent_core_round4_worker_recovery_v3_v1.sql');
const workerV3=read('supabase/functions/conversation-worker-v3/index.ts');
const config=read('supabase/config.toml');

// Caminho canônico deve permanecer V3; wrappers V2 são somente compatibilidade de nome.
must(dispatcher,'functions/v1/conversation-worker-v3','canonical_dispatch_endpoint_v3');
must(dispatcher,'select public.dispatch_conversation_worker_job_v3(p_job_id)','v2_dispatch_wrapper_forwards_to_v3');
must(dispatcher,'ai_job_event_dispatch_v3','canonical_dispatch_trigger_v3');
mustNot(dispatcher,"url:='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/conversation-worker-v2'",'canonical_dispatch_must_not_call_v2');

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

// Depois da migration que tornou V3 canônico, nenhuma migration nova pode reintroduzir endpoint V2
// nem reagendar o recovery V2. Migrations antigas são evidência histórica e permanecem intocadas.
const migrationDir='supabase/migrations';
const canonicalCutover='20260910160512';
const laterMigrations=fs.readdirSync(migrationDir)
  .filter(name=>name.endsWith('.sql') && name.slice(0,14)>=canonicalCutover)
  .sort();
for(const name of laterMigrations){
  const body=read(path.join(migrationDir,name));
  mustNot(body,'functions/v1/conversation-worker-v2',`post_cutover_v2_endpoint_${name}`);
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
  mustNot(read(file),'functions/v1/conversation-worker-v2',`active_edge_v2_endpoint_${file}`);
}

console.log(`Agent Core Round 4 worker retirement gate OK: V3 is canonical; ${laterMigrations.length} post-cutover migrations and active Edges cannot regress to the V2 endpoint.`);
