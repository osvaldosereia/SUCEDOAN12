import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCreativeStudioViewModel} from '../admin-view-model.js';

test('builds a concise one-idea preview with readiness and cost',()=>{
  const vm=buildCreativeStudioViewModel({
    product:{id:'p1',name:'Desinfetante Flores do Campo',price:12.9,offer_price:9.9,is_offer:true,image_url:'x.webp'},
    plan:{territory:'fragrance',concept:'um campo inteiro dentro do frasco',emotions:['freshness','surprise'],hook:'uma flor nasce',payoff:'campo revela produto',duration:18,product_role:'source_of_world',scenes:[{summary:'frasco entra'},{summary:'flores crescem'}]},
    assets:{summary:{total:3,ready:2,missing:1,blocked:0}},
    cost:{estimated:.04,requiresApproval:false}
  });
  assert.equal(vm.product.name,'Desinfetante Flores do Campo');
  assert.equal(vm.idea.territory,'fragrance');
  assert.equal(vm.assets.readyLabel,'2/3 prontos');
  assert.equal(vm.commercial.price,12.9);
  assert.equal(vm.commercial.offerPrice,9.9);
  assert.equal(vm.actions.produceEnabled,false);
});

test('enables production only when assets are ready and paid approval is not pending',()=>{
  const vm=buildCreativeStudioViewModel({product:{name:'Café'},plan:{territory:'energy',concept:'acorda tudo',emotions:[],hook:'x',payoff:'y',duration:15,product_role:'hero',scenes:[]},assets:{summary:{total:1,ready:1,missing:0,blocked:0}},cost:{estimated:0,requiresApproval:false}});
  assert.equal(vm.actions.produceEnabled,true);
});
