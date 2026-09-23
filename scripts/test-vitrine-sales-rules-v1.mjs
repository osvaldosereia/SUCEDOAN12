import fs from 'node:fs';
import assert from 'node:assert/strict';

const root=fs.readFileSync('index.html','utf8');
const vitrine=fs.readFileSync('vitrine/index.html','utf8');
const edge=fs.readFileSync('supabase/functions/simple-storefront-v1/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20260923044336_storefront_stock_reservation_v1.sql','utf8');

assert.equal(root,vitrine,'root and /vitrine must stay identical');
const inlineScript=root.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)?.[1]||'';
assert.ok(inlineScript,'inline storefront script must exist');
assert.doesNotThrow(()=>new Function(inlineScript),'storefront inline JavaScript must parse');
for(const source of [root,edge]){
  assert.match(source,/MINIMUM_ORDER_CENTS\s*=\s*7500/);
  assert.match(source,/America\/Cuiaba/);
  assert.match(source,/11-20/);
  assert.match(source,/easterSunday/);
  assert.match(source,/local\.hour>=12/);
}
assert.match(root,/remainingStock\(/);
assert.match(root,/maxBasketQty\(/);
assert.match(root,/Domingos e feriados nacionais não realizamos entregas/);
assert.match(edge,/reserve_storefront_stock_v1/);
assert.match(edge,/release_storefront_stock_v1/);
assert.match(edge,/stockDemand/);
assert.match(edge,/total<MINIMUM_ORDER_CENTS/);
assert.match(edge,/stock_quantity:\s*Number\(p\.stock_quantity/);
assert.match(migration,/for update/i);
assert.match(migration,/stock_quantity=stock_quantity-v_quantity/);
assert.match(migration,/revoke all on function public\.reserve_storefront_stock_v1[\s\S]*public, anon, authenticated/);
console.log('vitrine_sales_rules_v1_ok');
