import fs from 'node:fs';
import assert from 'node:assert/strict';

const rootSite = fs.readFileSync('index.html', 'utf8');
const vitrineSite = fs.readFileSync('vitrine/index.html', 'utf8');
const resilience = fs.readFileSync('checkout-resilience.js', 'utf8');
const storefront = fs.readFileSync('supabase/functions/storefront-v2/index.ts', 'utf8');
const orders = fs.readFileSync('supabase/functions/admin-orders-v1/index.ts', 'utf8');

for (const site of [rootSite, vitrineSite]) {
  assert.ok(site.includes('Finalizar pedido'), 'checkout final CTA must remain Finalizar pedido');
  assert.match(site,/\/checkout-resilience\.js\?v=[0-9a-z-]+/i, 'public checkout must load versioned resilient stock handling');
  assert.ok(site.includes('Até 10:59') && site.includes('A partir das 11h'), 'visible delivery cutoff must be 11:00 Cuiaba');
}

assert.ok(resilience.includes('const CUTOFF_HOUR=11'), 'frontend resilience contract must use 11:00 Cuiaba');
assert.ok(resilience.includes('confirmStockAdjustment'), 'checkout must require acknowledgement of automatic stock adjustment before WhatsApp return');
assert.ok(resilience.includes('applyStockAdjustment'), 'checkout must expose accepted stock removals/quantity reductions');
assert.ok(resilience.includes('quantidade ajustada de'), 'quantity reductions must identify the exact item and quantity change');
assert.ok(resilience.includes('retirado porque ficou sem estoque'), 'removed items must be explained explicitly');
assert.ok(resilience.includes('Novo total:'), 'automatic stock adjustment must show the recalculated total');
assert.ok(resilience.includes('O pedido continuou normalmente com os itens disponíveis.'), 'stock adjustment must not become a checkout dead-end');
assert.ok(resilience.includes("text.includes('Não consegui registrar')") && resilience.includes("text.includes('O estoque mudou. Atualize a cesta')"), 'legacy generic error copy must be intercepted and replaced');

assert.ok(storefront.includes('const CUTOFF_HOUR=11'), 'backend cutoff must be 11:00 Cuiaba');
assert.ok(storefront.includes('reconcileOrderItemsForStock'), 'backend must reconcile current stock before order creation');
assert.ok(storefront.includes('stock_adjustment'), 'backend must return structured stock adjustment details');
assert.ok(storefront.includes('adjusted_items'), 'backend must identify exact affected items');
assert.ok(storefront.includes('stock_adjusted_retry:true'), 'stock-adjusted order must be marked for minimum-order exception');

assert.ok(orders.includes('items_count:details.itemCount'), 'WhatsApp payload must include item count from persisted order details');
assert.ok(orders.includes('items_text:details.itemsText'), 'WhatsApp payload must include the template-safe complete item text');
assert.ok(orders.includes('products_text:details.productsText'), 'WhatsApp payload must also expose the multiline product text');
assert.ok(orders.includes('const productLines=lines.map(line=>`• ${line}`);'), 'multiline product text must mark every product line');
assert.ok(orders.includes('order_items_not_ready'), 'WhatsApp must retry instead of sending an incomplete order');

console.log('checkout resilient stock adjustment + 11h cutoff + complete WhatsApp contract: ok');
