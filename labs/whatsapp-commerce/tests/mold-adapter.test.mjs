import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMoldComposition,normalizeAllMoldCompositions} from '../src/mold-adapter.mjs';
import {beginDraft,changeSelection,quoteInternal,quoteForCustomer} from '../src/engine.mjs';

function sample(){
  return {
    basket:{id:'basket-mini',name:'Mini Completa',hidden_adjustment:99999},
    mold:{basket_id:'basket-mini',hidden_adjustment:12.00,
      conditional_hidden_enabled:true,conditional_hidden_product_id:'coffee-b',
      conditional_hidden_adjustment:3.00},
    positions:[
      {id:'rice',label:'Arroz 5 kg',quantity:1},
      {id:'coffee',label:'Café',quantity:1}
    ],
    options:[
      {position_id:'rice',product_id:'rice-a'},{position_id:'rice',product_id:'rice-b'},
      {position_id:'coffee',product_id:'coffee-a'},{position_id:'coffee',product_id:'coffee-b'}
    ],
    products:[
      {id:'rice-a',name:'Arroz A',price:24.5,is_active:true},
      {id:'rice-b',name:'Arroz B',price:26.9,is_active:true,is_offer:true,offer_price:23.9},
      {id:'coffee-a',name:'Café A',price:14.9,is_active:true},
      {id:'coffee-b',name:'Café B',price:17.0,is_active:true}
    ],
    generated:{compositions:[
      {number:1,items:[{position_id:'rice',product_id:'rice-a'}, {position_id:'coffee',product_id:'coffee-a'}]},
      {number:2,items:[{position_id:'rice',product_id:'rice-b'}, {position_id:'coffee',product_id:'coffee-b'}]}
    ]}
  };
}
test('canonical mold adjustment wins over obsolete template price',()=>{
 const m=normalizeMoldComposition(sample(),1);
 assert.equal(m.pricing.fixed_hidden_cents,1200);
 assert.notEqual(m.pricing.fixed_hidden_cents,9999900);
 const q=quoteInternal({models:[m]},beginDraft({models:[m]},'basket-mini',1),
   {'rice-a':9,'coffee-a':9});
 assert.equal(q.total_cents,2450+1490+1200);
 assert.equal(q._private_audit.hidden_conditional_cents,0);
});
test('generated composition chooses its actual products, not first alternatives',()=>{
 const m=normalizeMoldComposition(sample(),2);
 assert.equal(m.positions[0].default_id,'rice-b');
 assert.equal(m.positions[1].default_id,'coffee-b');
 assert.equal(m.positions[0].options.find(x=>x.id==='rice-b').price_cents,2390);
 const q=quoteInternal({models:[m]},beginDraft({models:[m]},'basket-mini',2),
   {'rice-b':9,'coffee-b':9});
 assert.equal(q.total_cents,2390+1700+1200+300);
});
test('swapping the conditional product removes conditional only',()=>{
 const m=normalizeMoldComposition(sample(),2),catalog={models:[m]};
 let d=beginDraft(catalog,'basket-mini',2);
 d=changeSelection(catalog,d,'coffee','coffee-a');
 const q=quoteInternal(catalog,d,{'rice-b':10,'coffee-a':10});
 assert.equal(q.total_cents,2390+1490+1200);
 assert.equal(q._private_audit.hidden_fixed_cents,1200);
 assert.equal(q._private_audit.hidden_conditional_cents,0);
});
test('client-safe DTO never exposes mold hidden values',()=>{
 const m=normalizeMoldComposition(sample(),2),catalog={models:[m]};
 const dto=quoteForCustomer(catalog,beginDraft(catalog,'basket-mini',2),{'rice-b':9,'coffee-b':9});
 assert.ok(!JSON.stringify(dto).includes('hidden'));
 assert.ok(!JSON.stringify(dto).includes('pricing'));
});
test('adapter never defaults to old template adjustment when mold value is missing',()=>{
 const s=sample();delete s.mold.hidden_adjustment;
 assert.throws(()=>normalizeMoldComposition(s,1),/mold_hidden_missing/);
});
test('adapter rejects incomplete generated compositions',()=>{
 const s=sample();s.generated.compositions[0].items.pop();
 assert.throws(()=>normalizeMoldComposition(s,1),/default_composition_incomplete/);
});
test('all composition variants build without duplicating source catalog',()=>{
 const catalog=normalizeAllMoldCompositions([sample()]);
 assert.equal(catalog.models.length,2);
 assert.deepEqual(catalog.models.map(x=>x.composition),[1,2]);
});
