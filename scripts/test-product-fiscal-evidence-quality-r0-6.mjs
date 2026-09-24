import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260924203000_product_fiscal_evidence_quality_r0_6.sql','utf8');

assert.match(sql,/refresh_product_fiscal_evidence_quality_v1/);
assert.match(sql,/gtin_invalid/);
assert.match(sql,/bling_cest_missing_vs_xml/);
assert.match(sql,/origin_evidence_conflict/);
assert.match(sql,/legal_rule_ambiguous/);
assert.match(sql,/cest_evidence_unmapped/);
assert.match(sql,/origin_candidate_source/);
assert.match(sql,/origin_variation/);
assert.match(sql,/external_write',false/);
assert.doesNotMatch(sql,/update public\.products/i);
assert.doesNotMatch(sql,/blingHub/i);

console.log('OK product fiscal evidence quality R0.6');
