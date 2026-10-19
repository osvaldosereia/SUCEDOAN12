import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('vitrine/admin/orders/card-model.js','utf8');
const readinessSource=fs.readFileSync('vitrine/admin/orders/customer-readiness.js','utf8');
const ctx={window:{},String,Array,Object,Boolean};vm.createContext(ctx);
vm.runInContext(readinessSource,ctx);
vm.runInContext(source,ctx);
const readiness=ctx.window.DonaAntoniaAdminCustomerReadiness.create(v=>String(v||'').toLowerCase());
let fiscalByOrder={},detail=null;
const model=ctx.window.DonaAntoniaAdminOrderCardModel.create({
  normalize:v=>String(v||'').toLowerCase(),escapeHtml:String,
  customerReadiness:{isPending:readiness.isOrderCustomerDataPending,reasons:readiness.orderCustomerDataPendingReasons},
  cachedFiscalForOrder:order=>fiscalByOrder[order?.id]||null,
  detailFiscalForOrder:order=>detail?.order?.id===order?.id?detail?.fiscal:null
});

assert.equal(model.orderSeparationSummary({}).phase,undefined);
assert.deepEqual(JSON.parse(JSON.stringify(model.orderV3Milestones({status:'created'}))),{
  confirmed:false,separated:false,dispatched:false,delivered:false,cancelled:false
});
assert.equal(model.orderV3Milestones({status:'confirmed'}).confirmed,true);
assert.equal(model.orderV3Milestones({status:'ready'}).separated,false,'READY alone is not completed separation');
assert.equal(model.orderV3Milestones({status:'out_for_delivery'}).separated,true);
assert.equal(model.orderV3Milestones({status:'cancelled'}).cancelled,true);
assert.equal(model.orderV3Milestones({status:'ready',separation_summary:{completed_at:'2026-10-19T10:00:00Z'}}).separated,true);
assert.equal(model.orderV3Milestones({status:'ready',separation_summary:{phase:'needs_attention',completion_metadata:{stock_applied:true}}}).separated,true);
detail={order:{id:'detail-1'},fiscal:{readiness:{separation_completed:true}}};
assert.equal(model.orderV3Milestones({id:'detail-1',status:'ready'}).separated,true,'open detail readiness remains a fallback');
detail=null;

for(const status of ['created','storefront_received','received'])assert.equal(model.orderListBucketKey({status}),'new',status+' orders are new');
assert.equal(model.orderListBucketKey({status:'confirmed'}),'separate');
assert.equal(model.orderListBucketKey({status:'processing',separation_summary:{assignment:{separator_key:'jose'}}}),'separate');
assert.equal(model.orderListBucketKey({status:'ready'}),'separate','READY alone is not proof of completed separation');
assert.equal(model.orderListBucketKey({status:'ready',separation_summary:{completed_at:'2026-10-19T10:00:00Z'}}),'ready');
assert.equal(model.orderListBucketKey({status:'out_for_delivery'}),'ready');
assert.equal(model.orderListBucketKey({status:'delivered'}),'delivered');
assert.equal(model.orderListBucketKey({status:'cancelled'}),'cancelled');

const fiscalOrder={id:'f1',status:'ready'};
assert.match(model.orderV3Tags(fiscalOrder),/NF-e…/);
fiscalByOrder.f1={authorized:true,stage:'authorized'};
assert.match(model.orderV3Tags(fiscalOrder),/NF-e AUTORIZADA/);
fiscalByOrder.f1={error:'offline'};
assert.match(model.orderV3Tags(fiscalOrder),/NF-e INDISPONÍVEL/);
fiscalByOrder.f1={stage:'processing'};
assert.match(model.orderV3Tags(fiscalOrder),/NF-e EM PROCESSAMENTO/);
fiscalByOrder.f1={stage:'rejected'};
assert.match(model.orderV3Tags(fiscalOrder),/NF-e REJEITADA/);
fiscalByOrder.f1={stage:'blocked'};
assert.match(model.orderV3Tags(fiscalOrder),/NF-e BLOQUEADA/);
fiscalByOrder={};
assert.match(model.orderV3Tags({status:'created'}),/RECEBIDO/);
assert.match(model.orderCardOperationalTags({status:'confirmed'}),/MONTAR PARA ENTREGAR HOJE/);
assert.match(model.orderCardOperationalTags({status:'ready',separation_summary:{completed_at:'yes',phase:'needs_attention'}}),/INTEGRAÇÃO PENDENTE/);
assert.equal(model.separatorLabel('JOSE'),'José');
assert.deepEqual(JSON.parse(JSON.stringify(model.separators)),[
  {key:'jose',label:'José'},{key:'claudio',label:'Cláudio'},
  {key:'jovenil',label:'Jovenil'},{key:'kelly',label:'Kelly'}
]);
assert.equal(model.orderV3SearchMatch({order_number:42,customer_name:'Ana',delivery_address_snapshot:{district:'Centro'}},'centro'),true);
assert.equal(model.orderV3SearchMatch({order_number:42,customer_name:'Ana'},'maria'),false);
console.log('Admin order card lifecycle and fiscal labels: PASS');
