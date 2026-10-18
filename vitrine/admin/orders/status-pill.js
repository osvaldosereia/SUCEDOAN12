(function(global){
  function createOrderStatusPill(esc){
  function statusPill(status){
    const map={created:'Novo',storefront_received:'Recebido',confirmed:'Confirmado',sent_to_bling:'Bling',processing:'Separando',ready:'Pronto',out_for_delivery:'Em entrega',delivered:'Entregue',cancelled:'Cancelado',returned:'Devolvido'};
    const cls=status==='cancelled'?'danger':status==='created'?'warn':'';
    return '<span class="pill '+cls+'">'+esc(map[status]||status||'—')+'</span>';
  }

    return {statusPill};
  }
  global.DonaAntoniaAdminOrderStatusPill=Object.freeze({createOrderStatusPill});
})(window);
