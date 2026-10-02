import assert from 'node:assert/strict';
import fs from 'node:fs';

const apiPath=new URL('../supabase/functions/admin-whatsapp-ops-v1/index.ts',import.meta.url);
const legacySqlPath=new URL('../supabase/sql/20261002_admin_attendance_papoai_webhook_send_v1.sql',import.meta.url);
const v3SqlPath=new URL('../supabase/sql/20261002_admin_attendance_provider_neutral_v3.sql',import.meta.url);
const hostGuardPath=new URL('../supabase/sql/20261002143000_admin_attendance_papoai_webhook_host_guard_v1.sql',import.meta.url);

assert.equal(fs.existsSync(legacySqlPath),true,'migration histórica do transporte PapoAI deve existir');
assert.equal(fs.existsSync(v3SqlPath),true,'contrato provider-neutral v3 deve existir');
assert.equal(fs.existsSync(hostGuardPath),true,'guard do host oficial PapoAI deve existir');
const api=fs.readFileSync(apiPath,'utf8');
const legacySql=fs.readFileSync(legacySqlPath,'utf8')+'\n'+fs.readFileSync(hostGuardPath,'utf8');
const v3Sql=fs.readFileSync(v3SqlPath,'utf8');

assert.match(api,/normalizeOutboundText/);
assert.match(api,/normalizeIdempotencyKey/);
assert.match(api,/SAFE_POST_ACTIONS[^\n]*send_text/,'send_text deve ficar somente no gateway autenticado');
assert.match(api,/ops2_admin_attendance_enqueue_text_v3/);
assert.match(api,/ops2_admin_attendance_claim_outbox_v3/);
assert.doesNotMatch(api,/ops2_admin_attendance_enqueue_text_v2/,'gateway novo não deve voltar ao contrato v2');
assert.doesNotMatch(api,/ops2_admin_attendance_claim_outbox_v2/,'gateway novo não deve voltar ao claim v2');
assert.match(api,/claim\.provider\s*===\s*["']papoai["']/,'fallback PapoAI deve permanecer provider-aware');
assert.match(api,/ops2_papoai_attendance_provider_url_v1/,'URL PapoAI deve continuar vindo do Vault via service-role');
assert.match(api,/phone_e164\s*:\s*claim\.to_phone_e164/);
assert.match(api,/message_text\s*:\s*claim\.text/);
assert.match(api,/event_id\s*:\s*claim\.idempotency_key/);
assert.doesNotMatch(api,/https:\/\/[^"']*papoai[^"']*webhooks\/in\//i,'URL secreta do webhook não pode ficar no código');
assert.doesNotMatch(api,/takeover|release/,'esta fase não deve reabrir controle da ANA');

assert.match(legacySql,/ops2_papoai_attendance_provider_url_v1/);
assert.match(legacySql,/ops2_papoai_attendance_provider_store_v1/);
assert.match(legacySql,/papoai_attendance_text_webhook_0975_url_v1/);
assert.match(legacySql,/papoai_attendance_text_webhook_1018_url_v1/);
assert.match(legacySql,/webpublic[\\.]+papoai[\\.]+com[\\.]+br/,'Vault deve aceitar somente o host oficial já observado do PapoAI');

assert.match(v3Sql,/ops2_admin_attendance_enqueue_text_v3/);
assert.match(v3Sql,/ops2_admin_attendance_claim_outbox_v3/);
assert.match(v3Sql,/last_inbound_at\s*\+\s*interval\s+'24 hours'/i,'texto livre deve respeitar janela de 24h');
assert.match(v3Sql,/human_send_enabled\s*=\s*true/i);
assert.match(v3Sql,/homologated_at\s+is\s+not\s+null/i);
assert.match(v3Sql,/v_provider\s+not\s+in\s*\(\s*'papoai'\s*,\s*'meta'\s*\)/i);
const enqueueSection=v3Sql.split('create or replace function public.ops2_admin_attendance_claim_outbox_v3')[0];
assert.doesNotMatch(enqueueSection,/insert into public\.whatsapp_messages_v1/i,'enqueue v3 não cria mensagem otimista');

console.log('OK · fallback PapoAI continua protegido por Vault/janela/gates sobre o contrato provider-neutral v3.');
