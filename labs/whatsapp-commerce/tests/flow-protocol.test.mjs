import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFakeCatalog,makeFakeStock,fakeExtraCatalog} from '../fixtures/fake-catalog.mjs';
import {createLabFlowStore,safeLabFlowError} from '../src/flow-protocol.mjs';

const catalog=makeFakeCatalog(),inventory=makeFakeStock(catalog);
const ctx={catalog,inventory,extrasCatalog:fakeExtraCatalog};
const makeStore=(options)=>createLabFlowStore(ctx,options);
let seq=0;
const token=()=>('lab-flow-dona-test-'+String(++seq).padStart(8,'0'));
const ex=(screen,flow_token,task,data={})=>({action:'data_exchange',screen,flow_token,data:{task,...data}});
test('Meta health check needs no customer data or token',()=>{
 const store=makeStore();
 assert.deepEqual(store.handle({action:'ping'}),{version:'3.0',data:{status:'active'}});
});
test('Dynamic Flow returns server quote on the same product screen after selection',()=>{
 const store=makeStore(),t=token();
 store.register(t,'lab-2',2);
 let res=store.handle(ex('CHOOSE_MODE',t,'choose_mode',{mode:'customize'}));
 assert.equal(res.screen,'PRODUCT_PILOT');
 const first=res.data;
 assert.equal(first.position_number,'1 de 23');
 assert.ok(first.options.some(o=>o.id==='__REMOVE__'));
 assert.ok(first.options.every(o=>o.title.length<=30));
 const alt=first.options.find(o=>o.id!==first.selected_id&&o.id!=='__REMOVE__');
 const preview=store.handle(ex('PRODUCT_PILOT',t,'preview_product',{
   position_id:first.position_id,product_id:alt.id}));
 assert.equal(preview.screen,'PRODUCT_PILOT','client should remain on the same Flow screen');
 assert.equal(preview.data.position_number,'1 de 23');
 assert.equal(preview.data.selected_id,alt.id);
 assert.notEqual(preview.data.total_label,first.total_label);
 assert.ok(!JSON.stringify(preview).includes('hidden'));
 assert.ok(!JSON.stringify(preview).includes('pricing'));
});
test('A single dynamic screen traverses every one of 23–27 positions',()=>{
 for(let size=1;size<=5;size++)for(let composition=1;composition<=3;composition++){
   const store=makeStore(),t=token();
   store.register(t,'lab-'+size,composition);
   let response=store.handle(ex('CHOOSE_MODE',t,'choose_mode',{mode:'customize'}));
   const n=response.data.position_number.endsWith('23')?23:size===1?14:27;
   for(let i=0;i<n;i++){
     assert.equal(response.screen,'PRODUCT_PILOT');
     const data=response.data;
     const titleParts=data.position_number.split(' de ');
     assert.equal(Number(titleParts[0]),i+1);
     response=store.handle(ex('PRODUCT_PILOT',t,'commit_product',{
       position_id:data.position_id,product_id:data.selected_id}));
   }
   assert.equal(response.screen,'UPSELL');
   assert.match(response.data.total_label,/R\$/);
   response=store.handle(ex('UPSELL',t,'select_upsell',{extras:[]}));
   assert.equal(response.screen,'CHECKOUT');
   response=store.handle(ex('CHECKOUT',t,'checkout',{
     name:'Cliente fictício',address:'Rua de testes, 100, Cuiabá',
     payment:'pix',customer_kind:'new',location_confirmed:true}));
   assert.equal(response.screen,'SIMULATED_FINISH');
   assert.match(response.data.message,/Simulação concluída/);
   assert.ok(!JSON.stringify(response).includes('hidden'));
   const confirmed=store.confirmSimulatedOnly(t,'same-event-unique');
   assert.equal(confirmed.order.status,'SIMULATED_ONLY');
   assert.equal(confirmed.existing,false);
   const replay=store.confirmSimulatedOnly(t,'same-event-unique');
   assert.equal(replay.existing,true);
   assert.equal(store.stats().simulatedOrders,1);
 }
});
test('Ready-made mode skips all product selections',()=>{
 const store=makeStore(),t=token();
 store.register(t,'lab-5',1);
 let result=store.handle(ex('CHOOSE_MODE',t,'choose_mode',{mode:'ready'}));
 assert.equal(result.screen,'UPSELL');
 assert.match(result.data.total_label,/R\$/);
 result=store.handle({action:'BACK',flow_token:t});
 assert.equal(result.screen,'CHOOSE_MODE');
});
test('Upsell is optional and changes only the total order price',()=>{
 const store=makeStore(),t=token();
 store.register(t,'lab-2',1);
 let result=store.handle(ex('CHOOSE_MODE',t,'choose_mode',{mode:'ready'}));
 const basketBefore=result.data.total_label;
 result=store.handle(ex('UPSELL',t,'select_upsell',{extras:['lab-extra-oleo']}));
 assert.equal(result.screen,'CHECKOUT');
 assert.notEqual(result.data.total_label,basketBefore);
 assert.ok(!JSON.stringify(result).includes('pricing'));
});
test('Wrong token, wrong screen and stale position fail closed',()=>{
 const store=makeStore(),t=token();
 store.register(t,'lab-2',1);
 assert.throws(()=>store.handle(ex('CHOOSE_MODE','lab-flow-not-present-1234','choose_mode',{mode:'ready'})),/session_missing/);
 assert.throws(()=>store.handle(ex('PRODUCT_PILOT',t,'commit_product',{position_id:'pos-0',product_id:'x'})),/screen_out_of_sync/);
 store.handle(ex('CHOOSE_MODE',t,'choose_mode',{mode:'customize'}));
 assert.throws(()=>store.handle(ex('PRODUCT_PILOT',t,'commit_product',{position_id:'pos-1',product_id:'x'})),/position_out_of_order/);
 assert.equal(store.refresh(t).data.position_number,'1 de 23');
});
test('Expired sessions reject requests and cannot be completed',()=>{
 let time=1000;
 const store=makeStore({ttlMs:1000,now:()=>time}),t=token();
 store.register(t,'lab-1',1);
 time=2001;
 assert.throws(()=>store.refresh(t),/session_expired/);
});
test('Product shortage blocks checkout with no synthetic order created',()=>{
 const m=catalog.models.find(x=>x.id==='lab-1'&&x.composition===1);
 const lowStock={...inventory,[m.positions[0].default_id]:0};
 const store=createLabFlowStore({...ctx,inventory:lowStock}),t=token();
 store.register(t,'lab-1',1);
 store.handle(ex('CHOOSE_MODE',t,'choose_mode',{mode:'ready'}));
 store.handle(ex('UPSELL',t,'select_upsell',{extras:[]}));
 assert.throws(()=>store.handle(ex('CHECKOUT',t,'checkout',{
     name:'Cliente fake',address:'Rua fictícia, 1',payment:'pix'})),/quote_not_confirmable/);
 assert.equal(store.stats().simulatedOrders,0);
});
test('Errors do not leak arbitrary implementation details',()=>{
 const error=safeLabFlowError(new Error('secret confidential production hostname'));
 assert.deepEqual(error,{version:'3.0',error_message:'Falha na simulação. Tente novamente.'});
});
test('Complete tokens isolate idempotency keys across users',()=>{
 const store=makeStore(),tokens=[token(),token()];
 for(const t of tokens){
  store.register(t,'lab-1',1);
  store.handle(ex('CHOOSE_MODE',t,'choose_mode',{mode:'ready'}));
  store.handle(ex('UPSELL',t,'select_upsell',{extras:[]}));
  store.handle(ex('CHECKOUT',t,'checkout',{name:'Fake User',address:'Fake Street 123',payment:'pix'}));
 }
 for(const t of tokens)store.confirmSimulatedOnly(t,'same-event-id-shared');
 assert.equal(store.stats().simulatedOrders,2);
});
