import fs from 'node:fs';
import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/migrations/20260924222000_product_fiscal_strict_validation_r0_10.sql','utf8');

assert.match(sql,/fiscal_rule_validation_policy/);
assert.match(sql,/strict_auto/);
assert.match(sql,/product_fiscal_strict_validation_preview_v1/);
assert.match(sql,/s\.legal_rule_match_count=1/);
assert.match(sql,/s\.open_blockers=0/);
assert.match(sql,/s\.gtin_status='valid'/);
assert.match(sql,/s\.bling_evidence_count>0/);
assert.match(sql,/s\.ncm_consensus=s\.ncm/);
assert.match(sql,/pf\.origin_code is not null/);
assert.match(sql,/upper\(trim\(coalesce\(p\.category,''\)\)\)=any/);
assert.match(sql,/review_status='auto_validated'/);
assert.match(sql,/classification_confidence=0\.9900/);
assert.match(sql,/bling_mutations',0/);
assert.doesNotMatch(sql,/update public\.products/i);
console.log('OK strict fiscal validation R0.10');
