  const {separationItems,separationKitRefs}=window.DonaAntoniaAdminSeparationModel;
  function separationTicketBody(detail){
    const o=detail.order,items=separationItems(detail),kitRefs=separationKitRefs(detail),groups=[];
    for(const item of items){
      const key=item.gondola_number??'none';
      let group=groups.find(g=>g.key===key);
      if(!group){group={key,label:item.gondola_number?'GÔNDOLA '+item.gondola_number:'SEM GÔNDOLA',shelves:[]};groups.push(group)}
      const shelfKey=item.shelf_label||'none';
      let shelf=group.shelves.find(s=>s.key===shelfKey);
      if(!shelf){shelf={key:shelfKey,label:item.shelf_label?'PRATELEIRA '+item.shelf_label:'SEM PRATELEIRA',items:[]};group.shelves.push(shelf)}
      shelf.items.push(item);
    }
    const kitBlock=kitRefs.length?'<div class="block"><b>PEGAR PRONTO</b>'+kitRefs.map(x=>'<div style="border:2px solid #000;padding:1.5mm;margin:1mm 0;font-size:13px;font-weight:900">'+esc(fmtQty(x.quantity))+'× '+esc(x.label)+' · '+esc(x.code)+(x.basket?'<div style="font-size:8px;font-weight:600;margin-top:.5mm">'+esc(x.basket)+'</div>':'')+'</div>').join('')+'</div>':'';
    const sections=groups.map(g=>'<div class="gondola-title">'+esc(g.label)+'</div>'+g.shelves.map(s=>'<div class="shelf-title-print">'+esc(s.label)+'</div><div class="sep-grid">'+s.items.map(i=>'<div class="sep-card"><img src="'+esc(i.image_url||'/img/logoantonia5.png')+'" alt=""><div class="sep-name">'+esc(i.name)+'</div>'+(i.gtin?'<div class="sep-ean">EAN '+esc(i.gtin)+'</div>':'<div class="sep-ean missing">SEM EAN</div>')+'<div class="sep-qty">'+esc(fmtQty(i.quantity))+'×</div></div>').join('')+'</div>').join('')).join('');
    const units=items.reduce((sum,i)=>sum+Number(i.quantity||0),0),kitUnits=kitRefs.reduce((sum,x)=>sum+Number(x.quantity||0),0);
    return '<div class="ticket-head"><strong>DONA ANTÔNIA</strong><span>SEPARAÇÃO · Pedido #'+esc(orderDisplayCode(o))+'</span><small>'+esc(dateTime(o.created_at))+'</small></div>'+kitBlock+sections+'<div class="foot">'+kitRefs.length+' referência(s) pronta(s) · '+items.length+' produto(s) avulso(s) · '+esc(fmtQty(kitUnits+units))+' unidades/volumes</div>';
  }
  async function markPickingPresented(orderId){
    try{await api('ops_print_presented',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:orderId})})}catch(error){console.warn('ops_print_presented_failed',String(error?.message||error))}
  }
  function printSeparationOnly(detail,existingWindow=null){
    const o=detail.order,w=existingWindow||window.open('','_blank','width=420,height=700');
    if(!w){toast('Libere pop-ups para imprimir');return false}
    openPrint('Separação #'+orderDisplayCode(o),separationTicketBody(detail),'separation',w);
    markPickingPresented(o.id);
    return true;
  }
  async function startSeparationFlow(detail,existingWindow=null){
    const o=detail.order,w=existingWindow||window.open('','_blank','width=420,height=700');
    if(!w){toast('Libere pop-ups para imprimir');return}
    try{
      w.document.open();
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Preparando separação</title></head><body style="font:16px system-ui;padding:30px;text-align:center"><strong>Preparando separação…</strong><p>Validando pedido e estoque antes de imprimir.</p></body></html>');
      w.document.close();
      await persistCurrentOrder();
      const blingReady=await validateBlingBeforeSeparation(o.id);
      if(!blingReady){try{w.close()}catch{};return}
      await api('order_update',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:o.id,status:'processing',operator:currentOperator()||'Operação'})});
      printSeparationOnly(detail,w);
      toast('Separação iniciada · estoque e status atualizados juntos');
      const fresh=await api('order',{id:o.id});state.currentOrder=fresh;
      await loadCurrentOrderFiscal(false);
      paintOrderDetail();loadOrders();
    }catch(e){try{w.close()}catch{};toast(errorMessage(e.message))}
  }
  function printDelivery(detail){
    const o=detail.order,c=detail.customer||{},a=o.delivery_address_snapshot||c.address||{},payment=o.payment_method_snapshot?.label||o.payment_method_snapshot?.method||'—';
    const products=separationItems(detail).map(i=>'<div class="delivery-item"><b>'+esc(fmtQty(i.quantity))+'×</b><span>'+esc(i.name)+'</span></div>').join('');
    const address=[a.street,a.number,a.complement,a.district,a.city,a.state].filter(Boolean).join(', ')||a.raw_text||'NÃO INFORMADO';
    const body='<div class="ticket-head"><strong>DONA ANTÔNIA</strong><span>ENTREGA · Pedido #'+esc(orderDisplayCode(o))+'</span><small>'+esc(dateTime(o.created_at))+'</small></div>'+
      '<div class="block"><b>CLIENTE</b><div>'+esc(c.display_name||a.recipient_name||'NÃO VINCULADO')+'</div>'+(c.phone?'<div>Tel: '+esc(formatPhone(c.phone))+'</div>':'')+(c.cpf?'<div>CPF: '+esc(formatCpf(c.cpf))+'</div>':'')+(c.email?'<div>E-mail: '+esc(c.email)+'</div>':'')+'</div>'+
      '<div class="block"><b>ENDEREÇO</b><div>'+esc(address)+'</div>'+(a.postal_code?'<div>CEP: '+esc(a.postal_code)+'</div>':'')+'</div>'+
      '<div class="block"><b>PAGAMENTO</b><div>'+esc(payment)+'</div><div>Status: '+esc(o.status||'')+'</div><div class="big-total">TOTAL: '+money(o.total_cents)+'</div></div>'+
      '<div class="block"><b>PRODUTOS</b>'+products+'</div>'+
      '<div class="block lines"><div>Observações:</div><br><br><div>Recebido por: __________________</div></div>';
    openPrint('Entrega #'+orderDisplayCode(o),body,'delivery');
  }
  const openPrint=window.DonaAntoniaAdminPrinting.createOpenPrint(toast,esc);

  const {orderDisplayCode,phoneDigits,formatPhone,formatCpf}=window.DonaAntoniaAdminIdentifiers;
  const {errorMessage}=window.DonaAntoniaAdminErrors;

  const scanner={buffer:'',timer:null};
  document.addEventListener('keydown',e=>{
    if(!['balance','gondolas'].includes(state.tab))return;
    const tag=e.target?.tagName||'';
    if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;
    if(/^\d$/.test(e.key)){
      scanner.buffer+=e.key;
      clearTimeout(scanner.timer);
      scanner.timer=setTimeout(()=>{scanner.buffer=''},900);
      e.preventDefault();
      return;
    }
    if(e.key==='Enter'||e.key==='Tab'){
      const ean=scanner.buffer;scanner.buffer='';clearTimeout(scanner.timer);
      if(ean.length>=4){
        if(state.tab==='balance')handleBalanceScan(ean);
        if(state.tab==='gondolas')handleGondolaScan(ean);
      }
      e.preventDefault();
    }
  });

  $('#closeEditor').onclick=()=>$('#editor').close();
  $('#editor').addEventListener('click',e=>{if(e.target===$('#editor'))$('#editor').close()});

  window.DonaAntoniaAdminBridge={
    api,
    token:adminStepUp,
    operator:requireOperator,
    toast,
    refresh:renderBaskets,
    errorMessage
  };

  async function start(){
    const params=new URLSearchParams(location.search),sharedSeparationId=params.get('separacao')||'',pickerMode=params.get('montar')==='1';
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if(pickerMode){
      if(!uuid.test(sharedSeparationId)){location.replace('/montar/?erro=pedido_invalido');return}
      try{
        // Verify current membership server-side. Do not show other Admin orders.
        const allowed=await manualQueueRpc('list');
        if(!Array.isArray(allowed.order_ids)||!allowed.order_ids.some(x=>String(x)===sharedSeparationId)){
          location.replace('/montar/?erro=pedido_indisponivel');return;
        }
        // Load only this one order, preserving the exact customer/status checks used by
        // the canonical separation sheet, without rendering the full Admin order list.
        const detail=await api('order',{id:sharedSeparationId});
        const selectedOrder=detail?.order||null;
        if(!selectedOrder||String(selectedOrder.id)!==sharedSeparationId){
          location.replace('/montar/?erro=pedido_indisponivel');return;
        }
        if(orderCustomerDataPending(selectedOrder)){
          location.replace('/montar/?erro=dados_pendentes');return;
        }
        if(!orderV3Milestones(selectedOrder).confirmed||orderV3Milestones(selectedOrder).separated||
            orderV3Milestones(selectedOrder).cancelled){
          location.replace('/montar/?erro=pedido_indisponivel');return;
        }
        state.orders=[selectedOrder];
        await openOrderSeparationSheet(sharedSeparationId);
        const sheet=document.querySelector('.orders-bottom-sheet-backdrop');
        if(!sheet){location.replace('/montar/?erro=vitrine_indisponivel');return}
        const close=sheet.querySelector('.orders-sheet-close');
        if(close)close.onclick=()=>location.replace('/montar/');
        sheet.addEventListener('click',e=>{
          if(e.target===sheet){e.stopImmediatePropagation();location.replace('/montar/')}
        },true);
      }catch(error){
        console.error('montar_existing_vitrine',error);
        location.replace('/montar/?erro=acesso');
      }
      return;
    }
    // Abre o cadastro completo em nova aba a partir dos mini cards de Cestas Molde.
    const directProductId=params.get('editar_produto')||'';
    if(directProductId){
      if(!uuid.test(directProductId)){setTab('products');toast('Link de produto inválido');return}
      setTab('products');
      await openProductEditor({id:directProductId});
      history.replaceState({},'',location.pathname+location.hash);
      return;
    }
    // Link direto vindo do Atendimento: exibir pedido no modal para revisão e confirmação humana.
    const directOrderId=params.get('pedido')||'';
    if(directOrderId){
      if(!uuid.test(directOrderId)){setTab('today');toast('Link de pedido inválido');return}
      state.orderStatusTab='received';
      await setTab('orders');
      await openOrder(directOrderId);
      history.replaceState({},'',location.pathname+location.hash);
      return;
    }
    if(!uuid.test(sharedSeparationId)){setTab('today');return}
    await setTab('orders');
    await openOrderSeparationSheet(sharedSeparationId);
    history.replaceState({},'',location.pathname+location.hash);
  }
  start();
})();
