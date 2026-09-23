import fs from 'node:fs';
import assert from 'node:assert/strict';

const root=fs.readFileSync('index.html','utf8');
const vitrine=fs.readFileSync('vitrine/index.html','utf8');
const adminHtml=fs.readFileSync('vitrine/admin/index.html','utf8');
const edge=fs.readFileSync('supabase/functions/simple-storefront-v1/index.ts','utf8');
const admin=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20260923050224_order_stock_reservations_v2.sql','utf8');
const consumeLockMigration=fs.readFileSync('supabase/migrations/20260923051012_order_stock_reservations_consume_lock.sql','utf8');

assert.equal(root,vitrine,'root and /vitrine must stay identical');

const publicScript=root.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)?.[1]||'';
const adminScript=adminHtml.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)?.[1]||'';
assert.ok(publicScript,'inline storefront script must exist');
assert.ok(adminScript,'inline admin script must exist');
assert.doesNotThrow(()=>new Function(publicScript),'storefront inline JavaScript must parse');
assert.doesNotThrow(()=>new Function(adminScript),'admin inline JavaScript must parse');

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

// Basket editor must visually follow checkout and keep live total beside a smaller action.
assert.match(root,/basket-edit-list/);
assert.match(root,/basket-action-bar/);
assert.match(root,/id="basketActionTotal"/);
assert.match(root,/class="checkout-item-row"/);
assert.match(root,/class="checkout-thumb"/);
assert.match(root,/basket-add-btn/);

// Storefront must use reservations for sellable stock and not deduct physical stock at checkout.
assert.match(edge,/availableStockMap/);
assert.match(edge,/order_stock_reservations/);
assert.match(edge,/reserve_storefront_order_stock_v2/);
assert.match(edge,/release_storefront_order_stock_v2/);
assert.match(edge,/stock_model:"reservation_v2"/);
assert.match(edge,/stockDemand/);
assert.match(edge,/total<MINIMUM_ORDER_CENTS/);

// Admin: filters + print separation consumes reservation exactly once.
assert.match(admin,/productFacets/);
assert.match(admin,/detailed_subcategory/);
assert.match(admin,/consumeOrderStock/);
assert.match(admin,/consume_storefront_order_stock_v2/);
assert.match(admin,/release_storefront_order_stock_v2/);
assert.match(admin,/currentOrder\.status==="cancelled"/);
assert.match(adminHtml,/id="productCategory"/);
assert.match(adminHtml,/id="productSubcategory"/);
assert.match(adminHtml,/action==="order_consume_stock"|order_consume_stock/);
assert.match(adminHtml,/async function printSeparation/);
assert.ok(adminHtml.indexOf("order_consume_stock") < adminHtml.indexOf("openPrint('Separação"),'stock must be consumed before separation is rendered');

// Database contract: reservation does not touch stock; consume does; repeated consume is idempotent.
assert.match(migration,/create table if not exists public\.order_stock_reservations/);
assert.match(migration,/status text not null default 'reserved'/);
assert.match(migration,/for update/i);
assert.match(migration,/reserve_storefront_order_stock_v2/);
assert.match(migration,/consume_storefront_order_stock_v2/);
assert.match(migration,/release_storefront_order_stock_v2/);
assert.match(migration,/stock_quantity=stock_quantity-v_row\.quantity/);
assert.match(migration,/already_consumed/);
assert.match(consumeLockMigration,/order by r\.product_id\s+for update/i,'concurrent separation prints must lock reservation rows');
assert.match(migration,/revoke all on function public\.reserve_storefront_order_stock_v2[\s\S]*public, anon, authenticated/);

console.log('vitrine_sales_rules_v2_ok');
