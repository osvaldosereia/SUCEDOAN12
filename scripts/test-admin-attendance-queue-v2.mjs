import assert from 'node:assert/strict';
import fs from 'node:fs';

const sqlPath='supabase/sql/20261002_admin_attendance_v2_phase1_queue.sql';
const apiPath='supabase/functions/admin-whatsapp-ops-v1/index.ts';
assert.ok(fs.existsSync(sqlPath),`${sqlPath} deve existir`);
const sql=fs.readFileSync(sqlPath,'utf8');
const api=fs.readFileSync(apiPath,'utf8');

assert.match(sql,/create or replace function public\.ops2_admin_attendance_queue_v2\s*\(/i);
assert.match(sql,/p_whatsapp_account_id\s+uuid/i);
assert.match(sql,/p_limit\s+integer\s+default\s+50/i);
assert.match(sql,/p_search\s+text\s+default\s+null/i);
assert.doesNotMatch(sql,/p_filter/i,'fila v2 não deve receber filtros Todos/Não lidos/Humano');
assert.doesNotMatch(sql,/\bc\.updated_at\b|\bconversations\.updated_at\b/i,'updated_at administrativo não pode ordenar conversas');
assert.doesNotMatch(sql,/greatest\s*\([^)]*last_inbound_at|greatest\s*\([^)]*last_outbound_at/is,'timestamps operacionais não podem furar a última mensagem canônica');
assert.match(sql,/coalesce\s*\(\s*lm\.message_at\s*,\s*c\.created_at\s*\)/i,'recência deve usar última mensagem canônica com fallback de criação');
assert.match(sql,/where\s+c\.whatsapp_account_id\s*=\s*p_whatsapp_account_id/i,'fila deve isolar conta/canal');
assert.match(sql,/order\s+by\s+q\.last_message_at\s+desc\s*,\s*q\.conversation_id/i,'fila deve ordenar pela mensagem mais recente e desempate estável');
assert.doesNotMatch(sql,/order\s+by[\s\S]{0,180}unread_count/i,'não lidas não podem alterar ordem cronológica');
assert.doesNotMatch(sql,/order\s+by[\s\S]{0,180}human_required/i,'modo humano não pode alterar ordem cronológica');
for(const role of ['public','anon','authenticated'])assert.match(sql,new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.ops2_admin_attendance_queue_v2[^;]*from\\s+${role}`,'i'));
assert.match(sql,/grant\s+execute\s+on\s+function\s+public\.ops2_admin_attendance_queue_v2[^;]*to\s+service_role/i);

assert.match(api,/ops2_admin_attendance_queue_v2/,'gateway deve usar a fila v2');
assert.doesNotMatch(api,/p_filter\s*:/,'gateway não deve enviar filtro legado');
assert.doesNotMatch(api,/attendanceFilter\s*\(/,'gateway não deve normalizar filtro legado');

console.log('OK · fila v2 usa somente atividade canônica real e isolamento por canal.');
