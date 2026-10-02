import fs from 'node:fs';
import assert from 'node:assert/strict';

const site = fs.readFileSync('vitrine/index.html', 'utf8');
const storefront = fs.readFileSync('supabase/functions/storefront-v2/index.ts', 'utf8');
const orders = fs.readFileSync('supabase/functions/admin-orders-v1/index.ts', 'utf8');

assert.ok(site.includes("Finalizar pedido"), 'checkout final CTA must remain Finalizar pedido');
assert.ok(!site.includes("O estoque mudou. Atualize a cesta e tente novamente."), 'stock conflict must not dead-end with the old generic blocking copy');
assert.ok(site.includes("confirmStockAdjustment"), 'checkout must offer a simple confirmation for automatic stock adjustment');
assert.ok(site.includes("applyStockAdjustment"), 'checkout must automatically apply accepted stock removals/quantity reductions');
assert.ok(site.includes("CUTOFF_HOUR=11") || site.includes("CUTOFF_HOUR = 11"), 'frontend checkout cutoff must be 11:00 Cuiaba');
assert.ok(storefront.includes('const CUTOFF_HOUR=11'), 'backend cutoff must be 11:00 Cuiaba');
assert.ok(storefront.includes('stock_adjustment'), 'backend must return structured stock adjustment details');
assert.ok(storefront.includes('adjusted_items'), 'backend must identify the exact affected items');
assert.ok(orders.includes('items_count:items.count'), 'WhatsApp payload must include item count');
assert.ok(orders.includes('items_text:items.text'), 'WhatsApp payload must include complete item lines');
assert.ok(orders.includes('order_items_not_ready'), 'WhatsApp must retry instead of sending an incomplete order');

console.log('checkout resilient stock adjustment + 11h cutoff + complete WhatsApp contract: ok');
