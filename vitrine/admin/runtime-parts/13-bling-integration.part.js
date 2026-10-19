  function blingOperationalIssues(b){
    const issues=[];
    const cred=b?.credentials||{},domains=b?.domains||{},queue=b?.hub_queue||{},orderLinks=b?.order_links||{};
    if(cred.ready===false)issues.push('Credenciais do Bling precisam de atenção');
    if(b?.hub_enabled===false)issues.push('Integração direta com o Bling está pausada');
    if(b?.hub_enabled!==false&&domains.orders===false)issues.push('Envio de pedidos ao Bling está pausado');
    const queueReview=Number(queue.review_required||0)+Number(queue.failed||0);
    if(queueReview>0)issues.push(queueReview+' item(ns) da fila precisam de revisão');
    const orderReview=Number(orderLinks.review_required||0);
    if(orderReview>0)issues.push(orderReview+' pedido(s) precisam de revisão no Bling');
    return [...new Set(issues)];
  }
  async function loadOperationalIntegrationAlert(){
    const host=$('#integrationOperationalAlert');if(!host)return;
    host.innerHTML='';
    try{
      const data=await api('bling_status');
      state.bling=data.bling||{};
      const issues=blingOperationalIssues(state.bling);
      if(!issues.length)return;
      host.innerHTML='<div class="operational-alert"><div><strong>Integração precisa de atenção</strong><small>'+issues.map(esc).join(' · ')+'</small></div><button class="secondary" id="openIntegrationIssue" type="button">Ver diagnóstico</button></div>';
      $('#openIntegrationIssue').onclick=renderBling;
    }catch(e){
      host.innerHTML='<div class="operational-alert"><div><strong>Não consegui verificar a integração</strong><small>Os pedidos continuam visíveis. Abra o diagnóstico para conferir o Bling.</small></div><button class="secondary" id="openIntegrationIssue" type="button">Ver diagnóstico</button></div>';
      $('#openIntegrationIssue').onclick=renderBling;
    }
  }

  function renderOpsShadowReadiness(){
    const s=state.opsShadow;if(!s)return '';
    const total=Number(s.total||0),ready=Number(s.erp_ready||0),blocked=Number(s.blocked||0);
    return '<div class="panel" style="margin-bottom:14px"><div class="history-title dispatch-head"><div><strong>Prontidão do novo fluxo</strong><span>shadow mode · nenhuma escrita externa</span></div><b>'+ready+' / '+total+'</b></div><div class="bling-grid" style="padding:14px">'+
      '<div class="bling-card"><small>Prontos para ERP</small><strong class="ok-text">'+ready+'</strong><span class="sub">cliente + endereço + pagamento + produtos vinculados</span></div>'+
      '<div class="bling-card"><small>Bloqueados</small><strong class="'+(blocked?'warn-text':'ok-text')+'">'+blocked+'</strong><span class="sub">antes do canário</span></div>'+
      '<div class="bling-card"><small>Cliente/vínculo</small><strong>'+Number(s.unresolved_customer||0)+'</strong><span class="sub">precisam consolidação</span></div>'+
      '<div class="bling-card"><small>Endereço</small><strong>'+Number(s.incomplete_address||0)+'</strong><span class="sub">incompletos</span></div>'+
      '<div class="bling-card"><small>Produtos</small><strong>'+Number(s.unresolved_products||0)+'</strong><span class="sub">sem vínculo Bling</span></div>'+
    '</div></div>';
  }

  let blingStatusGeneration=0;
  async function loadBlingStatus(){
    const host=$('#blingStatus');if(!host||state.tab!=='bling')return;
    const generation=++blingStatusGeneration;
    const isCurrent=()=>generation===blingStatusGeneration&&state.tab==='bling'&&host===$('#blingStatus');
    host.innerHTML='<div class="loading">Carregando status…</div>';
    try{
      const data=await api('bling_status');
      if(!isCurrent())return;
      state.bling=data.bling||{};
      paintBling();
    }catch(e){
      if(!isCurrent())return;
      host.innerHTML='<div class="empty">Não consegui carregar o estado do Bling. <button class="text" id="retryBling">Tentar novamente</button></div>';
      if($('#retryBling'))$('#retryBling').onclick=loadBlingStatus;
    }
  }

  function paintBling(){
    const host=$('#blingStatus');if(!host)return;
    const b=state.bling||{},cred=b.credentials||{},legacy=b.legacy||{},queue=b.hub_queue||{},domains=b.domains||{},probe=state.blingProbe||{},links=b.product_links||{},customerLinks=b.customer_links||{},orderLinks=b.order_links||{},rollout=b.order_rollout||{},statusCatalog=b.order_status_catalog||{},webhooks=b.webhook_inbox||{},fiscal=b.fiscal_readiness||{},fiscalCfg=fiscal.config||{},fiscalControls=fiscal.controls||{},fiscalJobs=fiscal.jobs||{};
    const probes=probe.probes||{};
    const banner=$('#blingRuntimeBanner');
    if(banner){
      const active=[
        domains.products?'Produtos':null,
        domains.stock?'Estoque':null,
        domains.customers?'Clientes':null,
        domains.orders?'Pedidos':null
      ].filter(Boolean);
      const firstOrderCanary=Boolean(domains.orders)&&String(rollout.state||'')==='armed_first_canary';
      const headline=b.hub_enabled
        ? 'Integração direta Bling ativa'
        : 'Integração direta Bling pausada';
      const detail=[
        active.length?'Ativos: '+active.join(', '):'Nenhum domínio de escrita ativo',
        firstOrderCanary?'Pedidos aguardando o primeiro canário real':'',
        domains.webhooks?'Webhooks ON':'Webhooks OFF',
        domains.fiscal?'Fiscal ON':'Fiscal OFF',
        'Make preservado e fora do novo runtime'
      ].filter(Boolean).join(' · ');
      banner.innerHTML='<strong>'+esc(headline)+'</strong><small>'+esc(detail)+'</small>';
    }
    const scope=(key,label)=>{
      const p=probes[key];
      if(!p)return '<div class="bling-scope"><strong>'+esc(label)+'</strong><small>Ainda não verificado</small></div>';
      const cls=p.ok?'ok-text':'danger-text';
      const txt=p.ok?'Acesso confirmado':p.insufficient_scope?'Escopo ausente':'HTTP '+esc(p.http_status||'erro');
      return '<div class="bling-scope"><strong>'+esc(label)+'</strong><small class="'+cls+'">'+txt+'</small></div>';
    };
    host.innerHTML=
      '<div class="bling-grid">'+
        '<div class="bling-card"><small>Credenciais OAuth</small><strong>'+yesNo(cred.ready,'Configuradas','Incompletas')+'</strong><span class="sub">Client ID · Secret · Refresh token</span></div>'+
        '<div class="bling-card"><small>Filas antigas</small><strong>'+yesNo(b.legacy_queues_frozen,'Congeladas','ATENÇÃO')+'</strong><span class="sub">'+esc(legacy.bling_commands_pending||0)+' comandos · '+esc(legacy.order_sync_pending_or_error||0)+' pedidos</span></div>'+
        '<div class="bling-card"><small>Novo Hub</small><strong>'+esc(String(b.mode||'observe').toUpperCase())+'</strong><span class="sub">'+esc(queue.pending||0)+' pendentes · '+esc(queue.processing||0)+' processando</span></div>'+
        '<div class="bling-card"><small>Produtos vinculados</small><strong>'+esc(links.matched||0)+' / '+esc(links.total||0)+'</strong><span class="sub">'+esc(links.not_found||0)+' não encontrados · '+esc((links.ambiguous||0)+(links.review_required||0))+' revisar</span></div>'+
        '<div class="bling-card"><small>Clientes vinculados</small><strong>'+esc(customerLinks.matched||0)+' / '+esc(customerLinks.total||0)+'</strong><span class="sub">'+esc(customerLinks.not_found||0)+' não encontrados · '+esc((customerLinks.ambiguous||0)+(customerLinks.review_required||0))+' revisar</span></div>'+
        '<div class="bling-card"><small>Pedidos vinculados</small><strong>'+esc(orderLinks.matched||0)+' / '+esc(orderLinks.total||0)+'</strong><span class="sub">'+esc(orderLinks.review_required||0)+' para revisar</span></div>'+
        '<div class="bling-card"><small>Pedidos · homologação</small><strong class="'+(String(rollout.state||'')==='canary_passed'?'ok-text':String(rollout.state||'')==='paused_after_canary_failure'?'danger-text':'warn-text')+'">'+esc(String(rollout.state||'')==='canary_passed'?'Canário validado':String(rollout.state||'')==='paused_after_canary_failure'?'Pausado após falha':String(rollout.state||'')==='armed_first_canary'?'Aguardando 1º pedido real':'Ainda não validado')+'</strong><span class="sub">'+(String(rollout.state||'')==='armed_first_canary'?'O primeiro pedido elegível será processado sozinho e verificado antes de liberar a sequência.':String(rollout.state||'')==='canary_passed'?'Primeiro pedido real criado/verificado com segurança.':String(rollout.state||'')==='paused_after_canary_failure'?'Novos pedidos ficam protegidos até revisão técnica.':'Estado do rollout ainda não foi confirmado.')+'</span></div>'+
        '<div class="bling-card"><small>Situações do pedido</small><strong class="'+(statusCatalog.status_updates_enabled===true?'ok-text':'warn-text')+'">'+(statusCatalog.status_updates_enabled===true?'Ativas':String(statusCatalog.state||'')==='scope_missing'?'Sem permissão':'Bloqueadas')+'</strong><span class="sub">'+(statusCatalog.status_updates_enabled===true?'Mapeamento de situações autorizado.':String(statusCatalog.state||'')==='scope_missing'?'Bling negou acesso a situações/modulos'+(statusCatalog.http_status?' · HTTP '+esc(statusCatalog.http_status):'')+'. Cancelamentos ficam sinalizados para conferência manual.':'Nenhum mapeamento de situações foi ativado.')+'</span></div>'+
        '<div class="bling-card"><small>Webhooks Bling</small><strong>'+esc(domains.webhooks?'ON':'OFF')+'</strong><span class="sub">'+esc(webhooks.held||0)+' aguardando · '+esc(webhooks.review_required||0)+' revisar · '+esc(webhooks.processed||0)+' processados</span></div>'+
        '<div class="bling-card"><small>Fiscal / NF-e</small><strong class="'+(fiscal.safe_off?'ok-text':'warn-text')+'">'+(fiscal.safe_off?'OFF seguro':esc(String(fiscalCfg.execution_mode||'off').toUpperCase()))+'</strong><span class="sub">'+esc(fiscalControls.ready||0)+' prontos · '+esc(fiscalJobs.total||0)+' jobs · emissão '+(fiscalCfg.bling_invoice_send_enabled?'ON':'OFF')+'</span></div>'+
        '<div class="bling-card"><small>Escritas externas</small><strong class="'+(b.hub_enabled?'ok-text':'warn-text')+'">'+(b.hub_enabled?'Ativas com proteção':'Bloqueadas')+'</strong><span class="sub">Produtos '+(domains.products?'ON':'OFF')+' · Estoque '+(domains.stock?'ON':'OFF')+' · Clientes '+(domains.customers?'ON':'OFF')+' · Pedidos '+(domains.orders?'ON':'OFF')+' · Fiscal '+(domains.fiscal?'ON':'OFF')+'</span></div>'+
      '</div>'+
      (String(statusCatalog.state||'')==='scope_missing'?'<div class="rule-notice warn"><strong>Permissão de Situações pendente</strong><div>No aplicativo da Dona Antônia no Bling, adicione os escopos de Situações / Situações - Módulos / Situações - Transições, salve o aplicativo e autorize novamente. Ao salvar escopos, o Bling revoga a autorização anterior. Depois use <b>Reconectar Bling</b> nesta tela e, ao voltar, clique em <b>Testar novamente</b> na Central.</div></div>':'')+'<div class="panel"><div class="history-title"><strong>Permissões e leitura da API</strong><span class="muted">teste sem alterar dados</span></div>'+
        '<div class="bling-scopes">'+scope('products','Produtos')+scope('contacts','Clientes')+scope('sales_orders','Pedidos')+scope('deposits','Depósitos')+scope('invoice','NF-e')+'</div>'+
        (Array.isArray(probe.deposit_candidates)&&probe.deposit_candidates.length?'<div class="rule-notice"><strong>Depósitos encontrados</strong>'+probe.deposit_candidates.map(d=>esc((d.default?'★ ':'')+(d.name||'Depósito')+' #'+d.id)).join(' · ')+'</div>':'')+
        '<div class="bling-actions"><button class="secondary" id="reconcileBlingCatalog">Reconciliar produtos</button><button class="secondary" id="reconcileBlingCustomers">Reconciliar clientes</button><button class="secondary" id="reconnectBlingOauth">Reconectar Bling</button><button class="primary" id="probeBling">Verificar conexão com o Bling</button></div>'+
      '</div>';
    if($('#probeBling'))$('#probeBling').onclick=probeBlingReadonly;if($('#reconnectBlingOauth'))$('#reconnectBlingOauth').onclick=reconnectBlingOauth;
    if($('#reconcileBlingCatalog'))$('#reconcileBlingCatalog').onclick=reconcileBlingCatalogReadonly;
    if($('#reconcileBlingCustomers'))$('#reconcileBlingCustomers').onclick=reconcileBlingCustomersReadonly;
  }

  async function reconcileBlingCatalogReadonly(){
    const btn=$('#reconcileBlingCatalog');if(btn){btn.disabled=true;btn.textContent='Reconciliando…'}
    try{
      const data=await api('bling_reconcile_catalog_readonly',{},{
        method:'POST',headers:{'Content-Type':'application/json'},body:'{}'
      });
      toast('Produtos: '+Number(data.summary?.matched||0)+' vinculados · '+Number(data.summary?.not_found||0)+' não encontrados');
      await loadBlingStatus();
    }catch(e){
      toast('Não consegui reconciliar os produtos agora');
      if(btn){btn.disabled=false;btn.textContent='Reconciliar produtos'}
    }
  }

  async function reconcileBlingCustomersReadonly(){
    const btn=$('#reconcileBlingCustomers');if(btn){btn.disabled=true;btn.textContent='Reconciliando…'}
    try{
      const data=await api('bling_reconcile_customers_readonly',{},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({limit:650})});
      toast('Clientes: '+Number(data.summary?.matched||0)+' vinculados · '+Number(data.summary?.not_found||0)+' não encontrados · '+Number((data.summary?.ambiguous||0)+(data.summary?.review_required||0))+' revisar');
      await loadBlingStatus();
    }catch(e){
      toast('Não consegui reconciliar os clientes agora');
      if(btn){btn.disabled=false;btn.textContent='Reconciliar clientes'}
    }
  }

  async function probeBlingReadonly(){
    const btn=$('#probeBling');if(btn){btn.disabled=true;btn.textContent='Verificando…'}
    try{
      const data=await api('bling_probe_readonly',{},{
        method:'POST',headers:{'Content-Type':'application/json'},body:'{}'
      });
      state.blingProbe=data.probe||{};
      if(data.probe?.readiness)state.bling=data.probe.readiness;
      paintBling();
      toast(data.probe?.ok?'Conexão com Bling confirmada':'Conexão parcial: há permissões para revisar');
    }catch(e){
      toast('Não consegui verificar o Bling agora');
      if(btn){btn.disabled=false;btn.textContent='Verificar conexão com o Bling'}
    }
  }

