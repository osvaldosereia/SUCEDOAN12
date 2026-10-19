  const openPrint=window.DonaAntoniaAdminPrinting.createOpenPrint(toast,esc);


  const orderDocuments=window.DonaAntoniaAdminOrderDocuments.create({
    api,ui:{window,toast},formatters:{esc,fmtQty,dateTime,orderDisplayCode,formatPhone,formatCpf,money,errorMessage},
    separationModel:window.DonaAntoniaAdminSeparationModel,openPrint
  });
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
      orderList.state.orderStatusTab='received';
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
