// Lifecycle and labels shared by order cards, filters and the open-order view.
(function(global){
  const SEPARATORS=Object.freeze([{key:'jose',label:'José'},{key:'claudio',label:'Cláudio'},{key:'jovenil',label:'Jovenil'},{key:'kelly',label:'Kelly'}].map(Object.freeze));
  function create({normalize,escapeHtml,customerReadiness,cachedFiscalForOrder,detailFiscalForOrder}){
    const {isPending:orderCustomerDataPending,reasons:orderCustomerDataPendingReasons}=customerReadiness;
    const esc=escapeHtml;
    function separatorLabel(key){return SEPARATORS.find(x=>x.key===String(key||'').toLowerCase())?.label||''}
    function orderSeparationSummary(order){return order?.separation_summary||{}}
    function fiscalForOrder(order){return cachedFiscalForOrder(order)||detailFiscalForOrder(order)||null}
    function orderV3SearchMatch(order,query){const normalized=normalize(query||'');if(!normalized)return true;return normalize([order.order_number,order.customer_name,order.whatsapp_phone_e164,order.delivery_address_snapshot?.street,order.delivery_address_snapshot?.district].filter(Boolean).join(' ')).includes(normalized)}
    function orderSeparationCompletedV4(order){
      const status=String(order?.status||''),summary=orderSeparationSummary(order),metadata=summary?.completion_metadata||{};
      if(summary?.completed_at||summary?.phase==='completed'||metadata?.operational_completion===true)return true;
      if(summary?.phase==='needs_attention'&&metadata?.stock_applied===true)return true;
      if(['out_for_delivery','delivered'].includes(status))return true;
      return status==='ready'&&fiscalForOrder(order)?.readiness?.separation_completed===true;
    }
    function orderV3Milestones(order){const status=String(order?.status||'');return {confirmed:['confirmed','processing','ready','out_for_delivery','delivered'].includes(status),separated:orderSeparationCompletedV4(order),dispatched:['out_for_delivery','delivered'].includes(status),delivered:status==='delivered',cancelled:status==='cancelled'}}
    function orderListBucketKey(order){
      const milestones=orderV3Milestones(order);
      if(milestones.cancelled)return 'cancelled';
      if(milestones.delivered)return 'delivered';
      if(milestones.separated)return 'ready';
      if(milestones.confirmed)return 'separate';
      return 'new';
    }
    function orderFiscalTagV4(order){
      const fiscal=cachedFiscalForOrder(order);
      if(order?.status==='ready'){
        if(!fiscal)return '<span class="order-v3-tag neutral">NF-e…</span>';
        if(fiscal.error)return '<span class="order-v3-tag warn">NF-e INDISPONÍVEL</span>';
        if(fiscal.authorized===true||fiscal.stage==='authorized')return '<span class="order-v3-tag ok">NF-e AUTORIZADA</span>';
        if(fiscal.stage==='processing')return '<span class="order-v3-tag warn">NF-e EM PROCESSAMENTO</span>';
        if(fiscal.stage==='rejected')return '<span class="order-v3-tag danger">NF-e REJEITADA</span>';
        if(fiscal.stage==='blocked')return '<span class="order-v3-tag warn">NF-e BLOQUEADA</span>';
        return '<span class="order-v3-tag warn">NF-e PENDENTE</span>';
      }
      if(order?.status==='out_for_delivery')return '<span class="order-v3-tag ok">NF-e AUTORIZADA</span><span class="order-v3-tag">SAIU PARA ENTREGA</span>';
      return '';
    }
    function orderV3Tags(order){
      const milestones=orderV3Milestones(order),tags=[],fiscal=fiscalForOrder(order);
      if(milestones.confirmed)tags.push('<span class="order-v3-tag">CONFIRMADO</span>');
      if(milestones.separated)tags.push('<span class="order-v3-tag">SEPARADO</span>');
      else if(order?.status==='ready'&&fiscal?.readiness?.separation_completed===false)tags.push('<span class="order-v3-tag warn">SEPARAÇÃO PENDENTE</span>');
      const fiscalTag=orderFiscalTagV4(order);if(fiscalTag)tags.push(fiscalTag);
      if(milestones.delivered)tags.push('<span class="order-v3-tag ok">ENTREGUE</span>');
      if(milestones.cancelled)tags.push('<span class="order-v3-tag cancelled">CANCELADO</span>');
      if(!tags.length)tags.push('<span class="order-v3-tag neutral">RECEBIDO</span>');
      if(orderCustomerDataPending(order))tags.push('<span class="order-v3-tag neutral" title="'+esc(orderCustomerDataPendingReasons(order).join(' · '))+'">AGUARDANDO DADOS DO CLIENTE</span>');
      return tags.join('');
    }
    function orderCardOperationalTags(order,milestones=orderV3Milestones(order)){
      const tags=[],summary=orderSeparationSummary(order);
      if(milestones.confirmed&&!milestones.separated&&!milestones.delivered&&!milestones.cancelled)tags.push('<span class="order-v3-tag ok">MONTAR PARA ENTREGAR HOJE</span>');
      if(milestones.separated&&summary?.phase==='needs_attention')tags.push('<span class="order-v3-tag warn">INTEGRAÇÃO PENDENTE</span>');
      const fiscalTag=orderFiscalTagV4(order);if(fiscalTag)tags.push(fiscalTag);
      if(orderCustomerDataPending(order))tags.push('<span class="order-v3-tag neutral" title="'+esc(orderCustomerDataPendingReasons(order).join(' · '))+'">DADOS DO CLIENTE PENDENTES</span>');
      return tags.join('');
    }
    return Object.freeze({separators:SEPARATORS,separatorLabel,orderSeparationSummary,orderV3SearchMatch,orderSeparationCompletedV4,orderV3Milestones,orderListBucketKey,orderFiscalTagV4,orderV3Tags,orderCardOperationalTags});
  }
  global.DonaAntoniaAdminOrderCardModel=Object.freeze({create});
})(window);
