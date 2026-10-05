import assert from 'node:assert/strict';
import fs from 'node:fs';

const path='supabase/functions/admin-baskets-v2-v1/index.ts';
assert.ok(fs.existsSync(path),`missing edge function: ${path}`);
const src=fs.readFileSync(path,'utf8');
assert.match(src,/async\s+function\s+adminAuth\s*\(/,'V2 admin API must require authenticated admin session');
assert.match(src,/basket_v2_items/,'V2 API must read V2 commercial items');
assert.match(src,/basket_v2_item_detail_admin_v1/,'V2 API must use canonical detail RPC');
assert.match(src,/select\([^)]*cost[^)]*price[^)]*/s,'product queries must select both cost and price');
assert.match(src,/cost:\s*validMoney\([^)]*cost[^)]*\)/,'product mapping must normalize cost explicitly');
assert.match(src,/return\s+null/,'invalid or missing monetary values must map to null, not implicit zero');
for(const action of ['health','list','detail','product_search','product_suggestions','component_candidates']){
  assert.match(src,new RegExp(`['\"]${action}['\"]`),`missing action ${action}`);
}
for(const cat of ['Cestas Completas','Cestas Só Alimento','Kits Limpeza e Higiene','Kits Limpeza','Kits Higiene']){
  assert.ok(src.includes(cat),`missing official category label: ${cat}`);
}
assert.doesNotMatch(src,/from\(["'](?:basket_templates|basket_kit_templates|basket_kit_lots|basket_lots)["']\)/,'V2 API must not read legacy basket tables for V2 actions');
console.log('baskets kits v2 API read contract: ok');
