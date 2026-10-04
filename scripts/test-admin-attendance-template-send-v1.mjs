import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/sql/20261002_admin_attendance_meta_template_send_v1.sql';
assert.equal(fs.existsSync(migrationPath),true,'migration de envio de template deve existir');
const sql=fs.readFileSync(migrationPath,'utf8');
const templatesApi=fs.readFileSync('supabase/functions/admin-whatsapp-templates-v1/index.ts','utf8');

assert.match(sql,/ops2_admin_attendance_enqueue_template_v1/i);
assert.match(sql,/ops2_admin_attendance_claim_template_outbox_v1/i);
assert.match(sql,/ops2_admin_attendance_accept_meta_template_outbound_v1/i);
assert.match(sql,/message_type\s*,[\s\S]*?'template'/i);
assert.match(sql,/template_id/i);
assert.match(sql,/upper\(coalesce\(t\.status,''\)\)\s*=\s*'APPROVED'/i);
assert.match(sql,/attendance[\s\S]*enabled/i);
assert.match(sql,/meta_canary_to_e164/i);
assert.match(sql,/meta_canary_destination_blocked/i);
assert.match(sql,/outbound_provider[\s\S]*?'meta'/i);
assert.match(sql,/pedidorecebidosite0975/i);
assert.match(sql,/pedidorecebidosite1018/i);

const enqueueStart=sql.search(/create or replace function public\.ops2_admin_attendance_enqueue_template_v1/i);
const claimStart=sql.search(/create or replace function public\.ops2_admin_attendance_claim_template_outbox_v1/i);
assert.ok(enqueueStart>=0&&claimStart>enqueueStart,'funções template devem estar definidas em ordem conhecida');
const enqueueSql=sql.slice(enqueueStart,claimStart);
assert.doesNotMatch(enqueueSql,/service_window_closed|last_inbound_at\s*\+\s*interval\s*'24 hours'/i,'template não depende da janela de 24h');

assert.match(templatesApi,/Access-Control-Allow-Methods[^\n]*GET,POST,OPTIONS/,'gateway de templates deve aceitar POST autenticado');
assert.match(templatesApi,/action\s*===\s*["']send["']|action\s*===\s*["']send_template["']/,'gateway deve manter ações send/send_template');
assert.match(templatesApi,/action_not_allowed/,'gateway deve continuar deny-by-default para ações POST desconhecidas');
assert.match(templatesApi,/ops2_admin_attendance_enqueue_template_v1/);
assert.match(templatesApi,/ops2_admin_attendance_claim_template_outbox_v1/);
assert.match(templatesApi,/ops2_admin_attendance_accept_meta_template_outbound_v1/);
assert.match(templatesApi,/sendTemplateViaMeta/);
assert.match(templatesApi,/destination_fields_not_allowed/,'browser não pode escolher destino');
assert.match(templatesApi,/template_identity_fields_not_allowed/,'browser não pode trocar nome/idioma/componentes do cache no envio individual');
assert.match(templatesApi,/template_id/);
assert.match(templatesApi,/parameters/);
assert.match(templatesApi,/attendance/);
assert.match(templatesApi,/enabled/);
assert.match(templatesApi,/sendable/);

console.log('PASS test-admin-attendance-template-send-v1');
