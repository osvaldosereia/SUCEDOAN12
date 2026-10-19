  function currentOrderEditablePayload(status){
    const order=orderSession.detail?.order||{};
    const currentCustomer=orderSession.detail?.customer||{};
    const currentCustomerId=currentCustomer.source_customer_id||order.delivery_address_snapshot?.source_customer_id||order.customer_id||'';
    const id=order.id;
    const selectedId=$('#orderCustomer')?.value||'';
    const selectedCustomer=state.customers.find(c=>c.id===selectedId)||null;
    const payload={id,payment_method:$('#orderPayment')?.value||''};
    if(selectedCustomer)payload.customer_snapshot=selectedCustomer;
    else if(!currentCustomerId)payload.customer_snapshot=null;
    if($('#orderDeliveryStreet'))payload.delivery_address=window.DonaAntoniaAdminOrderDetail.readDeliveryAddress($);
    if(status)payload.status=status;
    return payload;
  }
  async function persistCurrentOrder(status,extra={}){
    const payload={...currentOrderEditablePayload(status),...(extra&&typeof extra==='object'?extra:{})};
    await api('order_update',{},{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const fresh=await api('order',{id:payload.id});orderSession.detail=fresh;
    await loadCurrentOrderFiscal(false);
    await loadCurrentOrderBlingPreview(false);
    return fresh;
  }
