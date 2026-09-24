import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/migrations/20260924233000_product_fiscal_complex_bundle_guard_r0_14.sql','utf8');

assert.match(sql,/web_product_catalog:7897042020324/);
assert.match(sql,/product_fiscal_complex_bundle_v1/);
assert.match(sql,/complex_bundle_needs_evidence/);
assert.match(sql,/strict_validation_revoked_complex_bundle/);
assert.match(sql,/supplier_nfe_xml','manufacturer_catalog','web_product_catalog/);
assert.match(sql,/review_status='pending'/);
assert.match(sql,/st_status=case when pf\.st_status='applicable' then 'candidate'/);
assert.match(sql,/validation_eligible/);
assert.match(sql,/security_invoker = true/);
assert.doesNotMatch(sql,/update public\.products/i);

console.log('OK complex bundle fiscal guard R0.14');
