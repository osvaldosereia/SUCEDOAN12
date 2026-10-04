from pathlib import Path

p=Path('vitrine/admin/index.html')
s=p.read_text(encoding='utf-8')
start=s.index('  async function renderToday(){')
end=s.index('  function expeditionFiscalState(o){',start)
new=r'''  async function renderToday(){
    // CENTRAL_LAZY_ON_DEMAND_V1
    const content=$('#content');
    const sectionState=new Map();
    const sections=[
      ['orders','Pedidos e expedição','Separação, prontos, entrega e fechamento'],
      ['attention','Precisa de atenção','Pendências operacionais que exigem ação'],
      ['expiry','Estoque e validades','Alertas de validade para revisar'],
      ['integrations','WhatsApp e integrações','Situação dos canais e integrações'],
      ['printing','Impressão','Fila de impressão operacional']
    ];
    const sectionHtml=sections.map(([key,title,subtitle])=>
      '<section class="panel" style="margin-bottom:10px">'+
        '<button class="secondary" type="button" data-central-toggle="'+key+'" aria-expanded="false" style="width:100%;border:0;border-radius:0;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;padding:12px 14px">'+
          '<span><strong style="display:block">'+esc(title)+'</strong><small class="muted" style="display:block;margin-top:2px">'+esc(subtitle)+'</small></span>'+
          '<span data-central-status="'+key+'" class="muted" style="white-space:nowrap">Carregar</span>'+
        '</button>'+
        '<div id="centralSection-'+key+'" hidden style="border-top:1px solid var(--line);padding:12px 14px"></div>'+
      '</section>'
    ).join('');
    content.innerHTML=
      '<div class="page-head"><div><h1>Central</h1><p>Acessos rápidos e informações carregadas somente quando você precisar.</p></div><button class="secondary" id="refreshToday">Atualizar</button></div>'+
      '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:14px">'+
        '<button class="secondary" type="button" data-central-shortcut="orders">Pedidos</button>'+
        '<button class="secondary" type="button" data-central-shortcut="attendance">Atendimento</button>'+
        '<button class="secondary" type="button" data-central-shortcut="products">Produtos</button>'+
      '</div>'+sectionHtml;
    $('#refreshToday').onclick=renderToday;
    content.querySelectorAll('[data-central-shortcut]').forEach(b=>b.onclick=()=>setTab(b.dataset.centralShortcut));

  async function loadCentralSection(name,body){
      if(name==='orders'){
        const [data,closureData]=await Promise.all([
          api('orders'),
          api('closure_orders').catch(()=>null)
        ]);
        state.orders=data.orders||[];
        if(closureData){
          state.closureOrders=closureData.orders||[];
          state.closurePendingCount=Number(closureData.pending_count||0);
          state.fiscalByOrder={...state.fiscalByOrder,...(closureData.fiscal_by_order||{})};
        }else state.closurePendingCount=0;
        const pending=sortOperationalOrders(state.orders.filter(o=>!['delivered','cancelled'].includes(o.status))).slice(0,8);
        body.innerHTML=renderTodayCards()+
          '<div class="panel"><div class="history-title" style="padding:14px 14px 0"><strong>Próximos pedidos</strong><span class="muted">pendências primeiro · depois os mais antigos</span></div><div id="todayOrders"></div></div>';
        const todayOrders=body.querySelector('#todayOrders');
        if(todayOrders){
          todayOrders.innerHTML=pending.length?pending.map(o=>'<button class="history-row today-order-row" type="button" data-today-order="'+esc(o.id)+'"><strong>#'+esc(shortOrder(o.order_number))+'</strong><div class="history-main"><strong>'+esc(o.customer_name||'Sem cliente')+'</strong><small>'+money(o.total_cents)+' · '+esc(o.payment_method_snapshot?.label||o.payment_method_snapshot?.method||'Pagamento não informado')+'</small></div><span class="next-action">'+esc(orderNextAction(o))+'</span><span class="today-status">'+statusPill(o.status)+'</span></button>').join(''):'<div class="history-empty">Nenhum pedido pendente agora.</div>';
          todayOrders.querySelectorAll('[data-today-order]').forEach(b=>b.onclick=()=>openOrder(b.dataset.todayOrder));
        }
        body.querySelectorAll('[data-today-filter]').forEach(b=>b.onclick=()=>{state.orderFilter=b.dataset.todayFilter;if(state.orderFilter!=='problems')state.orderIssueFilter='all';setTab('orders')});
        body.querySelectorAll('[data-today-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.todayTab));
        body.querySelectorAll('[data-today-issue]').forEach(b=>b.onclick=()=>{state.orderFilter='problems';state.orderIssueFilter=b.dataset.todayIssue;setTab('orders')});
        return;
      }
      if(name==='attention'){
        const attentionData=await api('ops_attention',{limit:20});
        state.opsAttention=attentionData?.attention||[];
        body.innerHTML=renderOpsAttention();
        body.querySelectorAll('[data-attention-open]').forEach(b=>b.onclick=()=>setTab(b.dataset.attentionTab||'today'));
        return;
      }
      if(name==='expiry'){
        const expiryAlerts=await api('expiry_alerts');
        state.expiryAlerts=expiryAlerts||null;
        body.innerHTML=renderTodayExpiryAlert()||'<div class="history-empty">Nenhum alerta de validade agora.</div>';
        body.querySelectorAll('[data-today-expiry]').forEach(b=>b.onclick=()=>setTab('expiry'));
        return;
      }
      if(name==='integrations'){
        const papoData=await api('ops_papoai_capture_status').catch(()=>null);
        state.opsPapoAi=papoData?.papoai||null;
        body.innerHTML='<div id="integrationOperationalAlert"></div><div id="papoAiBridgeSlot">'+renderPapoAiBridgePanel()+'</div>';
        const papoLinkBtn=body.querySelector('[data-papoai-create-link]');if(papoLinkBtn)papoLinkBtn.onclick=createPapoAiCatalogLink;
        body.querySelectorAll('[data-retry-bling-status]').forEach(b=>b.onclick=retryBlingStatusCatalog);
        await loadOperationalIntegrationAlert();
        return;
      }
      if(name==='printing'){
        const printData=await api('ops_print_queue',{limit:20});
        state.opsPrintQueue=printData?.queue||null;
        body.innerHTML=renderOpsPrintQueue()||'<div class="history-empty">Nenhuma impressão pendente agora.</div>';
        body.querySelectorAll('[data-print-order]').forEach(b=>b.onclick=()=>openOrder(b.dataset.printOrder));
      }
    }

    async function toggleCentralSection(name){
      const body=$('#centralSection-'+name);
      const button=content.querySelector('[data-central-toggle="'+name+'"]');
      const status=content.querySelector('[data-central-status="'+name+'"]');
      if(!body||!button)return;
      if(!body.hidden){
        body.hidden=true;
        button.setAttribute('aria-expanded','false');
        if(status)status.textContent=sectionState.get(name)==='loaded'?'Abrir':'Carregar';
        return;
      }
      body.hidden=false;
      button.setAttribute('aria-expanded','true');
      if(sectionState.get(name)==='loaded'){
        if(status)status.textContent='Fechar';
        return;
      }
      sectionState.set(name,'loading');
      if(status)status.textContent='Carregando…';
      body.innerHTML='<div class="loading">Carregando…</div>';
      try{
        await loadCentralSection(name,body);
        sectionState.set(name,'loaded');
        if(status)status.textContent='Fechar';
      }catch(e){
        sectionState.delete(name);
        if(status)status.textContent='Tentar novamente';
        body.innerHTML='<div class="empty">Não consegui carregar este bloco. <button class="text" type="button" data-central-retry> Tentar novamente</button></div>';
        const retry=body.querySelector('[data-central-retry]');
        if(retry)retry.onclick=async()=>{body.hidden=true;await toggleCentralSection(name)};
      }
    }

    content.querySelectorAll('[data-central-toggle]').forEach(b=>b.onclick=()=>toggleCentralSection(b.dataset.centralToggle));
  }
'''
s=s[:start]+new+s[end:]
p.write_text(s,encoding='utf-8')
print('patched central lazy on demand')
