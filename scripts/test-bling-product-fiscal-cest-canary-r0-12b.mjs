import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const start=hub.indexOf('async function blingHubProductFiscalCestCanary');
const end=hub.indexOf('async function blingHubLookupProductByExactGtin',start);
assert.ok(start>=0&&end>start,'canary helper missing');
const block=hub.slice(start,end);

assert.doesNotMatch(block,/bling_id:blingId,/);
assert.match(block,/bling_product_id:blingId/);
assert.doesNotMatch(block,/\.rpc\([^\n]+\)\.catch/);
assert.match(block,/quality_refresh_ok/);
assert.match(block,/integrity_refresh_ok/);
assert.match(block,/evidence_persisted/);

const routeStart=hub.indexOf('if(subaction==="product_fiscal_cest_canary")');
const routeBlock=hub.slice(routeStart,routeStart+900);
assert.match(routeBlock,/unknown_possible/);
assert.match(routeBlock,/requires_verification:true/);

console.log('OK hardened CEST canary post-write handling');
