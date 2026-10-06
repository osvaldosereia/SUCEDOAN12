import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const page=fs.readFileSync('index.html','utf8');
new vm.Script([...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1],{filename:'index.html'});
const start=page.slice(page.indexOf('async function start(){'),page.indexOf('\n    start();'));
assert.ok(start.indexOf('renderInitialShell()')<start.indexOf('resolveEntryWhatsappPhone()'),'initial homepage must render before identity lookup starts');
assert.match(start,/const identityPhonePromise=resolveEntryWhatsappPhone\(\)/,'identity lookup should run concurrently');

const service=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const home=service.slice(service.indexOf('async function home(){'),service.indexOf('async function sellableMap('));
const carousel=service.slice(service.indexOf('async function basketCarouselItems('),service.indexOf('function basketCategoryFields('));
const molds=service.slice(service.indexOf('async function moldHomeCards('),service.indexOf('async function moldDetail('));
assert.match(carousel,/carousel_items:\[\.\.\.items\.values\(\)\]\.slice\(0,1\)/,'home payload should keep only the lead photo shown for legacy baskets');
assert.match(molds,/carousel_items:carousel\.slice\(0,1\)/,'home payload should keep only the lead photo shown for molded baskets');
assert.match(home,/basketCarouselItems\(baskets\)/,'legacy basket cards should keep their lead photo');
assert.match(service,/async function cachedHome\(\)/,'home response should be cached per warm function instance');
assert.match(service,/homePromise/,'simultaneous cold requests should share one catalog build');

console.log('Homepage performance contract passed');
