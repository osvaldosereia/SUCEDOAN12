import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922031000_papoai_value_replacement_v1.sql','utf8');
for(const x of [
"'value_replacement'",
'papoai_commerce_product_family_v1',
'recommend_papoai_commerce_value_replacement_v1',
'propose_papoai_commerce_value_replacement_v1',
'select_papoai_commerce_value_replacement_v1',
"'calculation_authority','supabase'",
'cart_changed_recommend_again',
"'delegated_replacement_max_options',3"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: delegated value replacement contract');
