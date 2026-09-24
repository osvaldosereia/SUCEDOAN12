import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/bling-product-fiscal-audit-v1/index.ts','utf8');

assert.match(fn,/x-dona-antonia-bling-hub-key/);
assert.match(fn,/get_bling_hub_key_v2/);
assert.match(fn,/get_bling_api_credentials_v1/);
assert.match(fn,/\/produtos\/"\+encodeURIComponent/);
assert.match(fn,/product_fiscal_evidence/);
assert.match(fn,/evidence_type:"bling_product_detail"/);
assert.match(fn,/external_write:false/);
assert.match(fn,/bling_mutations:0/);
assert.doesNotMatch(fn,/method:\s*"POST"[\s\S]*BLING_API_BASE/);
assert.doesNotMatch(fn,/method:\s*"PUT"/);
assert.doesNotMatch(fn,/method:\s*"PATCH"/);
assert.doesNotMatch(fn,/method:\s*"DELETE"/);

console.log('OK Bling product fiscal audit read-only');
