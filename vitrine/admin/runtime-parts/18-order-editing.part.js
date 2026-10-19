  function currentOrderEditablePayload(status){
    const order=state.currentOrder?.order||{};
    const currentCustomer=state.currentOrder?.customer||{};
    const currentCustomerId=currentCustomer.source_customer_id||order.delivery_address_snapshot?.source_customer_id||order.customer_id||'';
    const id=order.id;
    const selectedId=$('#orderCustomer')?.value||'';
    const selectedCustomer=state.customers.find(c=>c.id===selectedId)||null;
    const payload={id,payment_method:$('#orderPayment')?.value||''};
    if(selectedCustomer)payload.customer_snapshot=selectedCustomer;
    else if(!currentCustomerId)payload.customer_snapshot=null;
    if($('#orderDeliveryStreet'))payload.delivery_address={
      customer_name:$('#orderDeliveryName')?.value||'',
      phone:$('#orderDeliveryPhone')?.value||'',
      postal_code:$('#orderDeliveryPostalCode')?.value||'',
      street:$('#orderDeliveryStreet')?.value||'',
      number:$('#orderDeliveryNumber')?.value||'',
      district:$('#orderDeliveryDistrict')?.value||'',
      complement:$('#orderDeliveryComplement')?.value||'',
      city:$('#orderDeliveryCity')?.value||'',
      state:$('#orderDeliveryState')?.value||'',
      raw_text:$('#orderDeliveryRawText')?.value||''
    };
    if(status)payload.status=status;
    return payload;
  }
  async function persistCurrentOrder(status,extra={}){
    const payload={...currentOrderEditablePayload(status),...(extra&&typeof extra==='object'?extra:{})};
    await api('order_update',{},{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const fresh=await api('order',{id:payload.id});state.currentOrder=fresh;
    await loadCurrentOrderFiscal(false);
    await loadCurrentOrderBlingPreview(false);
    return fresh;
  }
  async function advanceCurrentOrder(next){
    const btn=$('#advanceOrder');if(btn){btn.disabled=true;btn.textContent='Atualizando…'}
    try{
      await persistCurrentOrder(next);
      paintOrderDetail();loadOrders();
      toast('Pedido atualizado · '+orderNextAction(state.currentOrder.order));
    }catch(e){
      toast(errorMessage(e.message));
      if(btn){btn.disabled=false;btn.textContent='Tentar novamente'}
    }
  }
  async function cancelCurrentOrder(){
    const linked=state.currentOrder?.bling_link?.linked===true;
    const choice=prompt(
      'Motivo do cancelamento:\n\n1 - Cliente desistiu\n2 - Produto indisponível\n3 - Endereço / área de entrega\n4 - Pedido duplicado\n5 - Problema de pagamento\n6 - Erro no pedido\n7 - Outro\n\nDigite o número ou escreva o motivo:'
    );
    if(choice===null)return;
    const value=String(choice||'').trim();
    const reasons={
      '1':'Cliente desistiu',
      '2':'Produto indisponível',
      '3':'Endereço / área de entrega',
      '4':'Pedido duplicado',
      '5':'Problema de pagamento',
      '6':'Erro no pedido',
      '7':'Outro'
    };
    const reason=reasons[value]||value;
    if(!reason){toast('Informe o motivo do cancelamento');return}
    const noteInput=prompt('Observação opcional sobre o cancelamento:', '');
    if(noteInput===null)return;
    const note=String(noteInput||'').trim();
    const message=linked
      ? 'Cancelar este pedido por "'+reason+'"?\n\nO estoque reservado será devolvido quando aplicável. Como o pedido já está vinculado ao Bling, qualquer situação que não puder ser atualizada automaticamente ficará registrada para revisão.'
      : 'Cancelar este pedido por "'+reason+'"? O estoque reservado será devolvido quando aplicável.';
    if(!confirm(message))return;
    try{
      await persistCurrentOrder('cancelled',{cancellation_reason:reason,cancellation_note:note});
      paintOrderDetail();loadOrders();
      toast(linked?'Pedido cancelado · Bling será conferido':'Pedido cancelado');
    }catch(e){toast(errorMessage(e.message))}
  }
  async function saveOrder(){
    const btn=$('#saveOrder');btn.disabled=true;btn.textContent='Salvando…';
    try{
      await persistCurrentOrder();
      paintOrderDetail();toast('Dados do pedido salvos');loadOrders();
    }catch(e){toast(errorMessage(e.message));btn.disabled=false;btn.textContent='Salvar dados'}
  }

  function customerSummary(c,snapshot){
    const a=snapshot||c?.address||{};
    if(!c?.id&&!snapshot)return '<span class="muted">Cliente ainda não vinculado. Cadastre em Clientes e selecione acima.</span>';
    const address=[a.street,a.number,a.complement,a.district,a.city,a.state].filter(Boolean).join(', ')||a.raw_text||'Endereço não informado';
    return '<strong>'+esc(c.display_name||a.recipient_name||'Cliente')+'</strong><br>'+
      (c.phone?'Telefone: '+esc(formatPhone(c.phone))+'<br>':'')+
      (c.cpf?'CPF: '+esc(formatCpf(c.cpf))+'<br>':'')+
      (c.email?'E-mail: '+esc(c.email)+'<br>':'')+
      'Endereço: '+esc(address);
  }

