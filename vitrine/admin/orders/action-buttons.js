(function(root){
  'use strict';
  function createOrderActionButtonsHtml(deps){
    const {orderProblemReasons,orderNextAction,esc}=deps;
    return function orderActionButtonsHtml(o,dispatchGate){
      // Keep stock-consumption and fiscal gates explicit; button order is operationally significant.
      if(!o||typeof o!=='object')return '';
      const consumed=o?.payment_method_snapshot?.stock_consumed===true;
      const reportedProblems=orderProblemReasons(o);
      const problems=Array.isArray(reportedProblems)?reportedProblems:[];
      const mustFix=problems.length>0&&['created','confirmed','ready','out_for_delivery'].includes(o?.status);
      const fiscalDispatchBlocked=o?.status==='ready'&&dispatchGate?.enforced===true&&dispatchGate?.allowed!==true;
      let primary='';
      if(mustFix)primary='<button class="primary" type="button" disabled>Corrija os dados antes de avançar</button>';
      if(!mustFix&&o?.status==='created')primary='<button class="primary" id="advanceOrder" data-next="confirmed" type="button">Confirmar pedido</button>';
      else if(!mustFix&&o?.status==='confirmed'&&!consumed)primary='<button class="primary" id="startSeparation" type="button">Iniciar separação</button>';
      else if(!mustFix&&o?.status==='confirmed'&&consumed)primary='<button class="primary" id="advanceOrder" data-next="processing" type="button">Continuar separação</button>';
      else if(o?.status==='processing'&&!consumed)primary='<button class="primary" id="startSeparation" type="button">Regularizar separação</button>';
      else if(o?.status==='processing')primary='<button class="primary" id="advanceOrder" data-next="ready" type="button">Finalizar separação</button>';
      else if(!mustFix&&o?.status==='ready'&&fiscalDispatchBlocked)primary='<button class="primary" type="button" disabled>Fiscal pendente antes da saída</button>';
      else if(!mustFix&&o?.status==='ready')primary='<button class="primary" id="advanceOrder" data-next="out_for_delivery" type="button">Marcar saída para entrega</button>';
      else if(!mustFix&&o?.status==='out_for_delivery')primary='<button class="primary" id="advanceOrder" data-next="delivered" type="button">Confirmar entrega</button>';
      const docs=[];
      if(o?.status==='out_for_delivery')docs.push('<button class="secondary" id="returnToExpedition" type="button">Entrega não concluída</button>');
      if(consumed)docs.push('<button class="secondary" id="reprintSeparation" type="button">Reimprimir separação</button>');
      if(['ready','out_for_delivery','delivered'].includes(o?.status))docs.push('<button class="secondary" id="printDelivery" type="button">Imprimir via do entregador</button>');
      const cancel=!['delivered','cancelled'].includes(o?.status)?'<button class="text danger" id="cancelOrder" type="button">Cancelar pedido</button>':'';
      return '<div class="order-action-zone"><strong>'+esc(orderNextAction(o))+'</strong><small>Use a próxima ação abaixo; o sistema atualiza estoque e integrações quando necessário.</small><div class="print-actions">'+(primary||'')+docs.join('')+'</div>'+cancel+'</div>';
    };
  }
  root.DonaAntoniaAdminOrderActionButtons=Object.freeze({createOrderActionButtonsHtml});
})(window);
