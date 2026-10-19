import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {adminDomFixture} from './helpers/admin-dom-fixture.mjs';
const context={window:{}};vm.createContext(context);
for(const file of ['session','detail-controller'])vm.runInContext(fs.readFileSync('vitrine/admin/orders/'+file+'.js','utf8'),context);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function fixture(api){
 const dom=adminDomFixture();
 const q=dom.query;const editor=q('#editor');q('#editorTitle').textContent='Pedido';editor.showModal();
 const session=context.window.DonaAntoniaAdminOrderSession.create({isOpen:()=>editor.open&&q('#editorTitle').textContent==='Pedido'});
 session.begin('a');session.detail={order:{id:'a',status:'created'}};
 const paints=[],messages=[],refreshes=[];
 const controller=context.window.DonaAntoniaAdminOrderDetail.create({api,session,ui:{query:q,toast:m=>messages.push(m),confirm:()=>true,prompt:()=> '1',currentOperator:()=> 'Operação'},
 errorMessage:String,view:{paint:()=>paints.push(session.detail.order.id),refreshList:async()=>refreshes.push('list'),loadFiscal:async()=>{}},editablePayload:status=>({id:session.detail.order.id,payment_method:'pix',status})});
 return {...dom,session,controller,paints,messages,refreshes};
}
{
 const waits=new Map();const f=fixture((_,{id})=>{const d=deferred();waits.set(id,d);return d.promise});
 const old=f.controller.openOrder('old'),fresh=f.controller.openOrder('fresh');
 waits.get('fresh').resolve({order:{id:'fresh',status:'created'}});await fresh;
 waits.get('old').resolve({order:{id:'old',status:'created'}});await old;
 assert.equal(f.session.detail.order.id,'fresh');assert.deepEqual(f.paints,['fresh']);
 const pending=f.controller.openOrder('closed');f.query('#editor').close();waits.get('closed').resolve({order:{id:'closed',status:'created'}});await pending;
 assert.equal(f.session.detail,null);assert.deepEqual(f.paints,['fresh']);
}
{
 const d=deferred(),calls=[];const f=fixture(async(action,params,options)=>{calls.push([action,options&&JSON.parse(options.body)]);if(action==='order_update')return d.promise;return {order:{id:params.id,status:'created'}}});
 const first=f.controller.saveOrderV3(),duplicate=f.controller.saveOrderV3();
 assert.equal(calls.length,1);
 f.session.begin('b');f.session.detail={order:{id:'b',status:'created'}};
 d.resolve({ok:true});await Promise.all([first,duplicate]);
 assert.equal(f.session.detail.order.id,'b');assert.deepEqual(f.paints,[]);
 assert.deepEqual(f.refreshes,['list']);assert.equal(calls[0][1].id,'a');assert.equal(calls[0][1].operator,'Operação');
}
{
 const d=deferred(),payloads=[],f=fixture(async(action,params,options)=>{if(action==='order_update'){payloads.push(JSON.parse(options.body));return d.promise}return {}});
 const pending=f.controller.cancelCurrentOrder();assert.equal(payloads[0].status,'cancelled');assert.equal(payloads[0].cancellation_reason,'Cliente desistiu');
 f.query('#editorTitle').textContent='Produto';f.query('#editorBody').innerHTML='Product editor';d.resolve({ok:true});await pending;
 assert.equal(f.query('#editorBody').innerHTML,'Product editor');assert.deepEqual(f.paints,[]);
}
console.log('Admin order detail and editing ownership: PASS');
