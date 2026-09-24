import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260924211000_product_fiscal_cest_evidence_gate_r0_7.sql','utf8');

assert.match(sql,/c\.cest_consensus is null/);
assert.match(sql,/legal_match_needs_evidence/);
assert.match(sql,/cest_evidence_count/);
assert.match(sql,/supplier_xml_cest_count/);
assert.match(sql,/bling_cest_count/);
assert.match(sql,/security_invoker = true/);
assert.doesNotMatch(sql,/update public\.products/i);
assert.doesNotMatch(sql,/update public\.product_fiscal_profiles/i);

console.log('OK product fiscal CEST evidence gate R0.7');
