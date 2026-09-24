import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const start=hub.indexOf('async function blingHubProductFiscalCestBatch');
const end=hub.indexOf('async function blingHubLookupProductByExactGtin',start);
assert.ok(start>=0&&end>start);
const block=hub.slice(start,end);

assert.match(block,/if\(requireSupplierXml\)/);
assert.match(block,/else\{\s*let diffQuery=sb\.from\("product_fiscal_bling_diff_v1"\)/s);
assert.match(block,/batch_selection_exception/);
assert.match(block,/external_write:false,bling_mutations:0/);
assert.match(block,/\.limit\(100\)/);
assert.match(block,/cestFilter/);

console.log('OK direct non-XML CEST batch selection');
