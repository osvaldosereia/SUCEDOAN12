import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge='supabase/functions/admin-baskets-v2-v1/index.ts';
const core='supabase/migrations/20261005011000_baskets_kits_v2_core.sql';
const writes='supabase/migrations/20261005011500_baskets_kits_v2_writes.sql';
const src=fs.readFileSync(edge,'utf8');
const sql=fs.readFileSync(core,'utf8');
const w=fs.readFileSync(writes,'utf8');
assert.match(sql,/min\s*\(\s*floor\s*\(/i,'combined availability must use minimum floor of component availability/quantity');
assert.match(sql,/when p\.paused or not p\.is_active then 0/i,'paused combined parent must have zero availability');
assert.match(sql,/basket_v2_nested_combination_not_allowed/i,'nested combined child must be rejected');
assert.match(w,/group by\s+component_item_id/i,'duplicate components must consolidate');
assert.doesNotMatch(w,/array_length|cardinality|limit_components|max_components/i,'no artificial component-count limit is allowed');
for(const key of ['current_cost_cents','retail_products_cents','sale_price_cents','cost_total_cents','retail_products_total_cents','component_sales_total_cents','final_sale_price_cents','commercial_adjustment_cents']){
  assert.ok(src.includes(key),`missing financial key ${key}`);
}
assert.match(src,/component_sales_total_cents[\s\S]*reduce/i,'component sale total must aggregate all kit components');
assert.match(src,/commercial_adjustment_cents[\s\S]*final_sale_price_cents[\s\S]*component_sales_total_cents/i,'commercial adjustment must compare final manual price against component sales');
assert.match(src,/final_sale_price_cents[\s\S]*detail\.item\.sale_price/i,'final sale price must come from parent commercial item, not component sum');
console.log('baskets kits v2 unlimited combination contract: ok');
