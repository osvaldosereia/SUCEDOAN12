import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');

assert.match(hub,/async function blingHubProductFiscalAuditReadonly\(sb:any,body:any\)/);
assert.match(hub,/subaction==="product_fiscal_audit_readonly"/);

const start=hub.indexOf('async function blingHubProductFiscalAuditReadonly');
const end=hub.indexOf('async function blingHubLookupProductByExactGtin',start);
assert.ok(start>=0&&end>start,'audit helper block missing');
const block=hub.slice(start,end);

assert.match(block,/blingHubGet\(sb,token,"\/produtos\/"\+encodeURIComponent/);
assert.match(block,/from\("product_fiscal_evidence"\)\.upsert/);
assert.match(block,/evidence_type:"bling_product_detail"/);
assert.match(block,/external_write:false/);
assert.match(block,/bling_mutations:0/);
assert.doesNotMatch(block,/blingHubWriteIdempotent/);
assert.doesNotMatch(block,/blingHubCreateProductOnce/);
assert.doesNotMatch(block,/fetch\(BLING_API_BASE/);
assert.doesNotMatch(block,/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);

console.log('OK Bling product fiscal audit is read-only externally');
