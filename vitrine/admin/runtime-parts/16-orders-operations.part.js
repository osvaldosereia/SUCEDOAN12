  let orderView=null,orderCardView=null;
  function paintOrderRows(){return orderView?.paintRows()}
  function renderOrders(){return orderView?.renderOrders()}
  const orderList=window.DonaAntoniaAdminOrderList.create({
    api,queueRequest:manualQueueRequest,
    orders:{get:()=>state.orders,set:value=>{state.orders=value},loadFiscal:loadFiscalForOrders,isCustomerPending:orderCustomerDataPending},
    navigation:{currentTab:()=>state.tab},ui:{query:$,document,toast,errorMessage,currentOperator},view:{paint:paintOrderRows}
  });
  function orderCardPhone(o){return formatPhone(o?.whatsapp_phone_e164||o?.delivery_address_snapshot?.phone||'')||'Telefone não informado'}
  function orderSeparationUrlFor(id){const url=new URL('/vitrine/admin/',location.origin);url.searchParams.set('separacao',String(id||''));return url.toString()}
  async function copyOrderSeparationLink(id,btn){const url=orderSeparationUrlFor(id);try{await navigator.clipboard.writeText(url)}catch{const input=document.createElement('textarea');input.value=url;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();document.execCommand('copy');input.remove()}toast('Link da vitrine de separação copiado');if(btn){btn.textContent='LINK COPIADO';setTimeout(()=>{if(document.contains(btn))btn.textContent='COPIAR LINK SEPARAÇÃO'},1800)}}
  function orderRow(o){return orderCardView?.render(o)||''}

  function orderStatusTabKey(o){
    const m=orderV3Milestones(o),sep=orderSeparationSummary(o),assigned=Boolean(sep?.assignment?.separator_key);
    if(m.cancelled)return 'cancelled';
    if(m.delivered)return 'delivered';
    if(o?.status==='out_for_delivery')return 'delivery';
    if(m.separated)return 'separated';
    if(assigned&&m.confirmed)return 'separating';
    if(m.confirmed)return 'confirmed';
    return 'received';
  }
  function orderStatusTabMatch(o,key=orderList.state.orderStatusTab||'manual'){
    if(key==='manual'){
      const m=orderV3Milestones(o);
      return orderList.state.manualQueueIds.has(String(o.id))&&m.confirmed&&!m.separated&&!m.delivered&&!m.cancelled&&o.status!=='out_for_delivery';
    }
    return key==='all'||orderStatusTabKey(o)===key;
  }
  orderCardView=window.DonaAntoniaAdminOrderCardView.create({
    escapeHtml:esc,money,dateTime,orderDisplayCode,separationMoney,orderCardPhone,
    cardModel:window.DonaAntoniaAdminOrderCardModel,customerReadiness:window.DonaAntoniaAdminCustomerReadiness,
    listState:orderList.state,statusKey:orderStatusTabKey,fiscalByOrder:id=>state.fiscalByOrder[id]
  });
  orderView=window.DonaAntoniaAdminOrderListView.create({
    query:$,document,getOrders:()=>state.orders,listState:orderList.state,escapeHtml:esc,
    statusKey:orderStatusTabKey,searchMatch:orderV3SearchMatch,statusMatch:orderStatusTabMatch,renderRow:orderRow,
    loadManualQueue:loadManualPickQueue,loadOrders,
    actions:{
      openOrder,openOrderChat:openOrderChatSheet,manualQueue:setManualPickQueue,copySeparation:copyOrderSeparationLink,
      confirmOrder:quickConfirmOrder,separate:openOrderSeparationSheet,dispatch:startOrderDispatchV4,
      deliver:openOrderDeliveryConfirm,deliveryFail:id=>returnOrderToExpedition(id,false)
    }
  });
  async function manualQueueRequest(action,orderId=null){
    const token=await adminStepUp();
    const res=await fetch(BASKET_AUTO_RPC+'manual_pick_queue_action_v1',{
      method:'POST',headers:{'Content-Type':'application/json','apikey':FINANCE_PUBLIC_KEY,'Authorization':'Bearer '+token},
      body:JSON.stringify({p_action:action,p_order_id:orderId}),cache:'no-store'
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!Array.isArray(data.order_ids))throw new Error(data.message||data.error||'manual_queue_unavailable');
    return data;
  }
  function loadManualPickQueue(){return orderList.loadManualPickQueue()}
  function setManualPickQueue(orderId,enable,button){return orderList.setManualPickQueue(orderId,enable,button)}
  function loadOrders(){return orderList.loadOrders()}
  function refreshOrderSeparationBoard(){return orderList.refreshOrderSeparationBoard()}
  if(!window.__orderSeparationBoardTimer)window.__orderSeparationBoardTimer=setInterval(refreshOrderSeparationBoard,5000);
  if(!window.__orderSeparationBoardVisibilityBound){window.__orderSeparationBoardVisibilityBound=true;document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.tab==='orders')refreshOrderSeparationBoard()})}
  // O painel preserva a página e reusa integralmente o Atendimento existente.
  let orderChatOpener=null,orderChatClosingTimer=null,orderChatPreviousOverflow='';
  function closeOrderChatSheet(){
    const sheet=$('#orderChatSheet'),overlay=$('#orderChatOverlay');
    if(!sheet||sheet.hidden)return;
    sheet.classList.remove('open');overlay.classList.remove('open');
    document.documentElement.style.overflow=orderChatPreviousOverflow;
    clearTimeout(orderChatClosingTimer);
    orderChatClosingTimer=setTimeout(()=>{if(sheet.classList.contains('open'))return;sheet.hidden=true;overlay.hidden=true;$('#orderChatFrame').removeAttribute('src');},240);
    if(orderChatOpener?.isConnected)orderChatOpener.focus({preventScroll:true});
    orderChatOpener=null;
  }
  function openOrderChatSheet(orderId,trigger){
    const order=state.orders.find(x=>String(x.id)===String(orderId));
    if(!order){toast('Pedido não localizado');return}
    const phone=String(order.whatsapp_phone_e164||order.delivery_address_snapshot?.phone||'').replace(/\D/g,'');
    if(![10,11,12,13].includes(phone.length)){toast('Este pedido não possui telefone válido para localizar a conversa');return}
    const params=new URLSearchParams({embedded:'order',phone,order:orderDisplayCode(order)});
    if(order.customer_id)params.set('customer_id',String(order.customer_id));
    const sheet=$('#orderChatSheet'),overlay=$('#orderChatOverlay'),frame=$('#orderChatFrame');
    clearTimeout(orderChatClosingTimer);
    orderChatOpener=trigger||null;
    $('#orderChatTitle').textContent='#'+orderDisplayCode(order)+' · '+(order.customer_name||'Cliente');
    $('#orderChatSubtitle').textContent='Conversa pelo WhatsApp · '+(orderCardPhone(order)||'');
    sheet.hidden=false;overlay.hidden=false;
    orderChatPreviousOverflow=document.documentElement.style.overflow;
    document.documentElement.style.overflow='hidden';
    // O iframe só é carregado após o clique, evitando consultas extras na fila de pedidos.
    frame.src='/vitrine/admin/atendimento/?'+params.toString();
    requestAnimationFrame(()=>{sheet.classList.add('open');overlay.classList.add('open');$('#orderChatClose').focus({preventScroll:true})});
  }
  $('#orderChatClose').onclick=closeOrderChatSheet;
  $('#orderChatOverlay').onclick=closeOrderChatSheet;
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#orderChatSheet').hidden){event.preventDefault();closeOrderChatSheet()}});
  async function startOrderDispatchV4(id,btn){
    const current=state.orders.find(o=>String(o.id)===String(id));
    if(!current||current.status!=='ready'){toast('Este pedido não está pronto para saída');return}
    const f=state.fiscalByOrder[id]||{};if(f.authorized!==true&&f.stage!=='authorized'){toast('A NF-e precisa estar autorizada antes da saída');return}
    if(!confirm('Confirmar que o pedido #'+orderDisplayCode(current)+' SAIU PARA ENTREGA?'))return;
    if(btn){btn.disabled=true;btn.textContent='REGISTRANDO SAÍDA…'}
    try{await api('order_dispatch_start_v4',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,operator:currentOperator()||'Expedição',idempotency_key:'dispatch-v4:'+id})});toast('Saída para entrega registrada');delete state.fiscalByOrder[id];await loadOrders();if(orderSession.detail?.order?.id===id)await openOrder(id)}catch(e){toast(errorMessage(e.message));if(btn){btn.disabled=false;btn.textContent='SAIU PARA ENTREGA'}}
  }
  function quickConfirmOrder(id,btn){return orderL