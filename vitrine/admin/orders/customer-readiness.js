// Pure customer completeness rules shared by order, expedition and separation views.
((root)=>{
  function create(normalize){
    const normalizeText=typeof normalize==='function'?normalize:value=>String(value||'').toLowerCase();
    function orderCustomerDataPendingReasons(order){
      const labels=['Cliente não identificado','Telefone pendente','Endereço incompleto','CPF/CNPJ pendente'];
      const address=order?.delivery_address_snapshot||{};
      const missing=(Array.isArray(order?.registration_missing_fields)?order.registration_missing_fields:[])
        .map(value=>normalizeText(String(value||'')));
      const reasons=[];
      if(!order?.customer_id)reasons.push(labels[0]);
      if(!String(order?.whatsapp_phone_e164||address.phone||'').replace(/\D/g,''))reasons.push(labels[1]);
      if(![address.street,address.number,address.city,address.state].every(value=>String(value||'').trim()))reasons.push(labels[2]);
      if(order?.document_only_pending===true||missing.some(value=>value.includes('cpf')||value.includes('cnpj')||value.includes('document')))reasons.push(labels[3]);
      return [...new Set(reasons)];
    }
    function isOrderCustomerDataPending(order){return orderCustomerDataPendingReasons(order).length>0}
    return Object.freeze({orderCustomerDataPendingReasons,isOrderCustomerDataPending});
  }
  root.DonaAntoniaAdminCustomerReadiness=Object.freeze({create});
})(window);
