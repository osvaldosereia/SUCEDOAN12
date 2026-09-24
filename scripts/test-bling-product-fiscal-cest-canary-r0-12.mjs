import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const start=hub.indexOf('async function blingHubProductFiscalCestCanary');
const end=hub.indexOf('async function blingHubLookupProductByExactGtin',start);
assert.ok(start>=0&&end>start,'canary helper missing');
const block=hub.slice(start,end);

assert.match(block,/APLICAR_CEST_CANARIO:/);
assert.match(block,/product_fiscal_bling_diff_v1/);
assert.match(block,/canary_eligible!==true/);
assert.match(block,/precondition_tax_identity_changed/);
assert.match(block,/precondition_cest_not_blank/);
assert.match(block,/blingHubWriteIdempotent/);
assert.match(block,/"PATCH"/);
assert.match(block,/otherTaxFieldsStable/);
assert.match(block,/post_write_verification_failed/);
assert.match(block,/product_fiscal_cest_canary/);
assert.match(block,/bling_mutations:1/);
assert.match(block,/refresh_product_fiscal_rule_integrity_v1/);

console.log('OK verified Bling CEST canary');
