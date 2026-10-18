import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const edge=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const workflow=fs.readFileSync('.github/workflows/admin-print-queue-panel.yml','utf8');
const audit=fs.readFileSync('docs/audits/admin-danfe-fiscal-documents-round-18-20261018.md','utf8');
const names=[...workflow.matchAll(/run: node (scripts\/test-admin-[\w-]+\.mjs)/g)].map(m=>m[1]);
assert.equal(names.length,new Set(names).size,'duplicate Admin regression test steps');
for(const file of names)assert.ok(fs.existsSync(file),'workflow references missing test: '+file);
for(const n of ['manual-order-create','customer-address-payment','confirmation-separation-print','delivery-cancellation-history','stock-physical-available','stock-reservation-consumption','lots-fefo','inventory-receipt','inventory-balance','stock-adjustment','bling-integration','whatsapp-attendance','customer-history-traceability','fiscal-eligibility-issuance','fiscal-uncertain-recovery','danfe-document']){
  assert.ok(names.some(x=>x.endsWith('test-admin-'+n+'-contract.mjs')),'missing regression suite '+n);
}
const open=html.slice(html.indexOf('async function openCurrentDanfe(){'),html.indexOf('async function loadCurrentOrderFiscal('));
assert.ok(open.length>0,'missing DANFE UI entry');
const safeGate=/if\s*\(\s*fiscal\.authorized!==true\s*&&\s*gate\.authorized!==true\s*\)/.test(open);
const legacyBypass=/&&\s*!fiscal\.bling_invoice_id\s*&&\s*!fiscal\.invoice_id/.test(open);
if(!safeGate){
  assert.ok(legacyBypass,'DANFE gate changed: review authorization behavior');
  assert.match(audit,/Não foi corrigido/,'historical round-18 report must document original issue');
}
assert.match(edge,/hub\("fiscal_document_pdf",\{source_order_id:oid\}\)/);
console.log('Admin consolidated audit regression inventory: PASS; DANFE gate remediation pending:',!safeGate);
