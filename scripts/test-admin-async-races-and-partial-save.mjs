import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('vitrine/admin/admin-runtime.js','utf8');

const part=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'section missing '+a);return html.slice(i,j)};
const deferred=()=>{let resolve;const promise=new Promise(ok=>resolve=ok);return {promise,resolve}};
// Customer list and modal races are now exercised via the public controller factory.
{
 const host={innerHTML:''},state={tab:'purchases',purchaseFilter:{period:'this_month'},purchaseAdvancedOpen:false,purchaseAdvancedLoaded:false,purchaseAdvancedLoading:false};
 const waits=[],paint=[];const api=action=>{if(action==='bling_received_review_status')return Promise.resolve({ok:true});assert.equal(action,'summary');const d=deferred();waits.push(d);return d.promise};
 const loadPurchases=new Function('state','$','purchaseCustomRangeReady','esc','purchasePeriodLabel','purchaseFilterPayload','purchaseApi','paintBlingReceivedReview','paintPurchases','queueMicrotask','let purchaseBlingCompareGeneration=0;\n'+part('  let purchasesLoadGeneration=0;','  async function loadPurchaseAdvanced')+';return loadPurchases')(state,x=>x==='#purchaseBody'?host:null,()=>true,x=>x,()=>'',()=>({period:'this_month'}),api,()=>paint.push('review'),()=>paint.push('list'),queueMicrotask);
 const old=loadPurchases(),now=loadPurchases();
 waits[1].resolve({documents:[{id:'now'}]});await now;
 waits[0].resolve({documents:[{id:'old'}]});await old;
 assert.equal(state.purchaseXml.documents[0].id,'now');
 const before=paint.length,later=loadPurchases();state.tab='customers';
 waits[2].resolve({documents:[{id:'wrong'}]});await later;
 assert.equal(state.purchaseXml.documents[0].id,'now');assert.equal(paint.length,before);
}
{
 const start=html.indexOf('  async function saveProduct('),end=html.indexOf('\n  }\n',start);assert.ok(start>=0&&end>start);
 const nodes={'#productForm':{dataset:{fiscalOriginal:'{}'}},'#saveProduct':{disabled:false,textContent:'Salvar produto'},'#editor':{closed:false,close(){this.closed=true}},'#productSearch':{value:''}};
 const calls=[],messages=[];let renders=0;
 const api=async action=>{calls.push(action);if(action==='product_save')return {product_id:'created',product:{stock_quantity:0}};if(action==='offer_save')throw Error('offer_failed');throw Error('Unexpected '+action)};
 const save=new Function('FormData','state','$','productFiscalDraft','requireOperator','api','document','centsFromInput','toast','errorMessage','renderProducts','renderExpirations','fmtQty',html.slice(start,end+5)+';return saveProduct')(
   class {get(k){return k==='stock'?'0':k==='offer_active'?'on':null}},
   {tab:'products'},x=>nodes[x],()=>({}),()=> 'Operação',api,{querySelector:()=>({})},()=>0,x=>messages.push(x),String,()=>renders++,()=>{},String);
 await save(null);
 assert.deepEqual(calls,['product_save','offer_save']);
 assert.equal(nodes['#editor'].closed,true);assert.equal(renders,1);
 assert.ok(messages[0].includes('Produto salvo, mas a atualização de oferta NÃO foi concluída.'));
}


// Order list/detail/fiscal races are covered through their actual factories:
// test-admin-order-{list,detail,fiscal}-controller.mjs and order-session.mjs.

{
 const scenarios=[
  ['previewCurrentOrderBling','  async function createCurrentOrderCustomerInBling(','bling_preview_order_sync'],
  ['resolveCurrentOrderBlingDependencies','  async function completeCurrentOrderCustomerDocument(','bling_reconcile_order_dependencies_readonly']
 ];
 for(const [name,next,action] of scenarios){
  const session={detail:{order:{id:'old'}},preview:null};
  const button={disabled:false,textContent:''};let finish,paints=0;
  const api=called=>{assert.equal(called,action);return new Promise(resolve=>finish=resolve)};
  const fn=new Function('orderSession','api',String.fromCharCode(36),'paintOrderDetail','toast','blingPreflightOperationalBlockers',
    part('  async function '+name+'(',next)+';return '+name)(session,api,()=>button,()=>paints++,()=>{},()=>[]);
  const pending=fn();
  session.detail={order:{id:'new'}};
  finish({preview:{id:'old'},write_eligible:true});
  await pending;
  assert.equal(session.preview,null);
  assert.equal(paints,0);
 }
}
{
 const session={detail:{order:{id:'old'}}};let finish,paints=0,refreshes=0;
 const api=action=>new Promise(resolve=>{if(action==='history_sync_retry')resolve({ok:true});else if(action==='order')finish=resolve;else throw Error(action)});
 const fn=new Function('orderSession','api',String.fromCharCode(36),'paintOrderDetail','loadOrders','toast',
  part('  async function retryHistorySync(','  const renderOrderActionButtons')+';return retryHistorySync')(
    session,api,()=>({disabled:false,textContent:''}),()=>paints++,()=>refreshes++,()=>{});
 const pending=fn();await Promise.resolve();
 session.detail={order:{id:'new'}};
 finish({order:{id:'old'}});await pending;
 assert.equal(session.detail.order.id,'new');
 assert.equal(paints,0);assert.equal(refreshes,0);
}

{
 const state={componentReplacement:{component_id:'part-1'}},host={innerHTML:'',querySelectorAll:()=>[]},input={value:'first'},pending=new Map();
 const api=(_,{q})=>{const d=deferred();pending.set(q,d);return d.promise};
 const fn=new Function('state','$','api','esc','fmtQty','replaceComponentWithProduct',
  part('  let componentReplacementSearchGeneration=0;','  async function replaceComponentWithProduct')+';return searchComponentReplacement')(
  state,k=>k==='#componentReplacementSearch'?input:k==='#componentReplacementResults'?host:null,api,String,String,()=>{});
 const old=fn();input.value='second';const latest=fn();
 pending.get('second').resolve({products:[{id:'2',name:'Second',stock_quantity:2}]});await latest;
 const result=host.innerHTML;
 pending.get('first').resolve({products:[{id:'1',name:'First',stock_quantity:2}]});await old;
 assert.equal(host.innerHTML,result);assert.ok(result.includes('Second'));assert.ok(!result.includes('First'));
}
{
 const state={tab:'purchases',purchaseAdvancedLoading:false,purchaseAdvancedLoaded:false,purchaseAdvancedError:''},host={innerHTML:''},d=deferred();let paints=0;
 const fn=new Function('state','purchaseApi','purchaseXmlError','$','paintPurchases',
  part('  let purchaseAdvancedGeneration=0;','  async function loadPurchaseBlingComparison')+';return loadPurchaseAdvanced')(
  state,()=>d.promise,String,k=>k==='#purchaseBody'?host:null,()=>paints++);
 const pending=fn();state.tab='customers';d.resolve({documents:[{id:'queue'}]});await pending;
 assert.equal(state.purchaseAdvancedLoaded,true);assert.equal(paints,0);
}

console.log('Admin async races and partial save: PASS');
