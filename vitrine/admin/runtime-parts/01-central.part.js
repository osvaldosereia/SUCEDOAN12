  function statusPill(status){
    const map={created:'Novo',storefront_received:'Recebido',confirmed:'Confirmado',sent_to_bling:'Bling',processing:'Separando',ready:'Pronto',out_for_delivery:'Em entrega',delivered:'Entregue',cancelled:'Cancelado',returned:'Devolvido'};
    const cls=status==='cancelled'?'danger':status==='created'?'warn':'';
    return '<span class="pill '+cls+'">'+esc(map[status]||status||'—')+'</span>';
  }

  const {cuiabaDayKey,deliveredToday,relativeAge}=window.DonaAntoniaAdminOrderTime;
  const {orderSearchMatch}=window.DonaAntoniaAdminOrderSearch.createOrderSearch(normalize);
  const {whatsappHref,whatsappMessageHref}=window.DonaAntoniaAdminWhatsappLinks;
  const {sortOperationalOrders}=window.DonaAntoniaAdminOrderSorting;
  const {orderProblemReasons,isBacklogOrder,orderIssueMatch,orderIssueCount,orderOperationalPriority,orderNextAction,orderFilterMatch}=window.DonaAntoniaAdminOrderReadModel.createOrderReadModel(cuiabaDayKey,state);
  const {orderMissingDataRequest,orderAddressRequestHref,mapsHrefFromAddress,orderContactActionsHtml}=window.DonaAntoniaAdminOrderContactActions.createOrderContactActions(orderProblemReasons,whatsappHref,whatsappMessageHref,orderDisplayCode,esc);
  function orderFilterCount(filter){
    if(filter==='problems')return state.orders.filter(o=>orderProblemReasons(o).length>0).length;
    return state.orders.filter(o=>orderFilterMatch(o,filter)).length;
  }
  function todayCardCount(key){
    if(key==='closure')return Number(state.closurePendingCount||0);
    return orderFilterCount(key);
  }
  const {renderTodayCards,renderTodayIssueBreakdown}=window.DonaAntoniaAdminTodayCards.createTodayCards(esc,todayCardCount,orderIssueCount);
  const {renderTodayExpiryAlert}=window.DonaAntoniaAdminExpiryAlert.createExpiryAlert(state,esc);
  async function reconnectBlingOauth(){
    const ok=confirm('Reconectar o Bling agora?\n\nUse este botão depois de salvar os novos escopos no aplicativo do Bling. Você será enviado ao Bling para autorizar novamente e depois voltará automaticamente para este Admin.');
    if(!ok)return;
    try{
      const data=await api('bling_oauth_begin',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      if(!data.authorization_url)throw new Error('oauth_url_missing');
      window.location.href=data.authorization_url;
    }catch(e){toast(errorMessage(e.message))}
  }

  async function retryBlingStatusCatalog(){
    const btn=document.querySelector('[data-retry-bling-status]');
    if(btn){btn.disabled=true;btn.textContent='Testando…'}
    try{
      const data=await api('bling_status_catalog_probe',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      toast('Permissão do Bling validada');
      await renderToday();
      return data;
    }catch(e){
      toast(errorMessage(e.message));
      if(btn){btn.disabled=false;btn.textContent='Testar novamente'}
    }
  }

  const {attentionTargetTab,renderOpsAttention}=window.DonaAntoniaAdminOpsAttention.createOpsAttention(state,esc);
  const {renderOpsPrintQueue}=window.DonaAntoniaAdminPrintQueuePanel.createPrintQueuePanel(state,esc,orderDisplayCode);
  function renderPapoAiBridgePanel(){
    if(state.opsPapoAi===null)return '<section class="panel" style="margin-bottom:14px"><div class="loading">Carregando PapoAI / WhatsApp…</div></section>';
    const p=state.opsPapoAi||{};
    if(!p.capture_enabled)return '<section class="panel" style="margin-bottom:14px"><div class="history-title" style="padding:14px"><strong>PapoAI / WhatsApp</strong><span class="danger-text">ponte desligada</span></div></section>';
    const lastFlow=p.last_flow||{},lastLink=p.last_identity_link||{},identity=p.identity||{};
    const stateLabel=p.bridge_state==='attention'?'Atenção':'Online';
    const stateClass=p.bridge_state==='attention'?'warn-text':'ok-text';
    const flowText=lastFlow.created_at
      ? dateTime(lastFlow.created_at)+' · '+(lastFlow.status==='processed'?'processado':'revisar')+(Number(lastFlow.orders_linked||0)?' · '+Number(lastFlow.orders_linked)+' pedido(s) associado(s)':'')
      :'Nenhum Flow estruturado recebido ainda';
    const linkText=lastLink.created_at
      ? (lastLink.catalog_path||'')+' · '+(lastLink.redeemed_at?'aberto pelo cliente':'aguardando abertura')+' · vence '+dateTime(lastLink.expires_at)
      :'Nenhum link personalizado emitido ainda';
    return '<section class="panel" style="margin-bottom:14px">'+
      '<div class="history-title" style="padding:14px 14px 0"><div><strong>PapoAI / WhatsApp</strong><span class="muted">ponte operacional · sem IA de atendimento no Admin</span></div><b class="'+stateClass+'">'+stateLabel+'</b></div>'+
      '<div class="bling-grid" style="padding:14px;margin-bottom:0">'+
        '<div class="bling-card"><small>Eventos 24h</small><strong>'+Number(p.events_24h||p.captured_24h||0)+'</strong><span class="sub">'+Number(p.events_conversation_linked||0)+' vinculados a conversa no total</span></div>'+
        '<div class="bling-card"><small>Clientes reconhecidos</small><strong>'+Number(p.events_customer_linked||0)+'</strong><span class="sub">por identidade telefônica canônica</span></div>'+
        '<div class="bling-card"><small>Flows</small><strong>'+Number(identity.flow_events_total||p.flow_events_total||0)+'</strong><span class="sub">'+Number(identity.flow_events_review||p.flow_events_review||0)+' em revisão</span></div>'+
        '<div class="bling-card"><small>Cadastros provisórios</small><strong>'+Number(identity.provisional_customers||0)+'</strong><span class="sub">'+Number(identity.provisional_without_name||0)+' ainda sem nome · '+Number(identity.verified_flow_customers||0)+' confirmado(s) pelo Flow</span></div>'+
        '<div class="bling-card"><small>Links catálogo</small><strong>'+Number(p.identity_tokens_total||0)+'</strong><span class="sub">'+Number(p.identity_tokens_redeemed||0)+' aberto(s) pelo cliente</span></div>'+
      '</div>'+
      '<div style="padding:0 14px 14px;display:grid;gap:8px">'+
        '<div class="purchase-safe" style="margin:0"><strong>Último Flow</strong><small>'+esc(flowText)+'</small></div>'+
        '<div class="purchase-safe" style="margin:0"><strong>Último link</strong><small>'+esc(linkText)+'</small></div>'+
        (p.last_error?'<div class="purchase-safe purchase-danger" style="margin:0"><strong>Último erro</strong><small>'+esc(p.last_error)+'</small></div>':'')+
        (Number(identity.site_orders_without_customer_31d||0)?'<div class="purchase-safe '+(Number(identity.site_orders_without_customer_with_phone_31d||0)?'purchase-danger':'')+'" style="margin:0"><strong>Pedidos sem cliente</strong><small>'+Number(identity.site_orders_without_customer_31d||0)+' pedido(s) nos últimos 31 dias · '+(Number(identity.site_orders_without_customer_with_phone_31d||0)?'há telefone disponível para revisar':'sem telefone disponível; legado não pode ser vinculado com segurança')+'</small></div>':'')+
        '<div class="dispatch-actions" style="justify-content:flex-start"><button class="primary" type="button" data-papoai-create-link>Criar link catálogo</button></div>'+
        '<small class="muted">Pedido automático vindo de evento estruturado: '+(p.structured_order_commit_enabled?'HABILITADO':'bloqueado até homologação real')+'. Mensagem livre nunca cria pedido.</small>'+
      '</div>'+
    '</section>';
  }
  async function createPapoAiCatalogLink(){
    const raw=prompt('Telefone do cliente com DDD:','');
    if(raw===null)return;
    const phone=String(raw||'').replace(/\D/g,'');
    if(phone.length<10){toast('Informe um telefone válido com DDD');return}
    try{
      const r=await api('papoai_issue_catalog_link',{},{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({phone})
      });
      const url=String(r.url||'');
      if(url){
        try{await navigator.clipboard.writeText(url);toast('Link criado e copiado: '+String(r.catalog_path||''))}
        catch{prompt('Link criado. Copie abaixo:',url)}
      }else toast('Link criado');
      const fresh=await api('ops_papoai_capture_status').catch(()=>null);
      if(fresh?.papoai){state.opsPapoAi=fresh.papoai;const host=$('#papoAiBridgeSlot');if(host)host.innerHTML=renderPapoAiBridgePanel()}
    }catch(e){toast(errorMessage(e.message))}
  }

  async function renderToday(){
    // CENTRAL_LAZY_ON_DEMAND_V1
    const content=$('#content');
    const sectionState=new Map();
    const sections=[
      ['orders','Pedidos e expedição','Separação, prontos, entrega e fechamento'],
      ['health','Saúde do sistema','Produtos, Bling, fiscal, filas e automações'],
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
          todayOrders.innerHTML=pending.length?pending.map(o=>'<button class="history-row today-order-row" type="button" data-today-order="'+esc(o.id)+'"><strong>#'+esc(orderDisplayCode(o))+'</strong><div class="history-main"><strong>'+esc(o.customer_name||'Sem cliente')+'</strong><small>'+money(o.total_cents)+' · '+esc(o.payment_method_snapshot?.label||o.payment_method_snapshot?.method||'Pagamento não informado')+'</small></div><span class="next-action">'+esc(orderNextAction(o))+'</span><span class="today-status">'+statusPill(o.status)+'</span></button>').join(''):'<div class="history-empty">Nenhum pedido pendente agora.</div>';
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
