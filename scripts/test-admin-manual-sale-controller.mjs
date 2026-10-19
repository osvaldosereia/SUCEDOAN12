import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context={window:{}};vm.createContext(context);
const path='vitrine/admin/orders/manual-sale.js';
assert.ok(fs.existsSync(path),'manual sale workflow should have an isolated provider');
vm.runInContext(fs.readFileSync(path,'utf8'),context);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function fixture({api=async()=>({}),customerApi=async()=>({customers:[]})}={}){
  const nodes=new Map(),values=new Map(),messages=[],calls=[];let sale={customer:null,cart:[{type:'product',id:'p',name:'Produto',qty:1,price_cents:7500}],baskets:[],basketConfig:null};
  const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',disabled:false,onclick:null,onkeydown:null,close(){this.closed=true},showModal(){this.open=true},querySelectorAll:()=>[]});return nodes.get(id)};
  const query=id=>node(id);
  for(const [id,value] of Object.entries({'#manualName':'Ana','#manualPhone':'65999990000','#manualStreet':'Rua A','#manualNumber':'10','#manualDistrict':'Centro','#manualComplement':'Casa','#manualCity':'Cuiabá','#manualState':'MT','#manualPayment':'PIX','#manualCustomerSearch':'Ma','#manualItemSearch':''}))values.set(id,value);
  for(const [id,value] of values)node(id).value=value;
  const document={querySelectorAll:()=>[],contains:()=>true};
  const controller=context.window.DonaAntoniaAdminManualSale.create({
    sale:{get:()=>sale,set:value=>{sale=value}},api:async(...args)=>{calls.push(args);return api(...args)},customerApi,storefrontApi:async()=>({baskets:[]}),
    orders:{render:async()=>{},open:async()=>{},selectNewFilter(){}},ui:{query,document,toast:m=>messages.push(m),errorMessage:String,currentOperator:()=> 'Operação'},
    formatters:{esc:String,money:v=>'R$ '+v,formatPhone:String,formatCpf:String,fmtQty:String,normalize:x=>String(x||'').toLowerCase()}
  });
  return {controller,nodes,values,messages,calls,get sale(){return sale},set sale(value){sale=value},query};
}
{
  const waits=[];const f=fixture({customerApi:()=>{const d=deferred();waits.push(d);return d.promise}});
  const old=f.controller.searchManualCustomers();
  f.values.set('#manualCustomerSearch','Maria');f.query('#manualCustomerSearch').value='Maria';
  const latest=f.controller.searchManualCustomers();
  waits[1].resolve({customers:[{display_name:'Maria'}]});await latest;
  waits[0].resolve({customers:[{display_name:'Marcos'}]});await old;
  assert.match(f.query('#manualCustomerResults').innerHTML,/Maria/);
  assert.doesNotMatch(f.query('#manualCustomerResults').innerHTML,/Marcos/);
}
{
  const waits=[];const f=fixture({api:()=>{const d=deferred();waits.push(d);return d.promise}});
  f.values.set('#manualItemSearch','Arroz');f.query('#manualItemSearch').value='Arroz';
  const old=f.controller.searchManualItems();
  f.values.set('#manualItemSearch','Feijao');f.query('#manualItemSearch').value='Feijao';
  const latest=f.controller.searchManualItems();
  waits[1].resolve({products:[{id:'new',name:'Feijao',stock_quantity:2,sale_price_cents:500}]});await latest;
  waits[0].resolve({products:[{id:'old',name:'Arroz',stock_quantity:2,sale_price_cents:500}]});await old;
  assert.match(f.query('#manualItemResults').innerHTML,/Feijao/);
  assert.doesNotMatch(f.query('#manualItemResults').innerHTML,/Arroz/);
}
{
  let renders=0,opened='';const f=fixture({api:async(action,_params,options)=>{assert.equal(action,'manual_order_create');return {order_id:'order-1'}}});
  f.controller=context.window.DonaAntoniaAdminManualSale.create({
    sale:{get:()=>f.sale,set:value=>{f.sale=value}},api:async(...args)=>{f.calls.push(args);return {order_id:'order-1'}},customerApi:async()=>({customers:[]}),storefrontApi:async()=>({baskets:[]}),
    orders:{render:async()=>{renders++},open:async id=>{opened=id},selectNewFilter(){}},ui:{query:f.query,document:{contains:()=>true},toast:m=>f.messages.push(m),errorMessage:String,currentOperator:()=> 'Operação'},
    formatters:{esc:String,money:v=>'R$ '+v,formatPhone:String,formatCpf:String,fmtQty:String,normalize:x=>String(x||'').toLowerCase()}
  });
  await f.controller.createManualSale();
  const payload=JSON.parse(f.calls[0][2].body);
  assert.deepEqual(JSON.parse(JSON.stringify(payload)),{phone:'65999990000',payment_method:'PIX',items:[{type:'product',id:'p',qty:1}],customer_snapshot:{id:null,display_name:'Ana',phone:'65999990000',address:{street:'Rua A',number:'10',district:'Centro',complement:'Casa',city:'Cuiabá',state:'MT'}},delivery:{},operator:'Operação'});
  assert.equal(renders,1);assert.equal(opened,'order-1');assert.equal(f.sale,null);
}
{
  const pending=deferred();const f=fixture({api:()=>pending.promise});
  const first=f.controller.createManualSale();
  await f.controller.createManualSale();
  assert.equal(f.calls.length,1,'the same manual-sale draft must not submit twice');
  pending.resolve({order_id:'order-1'});await first;
}
console.log('Admin manual sale controller and stale-search isolation: PASS');
