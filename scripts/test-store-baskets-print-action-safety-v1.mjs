import fs from 'node:fs';
import assert from 'node:assert/strict';
const ui=fs.readFileSync('vitrine/admin/store-baskets-builder.js','utf8');
assert.match(ui,/st\[0\]===['"]Montado['"][\s\S]*data-store-print|data-store-print[\s\S]*Montado/s,'print action must be tied to mounted build rendering');
assert.doesNotMatch(ui,/data-store-print[^\n]{0,300}Em montagem/,'assembling build must not expose operational print button');
console.log('store baskets print action safety v1: PASS');
