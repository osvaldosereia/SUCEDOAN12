// Renderização da fila de impressão; não dispara impressão nem muda estados.
(function(global){
  function createPrintQueuePanel(state,esc,orderDisplayCode){
    const labels={pending:'Aguardando',failed:'Falhou',claimed:'Em impressão'};
    function renderJob(job,orders){
      const order=orders.find(o=>o&&String(o.id)===String(job.entity_id));
      const status='<span class="pill '+(job.status==='failed'?'danger':'')+'">'+esc(labels[job.status])+'</span>';
      const details='<div class="history-main"><strong>Separação · #'+esc(orderDisplayCode(order))+'</strong><small>'+
        esc(job.printer_profile||'85 mm')+(job.last_error?' · '+esc(job.last_error):'')+'</small></div>';
      const hasOrderId=job.entity_id!==null&&job.entity_id!==undefined&&String(job.entity_id).trim()!=='';
      const button=hasOrderId?'<button class="quick-link" type="button" data-print-order="'+esc(job.entity_id)+'">Abrir pedido</button>':'';
      return '<div class="history-row" style="align-items:center">'+status+details+button+'</div>';
    }
    function renderOpsPrintQueue(){
      const queue=state?.opsPrintQueue||{};
      const jobs=Array.isArray(queue.jobs)?queue.jobs:[];
      const active=jobs.filter(j=>j&&Object.prototype.hasOwnProperty.call(labels,j.status)).slice(0,8);
      if(!active.length)return '';
      const orders=Array.isArray(state?.orders)?state.orders:[];
      return '<section class="panel" style="margin-bottom:14px">'+
        '<div class="history-title" style="padding:14px 14px 0"><strong>Fila de impressão</strong>'+
        '<span class="muted">a impressão automática ainda está em homologação</span></div>'+
        '<div style="padding:8px 14px 14px">'+active.map(job=>renderJob(job,orders)).join('')+'</div></section>';
    }
    return {renderOpsPrintQueue};
  }
  global.DonaAntoniaAdminPrintQueuePanel=Object.freeze({createPrintQueuePanel});
})(window);
