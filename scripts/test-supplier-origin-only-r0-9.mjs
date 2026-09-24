import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260924221500_supplier_origin_only_r0_9.sql','utf8');

assert.match(sql,/origin_candidate_reverted_reason/);
assert.match(sql,/supplier_xml_consensus_r0_9/);
assert.match(sql,/evidence_type='supplier_nfe_xml'/);
assert.match(sql,/origin_evidence_conflict','blocker','open'/);
assert.doesNotMatch(sql,/origin_candidate_source','evidence_consensus_r0_6'/);
assert.doesNotMatch(sql,/update public\.products/i);

console.log('OK supplier-only origin R0.9');
