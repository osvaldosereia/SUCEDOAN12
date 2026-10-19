import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {deliveryFixture,deferred} from './helpers/admin-delivery-fixture.mjs';
const path='vitrine/admin/closure/controller.js';
assert.ok(fs.existsSync(path),'closure controller must be extracted');
function fixture(api){
  const base=deliveryFixture(api,'closure'),{shared,ports}=base;
  const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(path,'utf8'),context);
  const controller=context.window.DonaAntoniaAdminClosure.create({
    api,
    orders:{...ports.orders,mergeFiscal:rows=>{shared.fiscal={...shared.fiscal,...rows}},clearFiscal:()=>{shared.fiscal={}}},
    navigation:ports.navigation,ui:{...ports.ui,CSS:{escape:String}},formatters:ports.formatters,
    orderView:{orderDisplayCode:ports.orderView.orderDisplayCode,actualPaymentText:base.controller.actualPaymentText,fiscalBlockReasonLabel:String},openOrder:()=>{}
  });
  return {...base,controller};
}
{
  const data={orders:[
    {id:'legacy',customer_name:'Legacy',status:'delivered'},
    {id:'paid',customer_name:'Paid',status:'delivered',payment_method_snapshot:{actual:{received:true,parts:[{method:'pix',amount_cents:100}]}}},
    {id:'complete',customer_name:'Complete',status:'delivered'}
  ],fiscal_by_order:{legacy:{payment_status:'pending'},paid:{payment_status:'pending'},complete:{payment_status:'confirmed',fiscal_status:'issued'}}};
  const f=fixture(async()=>data);await f.controller.renderClosure();
  const html=f.nodes.get('#closureBody').innerHTML;
  assert.match(html,/data-closure-payment="legacy"/);
  assert.ok(!html.includes('data-closure-payment="paid"'),'captured actual payment cannot be confirmed as legacy again');
  assert.match(html,/Recebido · Bling pendente/);assert.match(html,/Concluído/);
  assert.ok(Object.isFrozen(f.controller));
  assert.equal(f.shared.closureOrders,undefined,'closure rows belong to the closure controller');
}
{
  const requests=[];
  const f=fixture(()=>{const d=deferred();requests.push(d);return d.promise});
  const older=f.controller.renderClosure(),newer=f.controller.renderClosure();
  requests[1].resolve({orders:[],fiscal_by_order:{newer:{stage:'current'}}});await newer;
  requests[0].resolve({orders:[],fiscal_by_order:{older:{stage:'obsolete'}}});await older;
  assert.equal(f.shared.fiscal.older,undefined);
  const leaving=f.controller.renderClosure();f.shared.tab='customers';f.nodes.delete('#closureBody');requests[2].reject(Error('offline'));
  await assert.doesNotReject(leaving);
}


{
  const mutation=deferred();
  const f=fixture(async action=>{
    if(action==='order_fiscal_confirm_payment')return mutation.promise;
    return {orders:[{id:'legacy',status:'delivered'}],fiscal_by_order:{legacy:{payment_status:'pending'}}};
  });
  await f.controller.renderClosure();
  const confirming=f.ports.ui.document.querySelectorAll('[data-closure-payment]')[0].onclick();
  f.shared.tab='customers';f.nodes.get('#content').innerHTML='<h1>Clientes atuais</h1>';
  mutation.resolve({payment_status:'confirmed',fiscal_status:'ready'});await confirming;
  assert.equal(f.nodes.get('#content').innerHTML,'<h1>Clientes atuais</h1>','late payment completion must not navigate back to closure');
  assert.equal(f.shared.fiscal.legacy.payment_status,'confirmed','canonical completion still updates shared fiscal data');
}
console.log('Admin closure controller: PASS');
