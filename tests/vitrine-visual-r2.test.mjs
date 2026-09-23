// Visual regression contract for Vitrine R2.
// Run with: node tests/vitrine-visual-r2.test.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../vitrine/index.html', import.meta.url), 'utf8');

assert.match(html, /class="card product-card"/, 'product cards must use the R2 product-card layout');
assert.match(html, /class="product-buy-row"/, 'price and action must share one compact row');
assert.match(html, /class="quick-add"/, 'product add action must be a compact plus button');
assert.match(html, /class="quick-qty"/, 'selected products must use a compact quantity control');
assert.match(html, /.product-card\{border:0/, 'product cards must not use a visible box border');
assert.match(html, /.product-card \.photo\{[^}]*border-radius:/, 'product image area must have its own soft rounded surface');
assert.match(html, /.detail-photo\{[^}]*background:#f7f9f7/, 'product detail image must use the clean R2 surface');
assert.match(html, /.detail-grid\{[^}]*border-top:/, 'product details metadata must read as a light list, not boxed tiles');

console.log('vitrine visual r2: PASS');
