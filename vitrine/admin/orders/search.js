// Busca textual de pedidos: regra original com normalizador injetado.
(function(global){
  function createOrderSearch(normalize){
  function orderSearchMatch(o,q){
    const needle=normalize(q);
    if(!needle)return true;
    const a=o?.delivery_address_snapshot||{};
    const payment=o?.payment_method_snapshot?.label||o?.payment_method_snapshot?.method||'';
    const haystack=[
      o?.order_number,o?.customer_name,o?.whatsapp_phone_e164,a.phone,a.customer_name,a.recipient_name,
      a.street,a.number,a.district,a.city,a.state,payment
    ].map(normalize).join(' ');
    return haystack.includes(needle);
  }
    return {orderSearchMatch};
  }
  global.DonaAntoniaAdminOrderSearch=Object.freeze({createOrderSearch});
})(window);
