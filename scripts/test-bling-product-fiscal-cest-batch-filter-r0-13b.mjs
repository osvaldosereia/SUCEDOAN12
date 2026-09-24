import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const start=hub.indexOf('async function blingHubProductFiscalCestBatch');
const end=hub.indexOf('async function blingHubLookupProductByExactGtin',start);
assert.ok(start>=0&&end>start);
const block=hub.slice(start,end);

assert.match(block,/cestFilter=blingHubDigits\(body\?\.cest\)/);
assert.match(block,/proposed_cest/);
assert.match(block,/diffQuery\.eq\("proposed_cest",cestFilter\)/);
assert.match(block,/cest_filter:cestFilter\|\|null/);
assert.match(block,/Math\.min\(5/);

console.log('OK CEST-family filtered batch');
