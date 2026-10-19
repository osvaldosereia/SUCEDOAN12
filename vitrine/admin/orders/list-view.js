// Order board tabs, rendering and action binding. Domain behavior stays in injected controllers.
(function(global){
  const ORDER_STATUS_TABS=Object.freeze([
    Object.freeze({key:'new',label:'Novo'}),
    Object.freeze({key:'separate',label:'Separar agora'}),
    Object.freeze({key:'ready',label:'Pronto para entrega'}),
    Object.freeze({key:'delivered',label:'Entregue'})
  ]);
  function create({query,document,getOrders,listState,escapeHtml,statusKey,searchMatch,statusMatch,renderRow,actions,loadOrders}){
    const esc=escapeHtml;
    function statusTabCounts(){
      const orders=getOrders(),counts=Object.fromEntries(ORDER_STATUS_TABS.map(tab=>[tab.key,0]));
      counts.all=orders.length;
      orders.forEach(order=>{const key=statusKey(order);if(Object.prototype.hasOwnProperty.call(counts,key))counts[key]++});
      return counts;
    }
    function statusTabsHtml(extraClass=''){
      const counts=statusTabCounts(),active=listState.orderStatusTab||'new';
      return '<div class="orders-status-tabs '+esc(extraClass)+'" role="tablist" aria-label="Filtrar pedidos por status">'+ORDER_STATUS_TABS.map(tab=>'<button type="button" class="orders-status-tab'+(active===tab.key?' active':'')+'" data-order-status-tab="'+esc(tab.key)+'" role="tab" aria-selected="'+(active===tab.key?'true':'false')+'">'+esc(tab.label)+' <span class="count">'+Number(counts[tab.key]||0)+'</span></button>').join('')+'</div>';
    }
    function bindStatusTabs(){
      document.querySelectorAll('[data-order-status-tab]').forEach(button=>button.onclick=async()=>{
        listState.orderStatusTab=button.dataset.orderStatusTab||'new';
        paintRows();
      });
    }
    function bindOrderActions(host){
      const bind=(selector,handler)=>host.querySelectorAll(selector).forEach(button=>button.onclick=()=>handler(button));
      bind('[data-open-order]',button=>actions.openOrder(button.dataset.openOrder));
      bind('[data-order-chat]',button=>actions.openOrderChat(button.dataset.orderChat,button));
      bind('[data-copy-separation]',button=>actions.copySeparation(button.dataset.copySeparation,button));
      bind('[data-v3-confirm]',button=>actions.confirmOrder(button.dataset.v3Confirm,button));
      bind('[data-v3-separate],[data-v3-separation]',button=>actions.separate(button.dataset.v3Separate||button.dataset.v3Separation));
      bind('[data-v3-dispatch]',button=>actions.dispatch(button.dataset.v3Dispatch,button));
      bind('[data-v3-deliver]',button=>actions.deliver(button.dataset.v3Deliver));
      bind('[data-v3-delivery-fail]',button=>actions.deliveryFail(button.dataset.v3DeliveryFail));
    }
    function emptyMessage(){
      return String(listState.orderQuery||'').trim()
        ?'Nenhum pedido encontrado na busca.'
        :'Nenhum pedido nesta etapa.';
    }
    function paintRows(){
      const host=query('#orderRows');if(!host)return;
      const searching=Boolean(String(listState.orderQuery||'').trim());
      const rows=getOrders().filter(order=>searchMatch(order,listState.orderQuery)&&(searching||statusMatch(order,listState.orderStatusTab||'new')))
        .sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
      host.innerHTML=rows.length?rows.map(renderRow).join(''):'<div class="empty">'+emptyMessage()+'</div>';
      const top=query('#orderStatusTabsTop'),mobile=query('#orderStatusTabsMobile');
      if(top)top.innerHTML=statusTabsHtml('orders-status-desktop');
      if(mobile)mobile.innerHTML=statusTabsHtml('orders-status-mobile');
      bindStatusTabs();
      bindOrderActions(host);
    }
    async function renderOrders(){
      const content=query('#content');
      document.body.classList.add('orders-tab-active');
      content.innerHTML='<div class="page-head"><div><h1>Pedidos</h1><p>Acompanhe os pedidos do início à entrega.</p></div></div><div id="orderStatusTabsTop">'+statusTabsHtml('orders-status-desktop')+'</div><div class="toolbar"><input id="orderSearch" type="search" placeholder="Buscar pedido, cliente, telefone ou endereço…" value="'+esc(listState.orderQuery||'')+'"></div><div id="orderRows" class="orders-v3-list"><div class="loading">Carregando pedidos…</div></div><div id="orderStatusTabsMobile">'+statusTabsHtml('orders-status-mobile')+'</div>';
      bindStatusTabs();
      const search=query('#orderSearch');
      search.oninput=event=>{listState.orderQuery=event.target.value;paintRows()};
      await loadOrders();
    }
    return Object.freeze({statusTabCounts,statusTabsHtml,bindStatusTabs,bindOrderActions,paintRows,renderOrders});
  }
  global.DonaAntoniaAdminOrderListView=Object.freeze({create});
})(window);
