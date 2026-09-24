import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260924204500_product_fiscal_evidence_quality_r0_6b.sql','utf8');

assert.match(sql,/from public\.products p/);
assert.match(sql,/not public\.fiscal_valid_gtin_v1\(p\.gtin\)/);
assert.doesNotMatch(sql,/s\.risk_code='gtin_invalid'/);
assert.match(sql,/refresh_product_fiscal_review_state_v1/);
assert.doesNotMatch(sql,/update public\.products/i);

console.log('OK product fiscal evidence quality R0.6b');
