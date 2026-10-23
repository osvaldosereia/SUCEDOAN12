import fs from 'node:fs';
import assert from 'node:assert/strict';

const site = fs.readFileSync('index.html', 'utf8');
const start = site.indexOf('async function validateMoldCartBeforeCheckout(){');
assert.notEqual(start, -1, 'checkout must validate basket molds before submitting');
const end = site.indexOf('\n    async function sendWhatsApp()', start);
assert.notEqual(end, -1, 'checkout preflight function must have a clear boundary');
const preflight = site.slice(start, end);

assert.ok(!preflight.includes('basketApi(d,'), 'checkout preflight must not use the basket editor variable d outside its scope');
assert.ok(preflight.includes("api('basket_mold_quote'"), 'checkout preflight must send the basket quote request directly');

console.log('checkout basket preflight uses an in-scope API request: ok');
