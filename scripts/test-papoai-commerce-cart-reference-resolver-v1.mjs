import fs from 'node:fs';import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260921230647_papoai_commerce_cart_reference_resolver_v1.sql','utf8');
for(const x of ['resolve_papoai_commerce_cart_item_v1','ambiguous_item','set_papoai_commerce_basket_quantity_by_query_v1','source_query'])assert.ok(sql.includes(x),'missing '+x);
console.log('PASS: cart reference resolver contract');
