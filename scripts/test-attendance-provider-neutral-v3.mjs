import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath = new URL('../supabase/sql/20261002_admin_attendance_provider_neutral_v3.sql', import.meta.url);
assert.equal(fs.existsSync(migrationPath), true, 'migration provider-neutral v3 deve existir');

const sql = fs.readFileSync(migrationPath, 'utf8');

assert.match(sql, /ops2_admin_attendance_enqueue_text_v3/i);
assert.match(sql, /ops2_admin_attendance_claim_outbox_v3/i);
assert.match(sql, /attendance-v3:/i, 'idempotência v3 precisa de namespace próprio');
assert.match(sql, /last_inbound_at\s*\+\s*interval\s+'24 hours'/i, 'texto livre deve respeitar janela de 24h');
assert.match(sql, /human_send_enabled\s*=\s*true/i, 'gate humano continua obrigatório');
assert.match(sql, /homologated_at\s+is\s+not\s+null/i, 'homologação continua obrigatória');
assert.match(sql, /v_provider\s+text/i, 'provider deve ser resolvido pelo runtime');
assert.match(sql, /v_provider\s*:=\s*v_runtime\.outbound_provider/i, 'provider da outbox deve vir do runtime');
assert.match(sql, /v_provider\s+not\s+in\s*\(\s*'papoai'\s*,\s*'meta'\s*\)/i, 'apenas providers homologáveis podem ser enfileirados');
assert.match(sql, /provider\s*,\s*status\s*,\s*metadata/i, 'provider deve ser persistido na outbox');
assert.match(sql, /v_provider\s*,\s*'queued'/i, 'insert deve usar provider resolvido, não literal');
assert.match(sql, /v_outbox\.provider\s+is\s+distinct\s+from\s+v_runtime\.outbound_provider/i, 'claim deve impedir troca de provider depois do enqueue');
assert.match(sql, /'provider'\s*,\s*v_outbox\.provider/i, 'claim deve devolver provider ao adapter');
assert.match(sql, /'phone_number_id'\s*,\s*v_account\.phone_number_id/i, 'claim deve devolver Phone Number ID server-side');
assert.match(sql, /'waba_id'\s*,\s*v_account\.waba_id/i, 'claim deve devolver WABA ID server-side');
assert.match(sql, /canonical_whatsapp_e164_br_v2\(v_conversation\.wa_contact_e164\)/i, 'destino deve ser resolvido server-side');
assert.match(sql, /v_recent_count\s*>=\s*20/i, 'rate limit atual deve ser preservado');
assert.match(sql, /idempotency_conflict/i);
assert.match(sql, /grant execute on function public\.ops2_admin_attendance_enqueue_text_v3\(uuid,text,text\) to service_role/i);
assert.match(sql, /grant execute on function public\.ops2_admin_attendance_claim_outbox_v3\(uuid\) to service_role/i);

const enqueueSection = sql.split(/create or replace function public\.ops2_admin_attendance_claim_outbox_v3/i)[0];
assert.doesNotMatch(enqueueSection, /outbound_provider\s*=\s*'papoai'/i, 'enqueue v3 não pode fixar PapoAI');
assert.doesNotMatch(enqueueSection, /insert into public\.whatsapp_messages_v1/i, 'Task 1 não cria mensagem outbound otimista');
assert.doesNotMatch(sql, /papoai_attendance_text_webhook/i, 'v3 não pode depender de URL secreta do PapoAI');

console.log('OK · outbox v3 é provider-neutral, fail-closed, idempotente e preserva janela/gates.');
