// Leitura operacional de pedidos; sem chamadas de rede ou mutação.
(function(global){
  function createOrderReadModel(cuiabaDayKey,state){
    function orderProblemReasons(o){
  const reasons=[];
  if(o?.history_sync?.state==='failed')reasons.push('Histórico pendente do cliente');
  if(['delivered','cancelled'].includes(o?.status))return reasons;
  const a=o?.delivery_address_snapshot||{};
  const canonicalKnown=typeof o?.registration_complete==='boolean';
  if(canonicalKnown){
    const missing=Array.isArray(o?.registration_missing_fields)?o.registration_missing_fields:[];
    if(missing.includes('name'))reasons.push('Cliente não identificado');
    if(missing.includes('phone'))reasons.push('Telefone pendente');
    if(missing.includes('address')||missing.includes('city'))reasons.push('Endereço incompleto');
    if(o?.document_only_pending===true)reasons.push('CPF/CNPJ pendente');
  }else{
    const customerName=o?.customer_name||a.customer_name||a.recipient_name||'';
    if(!String(customerName).trim())reasons.push('Cliente não identificado');
    if(!String(a.street||'').trim()||!String(a.city||'').trim())reasons.push('Endereço incompleto');
  }
  const payment=o?.payment_method_snapshot?.label||o?.payment_method_snapshot?.method||'';
  if(!String(payment).trim())reasons.push('Pagamento não informado');
  if(o?.stock_readiness?.ok===false)reasons.push('Estoque insuficiente');
  if(o?.delivery_return?.status==='returned_review')reasons.push('Retorno aguardando revisão');
  return reasons;
}
  function isBacklogOrder(o){
    if(!o||!['created','confirmed','processing','ready','out_for_delivery'].includes(o.status))return false;
    const orderDay=cuiabaDayKey(o.created_at);
    const today=cuiabaDayKey(new Date());
    return Boolean(orderDay&&today&&orderDay<today);
  }
  function orderIssueMatch(o,key='all'){
    const reasons=orderProblemReasons(o);
    if(key==='all')return reasons.length>0;
    const labels={
      address:'Endereço incompleto',
      customer:'Cliente não identificado',
      payment:'Pagamento não informado',
      history:'Histórico pendente do cliente',
      stock:'Estoque insuficiente'
    };
    return reasons.includes(labels[key]||'');
  }
  function orderIssueCount(key){return (Array.isArray(state.orders)?state.orders:[]).filter(o=>o&&orderIssueMatch(o,key)).length}
  function orderOperationalPriority(o){
    if(orderProblemReasons(o).length)return 0;
    if(isBacklogOrder(o))return 1;
    const rank={created:2,confirmed:3,processing:4,ready:5,out_for_delivery:6,delivered:7,cancelled:8};
    return rank[o?.status]??8;
  }
  function orderNextAction(o){
    const problems=orderProblemReasons(o);
    if(problems.length)return 'Corrigir: '+problems[0];
    const consumed=o?.payment_method_snapshot?.stock_consumed===true;
    const map={
      created:'Confirmar pedido',
      confirmed:consumed?'Continuar separação':'Iniciar separação',
      processing:consumed?'Finalizar separação':'Regularizar separação',
      ready:'Liberar para entrega',
      out_for_delivery:'Confirmar entrega',
      delivered:'Conferir pagamento / fiscal',
      cancelled:'Nenhuma ação'
    };
    return map[o?.status]||'Revisar pedido';
  }
  function orderFilterMatch(o,filter){
    if(filter==='all')return true;
    if(!o)return false;
    if(filter==='new')return o.status==='created';
    if(filter==='separate')return ['confirmed','processing'].includes(o.status);
    if(filter==='ready')return o.status==='ready';
    if(filter==='delivery')return o.status==='out_for_delivery';
    if(filter==='finalized')return o.status==='delivered';
    if(filter==='backlog')return isBacklogOrder(o);
    if(filter==='problems')return orderIssueMatch(o,state.orderIssueFilter);
    return true;
  }
    return {orderProblemReasons,isBacklogOrder,orderIssueMatch,orderIssueCount,orderOperationalPriority,orderNextAction,orderFilterMatch};
  }
  global.DonaAntoniaAdminOrderReadModel=Object.freeze({createOrderReadModel});
})(window);
