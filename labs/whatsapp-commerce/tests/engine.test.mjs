import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginDraft, changeSelection, setBasketQuantity, setExtras,
  quoteInternal, quoteForCustomer, finishSimulatedOrder
} from '../src/engine.mjs';

const FIXTURE={
  models:[{
    id:'model-mini',name:'Mini Completa',composition:1,
    pricing:{fixed_hidden_cents:1200,conditional_enabled:true,
      conditional_product_id:'arroz-a',conditional_cents:300},
    positions:[
      {id:'rice',label:'Arroz 5kg',quantity:1,default_id:'arroz-a',removable:true,
        options:[{id:'arroz-a',name:'Arroz A',price_cents:2450,active:true},
          {id:'arroz-b',name:'Arroz B',price_cents:2690,active:true}]},
      {id:'coffee',label:'Café',quantity:1,default_id:'cafe-a',removable:true,
        options:[{id:'cafe-a',name:'Café A',price_cents:9000,active:true}]}
    ]
  }]
};
const STOCK={'arroz-a':10,'arroz-b':10,'cafe-a':10,'extra-oil':10};
const EXTRAS={'extra-oil':{id:'extra-oil',name:'Óleo',price_cents:790,active:true}};
const draft=()=>beginDraft(FIXTURE,'model-mini',1);
test('base composition includes fixed and conditional hidden values',()=>{
 const q=quoteInternal(FIXTURE,draft(),STOCK,EXTRAS);
 assert.equal(q.total_cents,2450+9000+1200+300);
 assert.equal(q._private_audit.hidden_fixed_cents,1200);
 assert.equal(q._private_audit.hidden_conditional_cents,300);
});
test('change brand preserves fixed hidden adjustment, condition follows product',()=>{
 const changed=changeSelection(FIXTURE,draft(),'rice','arroz-b');
 const q=quoteInternal(FIXTURE,changed,STOCK,EXTRAS);
 assert.equal(q.total_cents,2690+9000+1200);
 assert.equal(q._private_audit.hidden_fixed_cents,1200);
 assert.equal(q._private_audit.hidden_conditional_cents,0);
});
test('remove rice preserves fixed hidden while removing dependent conditional',()=>{
 const removed=changeSelection(FIXTURE,draft(),'rice',null,0);
 const q=quoteInternal(FIXTURE,removed,STOCK,EXTRAS);
 assert.equal(q.total_cents,9000+1200);
 assert.equal(q._private_audit.hidden_fixed_cents,1200);
 assert.equal(q._private_audit.hidden_conditional_cents,0);
});
test('changing quantity and doubling basket scales fixed adjustment per basket',()=>{
 const two=setBasketQuantity(draft(),2);
 const q=quoteInternal(FIXTURE,two,STOCK,EXTRAS);
 assert.equal(q.total_cents,(2450+9000+1200+300)*2);
});
test('extra item is outside basket, cannot overwrite hidden adjustment',()=>{
 const plus=setExtras(draft(),[{id:'extra-oil',quantity:2}]);
 const q=quoteInternal(FIXTURE,plus,STOCK,EXTRAS);
 assert.equal(q.total_cents,2450+9000+1200+300+790*2);
 assert.equal(q._private_audit.hidden_fixed_cents,1200);
});
test('client quote never exposes hidden pricing or internal rules',()=>{
 const q=quoteForCustomer(FIXTURE,draft(),STOCK,EXTRAS);
 assert.equal('_private_audit' in q,false);
 assert.equal(JSON.stringify(q).includes('hidden_fixed'),false);
 assert.equal(JSON.stringify(q).includes('conditional_cents'),false);
 assert.equal(JSON.stringify(q).includes('pricing'),false);
});
test('unavailable items cannot be confirmed',()=>{
 const q=quoteForCustomer(FIXTURE,draft(),{'arroz-a':0,'cafe-a':10},EXTRAS);
 assert.equal(q.eligible,false);
 assert.equal(q.status,'unavailable');
});
test('stale composition cannot continue',()=>{
 const d=draft();
 const changed=structuredClone(FIXTURE);
 changed.models[0].composition=2;
 assert.throws(()=>quoteForCustomer(changed,d,STOCK,EXTRAS),/composition_version_changed/);
});
test('simulation is idempotent and does not write external systems',()=>{
 const map=new Map();
 const first=finishSimulatedOrder(FIXTURE,draft(),STOCK,EXTRAS,'mock-event-key-0001',map);
 const second=finishSimulatedOrder(FIXTURE,draft(),STOCK,EXTRAS,'mock-event-key-0001',map);
 assert.equal(map.size,1);assert.equal(first.existing,false);
 assert.equal(second.existing,true);
 assert.equal(first.order.status,'SIMULATED_ONLY');
});
test('tampering with hidden price from Flow data has no effect',()=>{
 const d=draft();
 d.pricing={fixed_hidden_cents:-999999,conditional_cents:0};
 d.hidden_adjustment_cents=0;
 const q=quoteInternal(FIXTURE,d,STOCK,EXTRAS);
 assert.equal(q.total_cents,2450+9000+1200+300);
});
test('unconfigured fixed adjustment refuses calculation',()=>{
 const broken=structuredClone(FIXTURE);delete broken.models[0].pricing;
 assert.throws(()=>quoteForCustomer(broken,draft(),STOCK,EXTRAS),/hidden_fixed_unavailable/);
});
