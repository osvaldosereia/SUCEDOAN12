import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context={window:{},Date,Number,Object,String,Boolean,Array,Math};
vm.createContext(context);
vm.runInContext(fs.readFileSync('vitrine/admin/orders/list-view.js','utf8'),context);

function button(dataset={}){return {dataset,onclick:null,disabled:false,textContent:'',focus(){}}}
function fixture(){
  const calls=[], tabs=['new','separate','ready','delivered'].map(orderStatusTab=>button({orderStatusTab}));
  const actions={
    openOrder:id=>calls.push(['open',id]),
    openOrderChat:(id,el)=>calls.push(['chat',id,el]),
    manualQueue:(id,enable,el)=>calls.push(['queue',id,enable,el]),
    copySeparation:(id,el)=>calls.push(['copy',id,el]),
    confirmOrder:(id,el)=>calls.push(['confirm',id,el]),
    separate:id=>calls.push(['separate',id]),
    dispatch:(id,el)=>calls.push(['dispatch',id,el]),
    deliver:id=>calls.push(['deliver',id]),
    deliveryFail:id=>calls.push(['delivery-fail',id])
  };
  const rowButtons={
    '[data-open-order]':[button({openOrder:'o1'})],
    '[data-order-chat]':[button({orderChat:'o1'})],
    '[data-manual-queue-add],[data-manual-queue-remove]':[button({manualQueueAdd:'o1'})],
    '[data-copy-separation]':[button({copySeparation:'o1'})],
    '[data-v3-confirm]':[button({v3Confirm:'o1'})],
    '[data-v3-separate],[data-v3-separation]':[button({v3Separation:'o1'})],
    '[data-v3-dispatch]':[button({v3Dispatch:'o1'})],
    '[data-v3-deliver]':[button({v3Deliver:'o1'})],
    '[data-v3-delivery-fail]':[button({v3DeliveryFail:'o1'})]
  };
  const host={innerHTML:'',querySelectorAll:selector=>rowButtons[selector]||[]};
  const content={innerHTML:''},search={oninput:null,value:'query'};
  const body={classList:{values:new Set(),add(x){this.values.add(x)}}};
  const document={body,querySelectorAll:selector=>selector==='[data-order-status-tab]'?tabs:[],contains:()=>true};
  const map={'#content':content,'#orderRows':host,'#orderSearch':search,'#orderStatusTabsTop':{innerHTML:''},'#orderStatusTabsMobile':{innerHTML:''}};
  let orders=[
    {id:'old',status:'confirmed',created_at:'2026-01-01',customer_name:'Ana'},
    {id:'new',status:'confirmed',created_at:'2026-01-03',customer_name:'Beto'},
    {id:'received',status:'created',created_at:'2026-01-02',customer_name:'Caio'},
    {id:'cancelled',status:'cancelled',created_at:'2026-01-04',customer_name:'Dora'}
  ];
  const listState={orderQuery:'',orderStatusTab:'new',manualQueueIds:new Set(),manualQueueError:false};
  let loadCalls=0,queueCalls=0;
  const view=context.window.DonaAntoniaAdminOrderListView.create({
    query:selector=>map[selector]||null,document,getOrders:()=>orders,listState,
    escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),
    statusKey:order=>({created:'new',confirmed:'separate',ready:'ready',out_for_delivery:'ready',delivered:'delivered',cancelled:'cancelled'}[order.status]||'new'),
    searchMatch:(order,query)=>!query||order.customer_name.toLowerCase().includes(query.toLowerCase()),
    statusMatch:(order,key)=>({new:['created'],separate:['confirmed','processing'],ready:['ready','out_for_delivery'],delivered:['delivered']})[key]?.includes(order.status)||false,
    renderRow:order=>`<article>${order.id}</article>`,actions,
    loadManualQueue:async()=>{queueCalls++;listState.manualQueueIds=new Set(['new'])},
    loadOrders:async()=>{loadCalls++}
  });
  return {view,calls,tabs,host,content,search,body,listState,get orders(){return orders},set orders(v){orders=v},get loadCalls(){return loadCalls},get queueCalls(){return queueCalls}};
}

{
  const f=fixture();
  const counts=f.view.statusTabCounts();
  assert.equal(counts.new,1);
  assert.equal(counts.separate,2);
  assert.equal(counts.ready,0);
  assert.equal(counts.delivered,0);
  assert.match(f.view.statusTabsHtml('desktop'),/aria-label="Filtrar pedidos por status"/);
  assert.equal((f.view.statusTabsHtml('desktop').match(/data-order-status-tab=/g)||[]).length,4);
  assert.match(f.view.statusTabsHtml('desktop'),/class="orders-status-tab active" data-order-status-tab="new"/);
  f.listState.orderStatusTab='separate';
  assert.match(f.view.statusTabsHtml('desktop'),/data-order-status-tab="separate" role="tab" aria-selected="true"/);
}

{
  const f=fixture();
  f.listState.orderQuery='do';
  f.listState.orderStatusTab='new';
  f.view.paintRows();
  assert.equal(f.host.innerHTML,'<article>cancelled</article>');
  f.listState.orderQuery='be';
  f.view.paintRows();
  assert.equal(f.host.innerHTML,'<article>new</article>');
  f.listState.orderQuery='';
  f.listState.orderStatusTab='new';
  f.view.paintRows();
  assert.equal(f.host.innerHTML,'<article>received</article>');
}

{
  const f=fixture();
  f.view.paintRows();
  const queueButton=f.host.querySelectorAll('[data-manual-queue-add],[data-manual-queue-remove]')[0];
  assert.equal(queueButton.onclick,null,'order board no longer binds manual queue actions');
  for(const selector of Object.keys({
    '[data-open-order]':1,'[data-order-chat]':1,
    '[data-copy-separation]':1,'[data-v3-confirm]':1,'[data-v3-separate],[data-v3-separation]':1,
    '[data-v3-dispatch]':1,'[data-v3-deliver]':1,'[data-v3-delivery-fail]':1
  })){
    const el=f.host.querySelectorAll(selector)[0];
    assert.equal(typeof el.onclick,'function',`${selector} is bound`);
    el.onclick();
  }
  assert.deepEqual(f.calls.map(call=>call[0]),['open','chat','copy','confirm','separate','dispatch','deliver','delivery-fail']);
  assert.deepEqual(f.calls[4],['separate','o1']);
}

{
  const f=fixture();
  f.view.bindStatusTabs();
  await f.tabs[0].onclick();
  assert.equal(f.listState.orderStatusTab,'new');
  assert.equal(f.queueCalls,0);
  assert.equal(f.host.innerHTML,'<article>received</article>');
}

{
  const f=fixture();
  await f.view.renderOrders();
  assert.equal(f.loadCalls,1);
  assert.equal(f.body.classList.values.has('orders-tab-active'),true);
  assert.match(f.content.innerHTML,/Acompanhe os pedidos/);
  assert.equal(typeof f.search.oninput,'function');
  f.listState.orderStatusTab='new';
  f.search.oninput({target:{value:'ca'}});
  assert.equal(f.listState.orderQuery,'ca');
  assert.equal(f.host.innerHTML,'<article>received</article>');
}

console.log('Admin order list view, filters, actions and loading: PASS');
