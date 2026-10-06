import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/sql/20261006_attendance_delivery_day_auto_labels_v1.sql';
assert.ok(fs.existsSync(migrationPath),'migration de etiquetas automáticas deve existir');
const sql=fs.readFileSync(migrationPath,'utf8');

assert.match(sql,/attendance_conversation_manual_labels_v1/i,'etiquetas humanas precisam de origem independente');
assert.match(sql,/attendance_conversation_auto_labels_v1/i,'etiquetas automáticas precisam de origem independente');
assert.match(sql,/insert\s+into\s+public\.attendance_conversation_manual_labels_v1[\s\S]*select[\s\S]*attendance_conversation_labels_v1/i,'etiquetas existentes devem ser preservadas como manuais');
assert.match(sql,/ops2_admin_attendance_set_labels_v1/i,'a gravação manual deve recompor a projeção junto das automáticas');
assert.match(sql,/ops2_attendance_refresh_delivery_day_labels_v1/i,'a sincronização automática deve ter RPC própria');
assert.match(sql,/delivery_address\s*->>\s*'delivery_date'/i,'a fonte do dia deve ser a data estruturada do pedido');
assert.match(sql,/conversation_id\s+is\s+not\s+null/i,'pedido sem conversa ligada não deve escolher conversa por inferência');
assert.match(sql,/America\/Cuiaba/i,'data de hoje deve usar o fuso local da operação');
for(const status of ['storefront_received','confirmed','processing','ready']) assert.match(sql,new RegExp(status),`status ativo deve ser considerado: ${status}`);
const activeStatuses=sql.match(/and o\\.status in \\(([^)]+)\\)/i)?.[1]||'';\nassert.match(activeStatuses,/storefront_received[\\s\\S]*confirmed[\\s\\S]*processing[\\s\\S]*ready/i,'somente status ativos conhecidos devem receber etiqueta');\nassert.doesNotMatch(activeStatuses,/delivered|cancelled/i,'pedido entregue/cancelado não deve manter etiqueta futura');
for(const day of ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo']) assert.ok(sql.includes(day),`etiqueta semanal ausente: ${day}`);
assert.match(sql,/on\s+conflict[\s\S]*do\s+nothing/i,'reprocessamento não pode duplicar vínculos');
assert.match(sql,/create\s+trigger[\s\S]*after\s+insert[\s\S]*update[\s\S]*orders/i,'mudança de pedido precisa atualizar etiquetas');
assert.match(sql,/delete\s+from\s+public\.attendance_conversation_auto_labels_v1/i,'reagendamento deve remover origem automática antiga');
assert.match(sql,/attendance_conversation_labels_v1[\s\S]*manual_labels_v1[\s\S]*auto_labels_v1/i,'projeção deve unir origem humana e automática');
assert.match(sql,/enable\s+row\s+level\s+security/i,'tabelas de origem devem ter RLS');
assert.match(sql,/revoke\s+all[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i,'RPCs operacionais não devem ser expostas');
assert.match(sql,/grant\s+execute[\s\S]*to\s+service_role/i,'RPC de manutenção deve ficar no service role');
assert.doesNotMatch(sql,/ana_enabled\s*:?=\s*true|campaigns_enabled\s*:?=\s*true|whatsapp_outbox|sendTextViaMeta|graph\.facebook\.com/i,'etiquetar não deve ativar IA nem enviar mensagens');

console.log('OK · etiquetas da semana são sincronizadas pela data do pedido sem envio e preservando etiquetas manuais.');
