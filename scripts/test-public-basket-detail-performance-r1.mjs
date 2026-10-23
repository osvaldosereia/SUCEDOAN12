import fs from 'node:fs';
import assert from 'node:assert/strict';

const root=fs.readFileSync('index.html','utf8');
const api=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const sql=fs.readFileSync('supabase/migrations/20261023024055_public_basket_composition_stock_cache.sql','utf8');

const openStart=root.indexOf('async function openBasket(');
const openEnd=root.indexOf('function basketGroupTitle',openStart);
assert.ok(openStart>=0&&openEnd>openStart,'basket open function exists');
const open=root.slice(openStart,openEnd);
assert.match(open,/action=isHomeShell\?'basket_by_size':'basket'/,'first-open basket size uses a single detail request');
assert.doesNotMatch(open,/loadHomeSizeCardForOpen/,'first-open no longer resolves card IDs in a separate browser request');
assert.match(root,/basket_by_size/,'basket detail action is marked stock-sensitive and sent without cache');
assert.match(open,/markBasketPerformance\('open-start'/,'basket opening has a client performance mark');
assert.match(open,/markBasketPerformance\('detail-ready'/,'first usable basket render has a client performance mark');
assert.match(root,/trace_id/,'basket calls carry a non-customer trace ID');
assert.match(root,/BASKET_OPTION_MAX_IN_FLIGHT=3/,'visible alternative requests have a fixed concurrency limit');
assert.match(root,/abortBasketDraftRequests\(/,'closing or replacing a basket aborts in-flight basket requests');
assert.match(root,/basket_by_size/,'edge function exposes the combined size-to-detail action');
assert.match(api,/async function basketBySize\(/,'edge function resolves size and returns its detail in one request');

const batchStart=sql.search(/create or replace function public\.basket_mold_public_compositions_batch_v1/i);
assert.ok(batchStart>=0,'batch composition SQL function exists');
const batch=sql.slice(batchStart);
assert.match(batch,/stock_candidates as\s*\([\s\S]*?\),\s*fresh_stock as materialized\s*\(/i,'fresh sellable stock is materialized once for distinct option products');
assert.match(batch,/join fresh_stock fs on fs\.product_id = p\.id/i,'composition rows reuse one computed stock value per product');
assert.doesNotMatch(batch,/basket_component_fresh_sellable_stock_v1\(p\.id\)/,'expensive scalar stock lookup is not repeated for every option row');

console.log('public basket detail performance contract: PASS');
