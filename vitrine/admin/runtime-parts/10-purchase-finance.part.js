// XML payment summary helpers are shared by purchase finance and catalog rendering.
  function purchasePaymentSummary(d){
    return d?.metadata?.payment_summary&&typeof d.metadata.payment_summary==='object'?d.metadata.payment_summary:{};
  }
  function purchasePaymentMethodsText(ps){
    const labels=Array.isArray(ps?.method_labels)?ps.method_labels.filter(Boolean):[];
    return labels.length?labels.join(' + '):'Forma de pagamento não identificada';
  }
  function purchasePaymentAtPurchaseHtml(d){
    const ps=purchasePaymentSummary(d),settlement=d?.metadata?.settlement||{};
    if(!ps?.paid_at_purchase_likely)return '';
    const method=purchasePaymentMethodsText(ps),amount=purchaseMoney(ps.payment_total??d?.total_amount);
    if(settlement?.verified){
      return '<div class="purchase-safe" style="margin:10px 0 0"><strong>Pagamento baixado no Bling</strong><small>'+esc(method)+' · '+amount+(settlement.payment_date?' · baixa em '+esc(dateOnly(settlement.payment_date)):'')+(settlement.financial_account?.description?' · '+esc(settlement.financial_account.description):'')+'.</small></div>';
    }
    let guidance='A NF-e indica que o fornecedor provavelmente foi pago no ato da compra.';
    if(ps.guidance==='credit_card')guidance+=' No Bling, confirme a baixa usando a conta financeira do cartão de crédito; a fatura do cartão deve ser controlada separadamente.';
    else if(ps.guidance==='debit_card')guidance+=' No Bling, confirme a baixa usando a conta bancária/cartão de débito utilizado.';
    else if(ps.guidance==='pix')guidance+=' No Bling, confirme a baixa na conta bancária de onde saiu o PIX.';
    else if(ps.guidance==='cash')guidance+=' No Bling, confirme a baixa usando o caixa/dinheiro correspondente.';
    else if(ps.guidance==='bank_transfer')guidance+=' No Bling, confirme a baixa na conta bancária utilizada.';
    else guidance+=' Confirme a baixa na conta financeira correta do Bling.';
    return '<div class="purchase-safe purchase-danger" style="margin:10px 0 0">'+
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:240px">'+
        '<strong>Pagamento informado na NF-e: '+esc(method)+'</strong>'+
        '<small>'+amount+' · '+esc(guidance)+'</small>'+
      '</div><div class="purchase-detail-actions"><button class="secondary" type="button" data-purchase-open-payables>Ver no Bling</button><button class="primary" type="button" data-purchase-settlement-preview>Preparar baixa</button></div></div>'+
    '</div>';
  }

  function purchaseFinanceReasonLabel(v){
    const map={
      reconciled_existing:'Financeiro já encontrado e confirmado no Bling.',
      native_nfe_accounts_launched:'Contas a pagar lançadas e confirmadas pelo Bling.',
      native_launch_error_but_reconciled:'O Bling mostrou um aviso, mas as contas foram confirmadas.',
      payables_missing_or_ambiguous:'Não encontrei uma conta a pagar que corresponda com segurança a esta nota.',
      bling_nfe_id_missing_for_native_payables:'Esta nota ainda não tem a referência necessária no Bling para lançar o financeiro.',
      supplier_contact_missing:'O fornecedor desta nota ainda precisa ser vinculado corretamente no Bling.',
      installments_missing:'A nota não trouxe parcelas/vencimentos suficientes para montar o financeiro com segurança.',
      installment_total_mismatch:'O total das parcelas é diferente do total da NF-e.',
      automatic_payables_disabled:'O lançamento automático de contas está desativado.'
    };
    const key=String(v||'');
    if(/^nfe_lancar_contas_http_/.test(key))return 'O Bling não aceitou o lançamento das contas desta NF-e.';
    if(/^payable_reconcile_http_/.test(key))return 'Não consegui consultar as contas a pagar no Bling agora.';
    return map[key]||'O financeiro desta nota precisa de conferência.';
  }
  function purchaseFinanceProblemHtml(d){
    const f=d?.finance_reference||{},r=f.reconciliation||{};
    const reason=String(f.reason||d?.finance_last_error||'');
    if(reason==='installment_total_mismatch'){
      const invoice=Number(r.invoice_total??d?.total_amount),parts=Number(r.installment_total);
      const diff=Number.isFinite(invoice)&&Number.isFinite(parts)?Math.round((parts-invoice)*100)/100:null;
      const ps=purchasePaymentSummary(d);
      if(ps?.paid_at_purchase_likely&&ps?.total_matches){
        return '<div class="purchase-price-grid" style="margin-top:10px">'+
          '<div class="purchase-price-box"><small>Total da NF-e</small><strong>'+purchaseMoney(invoice)+'</strong></div>'+
          '<div class="purchase-price-box"><small>Pagamento efetivo no XML</small><strong class="ok-text">'+purchaseMoney(ps.payment_total)+'</strong></div>'+
          (Number(ps.change||0)>0?'<div class="purchase-price-box"><small>Troco informado</small><strong>'+purchaseMoney(ps.change)+'</strong></div>':'')+
          '<div class="purchase-price-box"><small>Parcela/cobrança</small><strong class="warn-text">'+purchaseMoney(parts)+'</strong></div>'+
        '</div><small class="warn-text" style="margin-top:7px">O pagamento da NF-e fecha corretamente. A divergência está somente na parcela/cobrança do Bling/XML. Confira essa conta antes da baixa.</small>';
      }
      return '<div class="purchase-price-grid" style="margin-top:10px">'+
        '<div class="purchase-price-box"><small>Total da NF-e</small><strong>'+purchaseMoney(invoice)+'</strong></div>'+
        '<div class="purchase-price-box"><small>Total das parcelas</small><strong>'+purchaseMoney(parts)+'</strong></div>'+
        '<div class="purchase-price-box"><small>Diferença</small><strong class="warn-text">'+(diff===null?'—':purchaseMoney(diff))+'</strong></div>'+
      '</div><small class="warn-text" style="margin-top:7px">Corrija as parcelas no Bling para que a soma fique igual ao total da nota. Depois clique em <b>Resolver financeiro</b> novamente.</small>';
    }
    if(reason==='payables_missing_or_ambiguous'){
      return '<small style="margin-top:7px">Ao clicar em <b>Resolver financeiro</b>, o sistema confere novamente. Se não existir conta correspondente, ele pedirá sua confirmação antes de solicitar o lançamento ao Bling.</small>';
    }
    if(reason==='installments_missing'){
      return '<small class="warn-text" style="margin-top:7px">Confira no Bling os vencimentos e parcelas desta compra. O sistema não cria valores por aproximação.</small>';
    }
    if(reason==='supplier_contact_missing'){
      return '<small class="warn-text" style="margin-top:7px">É preciso corrigir o vínculo do fornecedor no Bling antes de lançar as contas.</small>';
    }
    return '';
  }
  function purchaseFinanceBlockHtml(d){
    const f=d?.finance_reference||{},posted=d?.finance_status==='posted'&&Boolean(d?.finance_reconciled_at);
    const eligible=d?.recipient_kind==='CNPJ'&&d?.financial_eligible===true;
    const reason=purchaseFinanceReasonLabel(f.reason||d?.finance_last_error);
    const paymentHint=purchasePaymentAtPurchaseHtml(d);
    if(d?.recipient_kind==='CPF'){
      return '<div class="purchase-safe" style="margin:14px 0 0"><strong>Financeiro</strong><small>Nota em CPF: não gera contas a pagar da empresa.</small></div>'+paymentHint;
    }
    if(!eligible){
      return '<div class="purchase-safe" style="margin:14px 0 0"><strong>Financeiro</strong><small>Esta nota não está marcada para gerar contas a pagar da empresa.</small></div>'+paymentHint;
    }
    if(posted){
      const ps=purchasePaymentSummary(d);
      const title=ps?.paid_at_purchase_likely?'Conta registrada no Bling · baixa ainda precisa ser conferida':'Conta a pagar registrada no Bling';
      const text=ps?.paid_at_purchase_likely
        ?'A obrigação da compra existe no Bling, mas a NF-e indica pagamento no ato. Confirme a baixa para que ela não permaneça como vencida/atrasada.'
        :'A conta desta NF-e foi encontrada e conciliada no Bling.';
      return '<div class="purchase-safe" style="margin:14px 0 0"><strong>'+esc(title)+'</strong><small>'+esc(text)+'</small></div>'+paymentHint;
    }
    return '<div class="purchase-safe purchase-danger" style="margin:14px 0 0">'+
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div style="flex:1;min-width:240px">'+
        '<strong>Financeiro precisa de atenção</strong>'+
        '<small>'+esc(reason)+'</small>'+
        purchaseFinanceProblemHtml(d)+
      '</div><div class="purchase-detail-actions">'+
        '<button class="primary" type="button" data-purchase-finance-resolve="'+esc(d.id)+'">Resolver financeiro</button>'+
      '</div></div>'+
      '<details style="margin-top:8px"><summary class="sub" style="cursor:pointer">Detalhes técnicos</summary><small>NF-e Bling #'+esc(d?.bling_nfe_id||'—')+' · tentativas: '+esc(Number(d?.finance_attempt_count||0))+(d?.finance_last_attempt_at?' · última '+esc(dateTime(d.finance_last_attempt_at)):'')+'.</small></details>'+
    '</div>'+paymentHint;
  }

  function purchaseMoney(v){
    const n=Number(v||0);
    return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—';
  }
  async function purchaseApi(purchase_action,payload={}){
    return customerApi('purchase_xml',{purchase_action,...payload});
  }
  function purchaseFilterPayload(){
    const f=state.purchaseFilter||{period:'this_month',start_date:'',end_date:''};
    return {period:f.period||'this_month',start_date:f.start_date||null,end_date:f.end_date||null};
  }
  function purchasePeriodLabel(){
    const f=state.purchaseFilter||{};
    const labels={this_month:'Este mês',last_month:'Mês passado',days_90:'Últimos 90 dias',days_120:'Últimos 120 dias',days_180:'Últimos 180 dias',custom:'Período personalizado'};
    if(f.period==='custom'&&f.start_date&&f.end_date)return dateOnly(f.start_date)+' a '+dateOnly(f.end_date);
    return labels[f.period]||'Este mês';
  }
  function purchaseCustomRangeReady(){
    const f=state.purchaseFilter||{};
    return f.period!=='custom'||(/^\d{4}-\d{2}-\d{2}$/.test(f.start_date||'')&&/^\d{4}-\d{2}-\d{2}$/.test(f.end_date||'')&&f.start_date<=f.end_date);
  }
  function syncPurchasePeriodControls(){
    const f=state.purchaseFilter||{};
    const custom=f.period==='custom';
    const box=$('#purchaseCustomDates');if(box)box.style.display=custom?'flex':'none';
    const b=$('#purchaseBlingSync');if(b)b.textContent='Buscar no Bling';
  }
  async function renderPurchases(){
    const content=$('#content');
    if(!state.purchaseFilter)state.purchaseFilter={period:'this_month',start_date:'',end_date:''};
    if(!state.purchaseQuickStatus)state.purchaseQuickStatus='attention';
    const pf=state.purchaseFilter;
    content.innerHTML=
      '<div class="page-head"><div><h1>Notas fiscais de entrada</h1><p>Confira suas compras e os produtos recebidos. Integração com o Bling.</p></div><button class="secondary" id="refreshPurchases" type="button">Atualizar</button></div>'+
      '<section class="panel purchase-simple-toolbar" aria-label="Importação de notas fiscais">'+
        '<div class="purchase-toolbar-period"><label for="purchasePeriod">Período</label>'+
          '<select id="purchasePeriod">'+
            '<option value="this_month" '+(pf.period==='this_month'?'selected':'')+'>Este mês</option>'+
            '<option value="last_month" '+(pf.period==='last_month'?'selected':'')+'>Mês passado</option>'+
            '<option value="days_90" '+(pf.period==='days_90'?'selected':'')+'>Últimos 90 dias</option>'+
            '<option value="days_120" '+(pf.period==='days_120'?'selected':'')+'>Últimos 120 dias</option>'+
            '<option value="days_180" '+(pf.period==='days_180'?'selected':'')+'>Últimos 180 dias</option>'+
            '<option value="custom" '+(pf.period==='custom'?'selected':'')+'>Escolher datas</option>'+
          '</select>'+
        '</div>'+
        '<div id="purchaseCustomDates" class="purchase-custom-range" style="display:'+(pf.period==='custom'?'flex':'none')+'">'+
          '<label>De <input id="purchaseDateStart" type="date" value="'+esc(pf.start_date||'')+'"></label>'+
          '<label>Até <input id="purchaseDateEnd" type="date" value="'+esc(pf.end_date||'')+'"></label>'+
          '<button class="secondary" id="purchaseApplyDates" type="button">Aplicar</button>'+
        '</div>'+
        '<div class="purchase-toolbar-actions">'+
          '<button class="primary" id="purchaseBlingSync" type="button">Buscar no Bling</button>'+
          '<button class="secondary" id="purchaseXmlBatch" type="button">Importar XML</button>'+
          '<button class="secondary" id="purchaseBlingReceived" type="button">Notas recebidas no Bling ↗</button>'+
        '</div>'+
      '</section>'+
      '<div class="purchase-source-note"><strong>Importação automática:</strong> o Admin importa notas já registradas como <b>Notas de compra</b> no Bling. As notas apenas <b>Ciente</b> na aba Notas recebidas não estão disponíveis por esta API. Para incluir uma dessas notas, importe o XML obtido pelo Bling quando disponível ou confirme a operação no Bling somente após verificar a compra e o recebimento. Não confirme apenas para fazê-la aparecer aqui.</div>'+
      '<div id="purchaseBlingReceivedReview" class="purchase-review-reminder" role="status" aria-live="polite"><span class="sub">Verificando conferência diária do Bling…</span></div>'+
      '<details class="panel purchase-import-options"><summary>Outras opções de importação</summary>'+
        '<div class="purchase-toolbar-actions">'+
          '<button class="secondary" id="purchaseXmlSingle" type="button">Enviar apenas 1 XML</button>'+
          '<button class="secondary" id="purchaseXmlCatalogOnly" type="button">Catalogar XML sem cadastrar produtos</button>'+
        '</div>'+
        '<p class="sub">Importar uma nota não lança estoque automaticamente. A opção de catalogar serve apenas para pesquisa e revisão, sem alterar produtos, preços, estoque ou financeiro. Notas em CPF não geram contas a pagar.</p>'+
      '</details>'+
      '<input id="purchaseXmlInput" type="file" accept=".xml,application/xml,text/xml" multiple hidden>'+
      '<input id="purchaseXmlCatalogOnlyInput" type="file" accept=".xml,application/xml,text/xml" multiple hidden>'+
      '<div id="purchaseBody"><div class="loading">Carregando notas fiscais…</div></div>';
    $('#refreshPurchases').onclick=loadPurchases;
    $('#purchasePeriod').onchange=async e=>{
      state.purchaseFilter.period=e.target.value;
      syncPurchasePeriodControls();
      if(e.target.value!=='custom')await loadPurchases();
    };
    if($('#purchaseDateStart'))$('#purchaseDateStart').onchange=e=>state.purchaseFilter.start_date=e.target.value;
    if($('#purchaseDateEnd'))$('#purchaseDateEnd').onchange=e=>state.purchaseFilter.end_date=e.target.value;
    if($('#purchaseApplyDates'))$('#purchaseApplyDates').onclick=async()=>{
      if(!purchaseCustomRangeReady()){toast('Informe um período válido');return}
      await loadPurchases();
    };
    $('#purchaseBlingSync').onclick=runPurchaseBlingSync;
    $('#purchaseBlingReceived').onclick=()=>window.open('https://www.bling.com.br/notas.entrada.php#list','_blank','noopener');
    $('#purchaseXmlSingle').onclick=()=>{$('#purchaseXmlInput').multiple=false;$('#purchaseXmlInput').click()};
    $('#purchaseXmlBatch').onclick=()=>{$('#purchaseXmlInput').multiple=true;$('#purchaseXmlInput').click()};
    $('#purchaseXmlInput').onchange=e=>importPurchaseXmlFiles([...e.target.files]);
    $('#purchaseXmlCatalogOnly').onclick=()=>$('#purchaseXmlCatalogOnlyInput').click();
    $('#purchaseXmlCatalogOnlyInput').onchange=e=>importCatalogOnlyXmlFiles([...e.target.files]);
    syncPurchasePeriodControls();
    await loadPurchases();
  }
  // Lembrete diário compartilhado entre operadores. Não é uma contagem real de NF-e.
  function paintBlingReceivedReview(){
    const host=$('#purchaseBlingReceivedReview');if(!host)return;
    const r=state.purchaseBlingReceivedReview;
    if(!r||r.ok!==true){
      host.innerHTML='<span class="sub">Não foi possível verificar a conferência diária da equipe.</span>'+
        '<button class="secondary" type="button" id="purchaseReviewOpenBling">Abrir Notas recebidas no Bling ↗</button>';
    }else if(r.reviewed_today){
      host.classList.add('reviewed');
      const label=r.reviewed_by_name?' por '+esc(r.reviewed_by_name):'';
      host.innerHTML='<span><strong>Notas recebidas conferidas hoje</strong><small>Registrado'+label+' às '+esc(dateTime(r.reviewed_at||''))+'. Isso não significa ausência de notas fiscais pendentes.</small></span>'+
        '<button class="secondary" type="button" id="purchaseReviewOpenBling">Abrir Bling ↗</button>';
    }else{
      host.classList.remove('reviewed');
      host.innerHTML='<span><strong>Conferir notas recebidas no Bling</strong>'+
        '<small>Lembrete diário: veja se há novas NF-e para sua empresa. Não há contagem automática de notas pendentes.</small></span>'+
        '<div class="purchase-review-actions"><button class="secondary" type="button" id="purchaseReviewOpenBling">Abrir Bling ↗</button>'+
        '<button class="primary" type="button" id="purchaseReviewConfirm">Já conferi hoje</button></div>';
    }
    const open=$('#purchaseReviewOpenBling');
    if(open)open.onclick=()=>window.open('https://www.bling.com.br/notas.entrada.php#list','_blank','noopener');
    const confirm=$('#purchaseReviewConfirm');
    if(confirm)confirm.onclick=async()=>{
      if(confirm.disabled)return;
      confirm.disabled=true;confirm.textContent='Registrando…';
      try{
        const check=await purchaseApi('bling_received_review_confirm');
        if(!check?.ok)throw new Error('Não foi possível registrar a conferência.');
        state.purchaseBlingReceivedReview=check;
        paintBlingReceivedReview();
        toast('Conferência diária registrada para a equipe');
      }catch(e){confirm.disabled=false;confirm.textContent='Já conferi hoje';toast(errorMessage(e?.message||e))}
    };
  }
  let purchasesLoadGeneration=0;
  async function loadPurchases(){
    const host=$('#purchaseBody');if(!host||state.tab!=='purchases')return;
    const generation=++purchasesLoadGeneration;
    const isCurrent=()=>generation===purchasesLoadGeneration&&state.tab==='purchases'&&host===$('#purchaseBody');
    if(!purchaseCustomRangeReady()){host.innerHTML='<div class="empty">Escolha as duas datas do período personalizado e clique em Aplicar.</div>';return}
    host.innerHTML='<div class="loading">Carregando compras de '+esc(purchasePeriodLabel())+'…</div>';
    try{
      const filter=purchaseFilterPayload();
      const filterKey=JSON.stringify(filter);
      if(state.purchaseBlingCompareKey!==filterKey){
        // Cancel an in-flight comparison for the previous period before starting another.
        ++purchaseBlingCompareGeneration;
        state.purchaseBlingCompareLoading=false;
        state.purchaseBlingCompareKey=filterKey;
        state.purchaseBlingCompareLoaded=false;
        state.purchaseBlingCompareError='';
        state.purchaseBlingBrowse={ok:null,documents:[],count:0};
      }
      // Fast path: opening Compras/XML must not wait for Bling OAuth, pricing
      // configuration or the 31-day product queue. Advanced data loads on demand.
      const result=await purchaseApi('summary',filter);
      if(!isCurrent())return;
      state.purchaseXml=result;
      if(!state.purchaseAdvancedLoaded){
        state.purchaseCatalogQueue={ok:true,items:[],counts:{}};
      }
      // Daily reminder is best-effort and must not delay the note list.
      if(!state.purchaseBlingReceivedReview)state.purchaseBlingReceivedReview={ok:false};
      purchaseApi('bling_received_review_status',{}).then(value=>{
        if(!isCurrent())return;
        state.purchaseBlingReceivedReview=value;
        paintBlingReceivedReview();
      }).catch(()=>{});
      if(state.purchaseAdvancedOpen&&!state.purchaseAdvancedLoaded&&!state.purchaseAdvancedLoading){
        queueMicrotask(()=>{if(isCurrent())loadPurchaseAdvanced()});
      }
      if(state.purchaseBlingCompareOpen&&!state.purchaseBlingCompareLoaded&&!state.purchaseBlingCompareLoading&&!state.purchaseBlingCompareError){
        queueMicrotask(()=>{if(isCurrent())loadPurchaseBlingComparison()});
      }
      paintBlingReceivedReview();
      paintPurchases();
    }catch(e){
      if(!isCurrent())return;
      host.innerHTML='<div class="empty">Não consegui carregar Compras/XML. <button class="text" id="retryPurchases">Tentar novamente</button></div>';
      if($('#retryPurchases'))$('#retryPurchases').onclick=loadPurchases;
    }
  }
  let purchaseAdvancedGeneration=0;
  async function loadPurchaseAdvanced(){
    if(state.purchaseAdvancedLoading||state.purchaseAdvancedLoaded)return;
    const generation=++purchaseAdvancedGeneration;
    state.purchaseAdvancedLoading=true;
    state.purchaseAdvancedError='';
    try{
      const queue=await purchaseApi('catalog_queue',{lookback_days:31});
      if(generation!==purchaseAdvancedGeneration)return;
      state.purchaseCatalogQueue=queue;
      state.purchaseAdvancedLoaded=true;
    }catch(e){
      if(generation!==purchaseAdvancedGeneration)return;
      state.purchaseAdvancedError=purchaseXmlError(e);
      state.purchaseAdvancedLoaded=false;
    }finally{
      if(generation===purchaseAdvancedGeneration){
        state.purchaseAdvancedLoading=false;
        if(state.tab==='purchases'&&$('#purchaseBody'))paintPurchases();
      }
    }
  }
  let purchaseBlingCompareGeneration=0;
  async function loadPurchaseBlingComparison(){
    const filter=purchaseFilterPayload(), key=JSON.stringify(filter);
    if(state.purchaseBlingCompareKey===key&&(state.purchaseBlingCompareLoading||state.purchaseBlingCompareLoaded))return;
    const generation=++purchaseBlingCompareGeneration;
    state.purchaseBlingCompareKey=key;
    state.purchaseBlingCompareLoading=true;
    state.purchaseBlingCompareError='';
    const isCurrent=()=>generation===purchaseBlingCompareGeneration&&state.purchaseBlingCompareKey===key;
    try{
      const result=await purchaseApi('browse_bling',filter);
      if(!isCurrent())return;
      state.purchaseBlingBrowse=result;
      state.purchaseBlingCompareLoaded=true;
    }catch(e){
      if(!isCurrent())return;
      state.purchaseBlingCompareError=purchaseXmlError(e);
      state.purchaseBlingCompareLoaded=false;
      state.purchaseBlingBrowse={ok:false,documents:[],count:0};
    }finally{
      if(isCurrent()){
        state.purchaseBlingCompareLoading=false;
        if(state.tab==='purchases'&&$('#purchaseBody'))paintPurchases();
      }
    }
  }
  function purchaseMaybeMoney(v){
    if(v===null||v===undefined||v==='')return '—';
    const n=Number(v);return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—';
  }
  function purchaseNumberInput(v){
    const n=Number(v);return Number.isFinite(n)?String(Math.round(n*1000000)/1000000):'';
  }
  function purchaseItemNetTotal(x){
    const m=x?.metadata||{};
    let n=Number(m.net_line_total);
    if(!Number.isFinite(n)||n<=0)n=Number(x?.line_total);
    if((!Number.isFinite(n)||n<=0)&&Number.isFinite(Number(x?.purchase_unit_price)))n=Number(x.purchase_unit_price)*Number(x.purchase_quantity||0);
    return Number.isFinite(n)?n:null;
  }
  function purchaseItemUnitCost(x,factor){
    const qty=Number(x?.purchase_quantity||0),f=Number(factor),net=purchaseItemNetTotal(x);
    return net!==null&&qty>0&&f>0?net/(qty*f):null;
  }
  function purchaseItemCardHtml(x){
    const p=x.pricing_preview||{},prod=x.products||{},factor=p.suggested_conversion_factor??x.conversion_factor??1;
    const unitCost=p.proposed_unit_cost??purchaseItemUnitCost(x,factor);
    const minimum=p.suggested_sale_price??(unitCost!==null?Math.round(unitCost*1.4*100)/100:null);
    const currentSale=Number(prod?.price),hasCurrent=Number.isFinite(currentSale)&&currentSale>0;
    const hasMinimum=Number.isFinite(Number(minimum));
    const saleValue=hasCurrent&&hasMinimum?Math.max(currentSale,Number(minimum)):hasCurrent?currentSale:minimum;
    const shouldUpdateSale=!hasCurrent||(hasMinimum&&currentSale+0.005<Number(minimum))||['pending','missing_link'].includes(String(x?.metadata?.bling_sale_status||''));
    const saleHint=hasCurrent&&hasMinimum&&currentSale>=Number(minimum)
      ?'Preço atual já está acima do mínimo de '+purchaseMoney(minimum)+' e será mantido.'
      :hasMinimum?'Sugestão mínima com 40%: '+purchaseMoney(minimum)+'.':'Confira o preço antes de autorizar.';
    const existing=Boolean(prod?.id),inactive=existing&&prod.is_active===false,newFromXml=Boolean(prod?.metadata?.purchase_xml_created);
    const approved=Boolean(x?.metadata?.catalog_approved_at),sync=x?.metadata?.bling_sale_status||'',costSync=x?.metadata?.bling_supplier_cost_status||'';
    const statusText=approved
      ?'<div class="purchase-sync-status"><strong>✓ Atualizado no Admin</strong> · '+(sync==='confirmed'?'Preço confirmado no Bling':sync==='pending'||sync==='missing_link'?'Preço no Bling pendente':sync==='not_requested'?'Preço do Bling não foi alterado':'Preço no Bling não conferido')+
      (costSync==='submitted'?' · custo enviado ao fornecedor no Bling (não verificado)':costSync==='pending'||costSync==='missing_supplier_link'||costSync==='missing_product_link'?' · custo Bling pendente':'')+'</div>'
      :'';
    const matchHtml=existing?'':'<div class="purchase-match-panel" data-purchase-match-panel>'+
      '<strong>Identificar produto</strong>'+
      '<small class="purchase-match-help">Selecione a unidade vendida. Vincular não altera estoque nem dados fiscais.</small>'+
      '<div class="purchase-match-search"><input type="search" data-purchase-match-query placeholder="EAN ou nome do produto" value="'+esc(x.commercial_gtin||x.tax_gtin||x.description||'')+'"><button class="secondary" type="button" data-purchase-match-search>Buscar produto</button></div>'+
      '<div data-purchase-match-results class="purchase-match-results"></div>'+
      '<div data-purchase-match-selected class="purchase-match-selection" aria-live="polite">Aguardando correspondência…</div>'+
      '<div class="purchase-match-options"><label>Este EAN é da <select data-purchase-match-role><option value="base_unit">Unidade vendida</option><option value="package">Embalagem fechada</option></select></label>'+
      '<label class="purchase-match-source-label" '+(x.commercial_gtin&&x.commercial_gtin===x.tax_gtin?'hidden':'')+'>EAN da nota <select data-purchase-match-source><option value="commercial">Comercial: '+esc(x.commercial_gtin||'—')+'</option><option value="tax">Tributável: '+esc(x.tax_gtin||'—')+'</option></select></label></div>'+
      '<button class="primary" type="button" data-purchase-match-confirm disabled>Confirmar vínculo</button>'+
      '<details class="purchase-create-item"><summary>Não encontrou? Criar produto novo inativo</summary><label>Nome da unidade vendida <input data-purchase-create-name value="'+esc(x.description||'')+'"></label><button type="button" class="secondary" data-purchase-match-create>Criar produto inativo e vincular</button></details>'+
      '<div class="purchase-match-feedback" role="status" data-purchase-match-feedback></div>'+
      '</div>';
    const needsFactor=Boolean(p.requires_conversion_confirmation);
    const evidence=p.conversion_suggestion_evidence?' · leitura: '+esc(p.conversion_suggestion_evidence):'';
    const factorHint=needsFactor
      ?(factor&&Number(factor)>1?'Sugestão detectada: '+esc(fmtQty(factor))+' UN por '+esc(x.purchase_unit||'embalagem')+evidence:'Informe quantas unidades de venda existem em 1 '+esc(x.purchase_unit||'embalagem')+'.')
      :'Venda em unidade · fator '+esc(fmtQty(factor||1))+'.';
    const qtyText=(factor&&Number(factor)>0)
      ?esc(fmtQty(x.purchase_quantity||0))+' '+esc(x.purchase_unit||'')+' × '+esc(fmtQty(factor))+' = '+esc(fmtQty(Number(x.purchase_quantity||0)*Number(factor)))+' UN'
      :esc(fmtQty(x.purchase_quantity||0))+' '+esc(x.purchase_unit||'');
    const workflowStatus=!existing?'Vincular':approved?(sync==='pending'||sync==='missing_link'?'Bling pendente':'Salvo'):needsFactor?'Conferir embalagem':'Conferir';
    return '<div class="purchase-item-card" data-purchase-item="'+esc(x.id)+'" data-document-id="'+esc(x.document_id)+'">'+
      '<details class="purchase-item-collapsible"><summary class="purchase-item-compact-summary"><span class="purchase-item-compact-name"><strong>'+esc(prod.name||x.description||'Produto')+'</strong><small>'+esc(x.description||'')+'</small></span><span class="purchase-item-compact-qty">'+qtyText+'</span><span class="pill '+(!existing||needsFactor?'warn':approved?'':'warn')+'">'+esc(workflowStatus)+'</span></summary><div class="purchase-item-compact-body">'+
      '<div class="purchase-item-title"><div><strong>'+esc(prod.name||x.description||'Produto')+'</strong>'+
        '<small>'+esc(x.description||'')+' · EAN '+esc(x.commercial_gtin||x.tax_gtin||prod.gtin||'não informado')+'</small>'+
        '<small><b>Compra:</b> '+qtyText+'</small></div>'+
        '<div class="purchase-item-badges">'+
          '<span class="pill '+(existing?'':'warn')+'">'+(existing?'Produto identificado':'1. Vincular produto')+'</span>'+
          (newFromXml?'<span class="pill warn">Novo pelo XML</span>':'')+
          (inactive?'<span class="pill off">Inativo</span>':'')+
          (needsFactor?'<span class="pill warn">2. Conferir unidades da embalagem</span>':'<span class="pill">Unidade de venda</span>')+
        '</div></div>'+statusText+matchHtml+
      '<div class="purchase-price-grid">'+
        '<div class="purchase-field"><label>Unidades vendidas em cada '+esc(x.purchase_unit||'embalagem')+'</label><input type="number" min="1" step="1" data-purchase-factor value="'+esc(purchaseNumberInput(factor))+'"><div class="purchase-factor-hint '+(needsFactor?'warn-text':'')+'" data-purchase-factor-hint>'+factorHint+'</div></div>'+
        '<div class="purchase-price-box"><small>Quantidade final</small><strong data-purchase-base-qty>'+((factor&&Number(factor)>0)?esc(fmtQty(Number(x.purchase_quantity||0)*Number(factor)))+' UN':'—')+'</strong></div>'+
        '<div class="purchase-price-box"><small>Custo atual</small><strong>'+purchaseMaybeMoney(prod.cost)+'</strong></div>'+
        '<div class="purchase-price-box"><small>Custo novo / UN</small><strong class="accent" data-purchase-unit-cost>'+purchaseMaybeMoney(unitCost)+'</strong></div>'+
        '<div class="purchase-price-box"><small>Preço atual</small><strong>'+purchaseMaybeMoney(prod.price)+'</strong></div>'+
        '<div class="purchase-field"><label>Preço de venda</label><input type="number" min="0" step="0.01" data-purchase-sale value="'+esc(purchaseNumberInput(saleValue))+'"><div class="purchase-factor-hint" data-purchase-sale-hint>'+esc(saleHint)+'</div></div>'+
      '</div>'+
      '<div class="purchase-item-controls"><div><div class="purchase-checks"><label><input type="checkbox" data-purchase-update-cost checked> Atualizar custo</label><label><input type="checkbox" data-purchase-update-sale '+(shouldUpdateSale?'checked':'')+'> Atualizar preço de venda</label></div><div class="purchase-stock-note">Estoque atual: '+esc(fmtQty(prod.stock||0))+' · autorizar este item não altera o estoque.</div></div>'+
        '<div><button class="primary" type="button" data-purchase-approve-item="'+esc(x.id)+'" '+(!existing?'disabled title="Vincule primeiro o produto acima"':'')+'>'+(approved&&['pending','missing_link'].includes(sync)?'Reenviar ao Bling':approved?'Revisar atualização':'Salvar e sincronizar')+'</button><span class="purchase-approval-result" data-purchase-result role="status"></span></div></div>'+
      '</div></details></div>';
  }
  function purchaseXmlError(e){
    const code=String(e?.message||e||'');
    const map={
      product_match_required:'Vincule primeiro o produto da nota com o cadastro.',
      xml_catalog_evidence_only_required:'A identificação precisa passar pela confirmação segura.',
      xml_identity_confirmation_required:'Confirme a identificação do produto.',
      xml_identity_gtin_invalid:'O EAN da nota está inválido: verifique o produto antes de vincular.',
      xml_identity_gtin_conflict:'Este EAN já pertence a outro produto. Selecione o produto correto.',
      xml_identity_existing_gtin_mismatch:'EAN diferente do cadastro. Não altere a unidade sem conferir.',
      xml_identity_already_resolved:'Esse produto já foi vinculado. Atualize a nota.',
      xml_identity_verified_source_required:'XML original ainda não validado. Reimporte ou revise a nota.',
      xml_identity_service_unavailable:'Não foi possível confirmar o vínculo no banco. Tente novamente.',
      packaging_factor_must_be_greater_than_one:'Informe quantas unidades existem no fardo ou caixa (maior que 1).',
      invalid_sale_price:'Digite um preço de venda válido.',
      existing_product_name_preserved:'O nome cadastrado não é alterado pela nota de compra.',
      xml_identity_operational_lot_review_required:'Já existe um recebimento vinculado a este item. Precisa de revisão antes de trocar o produto.'
    };
    return map[code]||((errorMessage(code)!=='Não consegui salvar agora.')?errorMessage(code):code.replace(/_/g,' ').slice(0,230));
  }
  async function purchaseSearchMatch(card){
    const input=card.querySelector('[data-purchase-match-query]'),results=card.querySelector('[data-purchase-match-results]');
    const query=String(input?.value||'').trim(),token=(card._purchaseSearchToken||0)+1;
    card._purchaseSearchToken=token;
    if(query.length<2){results.textContent='Digite o EAN ou nome do produto.';return}
    card.dataset.purchaseSelectedId='';
    const confirm=card.querySelector('[data-purchase-match-confirm]');
    if(confirm)confirm.disabled=true;
    const selected=card.querySelector('[data-purchase-match-selected]');
    if(selected)selected.textContent='Procurando correspondência…';
    results.textContent='Buscando…';
    try{
      const found=await purchaseApi('search_products',{query});
      if(!card.isConnected||card._purchaseSearchToken!==token)return;
      const products=Array.isArray(found.items)?found.items:[];
      results.innerHTML=products.length?products.map(p=>
        '<button type="button" class="purchase-match-choice" data-purchase-select-id="'+esc(p.id)+'">'+
        '<strong>'+esc(p.name)+'</strong><small>EAN '+esc(p.gtin||'—')+' · '+(p.is_active===false?'inativo':'ativo')+'</small></button>'
      ).join(''):'<small>Produto não encontrado. Busque pelo nome ou crie um cadastro inativo.</small>';
      card._purchaseCandidates=products;
      const choose=(btn,automatic=false)=>{
        const product=products.find(p=>p.id===btn.dataset.purchaseSelectId);
        if(!product)return;
        card.dataset.purchaseSelectedId=product.id;
        if(selected)selected.textContent=(automatic?'EAN exato encontrado: ':'Selecionado: ')+product.name+' · confira e confirme.';
        const detail=state.purchaseDetailCache?.[card.dataset.documentId],item=(detail?.items||[]).find(x=>x.id===card.dataset.purchaseItem);
        const raw=String(product.gtin||''),commercial=String(item?.commercial_gtin||''),tax=String(item?.tax_gtin||'');
        const source=card.querySelector('[data-purchase-match-source]');
        if(source)source.value=raw&&raw===tax&&raw!==commercial?'tax':'commercial';
        if(confirm)confirm.disabled=false;
        results.querySelectorAll('.purchase-match-choice').forEach(b=>b.classList.toggle('selected',b===btn));
      };
      results.querySelectorAll('[data-purchase-select-id]').forEach(btn=>btn.onclick=()=>choose(btn));
      // Um único EAN exato já fica selecionado na tela, sem gravação automática.
      const detail=state.purchaseDetailCache?.[card.dataset.documentId],item=(detail?.items||[]).find(x=>x.id===card.dataset.purchaseItem);
      const gtins=[item?.commercial_gtin,item?.tax_gtin].map(x=>String(x||'').replace(/[^0-9]/g,'')).filter(Boolean);
      const exact=products.filter(p=>gtins.includes(String(p.gtin||'').replace(/[^0-9]/g,'')));
      if(exact.length===1&&gtins.length){
        const btn=[...results.querySelectorAll('[data-purchase-select-id]')].find(b=>b.dataset.purchaseSelectId===exact[0].id);
        if(btn)choose(btn,true);
      }else if(selected)selected.textContent=products.length?'Escolha uma correspondência acima.':'Nenhum produto selecionado.';
    }catch(e){
      if(card.isConnected&&card._purchaseSearchToken===token){
        results.textContent=purchaseXmlError(e);
        if(selected)selected.textContent='Busca não concluída. Tente novamente.';
      }
    }
  }
  async function purchaseConfirmMatch(card,createNew=false){
    const id=card.dataset.purchaseItem,docId=card.dataset.documentId,
      productId=card.dataset.purchaseSelectedId||null,feedback=card.querySelector('[data-purchase-match-feedback]'),
      factor=Number(card.querySelector('[data-purchase-factor]')?.value||0),
      role=card.querySelector('[data-purchase-match-role]')?.value||'base_unit',
      source=card.querySelector('[data-purchase-match-source]')?.value||'commercial',
      name=String(card.querySelector('[data-purchase-create-name]')?.value||'').trim();
    if(!createNew&&!productId){feedback.textContent='Busque e selecione um produto primeiro.';return}
    if(!Number.isInteger(factor)||factor<1){feedback.textContent='Informe a quantidade de unidades por embalagem.';return}
    if(role==='package'&&factor<=1){feedback.textContent='Se o EAN é da embalagem, ela precisa conter mais de uma unidade.';return}
    if(createNew&&name.length<3){feedback.textContent='Informe o nome completo da unidade vendida.';return}
    const button=card.querySelector(createNew?'[data-purchase-match-create]':'[data-purchase-match-confirm]');
    button.disabled=true;feedback.textContent='Confirmando vínculo sem alterar estoque…';
    try{
      const payload={item_id:id,product_id:productId,create_new:createNew,proposed_name:createNew?name:null,
        catalog_evidence_only:true,gtin_source:source,gtin_role:role,
        conversion_factor:role==='package'?factor:1,
        purchase_pack_units_for_review:role==='base_unit'&&factor>1?factor:null,
        confirmation:createNew?'CRIAR_INATIVO_XML':'VINCULAR_ITEM_XML'};
      await purchaseApi('resolve_item_identity',payload);
      feedback.textContent='Produto vinculado. Carregando custo e preço…';
      await refreshPurchaseAfterApproval(docId);
    }catch(e){feedback.textContent=purchaseXmlError(e);button.disabled=false}
  }
  function recalcPurchaseItemCard(card,resetSale=true){
    if(!card)return;
    const itemId=card.dataset.purchaseItem,detail=state.purchaseDetailCache?.[card.dataset.documentId],item=(detail?.items||[]).find(x=>x.id===itemId);
    if(!item)return;
    const factor=Number(card.querySelector('[data-purchase-factor]')?.value||0);
    const cost=purchaseItemUnitCost(item,factor);
    const baseQty=Number(item.purchase_quantity||0)*(factor>0?factor:0);
    const minimum=cost!==null?Math.round(cost*1.4*100)/100:null;
    const currentSale=Number(item?.products?.price),hasCurrent=Number.isFinite(currentSale)&&currentSale>0;
    const hasMinimum=Number.isFinite(Number(minimum));
    const saleValue=hasCurrent&&hasMinimum?Math.max(currentSale,Number(minimum)):hasCurrent?currentSale:minimum;
    const shouldUpdateSale=!hasCurrent||(hasMinimum&&currentSale+0.005<Number(minimum))||['pending','missing_link'].includes(String(item?.metadata?.bling_sale_status||''));
    const costEl=card.querySelector('[data-purchase-unit-cost]'),qtyEl=card.querySelector('[data-purchase-base-qty]'),sale=card.querySelector('[data-purchase-sale]'),saleCheck=card.querySelector('[data-purchase-update-sale]'),hint=card.querySelector('[data-purchase-sale-hint]');
    if(costEl)costEl.textContent=purchaseMaybeMoney(cost);
    if(qtyEl)qtyEl.textContent=factor>0?fmtQty(baseQty)+' UN':'—';
    if(resetSale&&sale&&saleValue!==null&&saleValue!==undefined)sale.value=purchaseNumberInput(saleValue);
    if(resetSale&&saleCheck)saleCheck.checked=Boolean(shouldUpdateSale);
    if(hint){
      hint.textContent=hasCurrent&&hasMinimum&&currentSale>=Number(minimum)
        ?'Preço atual já está acima do mínimo de '+purchaseMoney(minimum)+' e será mantido.'
        :hasMinimum?'Sugestão mínima com 40%: '+purchaseMoney(minimum)+'.':'Confira o preço antes de autorizar.';
    }
  }


  function purchaseCatalogReasonLabel(v){
    const map={product_match_required:'Produto sem vínculo',processing_failed:'Falha no processamento',item_review_required:'Item precisa de revisão',conversion_review_required:'Conversão precisa de revisão',packaging_factor_required:'Informe unidades por embalagem',unit_cost_unavailable:'Custo unitário indisponível'};
    return map[v]||v||'Revisar';
  }
