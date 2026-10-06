import fs from 'node:fs';
import assert from 'node:assert/strict';
const ui=fs.readFileSync('vitrine/admin/store-baskets-builder.js','utf8');
assert.match(ui,/Imprimir A4/,'mounted lot history must expose an A4 print action');
assert.match(ui,/data-store-print/,'print hook required');
assert.match(ui,/function printBuild\(/,'print function required');
assert.match(ui,/repeat\(4,1fr\)/,'A4 product grid must use four columns');
assert.match(ui,/quantity_for_lot/,'print must show total lot quantities');
console.log('store baskets A4 print UI v1: PASS');
