import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260924193000_product_fiscal_catalog_scan_r0_5.sql','utf8');

assert.match(sql,/fiscal_valid_gtin_v1/);
assert.match(sql,/product_fiscal_catalog_scan_v1/);
assert.match(sql,/blocker_conflict/);
assert.match(sql,/gtin_missing_or_invalid/);
assert.match(sql,/legal_rule_ambiguous/);
assert.match(sql,/cest_evidence_unmapped/);
assert.match(sql,/candidate_needs_validation/);
assert.match(sql,/legal_match_needs_evidence/);
assert.match(sql,/no_fiscal_evidence/);
assert.match(sql,/risk_score/);
assert.doesNotMatch(sql,/update public\.products/i);
assert.doesNotMatch(sql,/bling/i);

console.log('OK product fiscal catalog scan R0.5');
