import assert from 'node:assert/strict';
import fs from 'node:fs';

const patchPath=new URL('../supabase/sql/20261002_admin_attendance_meta_uncertain_guard_v1.sql',import.meta.url);
assert.equal(fs.existsSync(patchPath),true,'migration de guard uncertain Meta deve existir');
const sql=fs.readFileSync(patchPath,'utf8');

assert.match(sql,/create or replace function public\.ops2_admin_attendance_enqueue_text_v3/i);
assert.match(sql,/attendance-v3-conversation:/i,'enqueue deve serializar por conversa');
assert.match(sql,/pg_advisory_xact_lock/i);
assert.match(sql,/provider\s*=\s*'meta'/i);
assert.match(sql,/status\s*=\s*'claimed'/i);
assert.match(sql,/coalesce\(o\.last_error\s*,\s*''\)\s+like\s+'meta_send_uncertain:%'/i,'guard deve ser null-safe');
assert.match(sql,/meta_send_uncertain/i);
assert.match(sql,/last_inbound_at\s*\+\s*interval\s+'24 hours'/i);
assert.match(sql,/human_send_enabled\s*=\s*true/i);
assert.match(sql,/homologated_at\s+is\s+not\s+null/i);
assert.match(sql,/v_provider\s+not\s+in\s*\(\s*'papoai'\s*,\s*'meta'\s*\)/i);
assert.match(sql,/attendance-v3:/i);
assert.match(sql,/idempotency_conflict/i);
assert.match(sql,/v_recent_count\s*>=\s*20/i);
assert.doesNotMatch(sql,/insert into public\.whatsapp_messages_v1/i);

console.log('OK · enqueue v3 serializa por conversa e bloqueia novo send enquanto existir resultado Meta incerto.');
