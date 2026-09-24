import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260924174500_product_fiscal_evidence_r0_2.sql','utf8');
const script=fs.readFileSync('scripts/backfill-product-fiscal-evidence-r0-2.mjs','utf8');

assert.match(sql,/add column if not exists evidence_key text/);
assert.match(sql,/product_fiscal_evidence_key_uidx/);
assert.match(sql,/legacy_product_snapshot/);
assert.match(sql,/product_fiscal_evidence_consensus_v1/);
assert.match(sql,/with \(security_invoker = true\)/);
assert.match(script,/supplier_nfe_xml/);
assert.match(script,/on_conflict=evidence_key/);
assert.match(script,/ambiguous_gtin/);
assert.match(script,/gtin_not_found/);
assert.match(script,/origin_code:origin/);
assert.match(script,/tax_code:csosn/);
assert.doesNotMatch(script,/update\s+products/i);
assert.doesNotMatch(script,/patch\s+products/i);

console.log('OK product fiscal evidence R0.2');
