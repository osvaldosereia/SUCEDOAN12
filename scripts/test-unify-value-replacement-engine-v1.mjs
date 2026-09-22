import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922040000_unify_value_replacement_engine_v1.sql','utf8');
for(const x of [
"'value_replacement'",
"'delegated_replacement'",
"engine','delegated_replacement_v3",
'propose_papoai_commerce_delegated_replacement_v1',
'confirm_papoai_commerce_pending_action_v1'
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: value replacement engine unified');
