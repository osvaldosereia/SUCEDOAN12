import assert from 'node:assert/strict';
import fs from 'node:fs';

const patchPath='supabase/sql/20261003_admin_attendance_meta_media_safety_v2.sql';
assert.equal(fs.existsSync(patchPath),true,'migration de safety da mídia outbound deve existir');
const sql=fs.readFileSync(patchPath,'utf8');
const dispatcher=fs.readFileSync('supabase/functions/_shared/admin-attendance-media-send-v1.mjs','utf8');
const ui=fs.readFileSync('vitrine/admin/atendimento/attendance-media-send.js','utf8');

assert.match(sql,/ops2_admin_attendance_requeue_failed_media_v1/i,'falha determinística deve poder reusar o mesmo outbox');
assert.match(sql,/status\s*=\s*'failed'[\s\S]*status\s*=\s*'queued'/i,'requeue só pode partir de failed para queued');
assert.match(sql,/meta_canary_not_enabled/i,'mídia deve bloquear se o canário não estiver explicitamente ligado');
assert.match(sql,/meta_canary_destination_blocked/i,'mídia deve manter allowlist de destino');
assert.match(sql,/create\s+trigger[\s\S]*whatsapp_outbox_v1/i,'guard deve proteger também a transição queued→claimed');
assert.match(sql,/new\.status\s*=\s*'claimed'/i,'guard deve revalidar canário imediatamente antes do envio');

assert.match(dispatcher,/data\.status\s*===\s*['"]failed['"][\s\S]{0,350}ops2_admin_attendance_requeue_failed_media_v1/i,'dispatcher deve requeue apenas falha determinística do mesmo idempotency key');
assert.doesNotMatch(dispatcher,/data\.status\s*===\s*['"]claimed['"][\s\S]{0,200}requeue/i,'estado claimed/uncertain nunca pode ser reenviado cegamente');

assert.match(ui,/let\s+mediaConversationId\s*=\s*null/,'anexo deve ficar vinculado à conversa em que foi escolhido');
assert.match(ui,/selectedConversationId\(\)\s*!==\s*mediaConversationId[\s\S]{0,220}clearMediaSelection/i,'troca de conversa deve limpar anexo pendente');
assert.match(ui,/function\s+clearMediaSelection\(/,'UI deve ter limpeza explícita e auditável do anexo');

console.log('PASS test-attendance-meta-media-safety-v1');
