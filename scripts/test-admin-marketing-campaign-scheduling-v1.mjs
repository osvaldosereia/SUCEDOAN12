import assert from 'node:assert/strict';
import fs from 'node:fs';

const edgePath='supabase/functions/admin-marketing-campaigns-v1/index.ts';
const supportPath='supabase/migrations/20261005024000_marketing_campaign_execution_controls_v1.sql';
assert.equal(fs.existsSync(edgePath),true,'Edge de campanhas deve existir');
assert.equal(fs.existsSync(supportPath),true,'migration de controles de execução deve existir');
const source=fs.readFileSync(edgePath,'utf8');
const sql=fs.readFileSync(supportPath,'utf8');

assert.match(source,/async\s+function\s+adminAuth\s*\(/,'ações de execução devem continuar sob Admin auth');
for(const action of ['pause','cancel_execution','send_manual_batch','execution_status']){
  assert.match(source,new RegExp(`action\\s*===\\s*["']${action}["']`,'i'),`ação operacional ausente: ${action}`);
}
for(const action of ['schedule','start_now','resume']){
  assert.doesNotMatch(source,new RegExp(`action\\s*===\\s*["']${action}["']`,'i'),`ação automática proibida: ${action}`);
}
for(const rpc of ['marketing_pause_campaign_v1','marketing_cancel_campaign_execution_v1','marketing_begin_manual_campaign_batch_v1','marketing_campaign_execution_status_v1']){
  assert.match(source,new RegExp(`rpc\\(["']${rpc}["']`,'i'),`API deve usar RPC canônica: ${rpc}`);
}
assert.doesNotMatch(source,/marketing_schedule_campaign_v1|marketing_resume_campaign_v1|scheduleCampaign|resumeCampaign/i,'API não deve encaminhar agendamento ou retomada');
assert.match(source,/campaigns_disabled/i,'API deve propagar kill-switch fechado');
assert.match(source,/execution_status/i,'API deve expor progresso/estado operacional');

for(const forbidden of ['runtime_mode','worker_url','waba_id','phone_number_id','destination_phone','to_phone_e164','outbox_id']){
  assert.match(source,new RegExp(forbidden,'i'),`campo operacional proibido deve ser reconhecido: ${forbidden}`);
}
assert.match(source,/hasForbiddenField/i,'ações novas devem manter inspeção recursiva de campos proibidos');
assert.doesNotMatch(source,/sendTemplateViaMeta|graph\.facebook\.com|net\.http_post/i,'Admin não implementa transporte nem scheduler');
assert.match(source,/whatsapp-marketing-worker-v1/i,'Admin deve chamar worker apenas no servidor com chave interna');
assert.match(source,/marketing_campaign_worker_internal_key_v1/i,'chave de worker deve ser recuperada server-side');

assert.match(sql,/create\s+or\s+replace\s+function\s+public\.marketing_cancel_campaign_execution_v1\s*\(/i,'cancelamento canônico deve existir');
assert.match(sql,/v_campaign\.status\s+not\s+in\s*\(\s*['"]scheduled['"]\s*,\s*['"]running['"]\s*,\s*['"]paused['"]\s*\)/i,'cancelamento deve restringir-se aos estados executáveis');
assert.match(sql,/marketing_campaign_dispatches_v1[\s\S]*status\s*=\s*['"]skipped['"]/i,'cancelamento deve pular dispatches não enviados');
assert.match(sql,/skip_reason\s*=\s*['"]campaign_cancelled['"]/i,'dispatch cancelado deve ter motivo explícito');
assert.match(sql,/whatsapp_outbox_v1[\s\S]*status\s*=\s*['"]cancelled['"]/i,'outbox já criada e não enviada deve ser cancelada');
assert.match(sql,/create\s+or\s+replace\s+function\s+public\.marketing_campaign_execution_status_v1\s*\(/i,'status agregado deve existir');
assert.match(sql,/marketing_campaign_execution_runtime_v1/i,'status deve informar runtime de execução');
assert.match(sql,/whatsapp_channel_runtime_v1/i,'status deve informar campaigns_enabled');
for(const status of ['pending','claimed','skipped','accepted','retry','uncertain','failed'])assert.match(sql,new RegExp(status,'i'),`status agregado deve conhecer ${status}`);
for(const fn of ['marketing_cancel_campaign_execution_v1','marketing_campaign_execution_status_v1']){
  assert.match(sql,new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${fn}[\\s\\S]*anon[\\s\\S]*authenticated`,'i'),`${fn} deve ser service-role only`);
}

console.log('PASS test-admin-marketing-campaign-scheduling-v1');
