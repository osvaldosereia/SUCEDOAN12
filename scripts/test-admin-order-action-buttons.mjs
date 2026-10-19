import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {adminDomFixture} from './helpers/admin-dom-fixture.mjs';
const context={window:{}};vm.createContext(context);
for(const name of ['session','detail-view','fiscal-controller'])vm.runInContext(fs.readFileSync('vitrine/admin/orders/'+name+'.js','utf8'),context);
const dom=adminDomFixture(),query=dom.query;query('#editor').showModal();query('#editorTitle').textContent='Pedido';
const session=context.window.DonaAntoniaAdminOrderSession.create({isOpen:()=>query('#editor').open&&query('#editorTitle').textContent==='Pedido'});
const calls=[];const actions=new Proxy({}, {get:(_,name)=> (...args)=>{calls.push([name,...args]);return Promise.resolve()}});
const fiscal=context.window.DonaAntoniaAdminOrderFiscal.create({api:()=>assert.fail('render must not call backend'),session,cache:()=>({}),ui:{query,confirm:()=>false,toast(){},currentOperator:()=> 'Operação'},formatters:{esc:String,dateTime:String,errorMessage:String},orderView:{orderDisplayCode:o=>o.id},view:{paint(){},refreshList(){},open(){},openDanfe(){}}});
const view=context.window.DonaAntoniaAdminOrderDetailView.create({session,query,formatters:{esc:String,fmtQty:String,money:String,dateTime:String,formatPhone:String},
 model:{orderV3Milestones:o=>({confirmed:o.status!=='created',delivered:o.status==='delivered',cancelled:o.status==='cancelled'}),orderCustomerDataPending:()=>false,orderCustomerDataPendingReasons:()=>[],orderV3Tags:()=>'',orderV3PaymentOptions:()=>'',orderDisplayCode:o=>o.id,separationMoney:String,publicOrderUrlFor:()=>''},
 fiscal,actions});
function render(status,fiscal={authorized:true,danfe_available:true}){session.begin('a');session.detail={order:{id:'a',status,total_cents:1200},items:[]};session.fiscal=fiscal;view.paintOrderDetail()}
render('ready',{can_issue:true});assert.ok(query('#executeFiscalCanary'));assert.equal(query('#startDispatchV4'),null);assert.equal(query('#printDanfe'),null);
render('ready');assert.equal(query('#deliverOrderV3'),null,'ready order must not allow delivery before dispatch');assert.ok(query('#printDanfe'));
render('out_for_delivery');assert.ok(query('#deliverOrderV3'));await query('#deliverOrderV3').onclick();assert.equal(calls.at(-1)[0],'openOrderDeliveryConfirm');assert.equal(calls.at(-1)[1],'a');
render('delivered');assert.equal(query('#saveOrder'),null);assert.equal(query('#cancelOrderV3'),null);
render('created');assert.ok(query('#confirmOrderV3'));assert.equal(query('#printDanfe'),null);
query('#editorTitle').textContent='Produto';query('#editorBody').innerHTML='Product';view.paintOrderDetail();assert.equal(query('#editorBody').innerHTML,'Product');
console.log('Admin order detail view operational controls and modal ownership: PASS');
