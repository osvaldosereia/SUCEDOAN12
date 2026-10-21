import fs from "node:fs";
import assert from "node:assert/strict";
import { isCompleteImportedInvoice } from "../supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/purchase-xml-dedup.mjs";

const base={document_key:"1".repeat(44),storage_path:"2026/10/invoice.xml",content_sha256:"a".repeat(64),
  item_count:2,catalog_only:true,catalog_evidence_count:2,staged_item_count:2,catalog_recovery_failed:false};
assert.equal(isCompleteImportedInvoice(base),true,"complete catalog imports are skippable");
assert.equal(isCompleteImportedInvoice({...base,storage_path:null}),false,"a missing XML must be repaired");
assert.equal(isCompleteImportedInvoice({...base,content_sha256:null}),false,"a missing digest must be repaired");
assert.equal(isCompleteImportedInvoice({...base,catalog_evidence_count:1}),false,"missing catalog evidence must be repaired");
assert.equal(isCompleteImportedInvoice({...base,staged_item_count:1}),false,"missing staged items must be repaired");
assert.equal(isCompleteImportedInvoice({...base,catalog_recovery_failed:true}),false,"failed recovery must be retried");
assert.equal(isCompleteImportedInvoice({...base,catalog_only:false}),false,"non-catalog invoices must not be skipped");

const a=fs.readFileSync("supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/index.ts","utf8");
const b=fs.readFileSync("supabase/functions/purchase-xml-v1/index.ts","utf8");
assert.equal(a,b,"deployed XML function copies must remain identical");
assert.match(a,/knownBlingDocuments\(rows\)/,"known invoice index must be loaded once per Bling page");
assert.match(a,/isCompleteImportedInvoice\(existing\)/,"complete invoices must be tested before XML download");
assert.match(a,/duplicateRecoveryFailures/,"repair failures must be counted separately");
assert.match(a,/if\(key\.length!==44\)\{failed\+\+;if\(recoveringDuplicate\)duplicateRecoveryFailures\+\+;continue\}/,"invalid recovery keys must count as a recovery failure");
assert.match(a,/if\(!x\.ok\)\{failed\+\+;if\(recoveringDuplicate\)duplicateRecoveryFailures\+\+;continue\}/,"unavailable recovery XML must count as a recovery failure");
for(const helper of ["purchase-xml-dedup.mjs","xml-catalog-automation-policy.mjs"]){
  assert.equal(fs.readFileSync(`supabase/functions/purchase-xml-v1/${helper}`,"utf8"),
    fs.readFileSync(`supabase/functions/admin-service-intelligence-v1/purchase-xml-v1/${helper}`,"utf8"),
    `secondary worker must include matching ${helper}`);
}
console.log("PASS: complete Bling invoices are skipped; incomplete evidence remains retryable");
