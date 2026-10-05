import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath='supabase/migrations/20261005190000_attendance_weekly_offers_consent_v1.sql';
const sqlMirrorPath='supabase/sql/20261005_attendance_weekly_offers_consent_v1.sql';
const apiPath='supabase/functions/admin-whatsapp-ops-v1/index.ts';
const uiPath='vitrine/admin/atendimento/attendance-marketing-consent.js';
const customerViewPath='vitrine/admin/atendimento/attendance-customer-view.js';

assert.ok(fs.existsSync(migrationPath),'migration semanal deve existir');
assert.ok(fs.existsSync(sqlMirrorPath),'espelho SQL semanal deve existir');
assert.ok(fs.existsSync(uiPath),'módulo de consentimento no Atendimento deve existir');

const sql=fs.readFileSync(migrationPath,'utf8');
const mirror=fs.readFileSync(sqlMirrorPath,'utf8');
const api=fs.readFileSync(apiPath,'utf8');
const ui=fs.readFileSync(uiPath,'utf8');
const customerView=fs.readFileSync(customerViewPath,'utf8');

assert.equal(sql,mirror,'migration e espelho SQL devem permanecer idênticos');
assert.match(sql,/create table if not exists public\.marketing_weekly_consent_requests_v1/i);
assert.match(sql,/consent_scope[^\n]*weekly_offers_coupons/i);
assert.match(sql,/no máximo 1 vez por semana/i);
assert.match(sql,/SIM, QUERO RECEBER/i);
assert.match(sql,/AGORA NÃO/i);
assert.match(sql,/last_inbound_at\s*\+\s*interval '24 hours'/i,'pedido deve ser bloqueado fora da janela de serviço');
assert.match(sql,/ops2_admin_attendance_weekly_consent_state_browser_v1/i);
assert.match(sql,/ops2_admin_attendance_weekly_consent_prepare_v1/i);
assert.match(sql,/ops2_admin_attendance_weekly_consent_mark_sent_v1/i);
assert.match(sql,/marketing_capture_weekly_consent_message_v1/i);
assert.match(sql,/after insert on public\.whatsapp_messages_v1/i,'resposta inbound deve ser capturada no banco');
assert.match(sql,/marketing_record_consent_v1/i,'decisão deve entrar no ledger canônico');
assert.match(sql,/revoke all on table public\.marketing_weekly_consent_requests_v1 from public, anon, authenticated/i);
assert.match(sql,/grant execute on function public\.ops2_admin_attendance_weekly_consent_state_browser_v1/i);

assert.match(api,/marketing_weekly_consent_request/,'gateway deve expor ação segura de pedido de consentimento');
assert.match(api,/ops2_admin_attendance_weekly_consent_prepare_v1/);
assert.match(api,/ops2_admin_attendance_enqueue_text_v3/);
assert.match(api,/ops2_admin_attendance_weekly_consent_mark_sent_v1/);
assert.doesNotMatch(api,/template.*weekly_consent/i,'pedido inicial não deve depender de template de marketing');

assert.match(ui,/Pedir autorização/i);
assert.match(ui,/Ofertas e cupons até 1x\/semana/i);
assert.match(ui,/marketing_weekly_consent_request/);
assert.match(ui,/service_window_closed/);
assert.match(customerView,/renderMarketingConsent/i,'card de cliente vinculado deve carregar estado de consentimento');

console.log('weekly offers consent contract: OK');
