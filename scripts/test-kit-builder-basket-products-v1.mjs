import fs from 'node:fs';
import assert from 'node:assert/strict';

const api=fs.readFileSync('supabase/functions/admin-kit-builder-v1/index.ts','utf8');
const ui=fs.readFileSync('vitrine/admin/kit-builder.js','utf8');

assert.match(api,/['"]basket_products['"]/,'kit API must expose basket_products read action');
assert.match(api,/async function basketProducts\(/,'basket_products handler required');
const start=api.indexOf('async function basketProducts');
const end=api.indexOf('\nasync function',start+20);
const block=api.slice(start,end>start?end:api.length);
assert.match(block,/from\(['"]basket_templates['"]\)/,'basket products must start from commercial baskets');
assert.match(block,/is_active/i,'basket products must consider active baskets only');
assert.match(block,/from\(['"]store_basket_recipe_kits['"]\)/,'basket products must follow active basket recipe links');
assert.match(block,/assembly_kit_items|kitItemsFor/,'basket products must expand kit components');
assert.match(block,/basket_usage_count/,'basket products must expose count of baskets using each product');
assert.match(block,/basket_names/,'basket products must expose basket names for operational context');
assert.match(block,/stockMap|loose_sellable_stock/,'basket products must expose canonical stock context');

assert.match(ui,/productMode\s*:\s*['"]baskets['"]/,'products used in baskets must be the default product view');
assert.match(ui,/basketProducts\s*:\s*\[\]/,'UI must keep basket-product collection separate from full catalog');
assert.match(ui,/data-kit-product-mode=['"]baskets['"]/,'UI must expose Em cestas mode');
assert.match(ui,/data-kit-product-mode=['"]all['"]/,'UI must expose Todos os produtos mode');
assert.match(ui,/Em cestas/,'default mode must be labelled Em cestas');
assert.match(ui,/Todos os produtos/,'full catalog mode must remain available');
assert.match(ui,/['"]basket_products['"]/,'UI must load basket_products endpoint');
assert.match(ui,/basket_usage_count|cestas usando|usado em.*cesta/i,'product cards must show basket usage context');

console.log('kit builder basket products v1: PASS');
