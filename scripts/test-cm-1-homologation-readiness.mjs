import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260919050000_cm_1_homologation_readiness_v1.sql','utf8');
const runtime=fs.readFileSync('admin/runtime-config.js','utf8');
const relationship=fs.readFileSync('admin/relacionamento.js','utf8');
const html=fs.readFileSync('admin/relacionamento.html','utf8');

assert.match(migration,/cm1_homologation_readiness_v1/);
assert.match(migration,/safe_for_internal_homologation/);
assert.match(migration,/external_activation_authorized',false/);
assert.match(migration,/canonical_whatsapp_outbound_enabled/);
assert.match(migration,/marketing_publishing_enabled/);
assert.match(migration,/whatsapp_direct_enabled/);
assert.match(migration,/papoai_adapter_outbound_enabled/);
assert.match(migration,/runtime_templates_enabled/);
assert.match(migration,/legacy_automation_outbound_live_but_canonical_gate_closed/);
assert.match(migration,/no_positive_marketing_consent/);
assert.match(migration,/customer_os_pin_browser_validation','pending'/);
assert.match(migration,/relationship_center_pin_browser_validation','pending'/);
assert.match(migration,/meta_direct_homologation','pending'/);
assert.match(migration,/relationship_command_summary_v1[\s\S]*'homologation',public\.cm1_homologation_readiness_v1\(\)/);
assert.match(migration,/revoke all on function public\.cm1_homologation_readiness_v1\(\) from public,anon,authenticated/);
assert.doesNotMatch(migration,/insert into public\.(marketing_campaigns|whatsapp_direct_events)|graph\.facebook\.com|openai|gpt-|gemini/i);

assert.match(runtime,/customerOsSecureUiEnabled:false/);
assert.match(runtime,/relationshipUiEnabled:false/);
assert.match(runtime,/relationshipCanaryEnabled:true/);
assert.match(html,/Homologação CM-1/);
assert.match(relationship,/safe_for_internal_homologation/);
assert.match(relationship,/external_activation_authorized/);
assert.match(relationship,/Efeitos externos marketing 7d/);
assert.match(relationship,/Efeitos externos IA 7d/);

console.log('cm-1 homologation readiness contract ok');
