import fs from 'node:fs';
import assert from 'node:assert/strict';

const path='vitrine/admin/store-baskets-builder.js';
assert.ok(fs.existsSync(path),`missing ${path}`);
const ui=fs.readFileSync(path,'utf8');

assert.match(ui,/admin-store-baskets-v1/,'UI must use isolated store baskets API');
assert.match(ui,/admin-kit-builder-v1/,'new baskets must reuse canonical internal-kit catalog');
for(const action of ['list','editor','save','preview'])assert.match(ui,new RegExp(`["']${action}["']`),`UI must call action ${action}`);
assert.match(ui,/DonaAntoniaStoreBaskets/,'UI must expose stable adapter');
assert.match(ui,/Cestas do Site/,'workspace label required');
assert.match(ui,/Nova cesta/,'new basket action required');
assert.match(ui,/Kits internos/,'editor must be kit-only');
assert.match(ui,/Quantidade a montar/,'physical quantity control required');
assert.match(ui,/Valor oculto/,'hidden adjustment must be visible');
assert.match(ui,/Custo dos produtos|Custo total/,'cost summary required');
assert.match(ui,/Soma dos preços|Venda dos produtos/,'product sale total required');
assert.match(ui,/data-store-basket-list/,'basket list surface required');
assert.match(ui,/data-store-basket-editor/,'editor surface required');
assert.match(ui,/data-store-kit-add/,'kit add action required');
assert.match(ui,/data-store-kit-remove/,'kit remove action required');
assert.match(ui,/data-store-kit-qty/,'kit quantity editor required');
assert.match(ui,/data-store-quantity/,'assembly quantity input required');
assert.match(ui,/data-store-preview/,'preview action required');
assert.match(ui,/data-store-save/,'save recipe action required');
assert.doesNotMatch(ui,/position_products|family_key|data-bg-term|Adicionar termo/,'new store basket UI must not expose old position/family editor');
assert.doesNotMatch(ui,/product_quick_save|product_stock_set/,'store basket UI must not edit products directly');
assert.doesNotMatch(ui,/lot_reserve|basket_stock_lots|basket_lot_component_reservations/,'recipe UI must not reserve stock directly');

console.log('store baskets builder UI v1: PASS');
