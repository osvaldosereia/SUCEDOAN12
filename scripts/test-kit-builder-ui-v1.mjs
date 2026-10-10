import fs from 'node:fs';
import assert from 'node:assert/strict';

const path='vitrine/admin/kit-builder.js';
assert.ok(fs.existsSync(path),`missing ${path}`);
const ui=fs.readFileSync(path,'utf8');

assert.match(ui,/admin-kit-builder-v1/,'kit builder must call its isolated edge function');
assert.match(ui,/bridge\(\)[\s\S]{0,220}token|function token\(/,'kit API must use the authenticated Admin bridge token');
assert.match(ui,/function renderWorkspace\(/,'three-column workspace renderer required');
for(const marker of ['data-kit-column="kits"','data-kit-column="draft"','data-kit-column="products"']){
  assert.ok(ui.includes(marker),`missing workspace column ${marker}`);
}
assert.match(ui,/data-kit-nav-card/,'left column must expose selectable saved kits');
assert.match(ui,/data-kit-search/,'product column must have search');
assert.match(ui,/data-kit-chip/,'product column must expose reusable search chips');
assert.match(ui,/data-kit-product/,'product column must render selectable product cards');
for(const label of ['Estoque físico','Reservado','Livre','Custo','Venda'])assert.ok(ui.includes(label),`product cards must show ${label}`);
assert.match(ui,/productMode\s*:\s*['"]baskets['"]/,'basket products must be the default product mode');
assert.match(ui,/basketProducts\s*:\s*\[\]/,'basket products must have dedicated state');
assert.match(ui,/data-kit-product-mode=["']baskets["']/,'product column must expose Em cestas mode');
assert.match(ui,/data-kit-product-mode=["']all["']/,'product column must expose Todos os produtos mode');
assert.match(ui,/Em cestas/,'default mode label required');
assert.match(ui,/Todos os produtos/,'full catalog mode label required');
assert.match(ui,/['"]basket_products['"]/,'UI must call basket_products action');
assert.match(ui,/basket_usage_count|cestas usando|usado em.*cesta/i,'basket usage context must be visible on product cards');
assert.match(ui,/data-kit-inline-edit/,'product cards must open inline edit');
assert.match(ui,/data-kit-add/,'product cards must add product to draft');
assert.match(ui,/data-kit-item-qty/,'draft must edit per-kit quantity');
assert.match(ui,/data-kit-item-remove/,'draft must remove items');
assert.match(ui,/function saveDraftKit\(/,'draft save action required');
assert.match(ui,/['"]kit_save['"]/,'saving must use isolated kit API');
assert.match(ui,/source_kit_id/,'duplicate kit must retain source linkage');
assert.match(ui,/function duplicateKit\(/,'saved kits must support duplication');
assert.match(ui,/function archiveKit\(/,'saved kits must support archive');
assert.match(ui,/['"]kit_archive['"]/,'archive must use isolated kit API');
assert.match(ui,/cost_total|Custo total/,'workspace must calculate kit cost total');
assert.match(ui,/sale_total|Venda total/,'workspace must calculate kit sale total');
assert.match(ui,/function open\(/,'module must expose open entry point');
assert.match(ui,/DonaAntoniaKitBuilder/,'module must expose stable global adapter');

console.log('kit builder ui v3 basket products: PASS');
