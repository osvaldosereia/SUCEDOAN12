import fs from 'node:fs';import assert from 'node:assert/strict';
const b=fs.readFileSync('comprar/baskets.js','utf8'),a=fs.readFileSync('comprar/app.js','utf8'),c=fs.readFileSync('comprar/checkout.js','utf8');
assert.match(b,/renderAfterBasket/);assert.match(a,/renderBeforeCheckout/);assert.match(c,/modules\.upsell\?\.stop/);console.log('OK: fluxo de upsell');