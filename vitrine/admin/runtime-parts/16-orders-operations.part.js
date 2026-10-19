  function orderCardPhone(o){return formatPhone(o?.whatsapp_phone_e164||o?.delivery_address_snapshot?.phone||'')||'Telefone não informado'}
  function orderSeparationUrlFor(id){const url=new URL('/vitrine/admin/',location.origin);url.searchParams.set('separacao',String(id||''));return url.toString()}
  async function copyOrderSeparationLink(id,btn){const url=orderSeparationUrlFor(id);try{await navigator.clipboard.writeText(url)}catch{const input=document.createElement('textarea');input.value=url;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();document.execCommand('copy');input.remove()}toast('Link da vitrine de separação copiado');if(btn){btn.textContent='LINK COPIADO';setTimeout(()=>{if(document.contains(btn))btn.textContent='COPIAR LINK SEPARAÇÃO'},1800)}}
  function orderRow(o){
    const m=orderV3Milestones(o),f=state.fiscalByOrder[o.id]||null,sep=orderSeparationSummary(o),assignment=sep.assignment||{},counts=sep.counts||{},assigned=Boolean(assignment.separator_key),separator=assignment.separator_label||separatorLabel(assignment.separator_key),separatedCount=Number(counts.separated||0),missingCount=Number(counts.missing||0),checked=separatedCount+missingCount,totalItems=Number(counts.total||0),pendingCount=Math.max(0,Number(counts.pending??(totalItems-checked))||0),missingValue=Number(sep.missing_subtotal||counts.missing_subtotal||0),progressPct=totalItems>0?Math.max(0,Math.min(100,Math.round((checked/totalItems)*100))):0;
    let stage='received',stageLabel='RECEBIDO';
    if(m.cancelled){stage='cancelled';stageLabel='CANCELADO'}
    else if(m.delivered){stage='done';stageLabel='ENTREGUE'}
    else if(o.status==='out_for_delivery'){stage='delivery';stageLabel='SAIU PARA ENTREGA'}
    else if(m.separated){stage='separated';stageLabel='PEDIDO JÁ SEPARADO'}
    else if(assigned&&m.confirmed){stage='separating';stageLabel='EM SEPARAÇÃO · '+separator.toUpperCase()}
    else if(m.confirmed){stage='waiting';stageLabel='AGUARDANDO SEPARAÇÃO'}
    const cardClass=['waiting','separating','separated','delivery','done'].includes(stage)?' '+stage:'';
    let progress='';
    if(m.confirmed&&totalItems>0&&!m.delivered&&!m.cancelled){
      const progressTitle=m.separated?'Separação concluída':assigned?'Separação em andamento':'Itens para separar';
      progress='<div class="order-v3-progress"><div class="order-v3-progress-head"><span>'+esc(progressTitle)+'</span><strong>'+checked+' de '+totalItems+' itens</strong></div><div class="order-v3-progress-bar" aria-label="Progresso da separação" aria-valuemin="0" aria-valuemax="'+totalItems+'" aria-valuenow="'+checked+'"><i style="width:'+progressPct+'%"></i></div><div class="order-v3-progress-foot"><span class="ok">'+separatedCount+' separado'+(separatedCount===1?'':'s')+'</span><span>'+pendingCount+' pendente'+(pendingCount===1?'':'s')+'</span>'+(missingCount?'<span class="missing">'+missingCount+' faltou'+(missingCount===1?'':'aram')+(missingValue>0?' · − '+esc(separationMoney(missingValue)):'')+'</span>':'')+(assigned&&assignment.assigned_at&&!m.separated?'<span>Iniciado '+esc(dateTime(assignment.assigned_at))+'</span>':'')+'</div></div>';
    }
    let controls='';
    if(orderCustomerDataPending(o)){
      controls='<button class="order-v3-control" type="button" disabled title="'+esc(orderCustomerDataPendingReasons(o).join(' · '))+'">AGUARDANDO DADOS DO CLIENTE</button>';
    }else if(!m.confirmed&&!m.cancelled){
      controls='<button class="order-v3-control" type="button" data-v3-confirm="'+esc(o.id)+'">CONFIRMAR PEDIDO</button>';
    }else if(o.status==='ready'&&!m.cancelled){
      if(f?.authorized===true||f?.stage==='authorized')controls='<button class="order-v3-control" type="button" data-v3-dispatch="'+esc(o.id)+'">SAIU PARA ENTREGA</button>';
      else if(f)controls='<button class="order-v3-control" type="button" data-open-order="'+esc(o.id)+'">'+(f.stage==='blocked'||f.stage==='rejected'?'REVISAR NF-e':'ACOMPANHAR NF-e')+'</button>';
      else controls='<button class="order-v3-control" type="button" disabled>NF-e automática…</button>';
    }else if(o.status==='out_for_delivery'&&!m.delivered&&!m.cancelled){
      controls='<button class="order-v3-control" type="button" data-v3-deliver="'+esc(o.id)+'">ENTREGUE</button><button class="order-v3-control" type="button" data-v3-delivery-fail="'+esc(o.id)+'">NÃO ENTREGUE</button>';
    }
    const separationLabel=m.separated?'VER SEPARAÇÃO':assigned?'CONTINUAR SEPARAÇÃO':'INICIAR SEPARAÇÃO';
    const primaryAction=m.confirmed&&!m.delivered&&!m.cancelled?'<button class="order-v3-action main '+(m.separated?'secondary-action':'primary')+'" type="button" data-v3-separation="'+esc(o.id)+'">'+separationLabel+'</button>':'';
    const supportTags=orderCardOperationalTags(o,m);
    const manualSelected=state.manualQueueIds.has(String(o.id));
    const manualEligible=orderStatusTabKey(o)==='confirmed'&&o.status==='confirmed';
    const manualQueueButton=(manualEligible||(manualSelected&&state.orderStatusTab==='manual'&&!m.separated))?'<button class="order-v3-action secondary-action" type="button" data-manual-queue-'+(manualSelected?'remove':'add')+'="'+esc(o.id)+'">'+(manualSelected?'RETIRAR DE SEPARAR AGORA':'SEPARAR AGORA')+'</button>':'';
    return '<article class="order-v3-card'+cardClass+'"><div class="order-v3-topline"><span class="order-v3-stage '+esc(stage)+'">'+esc(stageLabel)+'</span><strong class="order-v3-money">'+money(o.total_cents||0)+'</strong></div><div class="order-v3-identity"><strong>#'+esc(orderDisplayCode(o))+' · '+esc(o.customer_name||'Sem cliente')+'</strong><small><span class="order-v3-phone">Tel. '+esc(orderCardPhone(o))+'</span><span>'+esc(dateTime(o.created_at))+'</span></small></div>'+(!m.confirmed&&!m.cancelled?'<div class="order-v3-do-not-build">NÃO MONTAR ESSE PEDIDO</div>':'')+progress+(supportTags?'<div class="order-v3-tags">'+supportTags+'</div>':'')+(controls?'<div class="order-v3-controls">'+controls+'</div>':'')+'<div class="order-v3-actions">'+primaryAction+manualQueueButton+'<button class="order-v3-action secondary-action" type="button" data-order-chat="'+esc(o.id)+'">💬 VER CONVERSA</button><button class="order-v3-action '+(primaryAction?'secondary-action':'primary')+'" type="button" data-open-order="'+esc(o.id)+'">ABRIR PEDIDO</button></div></article>';
  }
  const ORDER_STATUS_TABS=[
    {key:'manual',label:'SEPARAR AGORA'},
    {key:'received',label:'Recebidos'},
    {key:'confirmed',label:'Confirmados'},
    {key:'separating',label:'Em separação'},
    {key:'separated',label:'Separados'},
    {key:'delivery',label:'Em entrega'},
    {key:'delivered',label:'Entregues'},
    {key:'cancelled',label:'Cancelados'}
  ];
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
  function orderStatusTabMatch(o,key=state.orderStatusTab||'manual'){
    if(key==='manual'){
      const m=orderV3Milestones(o);
      return state.manualQueueIds.has(String(o.id))&&m.confirmed&&!m.separated&&!m.delivered&&!m.cancelled&&o.status!=='out_for_delivery';
    }
    return key==='all'||orderStatusTabKey(o)===key;
  }
  function orderStatusTabCounts(){
    const counts=Object.fromEntries(ORDER_STATUS_TABS.map(x=>[x.key,0]));
    counts.all=state.orders.length;
    state.orders.forEach(o=>{const key=orderStatusTabKey(o);if(Object.prototype.hasOwnProperty.call(counts,key))counts[key]++});
    counts.manual=state.orders.filter(o=>orderStatusTabMatch(o,'manual')).length;
    return counts;
  }
  function orderStatusTabsHtml(extraClass=''){
    const counts=orderStatusTabCounts(),active=state.orderStatusTab||'all';
    return '<div class="orders-status-tabs '+extraClass+'" role="tablist" aria-label="Filtrar pedidos por status">'+ORDER_STATUS_TABS.map(x=>'<button type="button" class="orders-status-tab'+(active===x.key?' active':'')+'" data-order-status-tab="'+x.key+'" role="tab" aria-selected="'+(active===x.key?'true':'false')+'">'+esc(x.label)+' <span class="count">'+Number(counts[x.key]||0)+'</span></button>').join('')+'</div>';
  }
  async function manualQueueRpc(action,orderId=null){
    const token=await adminStepUp();
    const res=await fetch(BASKET_AUTO_RPC+'manual_pick_queue_action_v1',{
      method:'POST',headers:{'Content-Type':'application/json','apikey':FINANCE_PUBLIC_KEY,'Authorization':'Bearer '+token},
      body:JSON.stringify({p_action:action,p_order_id:orderId}),cache:'no-store'
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!Array.isArray(data.order_ids))throw new Error(data.message||data.error||'manual_queue_unavailable');
    state.manualQueueIds=new Set(data.order_ids.map(String));
    state.manualQueueLoaded=true;state.manualQueueError=false;state.manualQueueLastSync=Date.now();
    return data;
  }
  async function loadManualPickQueue(){
    try{return await manualQueueRpc('list')}
    catch(error){state.manualQueueError=true;state.manualQueueLoaded=false;throw error}
  }
  async function setManualPickQueue(orderId,enable,button){
    if(button){button.disabled=true;button.textContent=enable?'ADICIONANDO…':'RETIRANDO…'}
    try{
      await manualQueueRpc(enable?'add':'remove',orderId);
      toast(enable?'Pedido incluído em SEPARAR AGORA':'Pedido retirado de SEPARAR AGORA');
    }catch(error){toast('Não foi possível atualizar a fila manual: '+errorMessage(error.message))}
    finally{paintOrderRows()}
  }
  function bindOrderStatusTabs(){document.querySelectorAll('[data-order-status-tab]').forEach(b=>b.onclick=async()=>{state.orderStatusTab=b.dataset.orderStatusTab||'manual';paintOrderRows();if(state.orderStatusTab==='manual'){try{await loadManualPickQueue()}catch{}paintOrderRows()}})}
  async function renderOrders(){const content=$('#content');document.body.classList.add('orders-tab-active');content.innerHTML='<div class="page-head"><div><h1>Pedidos</h1><p>Escolha manualmente quais pedidos confirmados devem aparecer em SEPARAR AGORA.</p></div></div><div id="orderStatusTabsTop">'+orderStatusTabsHtml('orders-status-desktop')+'</div><div class="toolbar"><input id="orderSearch" type="search" placeholder="Buscar pedido, cliente, telefone ou endereço…" value="'+esc(state.orderQuery||'')+'"></div><div id="orderRows" class="orders-v3-list"><div class="loading">Carregando pedidos…</div></div><div id="orderStatusTabsMobile">'+orderStatusTabsHtml('orders-status-mobile')+'</div>';bindOrderStatusTabs();$('#orderSearch').oninput=e=>{state.orderQuery=e.target.value;paintOrderRows()};await loadOrders()}
  let ordersLoadGeneration=0;
  async function loadOrders(){
    const generation=++ordersLoadGeneration,host=$('#orderRows');
    const isLatest=()=>generation===ordersLoadGeneration;
    const canPaint=()=>isLatest()&&state.tab==='orders'&&host&&host===$('#orderRows');
    try{
      const data=await api('orders');
      if(!isLatest())return;
      state.orders=Array.isArray(data.orders)?data.orders:[];
      try{await loadManualPickQueue()}catch{}
      if(!isLatest())return;
      if(canPaint())paintOrderRows();
      const fiscalRows=state.orders.filter(o=>o.status==='ready').sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0)).slice(0,8);
      if(fiscalRows.length){await loadFiscalForOrders(fiscalRows);if(canPaint())paintOrderRows()}
    }catch(e){if(canPaint())host.innerHTML='<div class="empty">Não consegui carregar os pedidos.</div>'}
  }
  let orderBoardRefreshGeneration=0;
  async function refreshOrderSeparationBoard(){
    if(state.tab!=='orders'||document.hidden||!state.orders.length)return;
    const generation=++orderBoardRefreshGeneration,ordersGeneration=ordersLoadGeneration;
    const isCurrent=()=>generation===orderBoardRefreshGeneration&&ordersGeneration===ordersLoadGeneration&&state.tab==='orders'&&!document.hidden;
    try{
      const data=await api('order_separation_board');
      if(!isCurrent())return;
      const map=new Map((data.board||[]).map(x=>[String(x.order_id),x]));
      let changed=false;
      state.orders=state.orders.map(o=>{
        const row=map.get(String(o.id));if(!row)return o;
        const nextSummary=row.separation_summary||null,nextStatus=row.status||o.status;
        if(nextStatus!==o.status||JSON.stringify(nextSummary)!==JSON.stringify(o.separation_summary||null))changed=true;
        return {...o,status:nextStatus,separation_summary:nextSummary};
      });
      if(state.orderStatusTab==='manual'&&Date.now()-Number(state.manualQueueLastSync||0)>=15000){
        const previous=[...state.manualQueueIds].sort().join(',');
        try{
          await loadManualPickQueue();
          if(!isCurrent())return;
          if(previous!==[...state.manualQueueIds].sort().join(','))changed=true;
        }catch{}
      }
      if(changed&&isCurrent())paintOrderRows();
    }catch{}
  }
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
  function paintOrderRows(){const host=$('#orderRows');if(!host)return;const rows=state.orders.filter(o=>orderV3SearchMatch(o,state.orderQuery)&&orderStatusTabMatch(o)).sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));host.innerHTML=rows.length?rows.map(orderRow).join(''):'<div class="empty">'+(state.orderStatusTab==='manual'?(state.manualQueueError?'Fila manual indisponível. Tente selecionar esta aba novamente.':'Nenhum pedido na fila. Em CONFIRMADOS, clique em SEPARAR AGORA no pedido desejado.'):'Nenhum pedido encontrado neste status.')+'</div>';const top=$('#orderStatusTabsTop'),mobile=$('#orderStatusTabsMobile');if(top)top.innerHTML=orderStatusTabsHtml('orders-status-desktop');if(mobile)mobile.innerHTML=orderStatusTabsHtml('orders-status-mobile');bindOrderStatusTabs();host.querySelectorAll('[data-open-order]').forEach(b=>b.onclick=()=>openOrder(b.dataset.openOrder));host.querySelectorAll('[data-order-chat]').forEach(b=>b.onclick=()=>openOrderChatSheet(b.dataset.orderChat,b));host.querySelectorAll('[data-manual-queue-add],[data-manual-queue-remove]').forEach(b=>b.onclick=()=>setManualPickQueue(b.dataset.manualQueueAdd||b.dataset.manualQueueRemove,Boolean(b.dataset.manualQueueAdd),b));host.querySelectorAll('[data-copy-separation]').forEach(b=>b.onclick=()=>copyOrderSeparationLink(b.dataset.copySeparation,b));host.querySelectorAll('[data-v3-confirm]').forEach(b=>b.onclick=()=>quickConfirmOrder(b.dataset.v3Confirm,b));host.querySelectorAll('[data-v3-separate],[data-v3-separation]').forEach(b=>b.onclick=()=>openOrderSeparationSheet(b.dataset.v3Separate||b.dataset.v3Separation));host.querySelectorAll('[data-v3-dispatch]').forEach(b=>b.onclick=()=>startOrderDispatchV4(b.dataset.v3Dispatch,b));host.querySelectorAll('[data-v3-deliver]').forEach(b=>b.onclick=()=>openOrderDeliveryConfirm(b.dataset.v3Deliver));host.querySelectorAll('[data-v3-delivery-fail]').forEach(b=>b.onclick=()=>returnOrderToExpedition(b.dataset.v3DeliveryFail,false))}
  async function startOrderDispatchV4(id,btn){
    const current=state.orders.find(o=>String(o.id)===String(id));
    if(!current||current.status!=='ready'){toast('Este pedido não está pronto para saída');return}
    const f=state.fiscalByOrder[id]||{};if(f.authorized!==true&&f.stage!=='authorized'){toast('A NF-e precisa estar autorizada antes da saída');return}
    if(!confirm('Confirmar que o pedido #'+orderDisplayCode(current)+' SAIU PARA ENTREGA?'))return;
    if(btn){btn.disabled=true;btn.textContent='REGISTRANDO SAÍDA…'}
    try{await api('order_dispatch_start_v4',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,operator:currentOperator()||'Expedição',idempotency_key:'dispatch-v4:'+id})});toast('Saída para entrega registrada');delete state.fiscalByOrder[id];await loadOrders();if(state.currentOrder?.order?.id===id)await openOrder(id)}catch(e){toast(errorMessage(e.message));if(btn){btn.disabled=false;btn.textContent='SAIU PARA ENTREGA'}}
  }
  async function quickConfirmOrder(id,btn){const current=state.orders.find(o=>String(o.id)===String(id));if(current&&orderCustomerDataPending(current)){toast('Complete os dados essenciais do cliente antes de confirmar');return}if(btn){btn.disabled=true;btn.textContent='CONFIRMANDO…'}try{await api('order_update',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,status:'confirmed',operator:currentOperator()||'Operação'})});toast('Pedido confirmado');await loadOrders()}catch(e){toast(errorMessage(e.message))}finally{if(btn&&document.contains(btn)){btn.disabled=false;btn.textContent='CONFIRMADO'}}}
  function closeOrderSeparationSheet(){document.querySelector('.orders-bottom-sheet-backdrop')?.remove()}
  function separationMoney(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
  async function openOrderSeparationSheet(id){const order=state.orders.find(o=>String(o.id)===String(id));if(order&&orderCustomerDataPending(order)){toast('Complete os dados essenciais do cliente antes da separação');return}if(order&&!orderV3Milestones(order).confirmed){toast('Confirme o pedido antes de iniciar a separação');return}const originalPublicCode=orderDisplayCode(order);closeOrderSeparationSheet();const back=document.createElement('div');back.className='orders-bottom-sheet-backdrop';back.innerHTML='<section class="orders-bottom-sheet" role="dialog" aria-modal="true"><header class="orders-sheet-head"><div><h2>Separação do pedido'+(originalPublicCode==='—'?'':' #'+esc(originalPublicCode))+'</h2><p>Marque cada produto como SEPARADO ou FALTOU.</p></div><button class="orders-sheet-close" type="button" aria-label="Fechar">×</button></header><div class="orders-sheet-body"><div class="loading">Carregando produtos…</div></div><footer class="orders-sheet-foot" hidden></footer></section>';document.body.appendChild(back);back.querySelector('.orders-sheet-close').onclick=closeOrderSeparationSheet;back.onclick=e=>{if(e.target===back){closeOrderSeparationSheet();return}const button=e.target.closest?.('[data-separation-state]');if(!button||button.disabled||back.dataset.separationBusy==='1'||!back.contains(button))return;e.preventDefault();setOrderSeparationItem(id,button.dataset.orderItem,button.dataset.separationState,back.dataset.orderUpdatedAt||'',back.dataset.separatorKey||'',back,button)};await loadOrderSeparationSheet(id,back)}
  async function assignOrderSeparator(orderId,key,current,back,btn){
    const next=ORDER_SEPARATORS.find(x=>x.key===key);if(!next)return;
    if(current?.separator_key===key||back?.dataset.separationBusy==='1')return;
    if(current?.separator_key&&!confirm('Este pedido está com '+(current.separator_label||separatorLabel(current.separator_key))+'.\n\nTrocar a separação para '+next.label+'?'))return;
    back.dataset.separationBusy='1';
    back.querySelectorAll('[data-separator-key]').forEach(button=>button.disabled=true);
    if(btn){btn.disabled=true;btn.textContent='SALVANDO…'}
    try{
      await api('order_separation_assign',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:orderId,separator_key:key})});
      toast('Separação atribuída a '+next.label);
      await loadOrderSeparationSheet(orderId,back);
      await refreshOrderSeparationBoard();
    }catch(e){toast(e.message==='invalid_separator'?'Responsável inválido. Atualize a página e tente novamente.':errorMessage(e.message));await loadOrderSeparationSheet(orderId,back)}
    finally{delete back.dataset.separationBusy}
  }
  async function loadOrderSeparationSheet(id,back=document.querySelector('.orders-bottom-sheet-backdrop')){
    if(!back)return;const body=back.querySelector('.orders-sheet-body'),foot=back.querySelector('.orders-sheet-foot');
    const savedScroll=back.dataset.separationOrderId===String(id)?Number(body.scrollTop||0):0;
    back.dataset.separationOrderId=String(id);
    try{
      const response=await api('order_separation_get',{id}),data=response.separation||response,items=Array.isArray(data.items)?data.items:[],componentBasketKeys=new Set(items.filter(x=>['basket_component','basket_mold_component'].includes(String(x.kind||''))).map(x=>String(x.basket_id||x.basket_name||'')).filter(Boolean)),visibleItems=items.filter(x=>!(['basket','basket_mold'].includes(String(x.kind||''))&&componentBasketKeys.has(String(x.basket_id||x.basket_name||x.name||'')))),completed=Boolean(data.completion?.completed_at),assignment=data.assignment&&data.assignment.separator_key?data.assignment:null,assigned=Boolean(assignment?.separator_key),pending=Number(data.counts?.pending||0),separated=Number(data.counts?.separated||0),missing=Number(data.counts?.missing||0),liveMissing=Number(data.missing_subtotal??data.completion?.missing_subtotal??visibleItems.filter(x=>String(x.state)==='missing').reduce((sum,x)=>sum+Number(x.line_total||0),0)),originalTotal=Number(data.original_total??data.completion?.original_total??data.total??0),finalTotal=Number(data.final_total??data.completion?.final_total??Math.max(0,originalTotal-liveMissing));back.dataset.orderUpdatedAt=String(data.order_updated_at||'');back.dataset.separatorKey=String(assignment?.separator_key||'');
      const picker='<section class="orders-separator-panel '+(completed?'completed':assigned?'assigned':'')+'"><div class="orders-separator-panel-head"><div><strong>'+(completed?'✓ Separação concluída por '+esc(assignment?.separator_label||separatorLabel(data.completion?.separator_key)||'separador'):assigned?'EM SEPARAÇÃO · '+esc(String(assignment.separator_label||separatorLabel(assignment.separator_key)).toUpperCase()):'Quem vai separar este pedido?')+'</strong><small>'+(completed?'Responsável registrado no histórico.':assigned?'Outro funcionário só deve trocar o responsável se realmente for assumir este pedido.':'Escolha o responsável antes de marcar os produtos.')+'</small></div></div>'+(!completed?'<div class="orders-separator-picker">'+ORDER_SEPARATORS.map(x=>'<button type="button" data-separator-key="'+x.key+'" class="'+(assignment?.separator_key===x.key?'active':'')+'">'+esc(x.label)+'</button>').join('')+'</div>':'')+'</section>';
      body.innerHTML=picker+'<div class="orders-separation-grid">'+visibleItems.map(x=>{
        const st=String(x.state||'pending'),klass=st==='separated'?' separated':st==='missing'?' missing':'',stateTag=st==='separated'?'<span class="orders-separation-state-tag separated">✓ SEPARADO</span>':st==='missing'?'<span class="orders-separation-state-tag missing">× FALTOU</span>':'';
        return '<article class="orders-separation-item'+klass+'"><div class="orders-separation-photo-wrap">'+(x.image_url?'<img src="'+esc(x.image_url)+'" alt="'+esc(x.name||'Produto')+'">':'<div class="orders-separation-placeholder"></div>')+stateTag+'</div><div class="orders-separation-name">'+esc(x.name||'Produto')+'</div><div class="orders-separation-info"><div class="orders-separation-qty"><span>QTD.</span><strong>'+esc(fmtQty(x.quantity))+'</strong></div><div class="orders-separation-price">'+esc(separationMoney(x.line_total))+'</div></div><div class="orders-separation-buttons"><button type="button" data-separation-state="separated" data-order-item="'+esc(x.order_item_id)+'" class="'+(st==='separated'?'active':'')+'" '+(completed||!assigned?'disabled':'')+'>SEPARADO</button><button type="button" data-separation-state="missing" data-order-item="'+esc(x.order_item_id)+'" class="'+(st==='missing'?'active':'')+'" '+(completed||!assigned?'disabled':'')+'>FALTOU</button></div></article>';
      }).join('')+'</div>'+(completed?'<div class="rule-notice" style="margin-top:10px"><strong>Separação concluída</strong><div>Cliente atualizado. A NF-e segue automaticamente para o fluxo fiscal; a expedição só será liberada após autorização.</div></div>':'');
      body.querySelectorAll('[data-separator-key]').forEach(button=>button.onclick=()=>assignOrderSeparator(id,button.dataset.separatorKey,assignment,back,button));
      body.scrollTop=savedScroll;
      foot.hidden=false;
      foot.innerHTML='<div class="orders-sheet-summary"><span>Pendentes: <strong>'+pending+'</strong></span><span>Separados: <strong>'+separated+'</strong></span><span>Faltou: <strong>'+missing+'</strong></span></div><div class="orders-sheet-financial"><span>Total original<strong>'+separationMoney(originalTotal)+'</strong></span><span class="discount">Abatimento por falta<strong>− '+separationMoney(liveMissing)+'</strong></span><span>Total atual<strong>'+separationMoney(finalTotal)+'</strong></span></div><button class="orders-sheet-complete" type="button" '+(pending||completed||!assigned?'disabled':'')+'>'+(completed?'SEPARAÇÃO CONCLUÍDA':!assigned?'ESCOLHA O SEPARADOR':'CONCLUIR SEPARAÇÃO')+'</button>';
      const complete=foot.querySelector('.orders-sheet-complete');if(!completed&&assigned)complete.onclick=()=>completeOrderSeparation(id,data.order_updated_at,assignment,back,complete);
    }catch(e){body.innerHTML='<div class="empty">Não consegui carregar a separação. '+esc(errorMessage(e.message))+'</div>';foot.hidden=true}
  }
  async function setOrderSeparationItem(orderId,itemId,separationState,expected,separatorKey,back,btn){
    if(!separatorKey){toast('Escolha quem está separando este pedido');return}
    if(!btn||btn.dataset.saving==='1'||back.dataset.separationBusy==='1')return;
    back.dataset.separationBusy='1';
    const actionLabel=separationState==='missing'?'FALTOU':'SEPARADO',buttons=[...back.querySelectorAll('[data-separation-state]')];
    btn.dataset.saving='1';btn.classList.add('saving');btn.classList.remove('saved','failed');btn.textContent='SALVANDO…';buttons.forEach(x=>x.disabled=true);
    const save=async(version,key)=>api('order_separation_item_set',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:orderId,order_item_id:itemId,state:separationState,expected_order_updated_at:version,separator_key:key,operator:separatorLabel(key)||'Separação'})});
    try{
      let result;
      try{result=await save(expected,separatorKey)}
      catch(e){
        if(!['stale_order_version','order_version_conflict'].includes(String(e.message||'')))throw e;
        const latestResponse=await api('order_separation_get',{id:orderId}),latest=latestResponse.separation||latestResponse,currentKey=latest.assignment?.separator_key||'';
        if(!currentKey||currentKey!==separatorKey)throw new Error('separator_assignment_changed');
        back.dataset.orderUpdatedAt=String(latest.order_updated_at||'');back.dataset.separatorKey=String(currentKey);
        result=await save(latest.order_updated_at,currentKey);
      }
      btn.classList.remove('saving');btn.classList.add('saved');btn.textContent='✓ SALVO';
      const nextVersion=result?.order_updated_at||result?.item?.order_updated_at||'';if(nextVersion)back.dataset.orderUpdatedAt=String(nextVersion);
      if(result?.warning==='bling_approval_pending')toast('✓ '+actionLabel+' salvo · Bling pendente, continue a separação');
      else toast('✓ '+actionLabel+' salvo');
      await refreshOrderSeparationBoard();
      await new Promise(resolve=>setTimeout(resolve,260));
      await loadOrderSeparationSheet(orderId,back);
    }catch(e){
      btn.classList.remove('saving');btn.classList.add('failed');btn.textContent='NÃO SALVO';
      const code=String(e.message||'');
      toast(code==='separator_assignment_changed'?'O responsável pela separação mudou. A marcação NÃO foi salva.':code==='bling_approval_required_before_separation'?'A marcação NÃO foi salva porque o Bling ainda não liberou o pedido.':('NÃO SALVO · '+errorMessage(code)));
      await new Promise(resolve=>setTimeout(resolve,700));
      await loadOrderSeparationSheet(orderId,back);
    }finally{
      if(btn)delete btn.dataset.saving;
      delete back.dataset.separationBusy;
    }
  }
  async function resolveOriginalOrderCodeForPackaging(orderId){
    let current=state.orders.find(o=>String(o.id)===String(orderId));
    let code=orderDisplayCode(current);
    if(code&&code!=='—')return code;
    try{
      const data=await api('order',{id:orderId});
      current=data?.order||null;
      code=orderDisplayCode(current);
      if(code&&code!=='—')return code;
    }catch{}
    return '';
  }
  async function showSeparationPackagingNotice(orderId,back){
    document.querySelector('.orders-packaging-backdrop')?.remove();
    const display=await resolveOriginalOrderCodeForPackaging(orderId);
    const pickerMode=document.documentElement.classList.contains('montar-picker-only');
    if(!display&&!pickerMode){
      toast('Separação concluída, mas não encontrei o número original do pedido. Abra o pedido antes de etiquetar a embalagem.');
      if(back?.isConnected)back.remove();else closeOrderSeparationSheet();
      await loadOrders();
      return;
    }
    const overlay=document.createElement('div');overlay.className='orders-packaging-backdrop';
    overlay.innerHTML='<section class="orders-packaging-sheet" role="dialog" aria-modal="true" aria-labelledby="packagingNoticeTitle"><div class="orders-packaging-kicker">Separação concluída</div><strong class="orders-packaging-number">#'+esc(display||'NÚMERO NÃO DISPONÍVEL')+'</strong><h2 class="orders-packaging-message" id="packagingNoticeTitle">ANOTE O NÚMERO DO PEDIDO NA EMBALAGEM</h2><button class="orders-packaging-ok" type="button">OK</button></section>';
    document.body.appendChild(overlay);
    overlay.querySelector('.orders-packaging-ok').onclick=async()=>{
      overlay.querySelector('.orders-packaging-ok').disabled=true;
      overlay.remove();
      if(back?.isConnected)back.remove();else closeOrderSeparationSheet();
      if(document.documentElement.classList.contains('montar-picker-only')){
        clearTimeout(overlay.__pickerReturnTimer);
        location.replace('/montar/?concluido='+encodeURIComponent(orderId));
        return;
      }
      await loadOrders();
      await refreshOrderSeparationBoard();
    };
    overlay.querySelector('.orders-packaging-ok').focus();
    if(document.documentElement.classList.contains('montar-picker-only')){
      const summary=document.createElement('p');
      summary.className='orders-packaging-auto-return';
      summary.textContent='A vitrine voltará à lista automaticamente em 12 segundos. Toque em OK para voltar agora.';
      overlay.querySelector('.orders-packaging-message').after(summary);
      overlay.__pickerReturnTimer=setTimeout(()=>{
        if(overlay.isConnected)location.replace('/montar/?concluido='+encodeURIComponent(orderId));
      },12000);
    }
  }
  async function completeOrderSeparation(id,expected,assignment,back,btn){
    if(!assignment?.separator_key){toast('Escolha quem está separando este pedido');return}
    if(btn.disabled)return;
    if(!confirm('Concluir a separação deste pedido como '+(assignment.separator_label||separatorLabel(assignment.separator_key))+'?\n\nA separação só será considerada concluída após a confirmação do servidor.'))return;
    btn.disabled=true;btn.textContent='CONCLUINDO…';
    let persisted=false;
    try{
      const result=await api('order_separation_complete',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:id,expected_order_updated_at:expected,separator_key:assignment.separator_key,operator:assignment.separator_label||separatorLabel(assignment.separator_key)||'Separação'})});
      if(result?.status!=='ready')throw new Error('separation_completion_unconfirmed');
      persisted=true;
      btn.textContent='✓ PEDIDO JÁ SEPARADO';
      // Post-save refresh must never suppress the completion receipt.
      refreshOrderSeparationBoard().catch(()=>{});
      await showSeparationPackagingNotice(id,back);
      if(!document.documentElement.classList.contains('montar-picker-only')){
        setTimeout(async()=>{try{const o=state.orders.find(x=>String(x.id)===String(id));if(o?.status==='ready'){await loadFiscalForOrders([o]);paintOrderRows()}}catch{}},5000);
      }
    }catch(e){
      if(persisted){
        toast('Separação salva, mas não foi possível abrir o aviso de embalagem.');
        if(document.documentElement.classList.contains('montar-picker-only'))location.replace('/montar/?concluido='+encodeURIComponent(id));
        return;
      }
      const reason=e.message==='separator_required'?'escolha o separador responsável':errorMessage(e.message);
      await loadOrderSeparationSheet(id,back);
      // The global toast is behind the full-screen vitrine: always show errors
      // inside the sticky footer, next to the completion action.
      const foot=back?.querySelector('.orders-sheet-foot');
      if(foot){
        const alert=document.createElement('div');
        alert.className='orders-sheet-completion-error';
        alert.setAttribute('role','alert');
        alert.textContent='NÃO FOI CONCLUÍDO. '+reason+'. Confira e tente novamente.';
        foot.prepend(alert);
      }else toast('A separação NÃO foi concluída · '+reason);
    }
  }
  const {deliveryMethodV3,deliveryMethodOptionsV3,orderV3PaymentOptions}=window.DonaAntoniaAdminOrderPaymentMethod.create(normalize);
  async function openOrderDeliveryConfirm(id){let order=state.orders.find(o=>String(o.id)===String(id));if(!order){await loadOrders();order=state.orders.find(o=>String(o.id)===String(id))}if(order&&orderCustomerDataPending(order)){toast('Complete os dados essenciais do cliente antes da entrega');return}if(!order||order.status!=='out_for_delivery'||orderV3Milestones(order).delivered){toast('O pedido precisa ter SAÍDO PARA ENTREGA antes da confirmação');return}const planned=order.payment_method_snapshot?.label||order.payment_method_snapshot?.method||'A confirmar',method=deliveryMethodV3(order.payment_method_snapshot?.method||planned);const dlg=document.createElement('dialog');dlg.className='delivery-v3-dialog';dlg.innerHTML='<div class="delivery-v3-body"><h2>Confirmar entrega</h2><div class="muted">Pedido #'+esc(orderDisplayCode(order))+'</div><div class="delivery-v3-grid"><label><span>Forma prevista</span><input value="'+esc(planned)+'" readonly></label><label><span>Forma recebida</span><select id="deliveryV3Method">'+deliveryMethodOptionsV3(method)+'</select></label><label><span>Valor recebido</span><input value="'+esc(money(order.total_cents||0))+'" readonly></label></div></div><div class="delivery-v3-actions"><button class="delivery-v3-cancel" type="button">Cancelar</button><button class="delivery-v3-confirm" type="button">CONFIRMAR ENTREGA</button></div>';document.body.appendChild(dlg);const close=()=>{dlg.close();dlg.remove()};dlg.querySelector('.delivery-v3-cancel').onclick=close;dlg.querySelector('.delivery-v3-confirm').onclick=async()=>{const btn=dlg.querySelector('.delivery-v3-confirm');btn.disabled=true;btn.textContent='CONFIRMANDO…';try{await api('order_delivery_complete_v3',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,method:dlg.querySelector('#deliveryV3Method').value,amount_cents:Number(order.total_cents||0),operator:currentOperator()||'Entrega',idempotency_key:'delivery-v3:'+id})});toast('Entrega e recebimento confirmados');close();await loadOrders();if(state.currentOrder?.order?.id===id)await openOrder(id)}catch(e){toast(errorMessage(e.message));btn.disabled=false;btn.textContent='CONFIRMAR ENTREGA'}};dlg.showModal()}
  async function sendOrderCustomerVitrineV3(id,btn){const access=String(sessionStorage.getItem('da_finance_access_token_v1')||'').trim();if(!access){toast('Sua sessão do Admin expirou');return}if(btn){btn.disabled=true;btn.textContent='ENVIANDO…'}try{const response=await fetch('https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-order-vitrine-send-v1',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+access},body:JSON.stringify({order_id:id,request_id:(crypto.randomUUID?.()||String(Date.now())).replace(/[^A-Za-z0-9-]/g,'').slice(0,80)})}),data=await response.json().catch(()=>({}));if(!response.ok||data?.ok===false)throw new Error(data?.error||'vitrine_send_failed');toast('Vitrine enviada ao cliente pelo WhatsApp '+(String(data.channel_phone_e164||'').replace(/\D/g,'').endsWith('1018')?'1018':'0975'))}catch(e){toast(e.message==='conversation_not_found'||e.message==='channel_unavailable'?'Não encontrei com segurança a conversa 0975/1018 deste pedido.':errorMessage(e.message))}finally{if(btn&&document.contains(btn)){btn.disabled=false;btn.textContent='VITRINE CLIENTE'}}}
  async function reopenOrderV3(id){if(!confirm('Reabrir este pedido para edição? A reserva será liberada.'))return;try{await api('order_reopen_v3',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,operator:currentOperator()||'Operação'})});toast('Pedido reaberto para edição');await loadOrders();await openOrder(id)}catch(e){toast(errorMessage(e.message))}}

  function publicOrderUrlFor(o){const short=String(o?.public_order_url||'').trim();if(/^https:\/\/donaantonia\.com\.br\/p\/\?k=[a-f0-9]{16}$/i.test(short))return short;const id=String(o?.id||'').trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)?'https://donaantonia.com.br/pedido/?o='+encodeURIComponent(id):''}
  function orderPublicVitrineHtml(o){
    const url=publicOrderUrlFor(o);
    return '<div class="section-title">Vitrine do pedido</div><div class="rule-notice">'+
      '<strong>Fotos e quantidades do pedido salvo</strong><div class="sub">A mesma página criada pelo checkout. Disponível mesmo com estoque zerado ou negativo.</div>'+
      '<div class="order-public-link"><label><span>Link da vitrine do pedido</span><input id="orderPublicLink" type="text" readonly value="'+esc(url)+'" placeholder="Gere a vitrine para obter o link"></label><button class="primary" id="copyOrderPublicLink" type="button" '+(url?'':'disabled')+'>Copiar link</button></div>'+
      '<div class="order-public-actions"><button class="secondary" id="openOrderVitrine" type="button" '+(url?'':'disabled')+'>Abrir vitrine</button><button class="secondary" id="printOrderVitrine" type="button" '+(url?'':'disabled')+'>Imprimir vitrine</button><button class="secondary" id="generateOrderVitrine" type="button" '+(o?.id?'':'disabled')+'>Gerar vitrine</button></div></div>';
  }
  function bindCurrentOrderVitrine(){
    if($('#copyOrderPublicLink'))$('#copyOrderPublicLink').onclick=copyCurrentOrderPublicLink;
    if($('#openOrderVitrine'))$('#openOrderVitrine').onclick=openCurrentOrderVitrine;
    if($('#printOrderVitrine'))$('#printOrderVitrine').onclick=printCurrentOrderVitrine;
    if($('#generateOrderVitrine'))$('#generateOrderVitrine').onclick=generateCurrentOrderVitrine;
  }
  async function generateCurrentOrderVitrine(){
    const id=state.currentOrder?.order?.id,btn=$('#generateOrderVitrine');if(!id||btn?.disabled)return;
    if(btn){btn.disabled=true;btn.textContent='Gerando…'}
    try{
      const data=await api('order',{id});
      if(state.currentOrder?.order?.id!==id)return;
      if(data.order?.id!==id||!publicOrderUrlFor(data.order))throw new Error('link_unavailable');
      Object.assign(state.currentOrder.order,{public_order_url:data.order.public_order_url,public_order_code:data.order.public_order_code});
      const panel=$('#orderPublicVitrinePanel');if(panel){panel.innerHTML=orderPublicVitrineHtml(state.currentOrder.order);bindCurrentOrderVitrine()}
      toast('Vitrine do pedido disponível');
    }catch{if(state.currentOrder?.order?.id===id)toast('Não consegui gerar a vitrine agora. Tente novamente.')}
    finally{if(btn){btn.disabled=false;btn.textContent='Gerar vitrine'}}
  }
  async function copyCurrentOrderPublicLink(){
    const url=publicOrderUrlFor(state.currentOrder?.order);if(!url)return;
    try{await navigator.clipboard.writeText(url);toast('Link da vitrine copiado')}
    catch{
      const input=$('#orderPublicLink');input?.focus();input?.select();
      let copied=false;try{copied=document.execCommand('copy')}catch{}
      toast(copied?'Link da vitrine copiado':'O link está selecionado. Copie pelo teclado ou mantenha pressionado para copiar.');
    }
  }
  function openCurrentOrderVitrine(){
    const url=publicOrderUrlFor(state.currentOrder?.order);if(url)window.open(url,'_blank','noopener,noreferrer');
  }
  function printCurrentOrderVitrine(){
    const url=publicOrderUrlFor(state.currentOrder?.order);if(!url)return;
    const printUrl=new URL(url);printUrl.searchParams.set('print','1');
    window.open(printUrl.toString(),'_blank','noopener,noreferrer');
  }
  let orderDetailLoadGeneration=0;
  async function openOrder(id){
    const generation=++orderDetailLoadGeneration;
    const editor=$('#editor'),title=$('#editorTitle'),body=$('#editorBody');
    title.textContent='Pedido';
    body.innerHTML='<div class="loading">Carregando pedido…</div>';
    $('#editorActions').innerHTML='<button class="secondary" id="cancelEditor">Fechar</button>';
    $('#cancelEditor').onclick=()=>editor.close();
    if(!editor.open)editor.showModal();
    const isCurrent=()=>generation===orderDetailLoadGeneration&&editor.open&&title.textContent==='Pedido';
    try{
      const data=await api('order',{id});
      if(!isCurrent())return;
      state.currentOrder=data;
      state.currentOrderFiscal=null;
      if(['confirmed','processing','ready','out_for_delivery','delivered'].includes(data.order?.status)){
        try{
          const sep=await api('order_separation_get',{id});
          if(!isCurrent())return;
          data.separation=sep.separation||sep;
        }catch(e){if(!isCurrent())return}
      }
      if(['ready','out_for_delivery','delivered'].includes(data.order?.status))await loadCurrentOrderFiscal(false);
      if(isCurrent())paintOrderDetail();
    }catch(e){if(isCurrent())body.innerHTML='<div class="empty">Não consegui abrir este pedido.</div>'}
  }
  function orderV3SeparationMap(){return new Map((state.currentOrder?.separation?.items||[]).map(x=>[String(x.order_item_id),String(x.state||'pending')]))}
  function orderV3DetailItemHtml(item,states){const st=states.get(String(item.id))||'',missing=st==='missing';const components=Array.isArray(item.components)?item.components:[];const componentHtml=components.length?'<div style="margin-top:7px">'+components.map(c=>{const cs=states.get(String(c.id))||'',cm=cs==='missing';return '<div class="muted" style="padding:3px 0">• '+esc(fmtQty(c.quantity))+' × '+esc(c.name_snapshot||'Produto')+(cm?'<span class="order-v3-missing">FALTOU</span>':'')+'</div>'}).join('')+'</div>':'';return '<div class="order-v3-item'+(missing?' missing':'')+'">'+(item.image_url?'<img src="'+esc(item.image_url)+'" alt="">':'<div class="order-v3-item-ph"></div>')+'<div><strong>'+esc(item.name_snapshot||'Produto')+'</strong>'+(missing?'<span class="order-v3-missing">FALTOU</span>':'')+'<small>Quantidade: '+esc(fmtQty(item.quantity||1))+'</small>'+componentHtml+'</div><strong>'+money(item.total_cents||Math.round(Number(item.line_total||0)*100))+'</strong></div>'}
  async function saveOrderV3(){const o=state.currentOrder?.order;if(!o||o.status==='delivered'||o.status==='cancelled')return;const btn=$('#saveOrder');if(btn){btn.disabled=true;btn.textContent='SALVANDO…'}try{await api('order_update',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:o.id,payment_method:$('#orderPayment')?.value||'',delivery_address:{customer_name:$('#orderDeliveryName')?.value||'',phone:$('#orderDeliveryPhone')?.value||'',postal_code:$('#orderDeliveryPostalCode')?.value||'',street:$('#orderDeliveryStreet')?.value||'',number:$('#orderDeliveryNumber')?.value||'',district:$('#orderDeliveryDistrict')?.value||'',complement:$('#orderDeliveryComplement')?.value||'',city:$('#orderDeliveryCity')?.value||'',state:$('#orderDeliveryState')?.value||'',raw_text:$('#orderDeliveryRawText')?.value||''},operator:currentOperator()||'Operação'})});toast('Dados do pedido atualizados');await openOrder(o.id);await loadOrders()}catch(e){toast(errorMessage(e.message));if(btn){btn.disabled=false;btn.textContent='Salvar dados'}}}
  function paintOrderDetail(){
    const d=state.currentOrder,o=d.order,c=d.customer||{},delivery=o.delivery_address_snapshot||c.address||{},milestones=orderV3Milestones(o),states=orderV3SeparationMap(),sep=d.separation||{},completion=sep.completion||{},original=Number(sep.original_total??completion.original_total??o.total_cents/100??0),missing=Number(sep.missing_subtotal??completion.missing_subtotal??0),finalTotal=Number(sep.final_total??completion.final_total??o.total_cents/100??0),sepStarted=Boolean(completion?.prepared_at||completion?.completed_at)||(sep.items||[]).some(x=>String(x.state||'pending')!=='pending'),locked=milestones.confirmed,editable=!milestones.delivered&&!milestones.cancelled,customerPending=orderCustomerDataPending(o),customerPendingReasons=orderCustomerDataPendingReasons(o);
    const fiscal=['ready','out_for_delivery','delivered'].includes(o.status)?'<div class="order-v3-section"><h3>Fiscal / NF-e</h3><div id="orderFiscalStatus">'+orderFiscalHtml(state.currentOrderFiscal,o)+'</div>'+fiscalCanaryActionHtml(state.currentOrderFiscal,o)+'<div class="print-actions">'+((state.currentOrderFiscal?.danfe_available===true)?'<button class="secondary" id="printDanfe" type="button">Imprimir DANFE</button>':'')+'</div></div>':'';
    $('#editorBody').innerHTML=(customerPending?'<div class="rule-notice warn"><strong>AGUARDANDO DADOS DO CLIENTE</strong><div>'+esc(customerPendingReasons.join(' · '))+'</div></div>':'')+'<div class="order-v3-detail-head"><div><h2 style="margin:0">Pedido #'+esc(orderDisplayCode(o))+'</h2><div class="muted">'+esc(dateTime(o.created_at))+' · '+esc(o.customer_name||c.display_name||'Cliente')+'</div><div class="order-v3-tags">'+orderV3Tags(o)+'</div></div><div class="order-v3-total">'+separationMoney(missing>0?finalTotal:Number(o.total_cents||0)/100)+'</div></div>'+
      (missing>0?'<div class="order-v3-financial"><span>Total original: <strong>'+separationMoney(original)+'</strong></span><span class="discount">Abatimento por falta: <strong>− '+separationMoney(missing)+'</strong></span><span>Total final: <strong>'+separationMoney(finalTotal)+'</strong></span></div>':'')+
      '<div class="order-v3-section"><h3>Cliente e entrega</h3><div class="form-grid"><label class="span-2"><span>Nome</span><input id="orderDeliveryName" value="'+esc(delivery.customer_name||delivery.recipient_name||c.display_name||'')+'" '+(editable?'':'disabled')+'></label><label><span>Telefone / WhatsApp</span><input id="orderDeliveryPhone" value="'+esc(formatPhone(delivery.phone||c.phone||o.whatsapp_phone_e164||''))+'" '+(editable?'':'disabled')+'></label><label><span>Pagamento previsto</span><select id="orderPayment" '+(editable?'':'disabled')+'>'+orderV3PaymentOptions(o.payment_method_snapshot?.method||o.payment_method_snapshot?.label||'')+'</select></label><label class="span-2"><span>Rua / avenida</span><input id="orderDeliveryStreet" value="'+esc(delivery.street||'')+'" '+(editable?'':'disabled')+'></label><label><span>Número</span><input id="orderDeliveryNumber" value="'+esc(delivery.number||'')+'" '+(editable?'':'disabled')+'></label><label><span>Bairro</span><input id="orderDeliveryDistrict" value="'+esc(delivery.district||'')+'" '+(editable?'':'disabled')+'></label><label><span>Complemento</span><input id="orderDeliveryComplement" value="'+esc(delivery.complement||'')+'" '+(editable?'':'disabled')+'></label><label><span>CEP</span><input id="orderDeliveryPostalCode" value="'+esc(delivery.postal_code||'')+'" '+(editable?'':'disabled')+'></label><label><span>Cidade</span><input id="orderDeliveryCity" value="'+esc(delivery.city||'Cuiabá')+'" '+(editable?'':'disabled')+'></label><label><span>UF</span><input id="orderDeliveryState" maxlength="2" value="'+esc(delivery.state||'MT')+'" '+(editable?'':'disabled')+'></label><label class="span-2"><span>Referência</span><input id="orderDeliveryRawText" value="'+esc(delivery.raw_text||delivery.reference||'')+'" '+(editable?'':'disabled')+'></label></div></div>'+
      '<div class="order-v3-section"><h3>Itens</h3>'+(locked?'<div class="muted" style="margin-bottom:8px">Produtos e quantidades estão travados porque o pedido já foi confirmado.</div>':'')+'<div class="order-v3-items">'+(d.items||[]).map(i=>orderV3DetailItemHtml(i,states)).join('')+'</div></div>'+
      '<div class="order-v3-section"><h3>Atendimento</h3><div class="order-v3-ops"><button class="secondary" id="sendCustomerVitrineV3" type="button">VITRINE CLIENTE</button>'+(publicOrderUrlFor(o)?'<button class="secondary" id="openOrderVitrineV3" type="button">ABRIR VITRINE</button>':'')+'</div></div>'+
      '<div class="order-v3-section"><h3>Operação</h3><div class="order-v3-ops">'+(!milestones.confirmed&&!milestones.cancelled?'<button class="primary" id="confirmOrderV3" type="button" '+(customerPending?'disabled title="Complete os dados essenciais do cliente"':'')+'>CONFIRMAR PEDIDO</button>':'')+(milestones.confirmed&&!milestones.delivered&&!milestones.cancelled?'<button class="secondary" id="openSeparationV3" type="button" '+(customerPending?'disabled title="Complete os dados essenciais do cliente"':'')+'>ABRIR VITRINE SEPARAÇÃO</button>':'')+(o.status==='out_for_delivery'&&!milestones.delivered&&!milestones.cancelled?'<button class="primary" id="deliverOrderV3" type="button" '+(customerPending?'disabled title="Complete os dados essenciais do cliente"':'')+'>CONFIRMAR ENTREGA</button><button class="secondary" id="deliveryFailedV4" type="button">ENTREGA NÃO CONCLUÍDA</button>':'')+(o.status==='confirmed'&&!sepStarted?'<button class="secondary" id="reopenOrderV3" type="button">REABRIR PEDIDO</button>':'')+(!milestones.delivered&&!milestones.cancelled?'<button class="text danger" id="cancelOrderV3" type="button">Cancelar pedido</button>':'')+'</div></div>'+fiscal;
    $('#editorActions').innerHTML='<button class="secondary" id="cancelEditor">Fechar</button>'+(editable?'<button class="primary" id="saveOrder">Salvar dados</button>':'');$('#cancelEditor').onclick=()=>$('#editor').close();if($('#saveOrder'))$('#saveOrder').onclick=saveOrderV3;if($('#sendCustomerVitrineV3'))$('#sendCustomerVitrineV3').onclick=e=>sendOrderCustomerVitrineV3(o.id,e.currentTarget);if($('#openOrderVitrineV3'))$('#openOrderVitrineV3').onclick=openCurrentOrderVitrine;if($('#confirmOrderV3'))$('#confirmOrderV3').onclick=()=>quickConfirmOrder(o.id,$('#confirmOrderV3')).then(()=>openOrder(o.id));if($('#openSeparationV3'))$('#openSeparationV3').onclick=()=>{const id=o.id;$('#editor').close();openOrderSeparationSheet(id)};if($('#deliverOrderV3'))$('#deliverOrderV3').onclick=()=>openOrderDeliveryConfirm(o.id);if($('#deliveryFailedV4'))$('#deliveryFailedV4').onclick=()=>returnOrderToExpedition(o.id,true);if($('#startDispatchV4'))$('#startDispatchV4').onclick=startCurrentOrderDispatchV4;if($('#reopenOrderV3'))$('#reopenOrderV3').onclick=()=>reopenOrderV3(o.id);if($('#cancelOrderV3'))$('#cancelOrderV3').onclick=cancelCurrentOrder;if($('#executeFiscalCanary'))$('#executeFiscalCanary').onclick=executeCurrentOrderFiscalCanary;if($('#refreshFiscalCanary'))$('#refreshFiscalCanary').onclick=recheckCurrentOrderFiscal;if($('#recoverBlingOrder'))$('#recoverBlingOrder').onclick=recoverCurrentOrderBling;if($('#printDanfe'))$('#printDanfe').onclick=openCurrentDanfe;
  }

  function blingPreflightOperationalBlockers(p){
    if(!p||p.error)return [];
    const expected=new Set(['first_separation_required','stock_not_consumed']);
    const blockers=Array.isArray(p.write_blockers)&&p.write_blockers.length?p.write_blockers:(p.blockers||[]);
    return [...new Set(blockers)].filter(code=>!expected.has(code));
  }
  async function loadCurrentOrderBlingPreview(repaint=true){
    const id=state.currentOrder?.order?.id;if(!id)return;
    let preview;
    try{
      preview=await api('bling_preview_order_sync',{},{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})
      });
    }catch(e){
      preview={error:String(e?.message||'bling_preview_unavailable')};
    }
    if(state.currentOrder?.order?.id!==id)return;
    state.currentOrderBlingPreview=preview;
    if(repaint&&$('#editor')?.open)paintOrderDetail();
  }

  function fiscalBlockReasonLabel(code){
    const map={
      delivery_not_confirmed:'Aguardando confirmação da entrega',
      payment_not_confirmed:'Aguardando confirmação do pagamento',
      payment_review_required:'Pagamento precisa de revisão',
      settled_amount_missing:'Valor recebido não informado',
      settled_amount_mismatch:'Valor recebido diferente do pedido',
      order_cancelled:'Pedido cancelado',
      order_returned:'Pedido devolvido',
      fiscal_control_missing:'Controle fiscal ainda não iniciado',
      fiscal_subtotal_item_sum_mismatch:'A soma dos produtos não confere com o subtotal fiscal',
      canonical_total_not_balanced:'O total do pedido não confere com subtotal, acréscimos e descontos',
      bling_order_not_linked:'O pedido ainda não está vinculado à venda no Bling',
      bling_order_not_verified:'A venda ainda não chegou ao status Verificado no Bling',
      invoice_generation_failed:'O Bling recebeu a solicitação, mas não conseguiu gerar a NF-e',
      fiscal_dispatch_preflight_failed:'A conferência fiscal encontrou dados inconsistentes',
      fiscal_dispatch_not_eligible:'O pedido ainda não está apto para emissão',
      invoice_generation_recovery_required:'Tentativa anterior teve erro ou tempo de resposta excedido. A recuperação automática está verificando a nota antes de permitir novo envio.',
      fiscal_status_unavailable:'Não foi possível consultar o retorno fiscal no Bling'
    };
    return map[code]||String(code||'').replaceAll('_',' ');
  }
  function fiscalDiagnosticHtml(f){
    if(!f||f.authorized===true)return '';
    const provider=f.provider||{},job=provider.job||{},readiness=f.readiness||{},raw=[
      ...(Array.isArray(f.hard_blockers)?f.hard_blockers:[]),
      ...(Array.isArray(f.blockers)?f.blockers:[]),
      job.error_code,f.fiscal_block_reason
    ].filter(Boolean),reasons=[...new Set(raw)].map(fiscalBlockReasonLabel);
    const detail=job.error_detail||provider.error_detail||provider.detail||'';
    const attempts=job.attempts!=null?Number(job.attempts):null;
    const lines=[];
    if(reasons.length)lines.push('<strong>Motivo identificado</strong><div>'+reasons.map(esc).join(' · ')+'</div>');
    if(detail)lines.push('<div style="margin-top:6px">'+esc(detail)+'</div>');
    if(readiness?.eligible===false&&readiness?.reason)lines.push('<div style="margin-top:6px">Pré-validação: '+esc(fiscalBlockReasonLabel(readiness.reason))+'</div>');
    if(attempts!=null)lines.push('<div style="margin-top:6px">Tentativas registradas: '+attempts+'</div>');
    const repair=f.fiscal_recovery||null,diagnosis=repair?.diagnostics||{};
    const repairLabels={
      started:'Verificação automática iniciada',
      existing_invoice_reconciled:'NF-e existente encontrada e reconciliada',
      existing_invoice_needs_authorization_or_review:'NF-e encontrada no Bling: aguarda autorização ou revisão',
      generation_result_uncertain_manual_reconcile_required:'O Bling não confirmou a geração; nenhuma nova nota foi criada para evitar duplicidade',
      unverified_ncm_requires_review:'NCM não possui documentação fiscal suficiente para correção automática',
      proposed_ncm_not_in_official_active_catalog:'Código proposto não consta na tabela NCM vigente',
      official_classif_unavailable:'Tabela oficial de NCM temporariamente indisponível',
      official_classif_data_unrecognized:'Tabela oficial de NCM precisa ser validada antes da correção',
      auto_invoice_authorized:'NF-e corrigida e autorizada automaticamente',
      auto_invoice_authorization_pending:'NF-e enviada; aguardando retorno da SEFAZ',
      auto_invoice_retry_failed:'Nova tentativa falhou; erro registrado',
      fiscal_preflight_blocked:'A conferência fiscal ainda possui bloqueios',
      unrecognized_fiscal_error:'Erro fiscal não reconhecido com segurança',
      separation_not_completed:'Separação física ainda não foi concluída',
      unable_to_identify_fiscal_products:'Não foi possível identificar inequivocamente o item fiscal',
      ambiguous_product_name:'Há ambiguidade entre os nomes dos produtos; bloqueio preventivo'
    };
    if(repair){
      const label=repairLabels[repair.stage]||String(repair.stage||'').replaceAll('_',' ');
      lines.push('<div style="margin-top:8px"><strong>Recuperação automática</strong><div>'+esc(label)+'</div></div>');
      const corrected=Array.isArray(diagnosis.corrected_products)?diagnosis.corrected_products.length:0;
      if(corrected)lines.push('<div>'+corrected+' produto(s) com NCM corrigido e conferido no Bling.</div>');
      if(Array.isArray(diagnosis.issues)&&diagnosis.issues.length)lines.push('<div>Itens para revisão: '+diagnosis.issues.length+'. Nenhum NCM será adivinhado.</div>');
      if(repair.created_at)lines.push('<div class="muted">Última análise: '+esc(dateTime(repair.created_at))+'</div>');
    }
    if(!lines.length&&f.stage==='pending')lines.push('<strong>Aguardando retorno do Bling</strong><div>A solicitação fiscal ainda não trouxe NF-e nem erro específico.</div>');
    return lines.length?'<div class="rule-notice warn" style="margin-top:8px">'+lines.join('')+'</div>':'';
  }

  function orderFiscalHtml(f,o){
    if(!f)return '<div class="rule-notice"><strong>Carregando controle fiscal…</strong><div>Consultando a situação da NF-e.</div></div>';
    if(f.error)return '<div class="rule-notice warn"><strong>NF-e INDISPONÍVEL</strong><div>A saída continua bloqueada até o controle fiscal voltar.</div></div>';
    const blockers=Array.isArray(f.blockers)?f.blockers:[];
    if(f.authorized===true||f.stage==='authorized')return '<div class="rule-notice"><strong>NF-e AUTORIZADA</strong><div>'+(f.invoice_number?'Nota '+esc(f.invoice_number)+' · ':'')+esc(f.sefaz_status||'Autorizada pela SEFAZ')+'</div></div>';
    if(f.stage==='processing')return '<div class="rule-notice warn"><strong>NF-e EM PROCESSAMENTO</strong><div>Aguarde a autorização. Não repita a geração da nota.</div></div>';
    if(f.stage==='rejected')return '<div class="rule-notice warn"><strong>NF-e REJEITADA</strong><div>'+esc(f.sefaz_status||blockers.map(fiscalBlockReasonLabel).join(' · ')||'Revise o retorno fiscal antes de tentar novamente.')+'</div></div>'+fiscalDiagnosticHtml(f);
    if(f.stage==='blocked')return '<div class="rule-notice warn"><strong>NF-e BLOQUEADA</strong><div>'+esc(blockers.map(fiscalBlockReasonLabel).join(' · ')||'Existem requisitos pendentes para emissão.')+'</div></div>'+fiscalDiagnosticHtml(f);
    return '<div class="rule-notice warn"><strong>NF-e PENDENTE</strong><div>A nota ainda não foi autorizada. Veja abaixo o retorno mais recente da integração.</div></div>'+fiscalDiagnosticHtml(f);
  }
  function fiscalCanaryActionHtml(f,o){
    if(!o||!['ready','out_for_delivery','delivered'].includes(o.status))return '';
    const busy=state.fiscalActionBusy===true,disabled=busy?' disabled':'';
    const latest=state.fiscalActionByOrder?.[o.id]||'';
    const feedback=latest?'<div class="rule-notice" role="status" style="margin-top:8px"><strong>Última consulta / tentativa</strong><div>'+esc(latest)+'</div></div>':'';
    const check='<button class="secondary" id="refreshFiscalCanary" type="button"'+disabled+'>CONSULTAR BLING / NF-e</button>';
    if(o.status!=='ready')return feedback+(o.status==='out_for_delivery'?'<div class="rule-notice"><strong>SAIU PARA ENTREGA</strong><div>NF-e deve estar autorizada antes da expedição.</div></div>':'')+'<div class="print-actions">'+check+'</div>';
    if(f?.authorized===true||f?.stage==='authorized')return feedback+'<div class="print-actions"><button class="primary" id="startDispatchV4" type="button">SAIU PARA ENTREGA</button>'+check+'</div>';
    const blockers=[...(f?.hard_blockers||[]),...(f?.blockers||[])].map(String);
    const missingLink=blockers.some(x=>['bling_order_not_linked','bling_order_not_verified','external_order_key_missing'].includes(x));
    const recover=missingLink?'<button class="primary" id="recoverBlingOrder" type="button"'+disabled+'>RECUPERAR VENDA NO BLING</button>':'';
    const invoiceId=Number(f?.invoice_id||f?.bling_invoice_id||0);
    const issue=f?.can_issue===true&&!missingLink?'<button class="primary" id="executeFiscalCanary" type="button"'+disabled+'>'+(invoiceId?'TENTAR AUTORIZAR NF-e':'TENTAR EMITIR NF-e')+'</button>':'';
    const explanation=missingLink
      ?'<div class="muted" style="margin-top:8px">Recupera a venda existente e confirma o status Verificado. Não cria uma segunda venda para o mesmo pedido.</div>'
      :invoiceId?'<div class="muted" style="margin-top:8px">NF-e localizada no Bling. Consulte primeiro a situação antes de tentar autorizar; o sistema impede o reenvio quando a transmissão já está em andamento.</div>':'';
    return feedback+explanation+'<div class="print-actions" style="margin-top:8px">'+recover+issue+check+'</div>';
  }
  async function recoverCurrentOrderBling(){
    const o=state.currentOrder?.order;
    if(!o||o.status!=='ready'||state.fiscalActionBusy)return;
    if(!confirm('Recuperar a venda do pedido #'+orderDisplayCode(o)+' no Bling?\\n\\nSerá consultada a venda existente e atualizado seu vínculo e status, sem emitir NF-e nesta etapa.'))return;
    state.fiscalActionBusy=true;paintOrderDetail();
    try{
      const result=await api('order_fiscal_recover_bling_v1',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:o.id,operator:currentOperator()||'Operação'})
      });
      state.fiscalActionByOrder??={};
      state.fiscalActionByOrder[o.id]='Venda no Bling recuperada e confirmada como Verificado. '+(result.fiscal?.can_issue?'A NF-e está liberada para tentativa manual.':result.fiscal?.authorized?'NF-e já autorizada.':'Consulte a situação fiscal antes de prosseguir.');
      state.currentOrderFiscal=result.fiscal||null;
      toast('Venda recuperada no Bling · confira a NF-e');
    }catch(e){
      state.fiscalActionByOrder??={};
      state.fiscalActionByOrder[o.id]='Falha na recuperação: '+fiscalBlockReasonLabel(e?.message||'bling_recovery_failed')+'. Os itens separados foram preservados.';
      toast(state.fiscalActionByOrder[o.id]);
    }finally{
      state.fiscalActionBusy=false;
      await loadCurrentOrderFiscal(false);
      if(state.currentOrder?.order?.id===o.id)paintOrderDetail();
    }
  }
  async function recheckCurrentOrderFiscal(){
    const o=state.currentOrder?.order;
    if(!o||state.fiscalActionBusy)return;
    state.fiscalActionBusy=true;paintOrderDetail();
    try{
      const result=await api('order_fiscal_recheck_v1',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:o.id})
      });
      state.currentOrderFiscal=result.fiscal||null;
      state.fiscalByOrder[o.id]=state.currentOrderFiscal;
      const f=result.fiscal||{},reason=result.reconcile?.reason||'';
      state.fiscalActionByOrder??={};
      state.fiscalActionByOrder[o.id]=f.authorized?'Nota autorizada pela SEFAZ.'
        :f.invoice_id?'Nota '+(f.invoice_number||f.invoice_id)+' encontrada; situação: '+(f.sefaz_status||f.stage||'pendente')+'.'
        :reason==='invoice_not_found'?'Consulta concluída: nenhuma NF-e encontrada no Bling para esta venda.'
        :reason==='fiscal_dispatch_not_eligible'?'Consulta concluída: ainda existe bloqueio de vínculo ou de verificação da venda.'
        :'Consulta concluída: '+(f.stage||'pendente')+'. Nenhuma NF-e foi enviada nesta consulta.';
      toast(state.fiscalActionByOrder[o.id]);
    }catch(e){
      state.fiscalActionByOrder??={};
      state.fiscalActionByOrder[o.id]='Não foi possível consultar o Bling: '+fiscalBlockReasonLabel(e?.message||'fiscal_status_unavailable');
      toast(state.fiscalActionByOrder[o.id]);
    }finally{
      state.fiscalActionBusy=false;
      if(state.currentOrder?.order?.id===o.id)paintOrderDetail();
    }
  }
  async function executeCurrentOrderFiscalCanary(){
    const o=state.currentOrder?.order;if(!o||o.status!=='ready')return;
    const f=state.currentOrderFiscal||{};if(f.can_issue!==true){toast('A NF-e ainda não está liberada para emissão');return}
    if(!confirm('EMITIR NF-e do pedido #'+orderDisplayCode(o)+' agora?\n\nA emissão será enviada ao Bling/SEFAZ.'))return;
    const btn=$('#executeFiscalCanary');if(btn){btn.disabled=true;btn.textContent='EMITINDO NF-e…'}
    try{
      const result=await api('order_fiscal_issue_v4',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:o.id,confirmation:'EMITIR_NFE',operator:currentOperator()||'Operação'})});
      state.currentOrderFiscal=result.fiscal||result;state.fiscalByOrder[o.id]=state.currentOrderFiscal;
      toast(state.currentOrderFiscal?.authorized?'NF-e autorizada':state.currentOrderFiscal?.stage==='rejected'?'NF-e rejeitada · consulte a situação fiscal':result.requires_reconciliation?'Resultado da emissão ainda não confirmado · reconsulte antes de tentar novamente':'Solicitação enviada ao Bling · aguardando confirmação');
      await loadCurrentOrderFiscal(true);
    }catch(e){
      try{await loadCurrentOrderFiscal(true)}catch{}
      const current=state.currentOrderFiscal||{},job=current.provider?.job||{},reason=job.error_detail||job.error_code||e?.message||'fiscal_issue_failed';
      const uncertain=(current.blockers||[]).includes('invoice_generation_recovery_required')
        ||['generating','authorizing'].includes(String(job.status||''))
        ||/uncertain|timeout|result.*unknown|resultado.*incerto/i.test(String(reason||''));
      toast(current.authorized?'NF-e autorizada após reconciliação':uncertain?'Resultado fiscal incerto · reconsulte/reconcilie a NF-e antes de tentar outra emissão':'Emissão fiscal não confirmada · '+fiscalBlockReasonLabel(reason));
    }
  }
  async function startCurrentOrderDispatchV4(){
    const o=state.currentOrder?.order;if(!o||o.status!=='ready')return;
    const f=state.currentOrderFiscal||{};if(f.authorized!==true&&f.stage!=='authorized'){toast('A NF-e precisa estar autorizada antes da saída');return}
    if(!confirm('Confirmar que o pedido #'+orderDisplayCode(o)+' SAIU PARA ENTREGA?'))return;
    const btn=$('#startDispatchV4');if(btn){btn.disabled=true;btn.textContent='REGISTRANDO SAÍDA…'}
    try{await api('order_dispatch_start_v4',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:o.id,operator:currentOperator()||'Expedição',idempotency_key:'dispatch-v4:'+o.id})});toast('Saída para entrega registrada');delete state.fiscalByOrder[o.id];await loadOrders();await openOrder(o.id)}catch(e){toast(errorMessage(e.message));if(btn){btn.disabled=false;btn.textContent='SAIU PARA ENTREGA'}}
  }
