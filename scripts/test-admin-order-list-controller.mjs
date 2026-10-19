import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync('vitrine/admin/orders/list-controller.js','utf8'),context);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(api,queueRequest=async()=>({order_ids:[]}),isCustomerPending=()=>false){
 let rows=[],tab='orders',paints=0;const host={innerHTML:''};
 const controller=context.window.DonaAntoniaAdminOrderList.create({api,queueRequest,
 orders:{get:()=>rows,set:value=>rows=value,loadFiscal:async()=>{},isCustomerPending},navigation:{currentTab:()=>tab},
 ui:{query:key=>key==='#orderRows'?host:null,document:{hidden:false},toast(){},errorMessage:String},view:{paint:()=>paints++}});
 return {controller,host,get rows(){return rows},set rows(v){rows=v},get paints(){return paints},leave:()=>tab='customers'};
}
{
 const initial=fixture(async()=>({orders:[]}));
 assert.equal(initial.controller.state.orderStatusTab,'new','the order board opens on Novo');
}
{
 let queueCalls=0;const f=fixture(async()=>({orders:[{id:'o1',status:'confirmed'}]}),async()=>{queueCalls++;return {order_ids:[]}});
 await f.controller.loadOrders();
 assert.equal(queueCalls,0,'loading the order board does not request manual queue membership');
 assert.equal(f.paints,1);
}
{
 const waits=[];const f=fixture(()=>{const d=deferred();waits.push(d);return d.promise});
 const a=f.controller.loadOrders(),b=f.controller.loadOrders();
 waits[1].resolve({orders:[{id:'fresh',status:'confirmed'}]});await b;
 waits[0].resolve({orders:[{id:'old'}]});await a;assert.equal(f.rows[0].id,'fresh');assert.equal(f.paints,1);
}
{
 const calls=[],waits=[];const f=fixture(async()=>({orders:[]}),async action=>{calls.push(action);const d=deferred();waits.push(d);return d.promise});
 const read=f.controller.loadManualPickQueue();await tick();const add=f.controller.setManualPickQueue('a',true),duplicate=f.controller.setManualPickQueue('a',true);
 assert.deepEqual(calls,['list'],'queue writes must wait for the outstanding snapshot');
 waits[0].resolve({order_ids:[]});await read;await tick();assert.deepEqual(calls,['list','add']);
 waits[1].resolve({order_ids:['a']});await Promise.all([add,duplicate]);assert.equal(f.controller.state.manualQueueIds.has('a'),true);
 assert.deepEqual(calls,['list','add']);
}
{
 const d=deferred(),f=fixture(async()=>({orders:[]}),()=>d.promise);
 const pending=f.controller.setManualPickQueue('a',true);await tick();f.leave();d.resolve({order_ids:['a']});await pending;
 assert.equal(f.paints,0);assert.equal(f.controller.state.manualQueueIds.has('a'),true);
}
{
 const d=deferred(),f=fixture(()=>d.promise);const pending=f.controller.loadOrders();f.leave();d.resolve({orders:[{id:'shared'}]});await pending;
 assert.equal(f.rows[0].id,'shared');assert.equal(f.paints,0);
}
{
 const d=deferred(),f=fixture(action=>action==='order_separation_board'?d.promise:Promise.resolve({orders:[{id:'a',status:'confirmed'}]}));
 f.rows=[{id:'a',status:'confirmed'}];
 const old=f.controller.refreshOrderSeparationBoard();await f.controller.loadOrders();
 d.resolve({board:[{order_id:'a',status:'ready'}]});await old;
 assert.equal(f.rows[0].status,'confirmed','poll started before reload must not overwrite it');
}
{
 const f=fixture(async action=>{if(action==='order_update')throw Error('temporary_failure');return {orders:[]}});
 f.rows=[{id:'a',status:'created'}];const button={disabled:false,textContent:'CONFIRMAR PEDIDO'};
 const ok=await f.controller.confirmOrder('a',button);
 assert.equal(ok,false);assert.equal(button.textContent,'CONFIRMAR PEDIDO');assert.equal(button.disabled,false);
}
{
 const requests=[],f=fixture(async(action,params,options)=>{requests.push([action,params,options&&JSON.parse(options.body)]);return action==='order_update'?{ok:true}:{orders:[{id:'a',status:'confirmed'}]}});
 f.rows=[{id:'a',status:'created'}];const button={disabled:false,textContent:'CONFIRMAR PEDIDO'};
 assert.equal(await f.controller.confirmOrder('a',button),true);
 assert.equal(JSON.stringify(requests[0]),JSON.stringify(['order_update',{}, {id:'a',status:'confirmed',operator:'Operação'}]));
 assert.deepEqual(f.rows,[{id:'a',status:'confirmed'}]);assert.equal(button.textContent,'CONFIRMADO');
}
{
 let calls=0;const f=fixture(async()=>{calls++;return {orders:[]}},undefined,()=>true);
 f.rows=[{id:'a',status:'created'}];
 assert.equal(await f.controller.confirmOrder('a'),false);assert.equal(calls,0);
}
console.log('Admin order list and manual queue concurrency: PASS');
