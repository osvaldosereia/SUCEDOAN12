import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='supabase/migrations/20261005011000_baskets_kits_v2_core.sql';
assert.ok(fs.existsSync(path),`migration missing: ${path}`);
const sql=fs.readFileSync(path,'utf8');
for(const name of ['basket_v2_items','basket_v2_product_components','basket_v2_kit_components','basket_v2_lots','basket_v2_lot_items']){
  assert.match(sql,new RegExp(`create table(?: if not exists)?\\s+public\\.${name}`,'i'),`missing table ${name}`);
}
assert.match(sql,/composition_mode[^\n]+check[^\n]+products[^\n]+combined_kits/is,'composition_mode must be constrained');
assert.match(sql,/unique\s*\(\s*parent_item_id\s*,\s*component_item_id\s*\)/i,'kit component relation must be unique');
assert.match(sql,/parent_item_id\s*<>\s*component_item_id/i,'self reference must be forbidden');
assert.match(sql,/quantity[^\n]+check\s*\(\s*quantity\s*>=\s*1\s*\)/i,'component quantity must be >= 1');
assert.match(sql,/basket_v2_validate_component_v1/i,'server-side component validation is required');
assert.match(sql,/basket_v2_item_availability_v1/i,'availability view/function is required');
assert.match(sql,/basket_v2_item_financials_v1/i,'financial view/function is required');
assert.match(sql,/basket_v2_item_detail_admin_v1/i,'admin detail RPC is required');
assert.doesNotMatch(sql,/\b(drop|alter)\s+table\s+public\.(basket_templates|basket_kit_templates|basket_kit_lots|basket_lots)\b/i,'V2 migration must not alter/drop legacy basket tables');
console.log('baskets kits v2 schema contract: ok');
