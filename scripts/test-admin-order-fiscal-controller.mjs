import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{}};vm.createContext(context);
for(const file of ['session','fiscal-controller'])vm.runInContext(fs.readFileSync('vitrine/admin/orders/'+file+'.js','utf8'),context);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
function fixture(api){
 const session=context.window.DonaAntoniaAdminOrderSession.create({isOpen:()=>true});
 const show=id=>{session.begin(id);session.detail={order:{id,status:'ready'}};session.fiscal={can_issue:true}};show('a');
 const cache={},paints=[],opened=[],messages=[];
 const controller=context.window.DonaAntoniaAdminOrderFiscal.create({api,session,cache:()=>cache,
 ui:{query:()=>null,confirm:()=>true,toast:m=>messages.push(m),currentOperator:()=> 'Operação'},
 formatters:{esc:String,dateTime:String,money:String,errorMessage:String},orderView:{orderDisplayCode:o=>o.id},
 view:{paint:()=>paints.push(session.detail.order.id),open:id=>opened.push(id),refreshList:async()=>{},currentTab:()=> 'orders',renderClosure:()=>{},openDanfe:()=>{}}});
 return {session,show,cache,paints,opened,messages,controller};
}
{
 const d=deferred(),calls=[];const f=fixture(async(action,params,options)=>{calls.push([action,JSON.parse(options.body)]);return d.promise});
 const pending=f.controller.recheckCurrentOrderFiscal();f.show('b');d.resolve({fiscal:{stage:'authorized',authorized:true}});await pending;
 assert.equal(f.session.fiscal.can_issue,true,'old reconciliation must not replace order B fiscal');
 assert.equal(f.cache.a.authorized,true);assert.deepEqual(f.paints,['a']);
}
{
 const waits=[];const f=fixture(()=>{const d=deferred();waits.push(d);return d.promise});
 const first=f.controller.loadCurrentOrderFiscal(),last=f.controller.loadCurrentOrderFiscal();
 waits[1].resolve({stage:'authorized'});await last;waits[0].resolve({stage:'blocked'});await first;
 assert.equal(f.session.fiscal.stage,'authorized');assert.equal(f.cache.a.stage,'authorized');
}
{
 const d=deferred(),calls=[];const f=fixture(async(action,params,options)=>{const payload=JSON.parse(options.body);calls.push([action,payload]);if(action==='order_fiscal_issue_v4')return d.promise;return {stage:'authorized',authorized:true}});
 const first=f.controller.executeCurrentOrderFiscalCanary(),duplicate=f.controller.executeCurrentOrderFiscalCanary();
 assert.equal(calls.length,1,'duplicate issue must not send another mutation');
 f.show('b');d.resolve({fiscal:{stage:'authorized',authorized:true}});await Promise.all([first,duplicate]);
 assert.equal(f.session.detail.order.id,'b');assert.equal(f.session.fiscal.can_issue,true);
 assert.ok(calls.every(([,body])=>body.id==='a'),'refresh after issue must query original order');
 assert.equal(calls[0][1].confirmation,'EMITIR_NFE');
}
{
 const d=deferred();const f=fixture(async action=>action==='order_dispatch_start_v4'?d.promise:{});f.session.fiscal={authorized:true};
 const pending=f.controller.startCurrentOrderDispatchV4();f.show('b');d.resolve({ok:true});await pending;
 assert.deepEqual(f.opened,[],'old dispatch completion must not reopen its order over B');
}
{
 const d=deferred(),f=fixture(()=>d.promise);const pending=f.controller.loadCurrentOrderBlingPreview();
 f.show('b');d.resolve({write_eligible:true});await pending;
 assert.equal(f.session.preview,null);assert.deepEqual(f.paints,[]);
}
console.log('Admin order fiscal isolation and duplicate mutations: PASS');
