import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

const part=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,'section missing '+a);return html.slice(i,j)};
const deferred=()=>{let resolve;const promise=new Promise(ok=>resolve=ok);return {promise,resolve}};
{
 const editor={open:false,showModal(){this.open=true},close(){this.open=false}};
 const dom={'#editor':editor,'#editorTitle':{textContent:''},'#editorBody':{innerHTML:''},'#editorActions':{innerHTML:''},'#cancelEditor':{}};
 const pending=new Map(),state={currentOrder:null,currentOrderFiscal:null};let paints=0;
 const api=(action,{id})=>{assert.equal(action,'order');const d=deferred();pending.set(id,d);return d.promise};
 const {openOrder}=new Function('state','api','$','paintOrderDetail','loadCurrentOrderFiscal',part('  let orderDetailLoadGeneration=0;','  function orderV3SeparationMap')+';return {openOrder}')(state,api,x=>dom[x],()=>paints++,async()=>{});
 const first=openOrder('first'),second=openOrder('second');
 pending.get('second').resolve({order:{id:'second',status:'created'}});await second;
 pending.get('first').resolve({order:{id:'first',status:'created'}});await first;
 assert.equal(state.currentOrder.order.id,'second');assert.equal(paints,1);
 const closed=openOrder('closed');editor.close();pending.get('closed').resolve({order:{id:'closed',status:'created'}});await closed;
 assert.equal(state.currentOrder.order.id,'second');assert.equal(paints,1);
}
{
 const host={innerHTML:'',querySelectorAll:()=>[]},state={tab:'customers',customers:[]},pending=new Map();
 const api=(_,{q})=>{const d=deferred();pending.set(q,d);return d.promise};
 const loadCustomers=new Function('state','customerApi','$','customerRow',part('  let customersLoadGeneration=0;','  function customerRow')+';return loadCustomers')(state,api,x=>x==='#customerRows'?host:null,x=>x.name);
 const one=loadCustomers('older'),two=loadCustomers('newer');
 pending.get('newer').resolve({customers:[{name:'newer'}]});await two;
 pending.get('older').resolve({customers:[{name:'older'}]});await one;
 assert.equal(state.customers[0].name,'newer');assert.equal(host.innerHTML,'newer');
}
{
 const host={innerHTML:''},state={tab:'purchases',purchaseFilter:{period:'this_month'},purchaseAdvancedOpen:false,purchaseAdvancedLoaded:false,purchaseAdvancedLoading:false};
 const waits=[],paint=[];const api=action=>{if(action==='bling_received_review_status')return Promise.resolve({ok:true});assert.equal(action,'summary');const d=deferred();waits.push(d);return d.promise};
 const loadPurchases=new Function('state','$','purchaseCustomRangeReady','esc','purchasePeriodLabel','purchaseFilterPayload','purchaseApi','paintBlingReceivedReview','paintPurchases','queueMicrotask',part('  let purchasesLoadGeneration=0;','  async function loadPurchaseAdvanced')+';return loadPurchases')(state,x=>x==='#purchaseBody'?host:null,()=>true,x=>x,()=>'',()=>({period:'this_month'}),api,()=>paint.push('review'),()=>paint.push('list'),queueMicrotask);
 const old=loadPurchases(),now=loadPurchases();
 waits[1].resolve({documents:[{id:'now'}]});await now;
 waits[0].resolve({documents:[{id:'old'}]});await old;
 assert.equal(state.purchaseXml.documents[0].id,'now');
 const before=paint.length,later=loadPurchases();state.tab='customers';
 waits[2].resolve({documents:[{id:'wrong'}]});await later;
 assert.equal(state.purchaseXml.documents[0].id,'now');assert.equal(paint.length,before);
}
{
 const state={currentOrder:{order:{id:'old'}},currentOrderFiscal:null,currentOrderBlingPreview:null,fiscalByOrder:{}};
 let finishFiscal,finishPreview,paints=0;
 const api=action=>new Promise(resolve=>{if(action==='order_fiscal_status')finishFiscal=resolve;else if(action==='bling_preview_order_sync')finishPreview=resolve;else throw Error(action)});
 const loadFiscal=new Function('state','api','paintOrderDetail',part('  async function loadCurrentOrderFiscal(','  async function confirmCurrentOrderPayment')+';return loadCurrentOrderFiscal')(state,api,()=>paints++);
 const loadPreview=new Function('state','api','$','paintOrderDetail',part('  async function loadCurrentOrderBlingPreview(','  function fiscalBlockReasonLabel')+';return loadCurrentOrderBlingPreview')(state,api,()=>({open:true}),()=>paints++);
 const a=loadFiscal(),b=loadPreview();state.currentOrder={order:{id:'new'}};
 finishFiscal({ok:true});finishPreview({ok:true});await Promise.all([a,b]);
 assert.equal(state.currentOrderFiscal,null);assert.equal(state.currentOrderBlingPreview,null);assert.equal(state.fiscalByOrder.old.ok,true);assert.equal(paints,0);
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


// Orders are also refreshed from the driver/expedition tab; their shared state
// must update without attempting to repaint a non-existent orders table.
{
 const state={tab:'driver',orders:[]},host={innerHTML:''};
 let painted=0,queue=0;
 const api=async()=>({orders:[{id:'driver-order',status:'confirmed'}]});
 const loadOrders=new Function('state','$','api','loadManualPickQueue','paintOrderRows','loadFiscalForOrders',
  part('  let ordersLoadGeneration=0;','  async function refreshOrderSeparationBoard')+';return loadOrders')(
    state,()=>null,api,async()=>queue++,()=>painted++,async()=>{});
 await loadOrders();
 assert.equal(state.orders[0].id,'driver-order');
 assert.equal(queue,1);
 assert.equal(painted,0);
}
// Two overlapping order-list refreshes must not restore an older dataset.
{
 const state={tab:'orders',orders:[]},host={innerHTML:'',querySelectorAll:()=>[]};
 const pending=[];let paints=0;
 const api=()=>{const d=deferred();pending.push(d);return d.promise};
 const loadOrders=new Function('state','$','api','loadManualPickQueue','paintOrderRows','loadFiscalForOrders',
  part('  let ordersLoadGeneration=0;','  async function refreshOrderSeparationBoard')+';return loadOrders')(
    state,k=>k==='#orderRows'?host:null,api,async()=>{},()=>paints++,async()=>{});
 const old=loadOrders(),fresh=loadOrders();
 pending[1].resolve({orders:[{id:'fresh',status:'confirmed'}]});await fresh;
 pending[0].resolve({orders:[{id:'old',status:'confirmed'}]});await old;
 assert.equal(state.orders[0].id,'fresh');
 assert.equal(paints,1);
}


{
 const scenarios=[
  ['previewCurrentOrderBling','  async function createCurrentOrderCustomerInBling(','bling_preview_order_sync'],
  ['resolveCurrentOrderBlingDependencies','  async function completeCurrentOrderCustomerDocument(','bling_reconcile_order_dependencies_readonly']
 ];
 for(const [name,next,action] of scenarios){
  const state={currentOrder:{order:{id:'old'}},currentOrderBlingPreview:null};
  const button={disabled:false,textContent:''};let finish,paints=0;
  const api=called=>{assert.equal(called,action);return new Promise(resolve=>finish=resolve)};
  const fn=new Function('state','api',String.fromCharCode(36),'paintOrderDetail','toast','blingPreflightOperationalBlockers',
    part('  async function '+name+'(',next)+';return '+name)(state,api,()=>button,()=>paints++,()=>{},()=>[]);
  const pending=fn();
  state.currentOrder={order:{id:'new'}};
  finish({preview:{id:'old'},write_eligible:true});
  await pending;
  assert.equal(state.currentOrderBlingPreview,null);
  assert.equal(paints,0);
 }
}
{
 const state={currentOrder:{order:{id:'old'}}};let finish,paints=0,refreshes=0;
 const api=action=>new Promise(resolve=>{if(action==='history_sync_retry')resolve({ok:true});else if(action==='order')finish=resolve;else throw Error(action)});
 const fn=new Function('state','api',String.fromCharCode(36),'paintOrderDetail','loadOrders','toast',
  part('  async function retryHistorySync(','  const renderOrderActionButtons')+';return retryHistorySync')(
    state,api,()=>({disabled:false,textContent:''}),()=>paints++,()=>refreshes++,()=>{});
 const pending=fn();await Promise.resolve();
 state.currentOrder={order:{id:'new'}};
 finish({order:{id:'old'}});await pending;
 assert.equal(state.currentOrder.order.id,'new');
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
{
 const state={tab:'orders',orders:[{id:'a',status:'confirmed'}],orderStatusTab:'all'},d=deferred(),document={hidden:false};let paints=0;
 const src=part('  let ordersLoadGeneration=0;','  if(!window.__orderSeparationBoardTimer)');
 const {refreshOrderSeparationBoard,reload}=new Function('state','api','$','document','loadManualPickQueue','paintOrderRows','loadFiscalForOrders',
  src+';return {refreshOrderSeparationBoard,reload:()=>++ordersLoadGeneration}')(
  state,()=>d.promise,()=>null,document,async()=>{},()=>paints++,async()=>{});
 const pending=refreshOrderSeparationBoard();reload();
 d.resolve({board:[{order_id:'a',status:'ready'}]});await pending;
 assert.equal(state.orders[0].status,'confirmed');assert.equal(paints,0);
}

console.log('Admin async races and partial save: PASS');
