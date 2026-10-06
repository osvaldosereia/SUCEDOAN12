import fs from 'node:fs';
import assert from 'node:assert/strict';

const api=fs.readFileSync('supabase/functions/admin-store-baskets-v1/index.ts','utf8');
const ui=fs.readFileSync('vitrine/admin/store-baskets-builder.js','utf8');

assert.match(api,/async function basketComposition\(/,'admin store baskets API must expose basket composition helper');
const start=api.indexOf('async function basketComposition');
const end=api.indexOf('\nasync function',start+20);
const block=api.slice(start,end>start?end:api.length);
for(const source of ['store_basket_recipe_kits','assembly_kits','assembly_kit_items','products','ops2_loose_sellable_stock_v1']){
  assert.match(block,new RegExp(source),`composition must use ${source}`);
}
assert.match(block,/kit_sources/,'composition must retain kit origin');
assert.match(block,/quantity_per_basket/,'composition must aggregate effective basket quantity');
assert.match(block,/loose_sellable_stock/,'composition must expose loose stock');
assert.match(block,/basket_locked_quantity/,'composition must expose reserved stock');
assert.match(api,/products\s*:\s*await basketComposition|basketComposition\(basketId\)/,'editor response must include product composition');

assert.match(ui,/sb-product-grid/,'basket editor must render product grid');
assert.match(ui,/grid-template-columns\s*:\s*repeat\(4,\s*minmax\(0,1fr\)\)/,'desktop composition must use four columns');
assert.match(ui,/data-store-product-card/,'each effective product must render as a card');
assert.match(ui,/quantity_per_basket/,'cards must show quantity per basket');
assert.match(ui,/kit_sources/,'cards must show kit origin');
for(const label of ['Livre','Reservado','Custo','Venda'])assert.ok(ui.includes(label),`product card must show ${label}`);
assert.match(ui,/sb-basket-image/,'basket image must be visually previewed');
assert.match(ui,/Produtos desta cesta/,'composition section must be clearly labelled');

console.log('store baskets visible composition v1: PASS');
