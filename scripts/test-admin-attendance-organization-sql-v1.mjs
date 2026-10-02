import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='supabase/sql/20261002_admin_attendance_organization_v1.sql';
assert.ok(fs.existsSync(path),'migration de organização deve existir');
const sql=fs.readFileSync(path,'utf8');

for(const table of ['attendance_labels_v1','attendance_conversation_labels_v1','attendance_quick_replies_v1']) assert.match(sql,new RegExp(`create\\s+table[\\s\\S]*${table}`,'i'),`missing ${table}`);
assert.match(sql,/attendance_conversation_labels_v1[\s\S]*foreign key[\s\S]*conversations/i,'vínculo deve referenciar conversa');
assert.match(sql,/attendance_conversation_labels_v1[\s\S]*foreign key[\s\S]*attendance_labels_v1/i,'vínculo deve referenciar etiqueta');
assert.match(sql,/is_active\s+boolean\s+not\s+null\s+default\s+true/i,'cadastros precisam de desativação lógica');
assert.match(sql,/ops2_admin_attendance_queue_v3/i,'fila v3 deve existir');
assert.match(sql,/p_whatsapp_account_id/i,'fila deve ser isolada por conta');
assert.match(sql,/p_label_id/i,'fila deve aceitar filtro de etiqueta');
assert.match(sql,/canonical_last_message_at[\s\S]*desc/i,'fila deve ordenar pela última mensagem canônica');
assert.doesNotMatch(sql,/conversations\.updated_at|c\.updated_at/i,'updated_at administrativo não pode ordenar a fila');
assert.match(sql,/revoke\s+all[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i,'RPCs/tabelas operacionais não devem ser expostos');
assert.match(sql,/grant\s+execute[\s\S]*to\s+service_role/i,'RPC da fila deve ser service-role-only');
for(const title of ['Pagamento','Entrega','Cidades atendidas','Pedido pelo catálogo','Prazo e horário','Pedido recebido']) assert.ok(sql.includes(title),`seed quick reply ausente: ${title}`);

console.log('OK · schema de organização da Central mantém etiquetas internas, quick replies e fila cronológica.');
