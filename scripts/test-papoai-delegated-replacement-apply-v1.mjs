import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922034500_papoai_delegated_replacement_apply_v1.sql','utf8');
for(const x of [
"'delegated_replacement'",
'propose_papoai_commerce_delegated_replacement_v1',
'apply_papoai_commerce_delegated_replacement_v1',
"'increase_existing'",
"'add_product'",
"v_action.action_type='delegated_replacement'"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: delegated replacement propose/apply contract');
