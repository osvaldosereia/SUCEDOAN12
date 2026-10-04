import fs from 'node:fs';
import assert from 'node:assert/strict';

const p='supabase/sql/20261004_basket_unified_order_engine_v1.sql';
assert.ok(fs.existsSync(p),'unified order migration must exist');
const sql=fs.readFileSync(p,'utf8');
const store=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const root=fs.readFileSync('index.html','utf8');
const vitrine=fs.readFileSync('vitrine/index.html','utf8');

assert.match(sql,/create_vitrine_cart_order_v3_base/i,'v3 base must be extended instead of creating a parallel order');
assert.match(sql,/legacy_full/i,'v3 must accept legacy preassembled basket lots');
assert.match(sql,/v_legacy_lot/i,'legacy lot branch must be explicit');
assert.match(sql,/basket_lot_public_availability_v1/i,'legacy branch must revalidate canonical public availability');
assert.match(sql,/availability_reason='available'/i,'legacy basket must be public at transaction time');
assert.match(sql,/allocation_role[^\n]*legacy|legacy[^\n]*allocation_role/i,'legacy allocations must coexist with food/hygiene allocations');
assert.match(sql,/basket_component_not_in_lot/i,'legacy component guard must be preserved');
assert.match(sql,/for update/i,'legacy lot must be locked before reserving the last unit');
assert.match(sql,/v_all_split:=true/i,'global split gate must be replaced by per-item routing');
assert.match(sql,/basket_unified_global_gate_anchor_missing/i,'migration must fail closed if the old global gate cannot be located');

const submitStart=store.indexOf('async function submit(req:Request,p:any){');
const submitEnd=store.indexOf('\nDeno.serve',submitStart);
assert.ok(submitStart>0&&submitEnd>submitStart,'storefront submit block must exist');
const orderBlock=store.slice(submitStart,submitEnd);
assert.match(orderBlock,/create_vitrine_cart_order_v3/,'storefront must always call the unified order RPC');
assert.doesNotMatch(orderBlock,/splitGlobalReady\(\)/,'order creation must not choose an RPC globally');
assert.doesNotMatch(orderBlock,/create_canonical_cart_order_v2/,'storefront must not fall back to a second basket order engine');

for(const html of [root,vitrine]){
  assert.doesNotMatch(html,/state\.cart=state\.cart\.filter\(x=>x\.type!==['"]basket['"]\|\|x\.split_mode===true\)/,'public cart must not delete legacy baskets when modern lots exist');
}
assert.equal(root,vitrine,'public root and /vitrine must remain identical');
console.log('basket unified mixed order engine: PASS');
