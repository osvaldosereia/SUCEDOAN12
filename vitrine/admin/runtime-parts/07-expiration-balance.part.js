  function expiryDaysText(days){
    if(days<0)return 'Vencido há '+Math.abs(days)+' dia'+(Math.abs(days)===1?'':'s');
    if(days===0)return 'Vence hoje';
    return days+' dia'+(days===1?'':'s');
  }
  function expiryDaysClass(days){
    return days<0?'danger':days<30?'danger':days<60?'warn':'ok';
  }
  function renderExpirySummary(summary={}){
    return '<div class="expiry-summary">'+
      '<div class="expiry-card danger"><small>Vencidos desativados</small><strong>'+esc(summary.expired_deactivated??summary.expired??0)+'</strong></div>'+
      '<div class="expiry-card danger"><small>Menos de 30 dias</small><strong>'+esc(summary.under_30||0)+'</strong></div>'+
      '<div class="expiry-card warn"><small>30 a 59 dias</small><strong>'+esc(summary.days_30_59||0)+'</strong></div>'+
      '<div class="expiry-card"><small>60 a 90 dias</small><strong>'+esc(summary.days_60_90||0)+'</strong></div>'+
      '<div class="expiry-card"><small>Sem validade</small><strong>'+esc(summary.without_expiration||0)+'</strong></div>'+
      '<div class="expiry-card"><small>Oferta auto ligada</small><strong>'+esc(summary.auto_enabled||0)+'</strong></div>'+
    '</div>';
  }
  function expiryRow(p){
    const days=Number(p.days_left||0),expired=days<0;
    const offer=p.offer||null;
    const offerActive=offer?.active===true;
    const offerSource=offer?.metadata?.source==='expiry_auto'?'Automática':'Manual';
    const offerInfo=offerActive
      ? offerSource+' · '+money(offer.sale_price_cents)
      : (p.auto_expiry_offer_enabled&&days>=0?'Regra '+esc(p.suggested_discount_percent)+'%':'Sem oferta ativa');
    return '<div class="expiry-row '+(expired?'expired':'')+'" data-expiry-row="'+esc(p.id)+'">'+
      '<img class="thumb" src="'+esc(p.image_url||'/img/logoantonia5.png')+'" alt="" loading="lazy">'+
      '<div class="expiry-main"><span class="row-title">'+esc(p.name)+'</span><span class="sub">Estoque '+esc(fmtQty(p.stock_quantity||0))+' · '+esc(p.gtin||p.sku||'sem EAN')+'</span><span class="sub">'+offerInfo+'</span></div>'+
      '<div class="expiry-date-wrap"><input class="expiry-date-input" type="date" data-expiry-date value="'+esc(p.expiration_date||'')+'" aria-label="Data de validade de '+esc(p.name)+'"></div>'+
      '<div class="expiry-days '+expiryDaysClass(days)+'">'+esc(expiryDaysText(days))+(expired?'<span class="sub" style="color:#b3261e">Estoque zerado</span>':'')+'</div>'+
      '<label class="expiry-auto"><input type="checkbox" data-expiry-auto '+(p.auto_expiry_offer_enabled?'checked':'')+'><span><strong>Oferta automática</strong><small>'+(days>=0?'Regra atual: '+esc(p.suggested_discount_percent)+'%':'Vencido · oferta desligada')+'</small></span></label>'+
      '<button class="text expiry-edit" type="button" data-expiry-edit="'+esc(p.id)+'">Editar</button>'+
    '</div>';
  }
  async function renderExpirations(){
    const content=$('#content');
    content.innerHTML='<div class="page-head"><div><h1>Validades</h1><p>Produtos ativos com vencimento até 90 dias, do mais próximo para o mais distante.</p></div><button class="secondary" id="refreshExpiry">Atualizar</button></div>'+
      '<div id="expirySummary">'+renderExpirySummary({})+'</div>'+
      '<div class="expiry-help"><strong>Regra de vencimento:</strong> ao vencer, o produto é desativado automaticamente, sai da vitrine, tem o estoque zerado e as ofertas desligadas. Produtos inativos não entram nos cálculos futuros de validade.</div>'+
      '<div id="expiryExpiredNotice"></div>'+
      '<div class="panel"><div id="expiryRows"><div class="loading">Carregando validades…</div></div></div>'+
      '<section class="panel" style="margin-top:14px"><div class="history-title" style="padding:12px 12px 0"><div><strong>Histórico de validade e ativação</strong><span class="sub">Quem alterou, reativou ou foi desativado pela regra automática</span></div><button class="text" id="refreshExpiryAudit" type="button">Atualizar</button></div><div id="expiryAudit"><div class="loading">Carregando histórico…</div></div></section>';
    $('#refreshExpiry').onclick=loadExpirations;
    $('#refreshExpiryAudit').onclick=loadExpiryAudit;
    await loadExpirations();
    loadExpiryAudit();
  }
  function expiryRangeSummary(products,inventory={}){
    return {
      expired:products.filter(p=>Number(p.days_left)<0).length,
      under_30:products.filter(p=>Number(p.days_left)>=0&&Number(p.days_left)<30).length,
      days_30_59:products.filter(p=>Number(p.days_left)>=30&&Number(p.days_left)<60).length,
      days_60_90:products.filter(p=>Number(p.days_left)>=60&&Number(p.days_left)<=90).length,
      without_expiration:inventory.without_expiration??'—',
      auto_enabled:inventory.auto_enabled??'—',
      total_products:inventory.total_products??'—'
    };
  }
  async function activeValidityInventorySummary(){
    let offset=0,pages=0,total=0,without=0,auto=0;
    while(offset!=null&&pages<100){
      const page=await api('products',{offset,limit:100});
      const rows=page.products||[];
      for(const p of rows){
        if(p.active===false)continue;
        total++;
        if(!p.expiration_date)without++;
        if(p.auto_expiry_offer_enabled===true)auto++;
      }
      offset=page.next_offset;
      pages++;
    }
    return {total_products:total,without_expiration:without,auto_enabled:auto};
  }
  function renderExpiredDeactivatedNotice(rows=[],summary={}){
    const total=Number(summary.expired_deactivated??summary.expired??0);
    if(!total)return '';
    const examples=rows.slice(0,6).map(p=>esc(p.name)+' · '+esc(fmtDate(p.expiration_date))).join(' · ');
    return '<div class="bling-banner" style="margin-bottom:14px"><strong>'+esc(total)+' produto(s) vencido(s) já foram desativados automaticamente</strong><small>Estão fora da vitrine, com estoque zerado e ofertas desligadas.'+(examples?' Recentes: '+examples+(total>rows.length?'…':''):'')+'</small></div>';
  }

  function lifecycleEventLabel(event){
    return {reactivated:'Reativado',manual_deactivated:'Desativado manualmente',auto_expired_deactivation:'Desativado por vencimento',expiration_changed:'Validade alterada'}[event]||event||'Alteração';
  }
  function lifecycleAuditRow(r){
    const p=r.product||{},before=r.previous_expiration_date?dateOnly(r.previous_expiration_date):'sem validade',after=r.new_expiration_date?dateOnly(r.new_expiration_date):'sem validade';
    const change=before!==after?'Validade: '+before+' → '+after:(r.previous_active!==r.new_active?(r.new_active?'Inativo → ativo':'Ativo → inativo'):'');
    return '<div class="audit-row"><div><strong>'+esc(p.name||'Produto')+'</strong><small>'+esc(lifecycleEventLabel(r.event))+(change?' · '+esc(change):'')+'</small></div><div><strong>'+esc(r.actor_label||'Não identificado')+'</strong><small>'+(r.actor_type==='system'?'Automático':'Operador')+'</small></div><div class="audit-time"><strong>'+esc(dateTime(r.created_at))+'</strong><small>'+esc(p.gtin||p.sku||'')+'</small></div></div>';
  }
  async function loadExpiryAudit(){
    const host=$('#expiryAudit');if(!host)return;
    try{
      const data=await api('product_lifecycle_audit',{limit:40});
      state.productAudit=data.audit||[];
      host.innerHTML=state.productAudit.length?'<div class="audit-list">'+state.productAudit.map(lifecycleAuditRow).join('')+'</div>':'<div class="empty">Ainda não há alterações registradas.</div>';
    }catch(e){
      host.innerHTML='<div class="empty">Não consegui carregar o histórico agora.</div>';
    }
  }

  async function loadExpirations(){
    const host=$('#expiryRows');
    try{
      const data=await api('expirations');
      state.expiryProducts=(data.products||[]).filter(p=>p.active!==false);
      state.expiredDeactivated=data.expired_deactivated||[];
      if(data.active_only===true){
        state.expirySummary=data.summary||{};
      }else{
        let inventory={};
        try{inventory=await activeValidityInventorySummary()}catch{}
        state.expirySummary=expiryRangeSummary(state.expiryProducts,inventory);
      }
      $('#expirySummary').innerHTML=renderExpirySummary(state.expirySummary);
      if($('#expiryExpiredNotice'))$('#expiryExpiredNotice').innerHTML=renderExpiredDeactivatedNotice(state.expiredDeactivated,state.expirySummary);
      host.innerHTML=state.expiryProducts.length?state.expiryProducts.map(expiryRow).join(''):'<div class="empty">Nenhum produto ativo com validade nos próximos 90 dias.</div>';
      host.querySelectorAll('[data-expiry-date]').forEach(el=>el.onchange=()=>saveExpiryRow(el.closest('[data-expiry-row]')));
      host.querySelectorAll('[data-expiry-auto]').forEach(el=>el.onchange=()=>saveExpiryRow(el.closest('[data-expiry-row]')));
      host.querySelectorAll('[data-expiry-edit]').forEach(btn=>btn.onclick=()=>openProductEditor(state.expiryProducts.find(p=>p.id===btn.dataset.expiryEdit)));
    }catch(e){
      host.innerHTML='<div class="empty">Não consegui carregar as validades. <button class="text" id="retryExpiry">Tentar novamente</button></div>';
      if($('#retryExpiry'))$('#retryExpiry').onclick=loadExpirations;
    }
  }
  async function saveExpiryRow(row){
    if(!row)return;
    const id=row.dataset.expiryRow,date=row.querySelector('[data-expiry-date]')?.value||'',auto=row.querySelector('[data-expiry-auto]')?.checked===true;
    const operator=requireOperator();if(!operator)return;
    row.querySelectorAll('input,button').forEach(el=>el.disabled=true);
    try{
      const data=await api('expiration_save',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({product_id:id,expiration_date:date||null,auto_expiry_offer_enabled:auto,operator})
      });
      const p=data.product;
      if(p?.active===false&&p?.deactivation_reason==='expired')toast('Validade vencida · produto desativado automaticamente');
      else toast(auto?'Validade salva · oferta automática ligada':'Validade salva');
      await loadExpirations();
    }catch(e){
      toast(errorMessage(e.message));
      row.querySelectorAll('input,button').forEach(el=>el.disabled=false);
    }
  }


  function numericPadHtml(prefix){
    return '<div class="keypad">'+
      [1,2,3,4,5,6,7,8,9].map(n=>'<button type="button" data-'+prefix+'-key="'+n+'">'+n+'</button>').join('')+
      '<button class="utility" type="button" data-'+prefix+'-key="clear">Limpar</button>'+
      '<button type="button" data-'+prefix+'-key="0">0</button>'+
      '<button class="utility" type="button" data-'+prefix+'-key="back">⌫</button>'+
    '</div>';
  }

  function inventoryIncidentLabel(v){
    return ({damage:'Avaria',expired:'Vencido',loss:'Perda / extravio',return:'Retorno',other:'Outro'})[v]||v||'Ocorrência';
  }
  function setBalanceMode(mode){
    stopBalanceCamera();
    state.balanceMode=mode==='incident'?'incident':'count';
    state.balanceProduct=null;state.balanceQty='';
    renderBalance();
  }
  async function loadInventoryIncidents(){
    try{
      const data=await api('inventory_incidents',{limit:30});
      state.inventoryIncidentSummary=data.inventory||{};
      state.inventoryIncidents=data.inventory?.incidents||[];
      paintBalance();
    }catch{}
  }
  let inventorySheetCvPromise=null,inventorySheetTesseractPromise=null;

  const INVENTORY_SCRIPT_TIMEOUT_MS=6500;
  const INVENTORY_SHEET_READ_TIMEOUT_MS=45000;

