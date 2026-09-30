import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePeriod, competenceInCuiaba } from './reconciliation.ts';

const access='4'.repeat(44);
const invoice=(overrides={})=>({sourceDocumentId:'n1',accessKey:access,blingInvoiceId:1,orderId:'o1',issuedAt:'2026-09-15T15:00:00Z',status:'authorized',total:100,items:[{productId:'p1',amount:100}],sourceRefs:['bling'],...overrides} as any);
const order=(overrides={})=>({id:'o1',total:100,status:'delivered',createdAt:'2026-09-15T14:00:00Z',...overrides} as any);
const profiles={p1:{reviewStatus:'auto_validated',stStatus:'not_applicable',monophaseStatus:'not_applicable'}};

test('competenceInCuiaba handles UTC month boundary correctly',()=>{
  assert.equal(competenceInCuiaba('2026-10-01T02:30:00Z'),'2026-09');
  assert.equal(competenceInCuiaba('2026-10-01T04:30:00Z'),'2026-10');
});

test('matched invoice and order produce revenue candidate without reconciliation issue',()=>{
  const r=reconcilePeriod({competenceMonth:'2026-09',invoices:[invoice()],orders:[order()],profiles});
  assert.equal(r.candidates.length,1);
  assert.equal(r.candidates[0].recognizedAmount,100);
  assert.equal(r.issues.length,0);
});

test('invoice without order remains revenue and blocks readiness',()=>{
  const r=reconcilePeriod({competenceMonth:'2026-09',invoices:[invoice({orderId:null})],orders:[],profiles});
  assert.equal(r.candidates.length,1);
  assert.ok(r.issues.some(x=>x.issueType==='invoice_without_order'&&x.severity==='blocking'));
});

test('order without invoice creates blocking issue',()=>{
  const r=reconcilePeriod({competenceMonth:'2026-09',invoices:[],orders:[order()],profiles});
  assert.ok(r.issues.some(x=>x.issueType==='order_without_invoice'));
});

test('duplicate access key is detected rather than silently dropped',()=>{
  const r=reconcilePeriod({competenceMonth:'2026-09',invoices:[invoice(),invoice({sourceDocumentId:'n2',orderId:'o2'})],orders:[order(),order({id:'o2'})],profiles});
  assert.ok(r.issues.some(x=>x.issueType==='duplicated_document'));
});

test('document/order total mismatch blocks readiness',()=>{
  const r=reconcilePeriod({competenceMonth:'2026-09',invoices:[invoice({total:110})],orders:[order()],profiles});
  assert.ok(r.issues.some(x=>x.issueType==='document_value_mismatch'));
});

test('cancel and return status mismatches are explicit',()=>{
  const c=reconcilePeriod({competenceMonth:'2026-09',invoices:[invoice({status:'cancelled'})],orders:[order({status:'delivered'})],profiles});
  assert.ok(c.issues.some(x=>x.issueType==='cancel_status_mismatch'));
  const ret=reconcilePeriod({competenceMonth:'2026-09',invoices:[invoice({status:'returned'})],orders:[order({status:'delivered'})],profiles});
  assert.ok(ret.issues.some(x=>x.issueType==='return_status_mismatch'));
});

test('missing fiscal profile and unresolved ST/monophase are blocking',()=>{
  const missing=reconcilePeriod({competenceMonth:'2026-09',invoices:[invoice()],orders:[order()],profiles:{}});
  assert.ok(missing.issues.some(x=>x.issueType==='product_without_fiscal_profile'));
  const unresolved=reconcilePeriod({competenceMonth:'2026-09',invoices:[invoice()],orders:[order()],profiles:{p1:{reviewStatus:'auto_validated',stStatus:'unknown',monophaseStatus:'unknown'}}});
  assert.ok(unresolved.issues.some(x=>x.issueType==='st_unresolved'));
  assert.ok(unresolved.issues.some(x=>x.issueType==='monophase_unresolved'));
});

test('invoices outside selected Cuiaba competence are ignored',()=>{
  const r=reconcilePeriod({competenceMonth:'2026-09',invoices:[invoice({issuedAt:'2026-10-01T04:30:00Z'})],orders:[],profiles});
  assert.equal(r.candidates.length,0);
});
