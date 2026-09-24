import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260924194500_product_fiscal_catalog_scan_r0_5b.sql','utf8');

assert.match(sql,/gtin_status/);
assert.match(sql,/gtin_invalid/);
assert.match(sql,/gtin_missing/);
assert.match(sql,/1100400/);
assert.match(sql,/1100500/);
assert.match(sql,/1100600/);
assert.match(sql,/1100700/);
assert.match(sql,/exclude_any/);
assert.doesNotMatch(sql,/update public\.products/i);
assert.doesNotMatch(sql,/bling/i);

console.log('OK product fiscal catalog scan R0.5b');
