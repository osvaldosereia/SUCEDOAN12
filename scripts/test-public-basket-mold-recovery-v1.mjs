import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const page = fs.readFileSync('index.html', 'utf8');
const api = fs.readFileSync('supabase/functions/storefront-v2/index.ts', 'utf8');

const availabilitySource = page.match(/function moldDraftAvailableBasketCount\(d\)\{[\s\S]*?\n    \}/)?.[0];
assert.ok(availabilitySource, 'public basket draft recalculates stock after an item change');
const compileAvailability = remainingStock => vm.runInNewContext(
  `(${availabilitySource.replace('function moldDraftAvailableBasketCount', 'function')})`,
  { remainingStock },
);
const availableBaskets = compileAvailability((_id, _index, fallback) => fallback);
assert.equal(availableBaskets({ items: [
  { product_id: 'out', quantity: 2, stock_quantity: 0 },
  { product_id: 'in', quantity: 2, stock_quantity: 80 },
] }), 0, 'unavailable active items keep the add button blocked');
assert.equal(availableBaskets({ items: [
  { product_id: 'out', quantity: 0, stock_quantity: 0 },
  { product_id: 'in', quantity: 2, stock_quantity: 80 },
] }), 30, 'removing an unavailable item unlocks the available draft');
assert.equal(availableBaskets({ items: [
  { product_id: 'same', quantity: 2, stock_quantity: 40 },
  { product_id: 'same', quantity: 3, stock_quantity: 40 },
] }), 8, 'duplicate product positions share the same stock pool');
assert.equal(compileAvailability((_id, _index, fallback) => fallback - 5)({ items: [
  { product_id: 'p', quantity: 2, stock_quantity: 40 },
] }), 17, 'the draft respects stock already used by the cart');

assert.match(page, /allow_unavailable_preview:true/, 'product substitutions may quote a draft while other rows still need adjustment');
assert.match(page, /quantity:Number\(x\.quantity\|\|0\)/, 'draft quantities, including removed rows, reach the quote endpoint');
assert.match(page, /basket_mold_options_batch/, 'visible option rows load through the batched endpoint');
assert.match(page, /syncMoldDraftAvailability\(d\)/, 'editing or removing items refreshes basket availability');

const checkout = page.slice(page.indexOf('async function validateMoldCartBeforeCheckout(){'), page.indexOf('\n    }', page.indexOf('async function validateMoldCartBeforeCheckout(){')) + 6);
assert.match(checkout, /quantity:Number\(component\.quantity\|\|0\)/, 'checkout quote validates the customer-edited quantities');
assert.match(checkout, /lightweight:true/, 'checkout validation reads only the selected products');
assert.doesNotMatch(checkout, /allow_unavailable_preview/, 'checkout still rejects an unavailable basket');

const batch = api.slice(api.indexOf('async function moldPositionOptionsBatch('), api.indexOf('async function moldQuote('));
assert.ok(batch.length > 0, 'edge function has a batched alternatives reader');
assert.match(batch, /moldProductsMap\(productIds\)/, 'batched options read product data once');
assert.match(batch, /moldAvailableStockMap\(productIds\)/, 'batched options read stock once');
assert.match(batch, /product&&available>0\?/, 'substitutions with partial stock remain selectable and can reduce the draft quantity');
assert.match(api, /action==="basket_mold_options_batch"/, 'edge function exposes the batch endpoint');
const bodyParse = api.indexOf('const body=req.method==="POST"?await req.json().catch(()=>({})):{');
const batchRoute = api.indexOf('action==="basket_mold_options_batch"');
assert.ok(bodyParse >= 0 && batchRoute > bodyParse, 'POST body is parsed before the batch route reads it');
assert.match(api, /allowUnavailablePreview\s*=\s*payload\?\.allow_unavailable_preview===true/, 'partial quotes require explicit preview mode');
assert.match(api, /moldDetail\(id,n,Array\.isArray\(payload\?\.items\)\?payload\.items:\[\],payload\?\.lightweight!==true,allowUnavailablePreview\)/, 'strict quotes remain separate from partial draft quotes');
assert.match(api, /stock<quantity&&!allowUnavailablePreview/, 'partial quotes preserve unavailable row stock while normal quotes fail closed');

console.log('public basket partial-stock recovery and batched option loading: PASS');
