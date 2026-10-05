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

const writesPath='supabase/migrations/20261005011500_baskets_kits_v2_writes.sql';
assert.ok(fs.existsSync(writesPath),`missing transactional writes migration: ${writesPath}`);
const writes=fs.readFileSync(writesPath,'utf8');
for(const fn of ['basket_v2_item_save_v1','basket_v2_product_components_save_v1','basket_v2_kit_components_save_v1','basket_v2_item_duplicate_v1','basket_v2_item_pause_v1']){
  assert.match(writes,new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}`,'i'),`missing RPC ${fn}`);
  assert.match(src,new RegExp(fn),`edge must call ${fn}`);
}
for(const action of ['item_save','item_duplicate','item_pause','product_components_save','kit_components_save']){
  assert.match(src,new RegExp(`['\"]${action}['\"]`),`missing write action ${action}`);
}
assert.match(writes,/category_id[^\n]+is null[\s\S]*raise exception 'basket_v2_category_required'/i,'item save must require category');
assert.match(writes,/sale_price[^\n]+<=\s*0[\s\S]*raise exception 'basket_v2_invalid_sale_price'/i,'item save must require positive sale price');
assert.match(writes,/group by\s+component_item_id/i,'duplicate kit components must be consolidated server-side');
assert.doesNotMatch(writes,/\b(delete|update|insert into)\s+public\.(basket_templates|basket_kit_templates|basket_kit_lots|basket_lots)\b/i,'V2 writes must not touch legacy basket tables');
console.log('baskets kits v2 API/write contract: ok');
