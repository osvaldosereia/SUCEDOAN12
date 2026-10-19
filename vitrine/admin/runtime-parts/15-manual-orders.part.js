  const manualSaleController=window.DonaAntoniaAdminManualSale.create({
    sale:{get:()=>state.manualSale,set:value=>{state.manualSale=value}},api,customerApi,storefrontApi,
    orders:{render:renderOrders,open:openOrder,selectNewFilter:()=>{state.orderFilter='new'}},ui:{query:$,document,toast,errorMessage,currentOperator},
    formatters:{esc,money,formatPhone,formatCpf,fmtQty,normalize}
  });
  const {manualSaleTotalCents,manualSaleFormValue,manualSaleFillCustomer,paintManualSaleCart,searchManualCustomers,searchManualItems,openManualBasketConfig,addConfiguredManualBasket,openManualSale,createManualSale}=manualSaleController;

  const ORDER_SEPARATORS=[{key:'jose',label:'José'},{key:'claudio',label:'Cláudio'},{key:'jovenil',label:'Jovenil'},{key:'kelly',label:'Kelly'}];


  function separatorLabel(key){return ORDER_SEPARATORS.find(x=>x.key===String(key||'').toLowerCase())?.label||''}


  function orderSeparationSummary(o){return o?.separation_summary||{}}


  function orderV3SearchMatch(o,q){const n=normalize(q||'');if(!n)return true;return normalize([o.order_number,o.customer_name,o.whatsapp_phone_e164,o.delivery_address_snapshot?.street,o.delivery_address_snapshot?.district].filter(Boolean).join(' ')) .includes(n)}
  const {orderCustomerDataPendingReasons,isOrderCustomerDataPending:orderCustomerDataPending}=window.DonaAntoniaAdminCustomerReadiness.create(normalize);
  function orderSeparationCompletedV4(o){const s=String(o?.status||''),summary=orderSeparationSummary(o),meta=summary?.completion_metadata||{};if(summary?.completed_at||summary?.phase==='completed'||meta?.operational_completion===true)return true;if(summary?.phase==='needs_attention'&&meta?.stock_applied===true)return true;if(['out_for_delivery','delivered'].includes(s))return true;const f=state.fiscalByOrder[o?.id]||(orderSession.detail?.order?.id===o?.id?orderSession.fiscal:null);return s==='ready'&&f?.readiness?.separation_completed===true}
  function orderV3Milestones(o){const s=String(o?.status||'');return {confirmed:['confirmed','processing','ready','out_for_delivery','delivered'].includes(s),separated:orderSeparationCompletedV4(o),dispatched:['out_for_delivery','delivered'].includes(s),delivered:s==='delivered',cancelled:s==='cancelled'}}
  function orderFiscalTagV4(o){
    const f=state.fiscalByOrder[o?.id]||null;
    if(o?.status==='ready'){
      if(!f)return '<span class="order-v3-tag neutral">NF-e…</span>';
      if(f.error)return '<span class="order-v3-tag warn">NF-e INDISPONÍVEL</span>';
      if(f.authorized===true||f.stage==='authorized')return '<span class="order-v3-tag ok">NF-e AUTORIZADA</span>';
      if(f.stage==='processing')return '<span class="order-v3-tag warn">NF-e EM PROCESSAMENTO</span>';
      if(f.stage==='rejected')return '<span class="order-v3-tag danger">NF-e REJEITADA</span>';
      if(f.stage==='blocked')return '<span class="order-v3-tag warn">NF-e BLOQUEADA</span>';
      return '<span class="order-v3-tag warn">NF-e PENDENTE</span>';
    }
    if(o?.status==='out_for_delivery')return '<span class="order-v3-tag ok">NF-e AUTORIZADA</span><span class="order-v3-tag">SAIU PARA ENTREGA</span>';
    return '';
  }
  function orderV3Tags(o){const m=orderV3Milestones(o),tags=[],f=state.fiscalByOrder[o?.id]||(orderSession.detail?.order?.id===o?.id?orderSession.fiscal:null);if(m.confirmed)tags.push('<span class="order-v3-tag">CONFIRMADO</span>');if(m.separated)tags.push('<span class="order-v3-tag">SEPARADO</span>');else if(o?.status==='ready'&&f?.readiness?.separation_completed===false)tags.push('<span class="order-v3-tag warn">SEPARAÇÃO PENDENTE</span>');const fiscalTag=orderFiscalTagV4(o);if(fiscalTag)tags.push(fiscalTag);if(m.delivered)tags.push('<span class="order-v3-tag ok">ENTREGUE</span>');if(m.cancelled)tags.push('<span class="order-v3-tag cancelled">CANCELADO</span>');if(!tags.length)tags.push('<span class="order-v3-tag neutral">RECEBIDO</span>');if(orderCustomerDataPending(o))tags.push('<span class="order-v3-tag neutral" title="'+esc(orderCustomerDataPendingReasons(o).join(' · '))+'">AGUARDANDO DADOS DO CLIENTE</span>');return tags.join('')}
  function orderCardOperationalTags(o,m=orderV3Milestones(o)){const tags=[],sep=orderSeparationSummary(o);if(m.confirmed&&!m.separated&&!m.delivered&&!m.cancelled)tags.push('<span class="order-v3-tag ok">MONTAR PARA ENTREGAR HOJE</span>');if(m.separated&&sep?.phase==='needs_attention')tags.push('<span class="order-v3-tag warn">INTEGRAÇÃO PENDENTE</span>');const fiscalTag=orderFiscalTagV4(o);if(fiscalTag)tags.push(fiscalTag);if(orderCustomerDataPending(o))tags.push('<span class="order-v3-tag neutral" title="'+esc(orderCustomerDataPendingReasons(o).join(' · '))+'">DADOS DO CLIENTE PENDENTES</span>');return tags.join('')}
