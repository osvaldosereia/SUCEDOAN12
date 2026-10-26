import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const operations = readFileSync('vitrine/admin/runtime-src/03-operations.part.js.txt', 'utf8');
const products = readFileSync('vitrine/admin/runtime-src/04-products.part.js.txt', 'utf8');
const editorStart = products.indexOf('async function openProductEditor');
const editorEnd = products.indexOf('function originOptions', editorStart);
const editor = products.slice(editorStart, editorEnd);
const listStart = operations.indexOf('async function renderProducts');
const listEnd = operations.indexOf('async function loadProductFacets', listStart);
const list = operations.slice(listStart, listEnd);

for (const field of ['name', 'sku', 'gtin', 'price', 'cost', 'stock', 'category', 'image_url', 'description', 'active']) {
  assert.ok(editor.includes(`name="${field}"`), `Product editor must keep ${field}.`);
}
for (const feature of ['fiscal_ncm', 'offer_discount', 'Ativar oferta', 'Oferta manual', 'manageProductLots', 'standardizeProductImage', 'inventoryPrintSheet', 'productSource', 'productLotStatus']) {
  assert.ok(!editor.includes(feature) && !list.includes(feature), `Product screen should not expose ${feature}.`);
}
assert.ok(products.includes("api('product_save'"), 'Product save must use the existing Supabase API.');
assert.ok(products.includes("api('product_stock_set'"), 'Stock updates must keep the existing Bling flow.');

console.log('OK: Products use a basic commerce editor and retain the existing database and stock integrations.');
