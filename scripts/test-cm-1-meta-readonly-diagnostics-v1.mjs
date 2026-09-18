import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('supabase/functions/admin-whatsapp-direct-v1/index.ts','utf8');
const api=fs.readFileSync('admin/relationship-api.js','utf8');
const ui=fs.readFileSync('admin/relacionamento.js','utf8');
const html=fs.readFileSync('admin/relacionamento.html','utf8');
const vaultMigration=fs.readFileSync('supabase/migrations/20260918203000_customer_os_vault_secret_reader_v1.sql','utf8');

assert.match(admin,/action==="meta_diagnostics_readonly"/);
const start=admin.indexOf('if(action==="meta_diagnostics_readonly")');
const end=admin.indexOf('if(action==="template_save_draft")',start);
assert.ok(start>=0&&end>start,'bloco meta_diagnostics_readonly ausente');
const block=admin.slice(start,end);

assert.match(admin,/dona_antonia_whatsapp_access_token_v1/);
assert.match(admin,/get_customer_os_vault_secret_v1/);
assert.match(block,/resolveWhatsappAccessTokenReadonly/);
assert.match(block,/method:"GET"/);
assert.match(block,/me\/permissions/);
assert.match(block,/subscribed_apps/);
assert.match(block,/override_callback_uri/);
assert.match(block,/expectedDirectCallback/);
assert.match(block,/whatsapp_flow_health_events/);
assert.match(block,/flow_health_webhook_verified/);
assert.match(block,/quality_rating/);
assert.match(block,/meta_account_permissions/);
assert.match(block,/meta_provider_health_snapshots/);
assert.match(block,/evaluate_meta_direct_readiness_v1/);
assert.match(block,/external_side_effect:false/);
assert.match(block,/meta_message_sent:false/);
assert.match(block,/meta_configuration_changed:false/);
assert.doesNotMatch(block,/\/messages/);
assert.doesNotMatch(block,/method:"POST"/);
assert.doesNotMatch(block,/from\("channel_accounts"\)[\s\S]{0,300}\.update\(/);
assert.doesNotMatch(block,/from\("whatsapp_direct_config"\)[\s\S]{0,300}\.update\(/);
assert.doesNotMatch(block,/sendMeta\s*\(/);

assert.match(api,/admin-whatsapp-direct-v1/);
assert.match(api,/runMetaDiagnosticsReadonly/);
assert.match(api,/action:'meta_diagnostics_readonly'/);

assert.match(ui,/data-meta-diagnostics/);
assert.match(ui,/runMetaDiagnosticsReadonly/);
assert.match(ui,/Verificar Meta agora/);
assert.match(ui,/Webhook Flow health/);
assert.match(ui,/zero ação externa/i);
assert.match(html,/relacionamento\.js\?v=20260918-9/);

console.log('CM-1 Meta read-only diagnostics contract: OK');
