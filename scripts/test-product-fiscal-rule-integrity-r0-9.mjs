import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260924214000_product_fiscal_rule_integrity_r0_9.sql','utf8');
assert.match(sql,/product_fiscal_rule_integrity_v1/);
assert.match(sql,/cest_rule_mismatch/);
assert.match(sql,/severity.*blocker/s);
assert.match(sql,/refresh_product_fiscal_review_state_v1/);
assert.match(sql,/security_invoker = true/);
assert.doesNotMatch(sql,/update public\.products/i);
console.log('OK product fiscal rule integrity R0.9');
