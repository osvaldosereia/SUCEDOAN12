import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/function orderOperationalPriority\(o\)/);
assert.match(html,/function sortOperationalOrders\(rows\)/);
assert.match(html,/if\(orderProblemReasons\(o\)\.length\)return 0/);
assert.match(html,/created:1,confirmed:2,processing:3,ready:4,out_for_delivery:5/);
assert.match(html,/pendências primeiro · depois os mais antigos/);
assert.match(html,/sortOperationalOrders\(state\.orders\.filter/);
assert.match(html,/rows=sortOperationalOrders\(rows\)/);
assert.match(html,/problems\.length>1/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · fila operacional priorizada');
