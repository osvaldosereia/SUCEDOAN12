import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922031500_papoai_delegated_replacement_utility_v2.sql','utf8');
for(const x of [
'preview_papoai_commerce_delegated_replacement_v2',
"'increase_existing'",
"'add_product'",
'same_category_count',
'existing_action_count',
"'ranking_policy','utility_then_value'",
"'delegated_replacement_prefer_existing_items',true"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: delegated replacement utility ranking v2');
