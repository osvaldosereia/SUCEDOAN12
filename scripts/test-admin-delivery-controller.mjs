import assert from 'node:assert/strict';
import {deliveryFixture,deferred} from './helpers/admin-delivery-fixture.mjs';

const noRoutes=()=>({delivery:{runs:[],catalog:{regions:[],drivers:[],vehicles:[]}}});
{
  const waiting=[];
  const fixture=deliveryFixture(action=>{
    if(action==='ops_delivery_runs')return Promise.resolve(noRoutes());
    assert.equal(action,'orders');const request=deferred();waiting.push(request);return request.promise;
  });
  const older=fixture.controller.renderExpedition(),newer=fixture.controller.renderExpedition();
  waiting[1].resolve({orders:[{id:'newer',status:'delivered'}]});await newer;
  waiting[0].resolve({orders:[{id:'older',status:'delivered'}]});await older;
  assert.equal(fixture.shared.orders[0].id,'newer','late render must not replace newer orders');
  const leaving=fixture.controller.renderExpedition();fixture.shared.tab='customers';
  fixture.nodes.delete('#expeditionBody');waiting[2].reject(new Error('offline'));
  await assert.doesNotReject(leaving,'late failure must not touch the removed expedition host');
}
{
  let fail=false;
  const fixture=deliveryFixture(async action=>{
    if(action==='ops_delivery_runs')return noRoutes();
    if(fail)throw Error('offline');return {orders:[]};
  },'driver');
  await fixture.controller.renderDriver();fail=true;
  await assert.doesNotReject(fixture.nodes.get('#refreshDriver').onclick());
  assert.match(fixture.nodes.get('#driverQueue').innerHTML,/Não consegui carregar/,'refresh failure must be visible');
}
{
  const one=deliveryFixture(async action=>action==='orders'?{orders:[]}:noRoutes());
  const two=deliveryFixture(async action=>action==='orders'?{orders:[]}:noRoutes());
  await one.controller.renderExpedition();
  one.nodes.get('#expeditionSearch').oninput({target:{value:'only-first'}});
  await two.controller.renderExpedition();
  assert.ok(!two.nodes.get('#content').innerHTML.includes('only-first'),'controller instances must own their query state');
  assert.ok(Object.isFrozen(one.controller),'controller contract must be immutable');
}
// A route catalog error must not look like an empty route list.
{
  let routeError=true;
  const fixture=deliveryFixture(async action=>{
    if(action==='orders')return {orders:[]};
    if(routeError)throw Error('routes offline');return noRoutes();
  },'driver');
  await fixture.controller.renderDriver();
  assert.match(fixture.nodes.get('#driverRouteToolbar').innerHTML,/Não consegui carregar as rotas/);
  routeError=false;await fixture.nodes.get('#refreshDriver').onclick();
  assert.ok(!fixture.nodes.get('#driverRouteToolbar').innerHTML.includes('Não consegui carregar as rotas'));
}
// The latest route snapshot must survive an older response even on repaint.
{
  const requests=[];
  const fixture=deliveryFixture(action=>{
    const request=deferred();requests.push({action,...request});return request.promise;
  },'driver');
  const older=fixture.controller.renderDriver(),newer=fixture.controller.renderDriver();
  requests[2].resolve({orders:[]});requests[3].resolve({delivery:{runs:[{vehicle_key:'car_1',status:'planned',driver:{name:'New driver'},stops:[]}]}});await newer;
  requests[0].resolve({orders:[]});requests[1].resolve({delivery:{runs:[{vehicle_key:'car_1',status:'planned',driver:{name:'Old driver'},stops:[]}]}});await older;
  fixture.nodes.get('#driverSearch').oninput();
  assert.match(fixture.nodes.get('#driverRouteToolbar').innerHTML,/New driver/);
  assert.ok(!fixture.nodes.get('#driverRouteToolbar').innerHTML.includes('Old driver'));
}
// Completing a delivery from the driver view must immediately remove its card.
{
  let delivered=false;
  const fixture=deliveryFixture(async action=>{
    if(action==='ops_delivery_runs')return {delivery:{runs:[]}};
    if(action==='order_delivery_complete_v3'){delivered=true;return {ok:true}}
    assert.equal(action,'orders');return {orders:[{id:'finish-me',status:delivered?'delivered':'out_for_delivery',total_cents:1200,payment_method_snapshot:{actual:{received:true,parts:[{method:'pix',amount_cents:1200}]}}}]};
  },'driver');
  await fixture.controller.renderDriver();
  await fixture.nodes.get('#driverQueue').querySelectorAll('[data-driver-delivered]')[0].onclick();
  assert.match(fixture.nodes.get('#driverQueue').innerHTML,/Nenhuma entrega em rota/,'completed driver delivery must repaint its current queue');
}
console.log('Admin delivery controller: PASS');
