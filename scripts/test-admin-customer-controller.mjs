import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {adminDomFixture} from './helpers/admin-dom-fixture.mjs';
import {deferred} from './helpers/admin-delivery-fixture.mjs';
const path='vitrine/admin/customers/controller.js';
assert.ok(fs.existsSync(path),'customer controller must be extracted');
function fixture(api,ui={}){
  const dom=adminDomFixture(),shared={customers:[],tab:'customers'},messages=[];
  const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(path,'utf8'),context);
  const controller=context.window.DonaAntoniaAdminCustomers.create({
    customerApi:api,customers:{get:()=>shared.customers,set:rows=>{shared.customers=rows}},navigation:{currentTab:()=>shared.tab},openOrder:async()=>{},
    ui:{query:dom.query,document:dom.document,FormData,confirm:()=>false,toast:value=>messages.push(value),...ui},
    formatters:{esc:String,money:String,fmtQty:String,dateTime:String,formatPhone:String,formatCpf:String,errorMessage:String},statusPill:String
  });
  return {...dom,controller,shared,messages};
}
{
  const requests=[];const f=fixture(()=>{const d=deferred();requests.push(d);return d.promise});
  const older=f.controller.renderCustomers('old'),newer=f.controller.renderCustomers('new');
  requests[1].resolve({customers:[{id:'new',display_name:'New'}]});await newer;
  requests[0].resolve({customers:[{id:'old',display_name:'Old'}]});await older;
  assert.equal(f.shared.customers[0].id,'new');
}
{
  let pending;
  const customer={id:'c1',display_name:'Cliente'};
  const f=fixture(async action=>{
    if(action==='vitrine_customers_list')return {customers:[customer]};
    pending=deferred();return pending.promise;
  });
  await f.controller.renderCustomers();
  const profile=f.document.querySelectorAll('[data-history-customer]')[0].onclick();
  f.controller.openCustomerEditor(customer);
  pending.resolve({customer,orders:[],summary:{}});await profile;
  assert.match(f.nodes.get('#editorBody').innerHTML,/id="customerForm"/,'late history must not overwrite customer editing');
  assert.ok(Object.isFrozen(f.controller));
}
{
  const customer={id:'c1',display_name:'Cliente'};let detail;
  const f=fixture(async action=>{
    if(action==='vitrine_customers_list')return {customers:[customer]};
    if(action==='vitrine_customer_history')return {customer,orders:[{order_id:'o1'}],summary:{}};
    detail=deferred();return detail.promise;
  });
  await f.controller.renderCustomers();await f.document.querySelectorAll('[data-history-customer]')[0].onclick();
  const opening=f.document.querySelectorAll('[data-history-order]')[0].onclick();
  f.controller.openCustomerEditor(customer);detail.resolve({order:{order_number:'obsolete'},items:[]});await opening;
  assert.match(f.nodes.get('#editorBody').innerHTML,/id="customerForm"/,'late order detail must not overwrite a newer dialog view');
}


for(const kind of ['save','delete']){
  const mutation=deferred();
  const f=fixture(async action=>{assert.equal(action,'vitrine_customer_'+kind);return mutation.promise},{confirm:()=>true,FormData:class {get(){return ''}}});
  f.controller.openCustomerEditor({id:'c1',display_name:'Cliente'});
  const pending=f.nodes.get(kind==='save'?'#saveCustomer':'#deleteCustomer').onclick();
  f.shared.tab='products';f.nodes.get('#content').innerHTML='<h1>Produtos atuais</h1>';
  f.nodes.get('#editorBody').innerHTML='<div>Outro diálogo</div>';
  mutation.resolve({ok:true});await pending;
  assert.equal(f.nodes.get('#content').innerHTML,'<h1>Produtos atuais</h1>',kind+' completion must not replace a newer page');
  assert.equal(f.nodes.get('#editor').open,true,kind+' completion must not close a different dialog');
}
console.log('Admin customer controller: PASS');
