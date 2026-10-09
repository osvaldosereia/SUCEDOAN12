import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectBlingNfeR2} from '../supabase/functions/admin-service-intelligence-v1/_shared/fiscal-r2-nfe-inspector.mjs';
const src=readFileSync(new URL('../supabase/functions/admin-service-intelligence-v1/index.ts',import.meta.url),'utf8');
const begin=src.indexOf('async function blingHubVitrineDispatchFiscalPreview(');
const end=src.indexOf('async function blingHubVitrineDispatchFiscalReconcile(',begin);
const preview=src.slice(begin,end);
for(const guard of ['blingHubFindNfeByExternalKey','/pedidos/vendas/','notaFiscal?.id','bling_sale_invoice_reference','remote_sale_identity_mismatch','invoice_lookup_inconclusive','invoice_detail_unavailable']){
  assert.ok(preview.includes(guard),'Missing sales-linked invoice guard: '+guard);
}
const q=preview.indexOf('blingHubFindNfeByExternalKey('),sale=preview.indexOf('const sale=await blingHubGet(',q);
assert.ok(q>0&&sale>q,'Must first search by number and then use sale invoice reference');
assert.ok(preview.includes('invoiceLookup.http_status===200&&invoiceLookup.match_count===0'),'Do not trust a failed list response');
const source=readFileSync(new URL('../supabase/functions/admin-service-intelligence-v1/_shared/fiscal-r2-nfe-inspector.mjs',import.meta.url),'utf8');
for(const k of ['ncm_not_exposed_count','sale_invoice_id','fiscal_subtotal','sale_invoice:','subtotal:'])assert.ok(source.includes(k),'Missing '+k);
const raw={data:{id:27090735788,numero:'000418',situacao:4,contato:{id:18441104541},
 itens:[{codigo:'A',total:209.7,quantidade:10,valor:20.97},{codigo:'B',total:10,quantidade:2,valor:5}]}};
const expected={bling_order_id:27087386324,sale_invoice_id:27090735788,contact_id:18441104541,fiscal_subtotal:219.7,total:269.7};
const report=inspectBlingNfeR2(raw,expected);
assert.equal(report.identity.verified,true,'Linked sale invoice plus contact and subtotal must be enough');
assert.equal(report.ncm_not_exposed_count,2,'GET lacking NCM must not invent missing fiscal values');
assert.equal(report.invalid_ncm_format_count,0);
assert.equal(report.line_subtotal_cents,21970);
assert.equal(report.editing.eligible,false,'Rejected invoice is not editable');
assert.equal(inspectBlingNfeR2(raw,{...expected,sale_invoice_id:123}).identity.verified,false);
assert.equal(inspectBlingNfeR2(raw,{...expected,fiscal_subtotal:12}).identity.verified,false);
console.log('PASS: fallback sale NF-e ID, rejected state, subtotal proof, NCM not-exposed semantics.');
