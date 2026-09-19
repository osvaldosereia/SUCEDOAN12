import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync('supabase/functions/admin-whatsapp-direct-v1/index.ts','utf8');
const vault=fs.readFileSync('supabase/migrations/20260918203000_customer_os_vault_secret_reader_v1.sql','utf8');

const start=source.indexOf('if(action==="meta_diagnostics_readonly")');
const end=source.indexOf('if(action==="template_save_draft")',start);
assert.ok(start>=0&&end>start,'Meta diagnostics block missing');
const block=source.slice(start,end);

// Credential contract: env first, narrowly-scoped Vault fallback, never exposed.
assert.match(source,/META_WHATSAPP_ACCESS_TOKEN/);
assert.match(source,/dona_antonia_whatsapp_access_token_v1/);
assert.match(source,/get_customer_os_vault_secret_v1/);
assert.match(vault,/service_role/i);
assert.match(block,/meta_credentials_missing/);
assert.doesNotMatch(block,/token:\s*access/);
assert.doesNotMatch(block,/access_token/);

// Read-only Graph probe: only GET and the three evidence endpoints.
assert.match(block,/method:"GET"/);
assert.match(block,/me\/permissions/);
assert.match(block,/subscribed_apps/);
assert.match(block,/fields=id,display_phone_number,verified_name,quality_rating/);
assert.doesNotMatch(block,/method:"POST"/);
assert.doesNotMatch(block,/\/messages/);
assert.doesNotMatch(block,/sendMeta\s*\(/);

// Required WhatsApp scopes are explicit and fail closed until proven granted.
assert.match(block,/whatsapp_business_management/);
assert.match(block,/whatsapp_business_messaging/);
assert.match(block,/===\s*"granted"\?"granted":"missing"/);
assert.match(block,/meta_account_permissions/);

// Callback evidence must be the exact Supabase Meta Direct endpoint.
assert.match(block,/expectedDirectCallback/);
assert.match(block,/\/functions\/v1\/whatsapp-meta-direct-v1/);
assert.match(block,/override_callback_uri/);
assert.match(block,/directCallbackVerified/);
assert.match(block,/flow_health_verified_direct_pending/);

// Evidence is persisted, but activation/runtime gates are not mutated.
assert.match(block,/meta_provider_health_snapshots/);
assert.match(block,/evaluate_meta_direct_readiness_v1/);
assert.doesNotMatch(block,/from\("channel_accounts"\)[\s\S]{0,500}\.update\(/);
assert.doesNotMatch(block,/from\("whatsapp_direct_config"\)[\s\S]{0,500}\.update\(/);
assert.doesNotMatch(block,/external_activation_authorized\s*[:=]\s*true/);
assert.match(block,/external_side_effect:false/);
assert.match(block,/meta_message_sent:false/);
assert.match(block,/meta_configuration_changed:false/);

// The probe reports the canonical runtime gates instead of opening them.
assert.match(block,/canonical_outbound_enabled/);
assert.match(block,/meta_direct_ready/);

console.log('CM-1 Meta preflight fail-closed v2 contract: OK');
