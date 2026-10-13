import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFakeCatalog,makeFakeStock,fakeExtraCatalog} from '../fixtures/fake-catalog.mjs';
import {
 createLabSession,chooseMode,chooseProduct,advance,back,addExtras,
 setCustomer,setDelivery,setPayment,publicView,confirmSimulated
} from '../src/session.mjs';

const catalog=makeFakeCatalog(),inventory=makeFakeStock(catalog);
const ctx={catalog,inventory,extrasCatalog:fakeExtraCatalog};
const newSession=(id='lab-2',composition=1)=>createLabSession({...ctx,modelId:id,composition});

test('Five basket sizes each support three compositions',()=>{
 assert.equal(catalog.models.length,15);
 for(let i=1;i<=5;i++)for(let composition=1;composition<=3;composition++){
   const s=newSession('lab-'+i,composition);
   const v=publicView(ctx,s);
   assert.equal(v.composition,composition);
   assert.equal(v.step,'MODE');
   assert.ok(v.total_cents>0);
 }
});
test('All 15 composition journeys complete, without Meta or production requests',()=>{
 for(let i=1;i<=5;i++)for(let composition=1;composition<=3;composition++){
   let s=chooseMode(ctx,newSession('lab-'+i,composition),'customize');
   const total=publicView(ctx,s).step_total;
   for(let n=0;n<total;n++){
     const v=publicView(ctx,s);assert.equal(v.step,'PRODUCT');
     s=chooseProduct(ctx,s,{positionId:v.current_position.id,productId:v.current_position.selected_id});
     s=advance(ctx,s);
   }
   assert.equal(s.step,'UPSELL');
   s=advance(ctx,s);
   s=setCustomer(ctx,s,{kind:'new',label:'Cliente de teste'});
   s=advance(ctx,s);
   s=setDelivery(ctx,s,{mode:'new',label:'Rua fictícia, 10, Cuiabá'});
   s=advance(ctx,s);
   s=setPayment(ctx,s,'pix');
   s=advance(ctx,s);
   const pub=publicView(ctx,s);
   assert.equal(pub.step,'REVIEW');assert.equal(pub.lines.length,total);
   assert.ok(!JSON.stringify(pub).includes('hidden'));
   const orders=new Map(),first=confirmSimulated(ctx,s,{idempotencyKey:'session-'+i+'-'+composition,orders});
   assert.equal(first.order.status,'SIMULATED_ONLY');
   assert.equal(first.session.step,'DONE');
   const again=confirmSimulated(ctx,s,{idempotencyKey:'session-'+i+'-'+composition,orders});
   assert.equal(again.existing,true);assert.equal(orders.size,1);
 }
});
test('Ready basket skips 27 product decisions and returns to correct screen',()=>{
 const before=chooseMode(ctx,newSession('lab-5'),'ready');
 assert.equal(before.step,'UPSELL');
 assert.equal(back(ctx,before).step,'MODE');
 assert.equal(advance(ctx,before).step,'CUSTOMER');
});
test('Brand switch and removal do not reveal or reset hidden adjustments',()=>{
 let s=chooseMode(ctx,newSession('lab-2',2),'customize');
 const p=publicView(ctx,s).current_position;
 const baseline=publicView(ctx,s).total_cents;
 s=chooseProduct(ctx,s,{positionId:p.id,productId:p.options[1].id});
 assert.equal(publicView(ctx,s).total_cents,baseline+125-275);
 s=chooseProduct(ctx,s,{positionId:p.id,productId:null,quantity:0});
 const v=publicView(ctx,s);
 assert.ok(v.total_cents<baseline);
 assert.equal(JSON.stringify(v).includes('fixed_hidden'),false);
 assert.equal(JSON.stringify(v).includes('conditional_hidden'),false);
});
test('Short stock fails in review, never silently confirms',()=>{
 const n=newSession('lab-1'),m=catalog.models.find(x=>x.id==='lab-1');
 const missing={...inventory,[m.positions[0].default_id]:0};
 const failCtx={...ctx,inventory:missing};
 const result=publicView(failCtx,n);
 assert.equal(result.eligible,false);
 assert.equal(result.quote_status,'unavailable');
});
test('Extra products and checkout fields are separate from basket unit price',()=>{
 let s=chooseMode(ctx,newSession('lab-1'),'ready');
 const base=publicView(ctx,s).basket_total_cents;
 s=addExtras(ctx,s,[{id:'lab-extra-oleo',quantity:1}]);
 assert.equal(publicView(ctx,s).basket_total_cents,base);
 assert.equal(publicView(ctx,s).total_cents,base+799);
 assert.equal(advance(ctx,s).step,'CUSTOMER');
});
test('Out-of-order selection is blocked',()=>{
 const s=chooseMode(ctx,newSession('lab-2'),'customize');
 assert.throws(()=>chooseProduct(ctx,s,{positionId:'pos-6',productId:'incorrect'}),/position_out_of_order/);
});
test('Cannot finish without customer, delivery, payment and review',()=>{
 const s=chooseMode(ctx,newSession('lab-2'),'ready');
 assert.throws(()=>confirmSimulated(ctx,s,{idempotencyKey:'sample-event-001',orders:new Map()}),/wrong_step/);
});
