  function fiscalClosureLabel(f,o){
    const actual=o?.payment_method_snapshot?.actual||null;
    if(!f||f.error)return actual?.received
      ? {title:'Recebido · revisar Bling',detail:'Pagamento real registrado; controle fiscal indisponível',kind:'warn'}
      : {title:'Verificar',detail:'Controle fiscal indisponível',kind:'warn'};
    if(f.payment_status!=='confirmed'){
      if(actual?.received){
        const parts=actualPaymentText(o)||money(actual.captured_total_cents||o?.total_cents||0);
        return {title:'Recebido · Bling pendente',detail:parts,kind:'warn'};
      }
      return {title:'Pagamento pendente',detail:'Confirmar recebimento legado',kind:'warn'};
    }
    if(f.fiscal_status==='issued'||f.bling_invoice_id)return {title:'Concluído',detail:f.bling_invoice_number?'NF-e '+f.bling_invoice_number:'Fiscal concluído',kind:'ok'};
    if(f.fiscal_status==='review_required')return {title:'Precisa de revisão',detail:f.fiscal_block_reason?fiscalBlockReasonLabel(f.fiscal_block_reason):'Revisar fiscal',kind:'warn'};
    if(f.fiscal_status==='ready')return {title:'Fiscal pronto',detail:f.config?.send_enabled?'Pronto para emissão':'Emissão permanece desligada',kind:'ok'};
    return {title:'Fiscal bloqueado',detail:f.fiscal_block_reason?fiscalBlockReasonLabel(f.fiscal_block_reason):'Aguardando requisitos',kind:'warn'};
  }
  function closureBucket(o){
    const f=state.fiscalByOrder[o.id],actual=o?.payment_method_snapshot?.actual||null;
    if(!f||f.error)return 'fiscal';
    if(f.payment_status!=='confirmed')return actual?.received?'fiscal':'payment';
    if(f.fiscal_status==='issued'||f.bling_invoice_id)return 'complete';
    return 'fiscal';
  }
  function closurePriority(o){
    const f=state.fiscalByOrder[o.id],label=fiscalClosureLabel(f,o);
    if(label.title==='Pagamento pendente')return 0;
    if(label.title==='Precisa de revisão'||label.title==='Verificar')return 1;
    if(label.title==='Fiscal pronto'||label.title==='Fiscal bloqueado')return 2;
    return 3;
  }
  function closureRow(o){
    const f=state.fiscalByOrder[o.id],label=fiscalClosureLabel(f,o);
    const cls=label.kind==='ok'?'ok-text':'warn-text';
    const actual=o?.payment_method_snapshot?.actual||null;
    const canConfirmPayment=o.status==='delivered'&&!actual?.received&&f&&!f.error&&f.payment_status!=='confirmed';
    return '<div class="closure-row">'+
      '<div><strong>#'+esc(orderDisplayCode(o))+'</strong><span class="sub">'+esc(dateTime(o.delivered_at))+'</span></div>'+
      '<div class="history-main"><strong>'+esc(o.customer_name||'Sem cliente')+'</strong><small>'+esc(actualPaymentText(o)||(o.payment_method_snapshot?.label||o.payment_method_snapshot?.method||'Pagamento não informado'))+'</small></div>'+
      '<strong>'+money(o.total_cents)+'</strong>'+
      '<div class="closure-status"><strong class="'+cls+'">'+esc(label.title)+'</strong><small>'+esc(label.detail)+'</small></div>'+
      '<div class="dispatch-actions">'+
        (canConfirmPayment?'<button class="quick-link primary-link" type="button" data-closure-payment="'+esc(o.id)+'">Confirmar recebimento</button>':'')+
        '<button class="text" type="button" data-closure-order="'+esc(o.id)+'">Abrir</button>'+
      '</div>'+
    '</div>';
  }
  async function confirmClosurePayment(id){
    const o=state.closureOrders.find(x=>x.id===id)||state.orders.find(x=>x.id===id);
    const f=state.fiscalByOrder[id];
    if(!o||o.status!=='delivered'||o.payment_method_snapshot?.actual?.received||!f||f.error||f.payment_status==='confirmed'){
      toast(o?.payment_method_snapshot?.actual?.received?'O pagamento real já foi registrado; falta conciliar com o Bling.':'Este recebimento não está mais pendente');return;
    }
    const payment=o.payment_method_snapshot?.label||o.payment_method_snapshot?.method||'Pagamento não informado';
    if(!confirm('Confirmar recebimento de '+money(o.total_cents)+' via '+payment+'?\n\nPedido #'+orderDisplayCode(o)))return;
    const btn=document.querySelector('[data-closure-payment="'+CSS.escape(id)+'"]');
    if(btn){btn.disabled=true;btn.textContent='Confirmando…'}
    try{
      state.fiscalByOrder[id]=await api('order_fiscal_confirm_payment',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id,payment_method:payment})
      });
      renderClosure();
      toast(state.fiscalByOrder[id]?.fiscal_status==='ready'?'Recebimento confirmado · fiscal pronto':'Recebimento confirmado');
    }catch(e){
      toast(errorMessage(e.message));
      if(btn){btn.disabled=false;btn.textContent='Confirmar recebimento'}
    }
  }
  let closureRenderGeneration=0;
  async function renderClosure(){
    const generation=++closureRenderGeneration;
    const content=$('#content');
    const host=()=>$('#closureBody');
    const isCurrent=()=>generation===closureRenderGeneration&&state.tab==='closure'&&content===$('#content')&&Boolean(host());
    content.innerHTML='<div class="page-head"><div><h1>Fechamento</h1><p>Entregas concluídas que precisam de recebimento, revisão fiscal ou conferência final.</p></div><button class="secondary" id="refreshClosure">Atualizar</button></div><div id="closureBody"><div class="loading">Carregando fechamento…</div></div>';
    $('#refreshClosure').onclick=()=>{state.fiscalByOrder={};renderClosure()};
    try{
      const data=await api('closure_orders');
      if(!isCurrent())return;
      const delivered=data.orders||[];
      state.closureOrders=delivered;
      state.fiscalByOrder={...state.fiscalByOrder,...(data.fiscal_by_order||{})};
      await loadFiscalForOrders(delivered);
      if(!isCurrent())return;
      delivered.sort((a,b)=>closurePriority(a)-closurePriority(b)||((Date.parse(b.delivered_at||0)||0)-(Date.parse(a.delivered_at||0)||0)));
      const paymentPending=delivered.filter(o=>closureBucket(o)==='payment');
      const fiscalPending=delivered.filter(o=>closureBucket(o)==='fiscal');
      const complete=delivered.filter(o=>closureBucket(o)==='complete');
      $('#closureBody').innerHTML='<div class="ops-cards">'+
        '<div class="ops-card warn"><small>Recebimento legado</small><strong>'+paymentPending.length+'</strong><span>Entregas antigas sem captura real</span></div>'+
        '<div class="ops-card warn"><small>Fiscal / revisão</small><strong>'+fiscalPending.length+'</strong><span>Pagamento já tratado · revisar fiscal</span></div>'+
        '<div class="ops-card"><small>Concluídos</small><strong>'+complete.length+'</strong><span>Fechamento encerrado</span></div>'+
      '</div><div class="closure-grid">'+
        '<section class="panel"><div class="history-title dispatch-head"><div><strong>Recebimento legado</strong><span>somente pedidos sem captura do pagamento real</span></div><b>'+paymentPending.length+'</b></div>'+(paymentPending.length?paymentPending.map(closureRow).join(''):'<div class="history-empty">Nenhum recebimento pendente.</div>')+'</section>'+
        '<section class="panel"><div class="history-title dispatch-head"><div><strong>Fiscal / revisão</strong><span>pagamento real registrado ou confirmado; falta conciliar/revisar o fiscal</span></div><b>'+fiscalPending.length+'</b></div>'+(fiscalPending.length?fiscalPending.map(closureRow).join(''):'<div class="history-empty">Nenhuma revisão fiscal pendente.</div>')+'</section>'+
        '<section class="panel"><div class="history-title dispatch-head"><div><strong>Concluídos recentes</strong><span>pagamento e fiscal conferidos</span></div><b>'+complete.length+'</b></div>'+(complete.length?complete.slice(0,10).map(closureRow).join(''):'<div class="history-empty">Nenhum fechamento concluído recente.</div>')+'</section>'+
      '</div>';
      document.querySelectorAll('[data-closure-order]').forEach(b=>b.onclick=()=>openOrder(b.dataset.closureOrder));
      document.querySelectorAll('[data-closure-payment]').forEach(b=>b.onclick=()=>confirmClosurePayment(b.dataset.closurePayment));
    }catch(e){
      if(!isCurrent())return;
      $('#closureBody').innerHTML='<div class="empty">Não consegui carregar os fechamentos. <button class="text" id="retryClosure">Tentar novamente</button></div>';
      if($('#retryClosure'))$('#retryClosure').onclick=renderClosure;
    }
  }

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

  function financeSummaryCard(label,value,detail,kind=''){
    return '<div class="bling-card '+esc(kind)+'"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span class="sub">'+esc(detail)+'</span></div>';
  }
  function financePriorityRow(r,today){
    const isReceive=r.kind==='receivable';
    const overdue=Boolean(r.due_date&&r.due_date<today);
    const title=r.contact_name||r.document_number||r.origin_number||('Lançamento #'+String(r.id||''));
    const detail=[r.document_number?'Doc. '+r.document_number:'',r.origin_number?'Origem '+r.origin_number:'',r.boleto_url?'Boleto emitido':'',r.pix_url?'PIX disponível':''].filter(Boolean).join(' · ');
    return '<div class="closure-row">'+
      '<div><strong class="'+(isReceive?'ok-text':'warn-text')+'">'+(isReceive?'Receber':'Pagar')+'</strong><span class="sub">'+(overdue?'<span class="danger-text">Vencido</span>':'Em aberto')+'</span></div>'+
      '<div class="history-main"><strong>'+esc(title)+'</strong><small>'+esc(detail||'Sem observação')+'</small><div class="dispatch-actions" style="justify-content:flex-start;margin-top:6px">'+
        '<button class="text" type="button" data-finance-detail="'+esc(r.id)+'" data-finance-kind="'+esc(r.kind)+'">Detalhes</button>'+
        '<button class="text" type="button" data-finance-edit="'+esc(r.id)+'" data-finance-kind="'+esc(r.kind)+'">Editar</button>'+
        '<button class="text" type="button" data-finance-settle="'+esc(r.id)+'" data-finance-kind="'+esc(r.kind)+'">Dar baixa</button>'+
        (isReceive&&r.origin_id?'<button class="text" type="button" data-finance-boleto="'+esc(r.origin_id)+'">Boletos</button>':'')+
      '</div></div>'+
      '<div><strong>'+esc(dateOnly(r.due_date))+'</strong><span class="sub">'+(r.due_date===today?'Vence hoje':'Vencimento')+'</span></div>'+
      '<strong>'+money(r.amount_cents)+'</strong>'+
      '<span class="pill '+(overdue?'danger':'')+'">'+(r.boleto_url?'Boleto':r.pix_url?'PIX':'Aberto')+'</span>'+
    '</div>';
  }
  function paintFinance(){
    const host=$('#financeBody');if(!host)return;
    const f=state.finance||{},rec=f.receivable||{},pay=f.payable||{},realized=f.realized_30d||{},today=f.window?.today||'';
    const priorities=Array.isArray(f.priority)?f.priority:[];
    const accounts=Array.isArray(f.financial_accounts)?f.financial_accounts:[];
    host.innerHTML=
      (f.truncated?'<div class="rule-notice warn"><strong>Volume alto de lançamentos</strong><div>O painel exibiu o limite seguro desta versão. Nenhum dado foi alterado.</div></div>':'')+
      (realized.truncated?'<div class="rule-notice warn"><strong>Histórico de 30 dias parcial</strong><div>O volume de contas pagas/recebidas ultrapassou o limite seguro de leitura; os totais exibidos podem ser parciais.</div></div>':'')+
      '<div class="bling-grid">'+
        financeSummaryCard('A receber',money(rec.total_cents),String(rec.count||0)+' conta(s) em aberto')+
        financeSummaryCard('A pagar',money(pay.total_cents),String(pay.count||0)+' conta(s) em aberto')+
        financeSummaryCard('Saldo projetado',money(f.projected_cents),(Number(f.projected_cents||0)>=0?'Recebimentos acima dos pagamentos':'Pagamentos acima dos recebimentos'),Number(f.projected_cents||0)<0?'danger':'')+
        financeSummaryCard('Recebido · 30 dias',money(realized.received_cents),String(realized.received_count||0)+' conta(s) recebida(s)')+
        financeSummaryCard('Pago · 30 dias',money(realized.paid_cents),String(realized.paid_count||0)+' conta(s) paga(s)')+
        financeSummaryCard('Líquido realizado · 30 dias',money(realized.net_cents),(Number(realized.net_cents||0)>=0?'Entradas acima das saídas':'Saídas acima das entradas'),Number(realized.net_cents||0)<0?'danger':'')+
        financeSummaryCard('Vencidos a receber',money(rec.overdue_cents),String(rec.overdue_count||0)+' vencido(s)',Number(rec.overdue_count||0)>0?'warn':'')+
        financeSummaryCard('Vencidos a pagar',money(pay.overdue_cents),String(pay.overdue_count||0)+' vencido(s)',Number(pay.overdue_count||0)>0?'danger':'')+
        financeSummaryCard('Próximos 7 dias',money(Number(rec.next_7_cents||0)-Number(pay.next_7_cents||0)),String(rec.next_7_count||0)+' a receber · '+String(pay.next_7_count||0)+' a pagar')+
        financeSummaryCard('Boletos',String(f.boleto_count||0),String(f.pix_count||0)+' conta(s) também com PIX')+
        financeSummaryCard('Contas financeiras',String(accounts.length),f.financial_accounts_access?.ok?'Acesso confirmado':'Acesso parcial')+
      '</div>'+
      '<section class="panel"><div class="history-title dispatch-head"><div><strong>Prioridades financeiras</strong><span>vencidos primeiro, depois próximos vencimentos · somente leitura</span></div><b>'+priorities.length+'</b></div>'+
        (priorities.length?priorities.map(r=>financePriorityRow(r,today)).join(''):'<div class="history-empty">Nenhuma conta em aberto no período consultado.</div>')+
      '</section>'+
      '<section class="panel" style="margin-top:14px"><div class="history-title dispatch-head"><div><strong>Contas financeiras do Bling</strong><span>bancos, caixas e integrações disponíveis</span></div><b>'+accounts.length+'</b></div>'+
        (accounts.length?'<div style="padding:12px 14px">'+accounts.map(a=>'<button class="pill" type="button" data-financial-account-detail="'+esc(a.id)+'" style="margin:3px">'+esc(a.description||('Conta #'+a.id))+' · '+esc(a.type||'tipo não informado')+'</button>').join('')+'</div>':'<div class="history-empty">Nenhuma conta financeira retornada.</div>')+
      '</section>';
    host.querySelectorAll('[data-finance-detail]').forEach(b=>b.onclick=()=>openFinanceDetail(b.dataset.financeKind,Number(b.dataset.financeDetail)));
    host.querySelectorAll('[data-finance-edit]').forEach(b=>b.onclick=()=>openFinanceEditor(b.dataset.financeKind,Number(b.dataset.financeEdit)));
    host.querySelectorAll('[data-finance-settle]').forEach(b=>b.onclick=()=>openFinanceSettlement(b.dataset.financeKind,Number(b.dataset.financeSettle)));
    host.querySelectorAll('[data-finance-boleto]').forEach(b=>b.onclick=()=>openFinanceBoletos(Number(b.dataset.financeBoleto)));
    host.querySelectorAll('[data-financial-account-detail]').forEach(b=>b.onclick=()=>openFinancialAccountDetail(Number(b.dataset.financialAccountDetail)));
  }
  function financeTokenPayload(token){
    try{
      const raw=String(token||'').split('.')[1]||'';
      const pad=raw.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-raw.length%4)%4);
      return JSON.parse(atob(pad));
    }catch{return {}}
  }
  function financeSessionToken(){
    const token=sessionStorage.getItem('da_finance_access_token_v1')||'';
    if(!token)return '';
    const exp=Number(financeTokenPayload(token)?.exp||0);
    if(!exp||exp<=Math.floor(Date.now()/1000)+60){
      sessionStorage.removeItem('da_finance_access_token_v1');
      return '';
    }
    return token;
  }
