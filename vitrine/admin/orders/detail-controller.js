// Order editor lifecycle and writes. Rendering and backend contracts are ports.
(function(global){
  function readDeliveryAddress(query){
    const field=name=>query('#orderDelivery'+name)?.value||'';
    return {customer_name:field('Name'),phone:field('Phone'),postal_code:field('PostalCode'),street:field('Street'),number:field('Number'),district:field('District'),complement:field('Complement'),city:field('City'),state:field('State'),raw_text:field('RawText')};
  }
  function create({api,session,ui,errorMessage,view,customers}){
    const {query:$,toast,confirm,prompt,currentOperator}=ui;
    const writes=new Set();
    const post=payload=>api('order_update',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    function currentOrderEditablePayload(status){
      const order=session.detail?.order||{};
      const currentCustomer=session.detail?.customer||{};
      const currentCustomerId=currentCustomer.source_customer_id||order.delivery_address_snapshot?.source_customer_id||order.customer_id||'';
      const id=order.id;
      const selectedId=$('#orderCustomer')?.value||'';
      const selectedCustomer=customers.get().find(c=>c.id===selectedId)||null;
      const payload={id,payment_method:$('#orderPayment')?.value||''};
      if(selectedCustomer)payload.customer_snapshot=selectedCustomer;
      else if(!currentCustomerId)payload.customer_snapshot=null;
      if($('#orderDeliveryStreet'))payload.delivery_address=readDeliveryAddress($);
      if(status)payload.status=status;
      return payload;
    }
    async function openOrder(id){
      const token=session.begin(id),editor=$('#editor'),title=$('#editorTitle'),body=$('#editorBody');
      title.textContent='Pedido';body.innerHTML='<div class="loading">Carregando pedido…</div>';
      $('#editorActions').innerHTML='<button class="secondary" id="cancelEditor">Fechar</button>';
      $('#cancelEditor').onclick=()=>editor.close();if(!editor.open)editor.showModal();
      try{
        const data=await api('order',{id});if(!session.isCurrent(token))return;
        session.detail=data;
        if(['confirmed','processing','ready','out_for_delivery','delivered'].includes(data.order?.status)){
          try{
            const sep=await api('order_separation_get',{id});if(!session.isCurrent(token))return;
            data.separation=sep.separation||sep;
          }catch(error){if(!session.isCurrent(token))return}
        }
        if(['ready','out_for_delivery','delivered'].includes(data.order?.status))await view.loadFiscal(false);
        if(session.isCurrent(token))view.paint();
      }catch(error){if(session.isCurrent(token))body.innerHTML='<div class="empty">Não consegui abrir este pedido.</div>'}
    }
    async function update(payload,message,button){
      const id=String(payload.id),token=session.capture();if(writes.has(id))return;
      writes.add(id);if(button){button.disabled=true;button.textContent='Salvando…'}
      try{
        await post(payload);toast(message);
        // Refreshing the list may update shared data, but cannot take over a different modal.
        if(session.isCurrent(token))await openOrder(payload.id);
        await view.refreshList();
      }catch(error){
        toast(errorMessage(error.message));
        if(session.isCurrent(token)&&button){button.disabled=false;button.textContent='Salvar dados'}
      }finally{writes.delete(id)}
    }
    function saveOrderV3(){
      const order=session.detail?.order;if(!order||['delivered','cancelled'].includes(order.status))return;
      return update({id:order.id,payment_method:$('#orderPayment')?.value||'',delivery_address:readDeliveryAddress($),operator:currentOperator()||'Operação'},'Dados do pedido atualizados',$('#saveOrder'));
    }
    async function cancelCurrentOrder(){
      const order=session.detail?.order;if(!order||writes.has(String(order.id)))return;
      const linked=session.detail?.bling_link?.linked===true;
      const choice=prompt('Motivo do cancelamento:\n\n1 - Cliente desistiu\n2 - Produto indisponível\n3 - Endereço / área de entrega\n4 - Pedido duplicado\n5 - Problema de pagamento\n6 - Erro no pedido\n7 - Outro\n\nDigite o número ou escreva o motivo:');
      if(choice===null)return;
      const value=String(choice||'').trim(),reasons={'1':'Cliente desistiu','2':'Produto indisponível','3':'Endereço / área de entrega','4':'Pedido duplicado','5':'Problema de pagamento','6':'Erro no pedido','7':'Outro'},reason=reasons[value]||value;
      if(!reason){toast('Informe o motivo do cancelamento');return}
      const noteInput=prompt('Observação opcional sobre o cancelamento:', '');if(noteInput===null)return;
      const note=String(noteInput||'').trim();
      const message=linked?'Cancelar este pedido por "'+reason+'"?\n\nO estoque reservado será devolvido quando aplicável. Como o pedido já está vinculado ao Bling, qualquer situação que não puder ser atualizada automaticamente ficará registrada para revisão.':'Cancelar este pedido por "'+reason+'"? O estoque reservado será devolvido quando aplicável.';
      if(!confirm(message))return;
      return update({...currentOrderEditablePayload('cancelled'),cancellation_reason:reason,cancellation_note:note},linked?'Pedido cancelado · Bling será conferido':'Pedido cancelado',$('#cancelOrderV3'));
    }
    async function reopenOrderV3(id){
      if(writes.has(String(id))||!confirm('Reabrir este pedido para edição? A reserva será liberada.'))return;
      const token=session.capture();writes.add(String(id));
      try{
        await api('order_reopen_v3',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,operator:currentOperator()||'Operação'})});
        toast('Pedido reaberto');await view.refreshList();
        if(session.isCurrent(token))await openOrder(id);
      }catch(error){toast(errorMessage(error.message))}
      finally{writes.delete(String(id))}
    }
    return Object.freeze({openOrder,saveOrderV3,cancelCurrentOrder,reopenOrderV3});
  }
  global.DonaAntoniaAdminOrderDetail=Object.freeze({create,readDeliveryAddress});
})(window);
