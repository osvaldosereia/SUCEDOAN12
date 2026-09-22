import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922033000_papoai_delegated_replacement_preferences_v3.sql','utf8');
for(const x of [
'papoai_commerce_substitution_preferences',
"('food','FEIJÃO',100",
"('food','ÓLEO',95",
'utility_score',
"'ranking_policy','utility_weight_then_value'"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: delegated replacement preference ranking v3');
