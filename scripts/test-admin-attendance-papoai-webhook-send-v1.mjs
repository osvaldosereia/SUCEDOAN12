import assert from 'node:assert/strict';
import fs from 'node:fs';

const apiPath=new URL('../supabase/functions/admin-whatsapp-ops-v1/index.ts',import.meta.url);
const sqlPath=new URL('../supabase/sql/20261002_admin_attendance_papoai_webhook_send_v1.sql',import.meta.url);

assert.equal(fs.existsSync(sqlPath),true,'migration do transporte oficial deve existir');
const api=fs.readFileSync(apiPath,'utf8');
const sql=fs.readFileSync(sqlPath,'utf8');

assert.match(api,/normalizeOutboundText/);
assert.match(api,/normalizeIdempotencyKey/);
assert.match(api,/SAFE_POST_ACTIONS[^\n]*send_text/,'send_text deve voltar somente pelo gateway autenticado');
assert.match(api,/ops2_admin_attendance_enqueue_text_v2/);
assert.match(api,/ops2_admin_attendance_claim_outbox_v2/);
assert.match(api,/ops2_papoai_attendance_provider_url_v1/,'URL deve vir do Vault via RPC service-role');
assert.match(api,/phone_e164\s*:\s*claim\.to_phone_e164/);
assert.match(api,/message_text\s*:\s*claim\.text/);
assert.match(api,/event_id\s*:\s*claim\.idempotency_key/);
assert.doesNotMatch(api,/https:\/\/[^"']*papoai[^"']*webhooks\/in\//i,'URL secreta do webhook não pode ficar no código');
assert.doesNotMatch(api,/takeover|release/,'esta fase não deve reabrir controle da ANA');

assert.match(sql,/ops2_papoai_attendance_provider_url_v1/);
assert.match(sql,/ops2_papoai_attendance_provider_store_v1/);
assert.match(sql,/papoai_attendance_text_webhook_0975_url_v1/);
assert.match(sql,/papoai_attendance_text_webhook_1018_url_v1/);
assert.match(sql,/webpublic\.papoai\.com\.br/,'Vault deve aceitar somente o host oficial já observado do PapoAI');
assert.match(sql,/ops2_admin_attendance_enqueue_text_v2/);
assert.match(sql,/ops2_admin_attendance_claim_outbox_v2/);
assert.match(sql,/last_inbound_at\s*\+\s*interval\s+'24 hours'/i,'texto livre deve respeitar janela de 24h');
assert.match(sql,/human_send_enabled\s*=\s*true/i);
assert.match(sql,/homologated_at\s+is\s+not\s+null/i);
const enqueueSection=sql.split('create or replace function public.ops2_admin_attendance_claim_outbox_v2')[0];
assert.doesNotMatch(enqueueSection,/insert into public\.whatsapp_messages_v1/i,'não criar mensagem otimista: message.sent canônico será a fonte do histórico');

console.log('OK · contrato de envio humano via webhook oficial PapoAI está protegido por Vault, host oficial, janela e gates.');
