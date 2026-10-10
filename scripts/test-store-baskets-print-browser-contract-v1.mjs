import fs from 'node:fs';
import assert from 'node:assert/strict';
const ui=fs.readFileSync('vitrine/admin/store-baskets-builder.js','utf8');
assert.match(ui,/storeCall\(['"]build_detail['"]/,'print must fetch canonical lot detail');
assert.match(ui,/quantity_for_lot/,'print must show total quantity for the lot');
assert.match(ui,/public_name|lot_code/,'print header must identify lot');
assert.match(ui,/URL\.createObjectURL|document\.write|window\.open/,'print should render isolated document');
console.log('store baskets print browser contract v1: PASS');
