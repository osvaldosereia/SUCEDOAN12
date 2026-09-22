import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260922030000_papoai_delegated_replacement_preview_v1.sql','utf8');
for(const x of [
'papoai_commerce_category_families',
'get_papoai_commerce_removal_credit_v1',
'preview_papoai_commerce_delegated_replacement_v1',
"'calculation_authority','supabase'",
"'requires_confirmation',true",
"'delegated_replacement_max_difference_pct',15",
"'delegated_replacement_max_distinct_products',2"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: delegated replacement preview contract');
