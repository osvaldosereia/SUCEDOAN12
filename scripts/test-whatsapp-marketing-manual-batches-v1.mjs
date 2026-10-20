import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20261019210000_marketing_campaign_manual_batches_v1.sql';
const workerPath='supabase/functions/whatsapp-marketing-worker-v1/index.ts';
const adminPath='supabase/functions/admin-marketing-campaigns-v1/index.ts';
const uiPath='vitrine/admin/marketing/campaign-center.js';
const entryPath='vitrine/admin/marketing/campaign-entry.js';
const configPath='supabase/config.toml';
assert.equal(fs.existsSync(migrationPath),true,'migration de lote manual deve existir');
const sql=fs.readFileSync(migrationPath,'utf8');
const worker=fs.readFileSync(workerPath,'utf8');
const admin=fs.readFileSync(adminPath,'utf8');
const ui=fs.readFileSync(uiPath,'utf8');
const entry=fs.readFileSync(entryPath,'utf8');
const config=fs.readFileSync(configPath,'utf8');

for(const fn of ['marketing_begin_manual_campaign_batch_v1','marketing_acquire_manual_campaign_batch_v1','marketing_finish_manual_campaign_batch_v1']){
  assert.match(sql,new RegExp(`function\\s+public\\.${fn}\\s*\\(`,'i'),`RPC ausente: ${fn}`);
  assert.match(sql,new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${fn}[\\s\\S]*anon[\\s\\S]*authenticated`,'i'),`${fn} deve ser service-role only`);
}
assert.match(sql,/manual_batch_mode/i,'campanha manual deve ficar fora do worker cron');
assert.match(sql,/manual_campaign_requires_explicit_batch/i,'agendamento/retomada recorrente deve ser bloqueado em campanhas manuais');
assert.match(sql,/manual_batch_mode[\s\S]*claimed_count/i,'estado operacional deve informar a modalidade manual');
assert.match(sql,/requested_limit integer not null default 10 check\(requested_limit between 1 and 10\)/i,'banco deve limitar lote a 10 destinatários');
assert.match(sql,/status\s+in\s*\(\s*'pending'\s*,\s*'retry'\s*\)[\s\S]*limit\s+v_limit/i,'cada clique deve claimar somente pendências com limite transacional');
assert.match(sql,/unique\s*\([^)]*idempotency_key/i,'clique repetido deve ser idempotente');
assert.match(sql,/claimed[\s\S]*for\s+update[\s\S]*skip\s+locked/i,'claims concorrentes devem usar lock');
assert.match(worker,/manual_batch_id/i,'worker deve aceitar lote manual autenticado');
assert.match(worker,/marketing_acquire_manual_campaign_batch_v1/i,'worker deve adquirir somente o lote pedido');
assert.match(worker,/marketing_finish_manual_campaign_batch_v1/i,'worker deve fechar o lote antes de liberar próxima rodada');
assert.match(config,/\[functions\.whatsapp-marketing-worker-v1\][\s\S]*?verify_jwt\s*=\s*false/i,'worker interno deve permitir autenticação pela chave própria');
assert.match(worker,/if\(parsed\.body\.manual_batch_id\)[\s\S]*marketing_claim_dispatch_batch_v1/i,'worker deve separar a rota manual do claim do cron');
assert.match(admin,/action\s*===\s*["']send_manual_batch["']/i,'Admin deve oferecer ação protegida para lote manual');
assert.match(admin,/marketing_begin_manual_campaign_batch_v1/i,'Admin deve iniciar lote por RPC atômica');
assert.match(admin,/whatsapp-marketing-worker-v1/i,'Admin deve invocar worker apenas server-side');
assert.match(ui,/data-campaign-send-manual-batch/i,'UI deve mostrar controle de lote explícito');
assert.match(ui,/10\s*(?:contatos|destinatários)/i,'UI deve informar limite por clique');
assert.match(ui,/marketing-campaign-v4/i,'UI deve invalidar cache do módulo alterado');
assert.match(entry,/campaign-center\.js\?v=marketing-campaign-v4/i,'entrada deve carregar a versão nova do centro');
assert.match(ui,/confirm\(/i,'UI deve pedir confirmação explícita antes do envio');
assert.doesNotMatch(ui,/telefone|phone_number_id|to_phone_e164/i,'browser não pode receber telefone operacional');

console.log('PASS test-whatsapp-marketing-manual-batches-v1');
