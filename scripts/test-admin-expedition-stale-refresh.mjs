import assert from 'node:assert/strict';
import {deliveryFixture} from './helpers/admin-delivery-fixture.mjs';
let offline=false,dispatched=false;const mutations=[];
const fixture=deliveryFixture(async(action,_params,options)=>{
  if(action==='ops_delivery_runs')return {delivery:{runs:[]}};
  if(action==='orders'){
    if(offline)throw Error('network offline');
    return {orders:[{id:'order-1',status:dispatched?'out_for_delivery':'ready',total_cents:1200}]};
  }
  assert.equal(action,'order_dispatch_start_v4');
  mutations.push(JSON.parse(options.body));dispatched=true;offline=true;return {ok:true};
});
fixture.shared.fiscal['order-1']={dispatch_gate:{authorized:true,allowed:true}};
await fixture.controller.renderExpedition();
fixture.nodes.get('#selectAllReady').onchange({target:{checked:true}});
await fixture.nodes.get('#bulkDispatchBtn').onclick();
assert.equal(mutations.length,1);
assert.equal(mutations[0].idempotency_key,'dispatch-v4:order-1');
assert.match(fixture.nodes.get('#expeditionBody').innerHTML,/lista de pedidos está desatualizada/);
assert.ok(fixture.messages.some(message=>message.includes('lista')&&message.includes('atualizada')));
offline=false;await fixture.nodes.get('#retryExpeditionRefresh').onclick();
assert.equal(fixture.shared.orders[0].status,'out_for_delivery');
assert.ok(!fixture.nodes.get('#expeditionBody').innerHTML.includes('lista de pedidos está desatualizada'));
console.log('Admin expedition stale refresh contract: PASS');
