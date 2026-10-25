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
assert.match(publicPage,/Estamos preparando melhorias/,'public homepage is in maintenance mode');
assert.match(publicPage,/https:\/\/wa\.me\/5565998150975/,'maintenance page links to the requested WhatsApp number');
assert.match(publicPage,/noindex/,'maintenance page is excluded from search indexing');
assert.doesNotMatch(publicPage,/prefetchBasketPreviews|BasketCarousel\.mount/,'storefront UI is not exposed during maintenance');
assert.match(edge, /allowUnavailablePreview/);
console.log('storefront basket lightweight defaults: PASS');
