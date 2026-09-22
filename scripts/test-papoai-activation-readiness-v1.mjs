import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922064000_papoai_activation_readiness_v1.sql','utf8');
for(const x of [
'get_papoai_commerce_activation_readiness_v1',
"'ready_for_external_homologation_test'",
"'ready_for_production'",
"'external_customer_e2e_test_pending'",
"'rotate_exposed_homologation_api_key'",
"'confirm_current_papoai_channel_agent_link'",
"'production_activation_not_authorized'"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: PapoAI activation readiness contract');
