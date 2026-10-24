import fs from 'node:fs';
import assert from 'node:assert/strict';

const source=fs.readFileSync('vitrine/admin/basket-admin-section.js','utf8');
const tabs=[...source.matchAll(/data-basket-config-tab="([^"]+)"/g)].map(match=>match[1]);
assert.deepEqual(tabs,['types','quantities','carousel']);
assert.match(source,/DonaAntoniaBasketAdmin\s*=\{state,render,refresh,setTab\}/);
assert.match(source,/basket-admin-types\.js/);
assert.match(source,/basket-admin-quantities\.js/);
assert.match(source,/basket-admin-carousel\.js/);
assert.match(source,/basket-admin-domain\.js/);
assert.match(source,/basket-admin-api\.js/);
assert.doesNotMatch(source,/basket-mold-admin\.js|DonaAntoniaBasketMolds|data-basket-advanced/);
console.log('basket admin three tabs: PASS');
