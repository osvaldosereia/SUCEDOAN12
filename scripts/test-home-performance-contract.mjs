import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const page=fs.readFileSync('index.html','utf8');
new vm.Script([...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1],{filename:'index.html'});
const start=page.slice(page.indexOf('async function start(){'),page.indexOf('\n    start();'));
assert.ok(start.indexOf('renderInitialShell()')<start.indexOf('resolveEntryWhatsappPhone()'),'initial homepage must render before identity lookup starts');
assert.match(start,/const identityPhonePromise=resolveEntryWhatsappPhone\(\)/,'identity lookup should run concurrently');
assert.match(start,/api\('home_priority'\)/,'homepage should request the first basket subgroup separately');
assert.match(start,/homePartial/,'homepage should track whether its first basket group is still loading');
assert.match(start,/await api\('home_priority'\)[\s\S]*await api\('home'\)/,'homepage should fetch the remaining baskets after the priority group');
const renderHome=page.slice(page.indexOf('function renderHome(){'),page.indexOf('function paintOffersPage('));
assert.match(renderHome,/homePartial[\s\S]*Grande/i,'partial homepage should limit its first render to the Grande subgroup');
assert.match(renderHome,/aria-busy="true"[\s\S]*homeRemainingBaskets/,'homepage should show a lightweight loading state for the remaining groups');

const service=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const home=service.slice(service.indexOf('async function home('),service.indexOf('async function sellableMap('));
const carousel=service.slice(service.indexOf('async function basketCarouselItems('),service.indexOf('function basketCategoryFields('));
const molds=service.slice(service.indexOf('async function moldHomeCards('),service.indexOf('async function moldDetail('));
assert.match(carousel,/carousel_items:\[\.\.\.items\.values\(\)\]\.slice\(0,1\)/,'home payload should keep only the lead photo shown for legacy baskets');
assert.match(molds,/carousel_items:carousel\.slice\(0,1\)/,'home payload should keep only the lead photo shown for molded baskets');
assert.match(home,/basketCarouselItems\(baskets\)/,'legacy basket cards should keep their lead photo');
assert.match(home,/home\(priorityOnly=false\)/,'home builder should support a separately scoped priority response');
assert.match(home,/priorityOnly[\s\S]*cestas-completas[\s\S]*grande/i,'priority response should include only Cestas Completas > Grande');
assert.match(molds,/moldHomeCards\(priorityOnly=false\)/,'mold cards should be filtered before public compositions are generated');
assert.match(service,/action==="home_priority"\)return json\(req,await cachedHomePriority\(\)/,'priority endpoint should use its own shared cache');
assert.match(service,/async function cachedHome\(\)/,'home response should be cached per warm function instance');
assert.match(service,/homePromise/,'simultaneous cold requests should share one catalog build');

console.log('Homepage performance contract passed');
