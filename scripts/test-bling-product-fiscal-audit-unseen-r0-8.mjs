import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const start=hub.indexOf('async function blingHubProductFiscalAuditReadonly');
const end=hub.indexOf('async function blingHubLookupProductByExactGtin',start);
assert.ok(start>=0&&end>start);
const block=hub.slice(start,end);

assert.match(block,/risk_code/);
assert.match(block,/only_unseen_bling/);
assert.match(block,/bling_evidence_count/);
assert.match(block,/\.eq\("bling_evidence_count",0\)/);
assert.match(block,/\.eq\("risk_code",riskCode\)/);
assert.match(block,/external_write:false/);
assert.match(block,/bling_mutations:0/);

console.log('OK Bling fiscal audit skips already-read products');
