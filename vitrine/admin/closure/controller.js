// Closure owns its fetched rows and render lifecycle; fiscal reads use a shared port.
(function(global){
  function create({api,orders,navigation,ui,formatters,orderView,openOrder}){
    const {query:$,document,CSS,confirm,toast}=ui;
    const {esc,money,dateTime,errorMessage}=formatters;
    const {orderDisplayCode,actualPaymentText,fiscalBlockReasonLabel}=orderView;
    const {loadFiscal:loadFiscalForOrders}=orders;
    let closureOrders=[];
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
    const f=orders.fiscal()[o.id],actual=o?.payment_method_snapshot?.actual||null;
    if(!f||f.error)return 'fiscal';
    if(f.payment_status!=='confirmed')return actual?.received?'fiscal':'payment';
    if(f.fiscal_status==='issued'||f.bling_invoice_id)return 'complete';
    return 'fiscal';
  }
  function closurePriority(o){
    const f=orders.fiscal()[o.id],label=fiscalClosureLabel(f,o);
    if(label.title==='Pagamento pendente')return 0;
    if(label.title==='Precisa de revisão'||label.title==='Verificar')return 1;
    if(label.title==='Fiscal pronto'||label.title==='Fiscal bloqueado')return 2;
    return 3;
  }
  function closureRow(o){
    const f=orders.fiscal()[o.id],label=fiscalClosureLabel(f,o);
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
    const o=closureOrders.find(x=>x.id===id)||orders.get().find(x=>x.id===id);
    const f=orders.fiscal()[id];
    if(!o||o.status!=='delivered'||o.payment_method_snapshot?.actual?.received||!f||f.error||f.payment_status==='confirmed'){
      toast(o?.payment_method_snapshot?.actual?.received?'O pagamento real já foi registrado; falta conciliar com o Bling.':'Este recebimento não está mais pendente');return;
    }
    const payment=o.payment_method_snapshot?.label||o.payment_method_snapshot?.method||'Pagamento não informado';
    if(!confirm('Confirmar recebimento de '+money(o.total_cents)+' via '+payment+'?\n\nPedido #'+orderDisplayCode(o)))return;
    const btn=document.querySelector('[data-closure-payment="'+CSS.escape(id)+'"]');
    if(btn){btn.disabled=true;btn.textContent='Confirmando…'}
    try{
      orders.fiscal()[id]=await api('order_fiscal_confirm_payment',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id,payment_method:payment})
      });
      renderClosure();
      toast(orders.fiscal()[id]?.fiscal_status==='ready'?'Recebimento confirmado · fiscal pronto':'Recebimento confirmado');
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
    const isCurrent=()=>generation===closureRenderGeneration&&navigation.currentTab()==='closure'&&content===$('#content')&&Boolean(host());
    content.innerHTML='<div class="page-head"><div><h1>Fechamento</h1><p>Entregas concluídas que precisam de recebimento, revisão fiscal ou conferência final.</p></div><button class="secondary" id="refreshClosure">Atualizar</button></div><div id="closureBody"><div class="loading">Carregando fechamento…</div></div>';
    $('#refreshClosure').onclick=()=>{orders.clearFiscal();renderClosure()};
    try{
      const data=await api('closure_orders');
      if(!isCurrent())return;
      const delivered=data.orders||[];
      closureOrders=delivered;
      orders.mergeFiscal(data.fiscal_by_order||{});
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

    return Object.freeze({renderClosure});
  }
  global.DonaAntoniaAdminClosure=Object.freeze({create});
})(window);
