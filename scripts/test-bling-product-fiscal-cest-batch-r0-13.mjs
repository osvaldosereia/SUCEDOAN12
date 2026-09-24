import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const start=hub.indexOf('async function blingHubProductFiscalCestBatch');
const end=hub.indexOf('async function blingHubLookupProductByExactGtin',start);
assert.ok(start>=0&&end>start,'batch helper missing');
const block=hub.slice(start,end);

assert.match(block,/APLICAR_LOTE_CEST_VALIDADO/);
assert.match(block,/Math\.min\(5/);
assert.match(block,/require_supplier_xml/);
assert.match(block,/supplier_xml_cest_count/);
assert.match(block,/canary_eligible/);
assert.match(block,/blingHubProductFiscalCestCanary/);
assert.match(block,/stoppedOnError=true/);
assert.match(block,/unknown_possible/);
assert.match(block,/refresh_product_fiscal_evidence_quality_v1/);
assert.match(block,/refresh_product_fiscal_rule_integrity_v1/);
assert.match(block,/product_fiscal_cest_batch/);

console.log('OK fail-closed CEST batch');
