import fs from 'node:fs';
import assert from 'node:assert/strict';
const ui=fs.readFileSync('vitrine/admin/store-baskets-builder.js','utf8');
assert.match(ui,/st\[0\]!={0,1}=['"]Cancelado['"][\s\S]*data-store-print|data-store-print[\s\S]*Cancelado/s,'print action must be available for active or mounted builds');
assert.match(ui,/data-store-cancel/,'assembling build must keep cancel action');
console.log('store baskets print action safety v1: PASS');
