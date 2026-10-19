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
  function quickConfirmOrder(id,btn){return orderList.confirmOrder(id,btn)}
  function closeOrderSeparationSheet(){document.querySelector('.orders-bottom-sheet-backdrop')?.remove()}
  function separationMoney(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
  const orderSeparationView=window.DonaAntoniaAdminOrderSeparationView.create({document,escapeHtml:esc});
  async function openOrderSeparationSheet(id){const order=state.orders.find(o=>String(o.id)===String(id));if(order&&orderCustomerDataPending(order)){toast('Complete os dados essenciais do cliente antes da separação');return}if(order&&!orderV3Milestones(order).confirmed){toast('Confirme o pedido antes de iniciar a separação');return}const originalPublicCode=orderDisplayCode(order);closeOrderSeparationSheet();const back=orderSeparationView.createShell(originalPublicCode);document.body.appendChild(back);orderSeparationView.bindInteractions({backdrop:back,orderId:id,close:closeOrderSeparationSheet,onItem:(orderId,itemId,separationState,sheet,button)=>setOrderSeparationItem(orderId,itemId,separationState,sheet.dataset.orderUpdatedAt||'',sheet.dataset.separatorKey||'',sheet,button)});await loadOrderSeparationSheet(id,back)}
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
  async function openOrderDeliveryConfirm(id){let order=state.orders.find(o=>String(o.id)===String(id));if(!order){await loadOrders();order=state.orders.find(o=>String(o.id)===String(id))}if(order&&orderCustomerDataPending(order)){toast('Complete os dados essenciais do cliente antes da entrega');return}if(!order||order.status!=='out_for_delivery'||orderV3Milestones(order).delivered){toast('O pedido precisa ter SAÍDO PARA ENTREGA antes da confirmação');return}const planned=order.payment_method_snapshot?.label||order.payment_method_snapshot?.method||'A confirmar',method=deliveryMethodV3(order.payment_method_snapshot?.method||planned);const dlg=document.createElement('dialog');dlg.className='delivery-v3-dialog';dlg.innerHTML='<div class="delivery-v3-body"><h2>Confirmar entrega</h2><div class="muted">Pedido #'+esc(orderDisplayCode(order))+'</div><div class="delivery-v3-grid"><label><span>Forma prevista</span><input value="'+esc(planned)+'" readonly></label><label><span>Forma recebida</span><select id="deliveryV3Method">'+deliveryMethodOptionsV3(method)+'</select></label><label><span>Valor recebido</span><input value="'+esc(money(order.total_cents||0))+'" readonly></label></div></div><div class="delivery-v3-actions"><button class="delivery-v3-cancel" type="button">Cancelar</button><button class="delivery-v3-confirm" type="button">CONFIRMAR ENTREGA</button></div>';document.body.appendChild(dlg);const close=()=>{dlg.close();dlg.remove()};dlg.querySelector('.delivery-v3-cancel').onclick=close;dlg.querySelector('.delivery-v3-confirm').onclick=async()=>{const btn=dlg.querySelector('.delivery-v3-confirm');btn.disabled=true;btn.textContent='CONFIRMANDO…';try{await api('order_delivery_complete_v3',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,method:dlg.querySelector('#deliveryV3Method').value,amount_cents:Number(order.total_cents||0),operator:currentOperator()||'Entrega',idempotency_key:'delivery-v3:'+id})});toast('Entrega e recebimento confirmados');close();await loadOrders();if(orderSession.detail?.order?.id===id)await openOrder(id)}catch(e){toast(errorMessage(e.message));btn.disabled=false;btn.textContent='CONFIRMAR ENTREGA'}};dlg.showModal()}
  async function sendOrderCustomerVitrineV3(id,btn){const access=String(sessionStorage.getItem('da_finance_access_token_v1')||'').trim();if(!access){toast('Sua sessão do Admin expirou');return}if(btn){btn.disabled=true;btn.textContent='ENVIANDO…'}try{const response=await fetch('https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-order-vitrine-send-v1',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+access},body:JSON.stringify({order_id:id,request_id:(crypto.randomUUID?.()||String(Date.now())).replace(/[^A-Za-z0-9-]/g,'').slice(0,80)})}),data=await response.json().catch(()=>({}));if(!response.ok||data?.ok===false)throw new Error(data?.error||'vitrine_send_failed');toast('Vitrine enviada ao cliente pelo WhatsApp '+(String(data.channel_phone_e164||'').replace(/\D/g,'').endsWith('1018')?'1018':'0975'))}catch(e){toast(e.message==='conversation_not_found'||e.message==='channel_unavailable'?'Não encontrei com segurança a conversa 0975/1018 deste pedido.':errorMessage(e.message))}finally{if(btn&&document.contains(btn)){btn.disabled=false;btn.textContent='VITRINE CLIENTE'}}}
  function reopenOrderV3(id){return orderDetailController.reopenOrderV3(id)}

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
    const id=orderSession.detail?.order?.id,btn=$('#generateOrderVitrine');if(!id||btn?.disabled)return;
    if(btn){btn.disabled=true;btn.textContent='Gerando…'}
    try{
      const data=await api('order',{id});
      if(orderSession.detail?.order?.id!==id)return;
      if(data.order?.id!==id||!publicOrderUrlFor(data.order))throw new Error('link_unavailable');
      Object.assign(orderSession.detail.order,{public_order_url:data.order.public_order_url,public_order_code:data.order.public_order_code});
      const panel=$('#orderPublicVitrinePanel');if(panel){panel.innerHTML=orderPublicVitrineHtml(orderSession.detail.order);bindCurrentOrderVitrine()}
      toast('Vitrine do pedido disponível');
    }catch{if(orderSession.detail?.order?.id===id)toast('Não consegui gerar a vitrine agora. Tente novamente.')}
    finally{if(btn){btn.disabled=false;btn.textContent='Gerar vitrine'}}
  }
  async function copyCurrentOrderPublicLink(){
    const url=publicOrderUrlFor(orderSession.detail?.order);if(!url)return;
    try{await navigator.clipboard.writeText(url);toast('Link da vitrine copiado')}
    catch{
      const input=$('#orderPublicLink');input?.focus();input?.select();
      let copied=false;try{copied=document.execCommand('copy')}catch{}
      toast(copied?'Link da vitrine copiado':'O link está selecionado. Copie pelo teclado ou mantenha pressionado para copiar.');
    }
  }
  function openCurrentOrderVitrine(){
    const url=publicOrderUrlFor(orderSession.detail?.order);if(url)window.open(url,'_blank','noopener,noreferrer');
  }
  function printCurrentOrderVitrine(){
    const url=publicOrderUrlFor(orderSession.detail?.order);if(!url)return;
    const printUrl=new URL(url);printUrl.searchParams.set('print','1');
    window.open(printUrl.toString(),'_blank','noopener,noreferrer');
  }
  function openOrder(id){return orderDetailController.openOrder(id)}
  function saveOrderV3(){return orderDetailController.saveOrderV3()}
  function cancelCurrentOrder(){return orderDetailController.cancelCurrentOrder()}
  function paintOrderDetail(){return orderDetailView.paintOrderDetail()}
  function openDanfeForOrder(id,orderCode=''){return orderDocuments.openDanfeForOrder(id,orderCode)}
  const orderFiscalController=window.DonaAntoniaAdminOrderFiscal.create({
    api,session:orderSession,cache:()=>state.fiscalByOrder,reads:fiscalReads,
    ui:{query:$,confirm,toast,currentOperator},formatters:{esc,dateTime,money,errorMessage},orderView:{orderDisplayCode},
    view:{paint:paintOrderDetail,open:openOrder,refreshList:loadOrders,currentTab:()=>state.tab,renderClosure,openDanfe:openDanfeForOrder}
  });
  function loadCurrentOrderFiscal(repaint=true){return orderFiscalController.loadCurrentOrderFiscal(repaint)}
  function orderFiscalHtml(f,o){return orderFiscalController.orderFiscalHtml(f,o)}
  function fiscalCanaryActionHtml(f,o){return orderFiscalController.fiscalCanaryActionHtml(f,o)}
  function recoverCurrentOrderBling(){return orderFiscalController.recoverCurrentOrderBling()}
  function recheckCurrentOrderFiscal(){return orderFiscalController.recheckCurrentOrderFiscal()}
  function executeCurrentOrderFiscalCanary(){return orderFiscalController.executeCurrentOrderFiscalCanary()}
  function startCurrentOrderDispatchV4(){return orderFiscalController.startCurrentOrderDispatchV4()}
  function openCurrentDanfe(){return orderFiscalController.openCurrentDanfe()}
  function fiscalBlockReasonLabel(code){return orderFiscalController.fiscalBlockReasonLabel(code)}
  const orderDetailController=window.DonaAntoniaAdminOrderDetail.create({
    api,session:orderSession,ui:{query:$,toast,confirm,prompt,currentOperator},errorMessage,
    view:{paint:paintOrderDetail,refreshList:loadOrders,loadFiscal:loadCurrentOrderFiscal},customers:{get:()=>state.customers}
  });
  const orderDetailView=window.DonaAntoniaAdminOrderDetailView.create({
    session:orderSession,query:$,formatters:{esc,fmtQty,money,dateTime,formatPhone},
    model:{orderV3Milestones,orderCustomerDataPending,orderCustomerDataPendingReasons,orderV3Tags,orderV3PaymentOptions,orderDisplayCode,separationMoney,publicOrderUrlFor},
    fiscal:{orderFiscalHtml,fiscalCanaryActionHtml},
    actions:{saveOrderV3,sendOrderCustomerVitrineV3,openCurrentOrderVitrine,quickConfirmOrder,openOrder,openOrderSeparationSheet,openOrderDeliveryConfirm,returnOrderToExpedition,startCurrentOrderDispatchV4,reopenOrderV3,cancelCurrentOrder,executeCurrentOrderFiscalCanary,recheckCurrentOrderFiscal,recoverCurrentOrderBling,openCurrentDanfe}
  });
