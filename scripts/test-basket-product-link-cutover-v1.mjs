import fs from 'node:fs';
import assert from 'node:assert/strict';

const section=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');
assert.match(section,/product-basket-link-cutover\.js\?v=20261006-1/,'basket section must load the canonical product→basket cutover');

const path='vitrine/admin/product-basket-link-cutover.js';
assert.ok(fs.existsSync(path),'canonical product→basket cutover module must exist');
const source=fs.readFileSync(path,'utf8');
assert.match(source,/data-open-product-basket/,'cutover must intercept product basket links');
assert.match(source,/data-tab=["']baskets["']/,'cutover must navigate to the main Cestas section');
assert.match(source,/DonaAntoniaBasketAdmin/,'cutover must use the canonical basket section controller');
assert.match(source,/setTab\(['"]store['"]\)/,'cutover must switch to Cestas do Site');
assert.match(source,/data-store-basket-card/,'cutover must select the linked canonical store basket');
assert.match(source,/stopImmediatePropagation/,'cutover must prevent the old guided click handler from running');
assert.match(source,/addEventListener\(['"]click['"][\s\S]*true\s*\)/,'cutover must intercept in capture phase before inline onclick');
assert.doesNotMatch(source,/DonaAntoniaBasketGuided|openGuided/,'canonical cutover must never invoke the guided compatibility editor');
console.log('basket product link cutover v1: PASS');
