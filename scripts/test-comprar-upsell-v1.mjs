import fs from 'node:fs';import assert from 'node:assert/strict';
const u=fs.readFileSync('comprar/upsell.js','utf8');
for(const p of [/MAX_AFTER_BASKET=4/,/MAX_BEFORE_CHECKOUT=3/,/MIN_RELEVANT=2/,/function renderAfterBasket/,/function renderBeforeCheckout/,/function stop/,/suggestedProductIds/])assert.match(u,p);console.log('OK: upsell suave');