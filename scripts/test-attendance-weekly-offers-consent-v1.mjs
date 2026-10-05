import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath='supabase/migrations/20261005190000_attendance_weekly_offers_consent_v1.sql';
const sqlMirrorPath='supabase/sql/20261005_attendance_weekly_offers_consent_v1.sql';
const browserMigrationPath='supabase/migrations/20261005190500_attendance_weekly_offers_consent_browser_v1.sql';
const browserSqlMirrorPath='supabase/sql/20261005_attendance_weekly_offers_consent_browser_v1.sql';
const templateFixPath='supabase/migrations/20261005195000_attendance_weekly_offers_consent_template_v2.sql';
const templateFixMirrorPath='supabase/sql/20261005_attendance_weekly_offers_consent_template_v2.sql';
const customerApiPath='vitrine/admin/atendimento/attendance-customer-api.js';
const uiPath='vitrine/admin/atendimento/attendance-marketing-consent.js';
const customerViewPath='vitrine/admin/atendimento/attendance-customer-view.js';
const consentEdgePath='supabase/functions/admin-whatsapp-weekly-consent-v1/index.ts';
const configPath='supabase/config.toml';

for(const p of [migrationPath,sqlMirrorPath,browserMigrationPath,browserSqlMirrorPath,templateFixPath,templateFixMirrorPath,consentEdgePath])assert.ok(fs.existsSync(p),`${p} deve existir`);
assert.ok(fs.existsSync(uiPath),'módulo de consentimento no Atendimento deve existir');

const core=fs.readFileSync(migrationPath,'utf8');
const coreMirror=fs.readFileSync(sqlMirrorPath,'utf8');
const browser=fs.readFileSync(browserMigrationPath,'utf8');
const browserMirror=fs.readFileSync(browserSqlMirrorPath,'utf8');
const templateFix=fs.readFileSync(templateFixPath,'utf8');
const templateFixMirror=fs.readFileSync(templateFixMirrorPath,'utf8');
const sql=`${core}\n${browser}\n${templateFix}`;
const customerApi=fs.readFileSync(customerApiPath,'utf8');
const ui=fs.readFileSync(uiPath,'utf8');
const customerView=fs.readFileSync(customerViewPath,'utf8');
const consentEdge=fs.readFileSync(consentEdgePath,'utf8');
const config=fs.readFileSync(configPath,'utf8');

assert.equal(core,coreMirror,'migration principal e espelho SQL devem permanecer idênticos');
assert.equal(browser,browserMirror,'migration browser e espelho SQL devem permanecer idênticos');
assert.equal(templateFix,templateFixMirror,'migration de template e espelho SQL devem permanecer idênticos');
assert.match(sql,/create table if not exists public\.marketing_weekly_consent_requests_v1/i);
assert.match(sql,/consent_scope[^\n]*weekly_offers_coupons/i);
assert.match(sql,/last_inbound_at\s*\+\s*interval '24 hours'/i,'pedido deve ser bloqueado fora da janela de serviço');
assert.match(sql,/marketing_capture_weekly_consent_message_v1/i);
assert.match(sql,/after insert on public\.whatsapp_messages_v1/i,'resposta inbound deve ser capturada no banco');
assert.match(sql,/marketing_record_consent_v1/i,'decisão deve entrar no ledger canônico');
assert.match(templateFix,/status='prepared'/i,'retry do estado prepared deve reutilizar a tentativa/idempotência');
assert.match(templateFix,/send_failed/i,'somente falha certa pode abrir nova tentativa');

assert.match(consentEdge,/WEEKLY_CONSENT_TEMPLATE_NAME/,'edge deve possuir template canônico de consentimento');
assert.match(consentEdge,/category:\s*['"]MARKETING['"]/i,'template de ofertas deve ser MARKETING');
assert.match(consentEdge,/type:\s*['"]QUICK_REPLY['"]/i,'template deve usar respostas rápidas');
assert.match(consentEdge,/SIM, QUERO RECEBER/i);
assert.match(consentEdge,/AGORA NÃO/i);
assert.match(consentEdge,/createTemplateViaMeta/i,'edge deve criar o template oficial quando ainda não existir');
assert.match(consentEdge,/ops2_admin_attendance_enqueue_template_v1/i,'consentimento deve usar o transporte oficial de templates');
assert.match(consentEdge,/ops2_admin_attendance_weekly_consent_mark_sent_v1/i,'edge deve marcar pedido somente depois do template aceito');
assert.match(consentEdge,/weekly_consent_template_pending_approval/i);
assert.match(config,/\[functions\.admin-whatsapp-weekly-consent-v1\][\s\S]*?verify_jwt\s*=\s*true/i,'edge dedicada deve exigir JWT');

assert.match(customerApi,/admin-whatsapp-weekly-consent-v1/);
assert.doesNotMatch(customerApi,/action=send_text/,'consentimento não pode mais cair para mensagem de texto');
assert.doesNotMatch(customerApi,/ops2_admin_attendance_weekly_consent_prepare_browser_v1/,'browser não deve orquestrar preparo/envio em passos separados');
assert.doesNotMatch(customerApi,/ops2_admin_attendance_weekly_consent_mark_sent_browser_v1/,'browser não deve marcar envio por conta própria');

assert.match(ui,/Pedir autorização/i);
assert.match(ui,/Ofertas e cupons até 1x\/semana/i);
assert.match(ui,/marketingConsentRequest/);
assert.match(ui,/aguardando aprovação/i);
assert.match(ui,/janela de 24h/i);
assert.match(customerView,/renderMarketingConsent/i,'card de cliente vinculado deve carregar estado de consentimento');

console.log('weekly offers consent template contract: OK');
