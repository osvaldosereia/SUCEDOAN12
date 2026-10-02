import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath = new URL('../supabase/sql/20261002_whatsapp_meta_canonical_outbound_v1.sql', import.meta.url);
assert.equal(fs.existsSync(migrationPath), true, 'migration de canonical outbound Meta deve existir');
const sql = fs.readFileSync(migrationPath, 'utf8');

assert.match(sql, /ops2_admin_attendance_accept_meta_outbound_v1/i);
assert.match(sql, /provider\s*=\s*'meta'|v_outbox\.provider\s*<>\s*'meta'/i);
assert.match(sql, /direction[^\n]*'outbound'|'outbound'[^\n]*direction/i);
assert.match(sql, /status_current[^\n]*accepted|'accepted'[^\n]*status_current/i);
assert.match(sql, /sender_kind[^\n]*human|'human'[^\n]*sender_kind/i);
assert.match(sql, /provider_message_id/i);
assert.match(sql, /on conflict\s*\(\s*whatsapp_account_id\s*,\s*provider\s*,\s*provider_message_id\s*\)/i, 'wamid deve ser idempotente no histórico');
assert.match(sql, /whatsapp_record_status_v1/i, 'aceite e replay de status devem usar contrato canônico');
assert.match(sql, /whatsapp_webhook_events_v1/i, 'status capturado antes do send deve ser reconciliado');
assert.match(sql, /message\.status\./i);
assert.match(sql, /update\s+public\.whatsapp_outbox_v1/i);
assert.match(sql, /message_id\s*=\s*v_message_id/i);
assert.match(sql, /provider_message_id\s*=\s*v_provider_message_id/i);
assert.match(sql, /status\s*=\s*'sent'/i, 'outbox usa sent como terminal de aceitação por limitação do enum atual');
assert.match(sql, /last_outbound_at/i);
assert.match(sql, /idempotent|already_accepted/i);
assert.match(sql, /grant execute on function public\.ops2_admin_attendance_accept_meta_outbound_v1/i);
assert.doesNotMatch(sql, /delete\s+from\s+public\.whatsapp_(messages|webhook_events|outbox)/i, 'reconciliação não deve apagar evidências');
assert.doesNotMatch(sql, /papoai_attendance_text_webhook/i);

console.log('OK · Meta acceptance cria outbound canônico por wamid, liga outbox e reconcilia status pendente sem apagar evidências.');
