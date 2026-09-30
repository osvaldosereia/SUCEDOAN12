import test from 'node:test';
import assert from 'node:assert/strict';
import { collectFiscalEvidence } from './source.ts';

const key='5'.repeat(44);
const inv={sourceDocumentId:'local-1',accessKey:key,blingInvoiceId:101,orderId:'o1',issuedAt:'2026-09-10T15:00:00Z',status:'authorized',total:100,items:[],sourceRefs:['local']} as const;

test('collectFiscalEvidence preserves authorized invoices and deduplicates by access key', async()=>{
  const r=await collectFiscalEvidence({competenceMonth:'2026-09'}, {
    loadLocal:async()=>({status:'complete',invoices:[inv]}),
    loadBling:async()=>({status:'complete',invoices:[{...inv,sourceDocumentId:'bling-101',sourceRefs:['bling']}]}),
  });
  assert.equal(r.collectionStatus,'complete');
  assert.equal(r.invoices.length,1);
  assert.equal(r.invoices[0].accessKey,key);
  assert.deepEqual(r.invoices[0].sourceRefs.sort(),['bling','local']);
});

test('collectFiscalEvidence keeps cancelled status from the fresher Bling source', async()=>{
  const r=await collectFiscalEvidence({competenceMonth:'2026-09'}, {
    loadLocal:async()=>({status:'complete',invoices:[inv]}),
    loadBling:async()=>({status:'complete',invoices:[{...inv,status:'cancelled',sourceRefs:['bling']}]}),
  });
  assert.equal(r.invoices[0].status,'cancelled');
});

test('collectFiscalEvidence never marks partial/stale input complete', async()=>{
  const incomplete=await collectFiscalEvidence({competenceMonth:'2026-09'}, {
    loadLocal:async()=>({status:'complete',invoices:[inv]}),
    loadBling:async()=>({status:'incomplete',invoices:[]}),
  });
  assert.equal(incomplete.collectionStatus,'incomplete');
  const stale=await collectFiscalEvidence({competenceMonth:'2026-09'}, {
    loadLocal:async()=>({status:'complete',invoices:[inv]}),
    loadBling:async()=>({status:'stale',invoices:[]}),
  });
  assert.equal(stale.collectionStatus,'stale');
});

test('collectFiscalEvidence falls back to stable Bling invoice id when access key is unavailable', async()=>{
  const noKey={...inv,accessKey:null,blingInvoiceId:999,sourceDocumentId:'local-x'};
  const r=await collectFiscalEvidence({competenceMonth:'2026-09'}, {
    loadLocal:async()=>({status:'complete',invoices:[noKey]}),
    loadBling:async()=>({status:'complete',invoices:[{...noKey,sourceDocumentId:'bling-x',sourceRefs:['bling']}]}),
  });
  assert.equal(r.invoices.length,1);
  assert.equal(r.invoices[0].blingInvoiceId,999);
});
