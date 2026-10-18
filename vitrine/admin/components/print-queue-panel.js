// Renderização da fila de impressão; não dispara impressão nem muda estados.
(function(global){
  function createPrintQueuePanel(state,esc,orderDisplayCode){
  function renderOpsPrintQueue(){
    const q=state.opsPrintQueue||{},jobs=Array.isArray(q.jobs)?q.jobs:[];
    if(!jobs.length)return '';
    const active=jobs.filter(j=>j&&['pending','failed','claimed'].includes(j.status));
    const orders=Array.isArray(state.orders)?state.orders:[];
    if(!active.length)return '';
    const label={pending:'Aguardando',failed:'Falhou',claimed:'Em impressão'};
    return '<section class="panel" style="margin-bottom:14px"><div class="history-title" style="padding:14px 14px 0"><strong>Fila de impressão</strong><span class="muted">a impressão automática ainda está em homologação</span></div><div style="padding:8px 14px 14px">'+active.slice(0,8).map(j=>'<div class="history-row" style="align-items:center"><span class="pill '+(j.status==='failed'?'danger':'')+'">'+esc(label[j.status]||j.status)+'</span><div class="history-main"><strong>Separação · #'+esc(orderDisplayCode(orders.find(o=>o&&String(o.id)===String(j.entity_id))))+'</strong><small>'+esc(j.printer_profile||'85 mm')+(j.last_error?' · '+esc(j.last_error):'')+'</small></div><button class="quick-link" type="button" data-print-order="'+esc(j.entity_id)+'">Abrir pedido</button></div>').join('')+'</div></section>';
  }

    return {renderOpsPrintQueue};
  }
  global.DonaAntoniaAdminPrintQueuePanel=Object.freeze({createPrintQueuePanel});
})(window);
