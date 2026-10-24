import assert from 'node:assert/strict';
import { moldFirstAvailableOption, moldFirstConfiguredOption, moldProductIdsForRead } from '../supabase/functions/storefront-v2/basket-lightweight.js';

const positions = [{id:'selected'}, {id:'defaulted'}, {id:'unconfigured'}];
const options = [
  {position_id:'selected', product_id:'selected-product', sort_order:0},
  {position_id:'selected', product_id:'selected-alternative', sort_order:1},
  {position_id:'defaulted', product_id:'default-product', sort_order:0},
  {position_id:'unconfigured', product_id:'first-choice', sort_order:0},
  {position_id:'unconfigured', product_id:'second-choice', sort_order:1}
];
const requested = new Map();
const defaults = new Map([['selected','selected-product'],['defaulted','default-product']]);

assert.deepEqual(
  moldProductIdsForRead(positions, options, requested, defaults, false),
  ['selected-product','default-product','first-choice','second-choice'],
  'lightweight detail reads selected products plus alternatives only for positions without a saved default'
);
assert.deepEqual(
  moldProductIdsForRead(positions, options, requested, defaults, true),
  ['selected-product','selected-alternative','default-product','first-choice','second-choice'],
  'full detail still reads every carousel option'
);
assert.deepEqual(
  moldProductIdsForRead(positions, options, new Map([['selected',{product_id:'requested-product'}]]), defaults, false),
  ['requested-product','default-product','first-choice','second-choice'],
  'a customer selection replaces the saved default for that position'
);

const products = new Map([
  ['first-choice',{id:'first-choice'}],
  ['second-choice',{id:'second-choice'}]
]);
const stock = new Map([['first-choice',0],['second-choice',4]]);
assert.equal(
  moldFirstAvailableOption(options.slice(3), products, stock, 2).id,
  'second-choice',
  'an unconfigured position chooses the first option in admin order that meets requested quantity'
);
assert.equal(moldFirstAvailableOption(options.slice(3), products, stock, 5), null);
const configuredFallback = moldFirstConfiguredOption(options.slice(3), products);
assert.equal(configuredFallback.id, 'first-choice', 'the composition remains visible when every configured choice is out of stock');

import { readFile } from 'node:fs/promises';
const [publicPage, edge] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/storefront-v2/index.ts', import.meta.url), 'utf8')
]);
const prefetchStart = publicPage.indexOf('function prefetchBasketPreviews(){');
const prefetchEnd = publicPage.indexOf('function scheduleBasketPreviewPrefetch()', prefetchStart);
assert.ok(prefetchStart >= 0 && prefetchEnd > prefetchStart);
const prefetch=publicPage.slice(prefetchStart,prefetchEnd);
assert.match(prefetch,/await resolveHomeSizeCards\(\)/,'idle prefetch shares the one-time lightweight size-ID resolution');
assert.match(prefetch,/loadHomeBasketDetail\(card,traceId\)/,'idle prefetch uses the canonical direct detail route');
assert.match(publicPage,/return api\('basket_by_size'/,'size-based lookup remains only as a fallback when lightweight resolution is unavailable');
assert.match(publicPage,/api\('basket',\{basket_id:resolvedKey,lightweight:1,trace_id:traceId\}\)/,'direct detail reads still carry the canonical ID and trace ID');
assert.match(publicPage,/BASKET_PREVIEW_PREFETCH_CONCURRENCY=1/,'the low-priority preview queue is bounded to one request');
assert.match(publicPage, /Sem estoque para esta quantidade/, 'unavailable products are visible in the basket editor');
assert.match(publicPage, /Number\(b\.stock_quantity\|\|0\)<1/, 'basket cannot be added with no sellable capacity');
assert.match(edge, /allowUnavailablePreview/);
console.log('storefront basket lightweight defaults: PASS');
