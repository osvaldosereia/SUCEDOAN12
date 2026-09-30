from pathlib import Path

p=Path('vitrine/admin/index.html')
s=p.read_text(encoding='utf-8')
start=s.index('  async function renderToday(){')
end=s.index('  function expeditionFiscalState(o){',start)
new=r'''  async function renderToday(){
    // CENTRAL_PROGRESSIVE_LOAD_V1
    const content=$('#content');
    content.innerHTML='<div class="page-head"><div><h1>Central</h1><p>O que está acontecendo e o que precisa da sua atenção.</p></div><button class="secondary" id="refreshToday">Atualizar</button></div><div id="integrationOperationalAlert"></div><div id="todayBody"><div class="loading">Carregando pedidos…</div></div>';
    $('#refreshToday').onclick=renderToday;
    const host=$('#todayBody');
    const paintCentral=()=>{
      if(!host)return;
      host.innerHTML=renderOps2Summary()+'<div id="papoAiBridgeSlot">'+renderPapoAiBridgePanel()+'</div>'+renderOpsAttention()+renderOpsPrintQueue()+renderOpsTimeline()+renderTodayExpiryAlert()+renderTodayCards()+
        '<div class="panel"><div class="history-title" style="padding:14px 14px 0"><strong>Próximos pedidos</strong><span class="muted">pendências primeiro · depois os mais antigos</span></div><div id="todayOrders"></div></div>';
      const papoLinkBtn=host.querySelector('[data-papoai-create-link]');if(papoLinkBtn)papoLinkBtn.onclick=createPapoAiCatalogLink;
      host.querySelectorAll('[data-retry-bling-status]').forEach(b=>b.onclick=retryBlingStatusCatalog);
      host.querySelectorAll('[data-attention-open]').forEach(b=>b.onclick=()=>setTab(b.dataset.attentionTab||'today'));
      host.querySelectorAll('[data-print-order]').forEach(b=>b.onclick=()=>openOrder(b.dataset.printOrder));
      host.querySelectorAll('[data-today-expiry]').forEach(b=>b.onclick=()=>setTab('expiry'));
      host.querySelectorAll('[data-today-filter]').forEach(b=>b.onclick=()=>{state.orderFilter=b.dataset.todayFilter;if(state.orderFilter!=='problems')state.orderIssueFilter='all';setTab('orders')});
      host.querySelectorAll('[data-today-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.todayTab));
      host.querySelectorAll('[data-today-issue]').forEach(b=>b.onclick=()=>{state.orderFilter='problems';state.orderIssueFilter=b.dataset.todayIssue;setTab('orders')});
      const pending=sortOperationalOrders(state.orders.filter(o=>!['delivered','cancelled'].includes(o.status))).slice(0,8);
      const todayOrders=$('#todayOrders');
      if(todayOrders){
        todayOrders.innerHTML=pending.length?pending.map(o=>'<button class="history-row today-order-row" type="button" data-today-order="'+esc(o.id)+'"><strong>#'+esc(shortOrder(o.order_number))+'</strong><div class="history-main"><strong>'+esc(o.customer_name||'Sem cliente')+'</strong><small>'+money(o.total_cents)+' · '+esc(o.payment_method_snapshot?.label||o.payment_method_snapshot?.method||'Pagamento não informado')+'</small></div><span class="next-action">'+esc(orderNextAction(o))+'</span><span class="today-status">'+statusPill(o.status)+'</span></button>').join(''):'<div class="history-empty">Nenhum pedido pendente agora.</div>';
        todayOrders.querySelectorAll('[data-today-order]').forEach(b=>b.onclick=()=>openOrder(b.dataset.todayOrder));
      }
    };
    try{
      const data=await api('orders');
      state.orders=data.orders||[];
      paintCentral();
      host.insertAdjacentHTML('beforeend','<div class="loading" id="todayDeferredLoading">Carregando indicadores complementares…</div>');

      const [opsData,closureData]=await Promise.all([
        api('ops_summary').catch(()=>null),
        api('closure_orders').catch(()=>null)
      ]);
      state.opsSummary=opsData?.summary||null;
      if(closureData){
        state.closureOrders=closureData.orders||[];
        state.closurePendingCount=Number(closureData.pending_count||0);
        state.fiscalByOrder={...state.fiscalByOrder,...(closureData.fiscal_by_order||{})};
      }else state.closurePendingCount=0;
      paintCentral();

      const [attentionData,printData]=await Promise.all([
        api('ops_attention',{limit:20}).catch(()=>null),
        api('ops_print_queue',{limit:20}).catch(()=>null)
      ]);
      state.opsAttention=attentionData?.attention||[];
      state.opsPrintQueue=printData?.queue||null;
      paintCentral();

      const [papoData,timelineData]=await Promise.all([
        api('ops_papoai_capture_status').catch(()=>null),
        api('ops_timeline',{limit:20}).catch(()=>null)
      ]);
      state.opsPapoAi=papoData?.papoai||null;
      state.opsTimeline=timelineData?.events||[];
      paintCentral();

      const expiryAlerts=await api('expiry_alerts').catch(()=>null);
      state.expiryAlerts=expiryAlerts||null;
      paintCentral();
      loadOperationalIntegrationAlert();
    }catch(e){
      host.innerHTML='<div class="empty">Não consegui carregar os pedidos. <button class="text" id="retryToday">Tentar novamente</button></div>';
      if($('#retryToday'))$('#retryToday').onclick=renderToday;
    }
  }
'''
s=s[:start]+new+s[end:]
p.write_text(s,encoding='utf-8')
print('patched central progressive load')
