import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260919071000_cm_1_meta_policy_registry_verified_v1.sql','utf8');

for(const key of [
  'whatsapp_opt_in_required',
  'whatsapp_opt_out_required',
  'whatsapp_business_initiated_template_required',
  'whatsapp_customer_service_window_24h',
  'whatsapp_automation_human_escalation',
  'whatsapp_data_privacy_sensitive_identifiers',
  'whatsapp_commerce_policy_required',
  'whatsapp_regulated_verticals_fail_closed'
]) assert.match(migration,new RegExp(key),`missing policy ${key}`);

assert.match(migration,/https:\/\/business\.whatsapp\.com\/policy/);
assert.match(migration,/fail_closed/);
assert.match(migration,/meta_policy_registry_readiness_v1/);
assert.match(migration,/freshness_days',30/);
assert.match(migration,/external_side_effect',false/);
assert.match(migration,/external_activation_authorized',false/);
assert.match(migration,/revoke all on function public\.meta_policy_registry_readiness_v1\(\)/);
assert.match(migration,/grant execute on function public\.meta_policy_registry_readiness_v1\(\)[\s\S]*to service_role/);
assert.match(migration,/whatsapp_regulated_verticals_fail_closed',2/);
assert.match(migration,/independentemente de licenças, registros ou outras aprovações/);
assert.match(migration,/"license_override":false/);
assert.match(migration,/"prohibited_goods_must_be_blocked":true/);
assert.doesNotMatch(migration,/"license_check_when_applicable":true/);
assert.doesNotMatch(migration,/update public\.channel_accounts|update public\.whatsapp_direct_config|outbound_enabled\s*=\s*true|release_mode\s*=\s*'live'/i);

console.log('cm-1 meta policy registry contract ok');
