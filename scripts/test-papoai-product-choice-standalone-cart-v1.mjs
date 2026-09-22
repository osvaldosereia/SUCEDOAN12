import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260921234613_papoai_product_choice_standalone_cart_v1.sql','utf8');
for(const x of [
"'product_choice'",
'ensure_papoai_commerce_draft_cart_v1',
'propose_papoai_commerce_product_choice_v1',
'select_papoai_commerce_product_choice_v1',
"'basket_id',null",
"'selection_required'",
"action_type='product_choice'"
])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: standalone cart and remembered product choice contract');
