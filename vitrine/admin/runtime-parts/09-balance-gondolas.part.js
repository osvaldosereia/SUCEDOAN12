  function stopBalanceCamera(){
    state.balanceCameraRunning=false;
    if(state.balanceCameraStream){for(const t of state.balanceCameraStream.getTracks?.()||[])try{t.stop()}catch{}state.balanceCameraStream=null}
    state.balanceCameraDetector=null;
    const v=$('#balanceCameraVideo');if(v)try{v.srcObject=null}catch{}
  }
  let balanceScanAudioCtx=null;
  function balanceScanAudioContext(){
    const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return null;
    if(!balanceScanAudioCtx)balanceScanAudioCtx=new Ctx();return balanceScanAudioCtx;
  }
  async function unlockBalanceScanAudio(){try{const ctx=balanceScanAudioContext();if(ctx?.state==='suspended')await ctx.resume()}catch{}}
  function playBalanceScanBeep(){
    try{const ctx=balanceScanAudioContext();if(!ctx)return;const fire=()=>{const now=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='square';osc.frequency.setValueAtTime(1500,now);gain.gain.setValueAtTime(1,now);gain.gain.setValueAtTime(1,now+.10);gain.gain.exponentialRampToValueAtTime(.0001,now+.18);osc.connect(gain);gain.connect(ctx.destination);osc.start(now);osc.stop(now+.19)};if(ctx.state==='suspended')ctx.resume().then(fire).catch(()=>{});else fire()}catch{}
  }
  async function startBalanceCamera(){
    unlockBalanceScanAudio();
    if(state.tab!=='balance'||state.balanceMode==='incident'||state.balanceSubtab!=='scanner')return;
    const status=$('#balanceCameraStatus'),video=$('#balanceCameraVideo');if(!video)return;
    if(!navigator.mediaDevices?.getUserMedia){if(status)status.textContent='Este navegador não liberou câmera. Use a busca por nome/EAN abaixo.';return}
    stopBalanceCamera();
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:960},height:{ideal:540}},audio:false});
      state.balanceCameraStream=stream;video.srcObject=stream;await video.play();state.balanceCameraRunning=true;
      if('BarcodeDetector' in window){state.balanceCameraDetector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128']});if(status)status.textContent='Câmera ativa · aponte o código de barras para o quadro.';balanceCameraTick()}
      else{if(status)status.textContent='Câmera ativa, mas leitura automática de código não é suportada neste navegador. Digite o EAN ou busque pelo nome.'}
    }catch(e){if(status)status.textContent='Não consegui abrir a câmera. Libere a permissão ou use a busca manual.'}
  }
  async function balanceCameraTick(){
    if(!state.balanceCameraRunning||state.tab!=='balance'||state.balanceSubtab!=='scanner')return;
    const detector=state.balanceCameraDetector,video=$('#balanceCameraVideo');
    if(detector&&video&&video.readyState>=2&&!state.balanceProduct){
      try{
        const codes=await detector.detect(video);const raw=String(codes?.[0]?.rawValue||'').replace(/\D+/g,'');
        if(raw.length>=4){const now=Date.now();if(raw!==state.balanceLastCameraEan||now-state.balanceLastCameraAt>2500){state.balanceLastCameraEan=raw;state.balanceLastCameraAt=now;if(navigator.vibrate)navigator.vibrate(70);playBalanceScanBeep();await handleBalanceScan(raw)}}
      }catch{}
    }
    if(state.balanceCameraRunning)setTimeout(balanceCameraTick,120);
  }
  function bindBalanceManualSearch(){
    const input=$('#balanceManualSearch'),host=$('#balanceManualResults');if(!input||!host)return;
    input.oninput=()=>{clearTimeout(state.balanceManualSearchTimer);const q=String(input.value||'').trim();if(q.length<2){host.innerHTML='';return}state.balanceManualSearchTimer=setTimeout(()=>searchBalanceProducts(q),220)};
  }
  async function searchBalanceProducts(q){
    const host=$('#balanceManualResults');if(!host)return;host.innerHTML='<div class="loading">Buscando…</div>';
    try{const data=await api('products',{q,limit:10});const rows=data.products||[];host.innerHTML=rows.length?rows.map(p=>'<button class="balance-search-result" type="button" data-balance-pick="'+esc(p.id)+'"><img src="'+esc(p.image_url||'/img/sem-foto.svg')+'" alt=""><span><strong>'+esc(p.name)+'</strong><small class="sub">EAN '+esc(p.gtin||'—')+' · '+(p.is_active===false?'inativo':'ativo')+'</small></span></button>').join(''):'<div class="history-empty">Nenhum produto encontrado.</div>';host.querySelectorAll('[data-balance-pick]').forEach(b=>b.onclick=()=>{const p=rows.find(x=>x.id===b.dataset.balancePick);if(p)selectBalanceProduct(p,{photo_required:!p.image_url,readiness:null})})}catch{host.innerHTML='<div class="history-empty">Não consegui buscar agora.</div>'}
  }
  function selectBalanceProduct(p,metaInfo={}){
    const same=state.balanceProduct?.id===p?.id;
    const keepQty=same?state.balanceQty:'';
    const keepGondola=same?state.balanceGondola:'';
    const keepValidity=same?state.balanceValidity:'';
    const keepLot=same?state.balanceLotId:'';
    state.balanceProduct=p;
    state.balanceQty=keepQty;
    state.balanceGondola=keepGondola||String(p.gondola_number??p.gondola??'').replace(/\D+/g,'');
    state.balanceValidity=keepValidity||p.expiration_date||p.validity_date||'';
    state.balanceLotId=keepLot;
    state.balanceNeedsPhoto=metaInfo.photo_required===true;
    state.balanceReadiness=metaInfo.readiness||metaInfo.commercial_readiness||null;
    paintBalance();
  }
  async function uploadBalanceProductPhoto(file){
    const p=state.balanceProduct;if(!p||!file)return;const status=$('#balancePhotoStatus');if(status)status.textContent='Enviando foto real…';
    try{
      await uploadProductImageSource(p.id,file);if(status)status.textContent='Foto salva · identificando produto…';
      try{await productImageApi('identify',{product_id:p.id})}catch{}
      try{const fresh=await api('inventory_balance_status',{product_id:p.id});if(fresh.product)selectBalanceProduct(fresh.product,{photo_required:false,readiness:fresh.readiness})}catch{}
      state.balanceNeedsPhoto=false;if(status)status.textContent='Foto salva. A imagem de catálogo está sendo preparada.';
      standardizeProductImage(p.id).then(()=>api('inventory_balance_status',{product_id:p.id})).then(f=>{if(f?.product&&state.balanceProduct?.id===p.id)selectBalanceProduct(f.product,{photo_required:false,readiness:f.readiness})}).catch(()=>{});
    }catch(e){if(status)status.textContent='Não consegui salvar a foto: '+errorMessage(e.message)}
  }

  async function renderBalance(){
    const content=$('#content'),incident=state.balanceMode==='incident',scanner=!incident;
    const photoPanel='',manualPendingPanel='';
    const cameraPanel=scanner?'<section class=\"panel balance-camera-shell\"><div class=\"balance-camera-view\"><video id=\"balanceCameraVideo\" playsinline muted autoplay></video><div class=\"balance-camera-frame\"></div></div><div class=\"balance-camera-status\" id=\"balanceCameraStatus\">Abrindo câmera…</div><details class=\"balance-manual-search\"><summary>Buscar manualmente por nome ou EAN</summary><label style=\"display:block;margin-top:6px\"><input id=\"balanceManualSearch\" type=\"search\" inputmode=\"search\" autocomplete=\"off\" placeholder=\"Nome ou EAN\"></label><div id=\"balanceManualResults\" class=\"balance-search-results\"></div></details></section>':'';
    const work=(incident||scanner)?'<div class="tool-grid balance-tool-grid"><section class="panel tool-card">'+(incident?'<div class="form-grid" style="margin-bottom:12px"><label><span>Tipo</span><select id="inventoryIncidentType"><option value="damage">Avaria</option><option value="expired">Vencido</option><option value="loss">Perda / extravio</option><option value="return">Retorno para inspeção</option><option value="other">Outro</option></select></label><label><span>Observação opcional</span><input id="inventoryIncidentNote" maxlength="500" placeholder="Ex.: embalagem rasgada"></label></div>':'')+'<div id="balanceScanner" class="scanner-hero"><div class="scan-title"><span class="scan-dot"></span>AGUARDANDO EAN</div><div class="scan-value">Leia um produto</div><div class="scan-sub">'+(incident?'Depois informe a quantidade afetada.':'A câmera fica pronta para o próximo produto.')+'</div></div><div id="balanceProductExtras"></div><div class="qty-label">'+(incident?'Quantidade afetada':'Quantidade contada')+'</div><div class="qty-display" id="balanceQty">—</div>'+numericPadHtml('balance')+'<button class="confirm-wide" id="balanceConfirm" type="button" disabled>'+(incident?'Registrar ocorrência':'Salvar e próximo')+'</button></section><section class="panel"><div class="list-head" style="display:block">'+(incident?'Ocorrências abertas':'Contagens desta sessão')+'</div><div id="balanceHistory"></div></section></div>':'';
    content.innerHTML='<div class="page-head"><div><h1>Balanço</h1><p>'+(incident?'Registre avaria, vencimento, perda ou retorno.':'Conte estoque, localização e validade usando a câmera do celular.')+'</p></div><span class="pill">'+(scanner?'Câmera':'Balanço')+'</span></div><div class="order-filters" style="margin-bottom:12px"><button class="filter-chip '+(!incident?'active':'')+'" id="balanceModeCount" type="button">Balanço</button><button class="filter-chip '+(incident?'active':'')+'" id="balanceModeIncident" type="button">Avaria / Vencido / Retorno</button></div>'+cameraPanel+photoPanel+manualPendingPanel+work+(!incident?'<section class="panel" style="margin-top:14px"><div class="history-title dispatch-head"><div><strong>Recontagem para Bling</strong><span>Itens que precisam de conferência física</span></div><button class="secondary" id="refreshStockRecount" type="button">Atualizar</button></div><div id="stockRecountRows"><div class="loading">Carregando recontagens…</div></div></section><section class="panel" style="margin-top:14px"><div class="history-title dispatch-head"><div><strong>Faltas dos pedidos</strong><span>Priorize o que está travando pedidos</span></div><button class="secondary" id="refreshStockShortages" type="button">Atualizar</button></div><div id="stockShortageRows"><div class="loading">Calculando faltas…</div></div></section>':'<div class="rule-notice" style="margin-top:14px"><strong>Ocorrências</strong><div>Avaria, vencido e perda seguem para reconciliação operacional/fiscal.</div></div>');
    $('#balanceModeCount').onclick=()=>setBalanceMode('count');$('#balanceModeIncident').onclick=()=>setBalanceMode('incident');
    if(incident){$('#inventoryIncidentType').value=state.inventoryIncidentType||'damage';$('#inventoryIncidentType').onchange=e=>state.inventoryIncidentType=e.currentTarget.value;$('#inventoryIncidentNote').value=state.inventoryIncidentNote||'';$('#inventoryIncidentNote').oninput=e=>state.inventoryIncidentNote=e.currentTarget.value}
    if(incident||scanner){bindBalancePad();paintBalance()}
    if(scanner){bindBalanceManualSearch();startBalanceCamera()}
    if(incident)loadInventoryIncidents();
  }

  async function loadStockRecountQueue(){
    const host=$('#stockRecountRows');if(!host)return;
    host.innerHTML='<div class="loading">Carregando recontagens…</div>';
    try{
      const data=await api('stock_recount_queue');
      const q=data.recount||{},rows=q.items||[];
      if(!rows.length){host.innerHTML='<div class="history-empty">Nenhuma recontagem pendente para o cutover.</div>';return}
      host.innerHTML='<div class="bling-banner" style="margin:12px"><strong>'+esc(q.count||rows.length)+' produto(s) para recontar · '+esc(q.high||0)+' prioridade alta</strong><small>Esta etapa só registra a quantidade física. Nenhum saldo é enviado automaticamente ao Bling.</small></div>'+rows.map(x=>'<div class="simple-row"><div class="simple-main"><strong>'+esc(x.name)+'</strong><small>'+(x.priority==='high'?'PRIORIDADE ALTA · ':'')+'EAN '+esc(x.gtin||'—')+' · local '+esc(fmtQty(x.legacy_stock))+' · Bling físico '+esc(fmtQty(x.bling_physical))+' · virtual '+esc(fmtQty(x.bling_virtual))+(x.shelf_label?' · prateleira '+esc(x.shelf_label):'')+'</small></div><button class="secondary" type="button" data-count-reconcile="'+esc(x.product_id)+'">Contar</button></div>').join('');
      host.querySelectorAll('[data-count-reconcile]').forEach(b=>b.onclick=()=>selectRecountForBalance(b.dataset.countReconcile,rows));
    }catch(e){host.innerHTML='<div class="history-empty">Não consegui carregar as recontagens agora.</div>'}
  }
  function selectRecountForBalance(productId,rows){
    const x=(rows||[]).find(r=>r.product_id===productId);if(!x)return;
    state.balanceProduct={id:x.product_id,name:x.name,gtin:x.gtin||'',stock_quantity:x.legacy_stock,gondola_number:x.gondola_number??null};
    state.balanceQty='';paintBalance();$('#balanceScanner')?.scrollIntoView({behavior:'smooth',block:'center'});toast('Recontagem selecionada · informe a quantidade física atual');
  }
  async function loadOrderStockShortages(){
    const host=$('#stockShortageRows');if(!host)return;
    host.innerHTML='<div class="loading">Calculando faltas…</div>';
    try{
      const data=await api('order_stock_shortages');
      state.stockShortages=data.products||[];
      state.stockShortageSummary=data.summary||{products:0,shortage_units:0,pending_orders:0};
      paintOrderStockShortages();
    }catch(e){
      host.innerHTML='<div class="history-empty">Não consegui calcular as faltas agora. <button class="text" id="retryStockShortages" type="button">Tentar novamente</button></div>';
      if($('#retryStockShortages'))$('#retryStockShortages').onclick=loadOrderStockShortages;
    }
  }
  function paintOrderStockShortages(){
    const host=$('#stockShortageRows');if(!host)return;
    const rows=state.stockShortages||[],s=state.stockShortageSummary||{};
    if(!rows.length){host.innerHTML='<div class="history-empty">Nenhuma falta de estoque está bloqueando pedidos.</div>';return}
    host.innerHTML='<div class="bling-banner" style="margin:12px"><strong>'+esc(s.products||rows.length)+' produto(s) em falta · '+esc(s.pending_orders||0)+' pedido(s) aguardando</strong><small>Reposição mínima calculada: '+esc(fmtQty(s.shortage_units||0))+' unidade(s). Reservas já protegidas foram descontadas.</small></div>'+rows.map(x=>'<div class="simple-row"><div class="simple-main"><strong>'+esc(x.name)+'</strong><small>Faltam '+esc(fmtQty(x.shortage))+' · livre '+esc(fmtQty(x.free_stock))+' · físico '+esc(fmtQty(x.physical_stock))+' · reservado '+esc(fmtQty(x.reserved_stock))+' · demanda '+esc(fmtQty(x.pending_demand))+' · '+esc(x.pending_orders)+' pedido(s)'+(x.gondola_number?' · Gôndola '+esc(x.gondola_number):'')+(x.shelf_label?' · prateleira '+esc(x.shelf_label):'')+'</small></div><button class="secondary" type="button" data-count-shortage="'+esc(x.product_id)+'">Contar</button></div>').join('');
    host.querySelectorAll('[data-count-shortage]').forEach(b=>b.onclick=()=>selectShortageForBalance(b.dataset.countShortage));
  }
  function selectShortageForBalance(productId){
    const x=(state.stockShortages||[]).find(r=>r.product_id===productId);if(!x)return;
    state.balanceProduct={id:x.product_id,name:x.name,gtin:x.gtin||'',stock_quantity:x.physical_stock,gondola_number:x.gondola_number??null};state.balanceQty='';paintBalance();$('#balanceScanner')?.scrollIntoView({behavior:'smooth',block:'center'});toast('Produto selecionado · informe a quantidade física contada');
  }
  function bindBalancePad(){document.querySelectorAll('[data-balance-key]').forEach(b=>b.onclick=()=>balanceKey(b.dataset.balanceKey));$('#balanceConfirm').onclick=confirmBalance}
  function balanceKey(key){if(!state.balanceProduct)return;if(key==='clear')state.balanceQty='';else if(key==='back')state.balanceQty=state.balanceQty.slice(0,-1);else if(/^\d$/.test(key)&&state.balanceQty.length<7)state.balanceQty=(state.balanceQty==='0'?'':state.balanceQty)+key;paintBalance()}
  function paintBalance(){
    if(state.tab!=='balance')return;
    const hero=$('#balanceScanner'),qty=$('#balanceQty'),confirm=$('#balanceConfirm'),history=$('#balanceHistory');if(!hero||!qty||!confirm||!history)return;
    const incident=state.balanceMode==='incident',extras=$('#balanceProductExtras');
    if(state.balanceProduct){
      const p=state.balanceProduct;hero.className='scanner-hero ready';hero.innerHTML='<div class="scan-title"><span class="scan-dot"></span>PRODUTO LIDO</div><div class="scan-value">'+esc(p.name)+'</div><div class="scan-sub">EAN '+esc(p.gtin||'—')+' · estoque atual '+esc(fmtQty(p.stock_quantity||0))+(p.is_active===false?' · INATIVO':'')+'</div>';qty.textContent=state.balanceQty||'0';confirm.disabled=state.balanceQty==='';
      if(extras&&!incident){const blockers=state.balanceReadiness?.blockers||[];extras.innerHTML='<div class="balance-product-fields"><label><span>Gôndola</span><input id="balanceGondola" type="number" min="1" max="9999" inputmode="numeric" value="'+esc(state.balanceGondola||'')+'" placeholder="Ex.: 12"></label><label><span>Validade</span><input id="balanceValidity" type="date" value="'+esc(state.balanceValidity||'')+'"></label></div>'+(state.balanceNeedsPhoto?'<div class="balance-photo-callout"><strong>Produto sem foto adequada</strong><div class="sub">Se for produto novo, tire uma foto frontal da embalagem para completar o cadastro automaticamente.</div><button class="primary" id="balanceTakeProductPhoto" type="button" style="margin-top:8px">Tirar foto do produto</button><input id="balanceProductPhotoInput" type="file" accept="image/*" capture="environment" hidden><div id="balancePhotoStatus" class="balance-readiness"></div></div>':'')+'<div class="balance-readiness '+(state.balanceReadiness?.ready?'ok':'')+'">'+(state.balanceReadiness?.ready?'Cadastro comercial completo':(blockers.length?'Cadastro operacional pronto · pendente para o site: '+blockers.join(', '):'Cadastro pronto para balanço'))+'</div>';$('#balanceGondola').oninput=e=>state.balanceGondola=String(e.currentTarget.value||'').replace(/\D+/g,'').slice(0,4);$('#balanceValidity').onchange=e=>state.balanceValidity=e.currentTarget.value||'';const photoBtn=$('#balanceTakeProductPhoto'),photoInput=$('#balanceProductPhotoInput');if(photoBtn&&photoInput){photoBtn.onclick=()=>photoInput.click();photoInput.onchange=e=>{const file=e.currentTarget.files?.[0];if(file)uploadBalanceProductPhoto(file)}}}
    }else{hero.className='scanner-hero';hero.innerHTML='<div class="scan-title"><span class="scan-dot"></span>AGUARDANDO EAN</div><div class="scan-value">Leia um produto</div><div class="scan-sub">'+(incident?'Depois informe a quantidade afetada.':'Aponte a câmera para o código de barras.')+'</div>';qty.textContent='—';confirm.disabled=true;if(extras)extras.innerHTML=''}
    if(incident){const rows=state.inventoryIncidents||[];history.innerHTML=rows.length?rows.map(x=>'<div class="simple-row"><div class="simple-main"><strong>'+esc(x.product_name)+'</strong><small>'+esc(inventoryIncidentLabel(x.incident_type))+' · '+esc(dateTime(x.created_at))+(x.note?' · '+esc(x.note):'')+'</small></div><div class="simple-number">'+esc(fmtQty(x.quantity))+'</div></div>').join(''):'<div class="history-empty">Nenhuma ocorrência aberta.</div>'}
    else history.innerHTML=state.balanceHistory.length?state.balanceHistory.map(x=>'<div class="simple-row"><div class="simple-main"><strong>'+esc(x.name)+'</strong><small>'+esc(x.gtin||'')+(x.gondola_number?' · Gôndola '+esc(x.gondola_number):'')+(x.difference!=null&&Number(x.difference)!==0?' · diferença '+esc(fmtQty(x.difference)):'')+'</small></div><div class="simple-number">'+esc(fmtQty(x.stock_quantity))+'</div></div>').join(''):'<div class="history-empty">Nenhum produto contado nesta sessão.</div>';
  }

  async function handleBalanceScan(ean){
    if(state.tab!=='balance')return;
    if(state.balanceProduct){toast('Salve o produto atual antes de ler o próximo.');return}
    try{const data=await api('inventory_balance_resolve_ean',{ean,operator:currentOperator()||'Operação'});if(!data.product)throw new Error('product_not_found');selectBalanceProduct(data.product,{photo_required:data.photo_required===true,readiness:data.readiness||data.commercial_readiness});const status=$('#balanceCameraStatus');if(status)status.textContent=data.state==='photo_required'?'Produto novo cadastrado · tire uma foto se possível.':'Produto encontrado · informe quantidade, gôndola e validade.'}catch(e){state.balanceProduct=null;state.balanceQty='';paintBalance();toast(errorMessage(e.message))}
  }
  async function confirmBalance(){
    if(!state.balanceProduct||state.balanceQty==='')return;
    const btn=$('#balanceConfirm'),operator=requireOperator();if(!operator)return;btn.disabled=true;btn.textContent='Salvando…';
    try{
      if(state.balanceMode==='incident'){
        const data=await api('inventory_incident_create',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:state.balanceProduct.id,incident_type:state.inventoryIncidentType,quantity:Number(state.balanceQty),operator,note:state.inventoryIncidentNote||''})});
        const applied=data.incident?.local_stock_applied===true;
        toast(inventoryIncidentLabel(data.incident?.incident_type)+' registrada'+(applied?' · fora do estoque vendável':' · aguardando inspeção'));
        state.balanceProduct=null;state.balanceQty='';state.inventoryIncidentNote='';paintBalance();await loadInventoryIncidents();loadOrderStockShortages();
      }else{
        if(!/^\d{1,4}$/.test(String(state.balanceGondola||''))||Number(state.balanceGondola)<1){toast('Informe a gôndola antes de salvar');btn.disabled=false;btn.textContent='Salvar e próximo';return}
        const data=await api('inventory_balance_commit',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:state.balanceProduct.id,ean:state.balanceProduct.gtin,counted_quantity:Number(state.balanceQty),gondola_number:Number(state.balanceGondola),expiration_date:state.balanceValidity||null,lot_id:state.balanceLotId||null,operator,source:'scanner_ean'})});
        const item={...data.product,difference:data.count?.difference??0,reconciliation_state:data.stock?.state||data.count?.reconciliation_state||'matched'};
        state.balanceHistory.unshift(item);state.balanceHistory=state.balanceHistory.slice(0,40);
        const diff=Number(data.count?.difference||0);toast(diff===0?data.product.name+' · conferido':data.product.name+' · diferença '+fmtQty(diff)+' registrada para revisão');
        state.balanceProduct=null;state.balanceQty='';state.balanceGondola='';state.balanceValidity='';state.balanceLotId='';state.balanceNeedsPhoto=false;state.balanceReadiness=null;paintBalance();loadStockRecountQueue();loadOrderStockShortages();if(state.balanceSubtab==='scanner')startBalanceCamera();
      }
    }catch(e){toast(errorMessage(e.message));btn.disabled=false;btn.textContent=state.balanceMode==='incident'?'Registrar ocorrência':'Confirmar e ler próximo'}
  }

  let gondolasRenderGeneration=0;
  async function renderGondolas(){
    const generation=++gondolasRenderGeneration;
    const content=$('#content');
    const host=()=>$('#gondolaHost');
    const isCurrent=()=>generation===gondolasRenderGeneration&&state.tab==='gondolas'&&content===$('#content')&&Boolean(host());
    content.innerHTML='<div class="page-head"><div><h1>Gôndolas</h1><p>Localize produtos rapidamente ou cadastre a localização já registrando a contagem física.</p></div><button class="primary" id="newGondola">+ Nova gôndola</button></div><div id="gondolaHost"><div class="panel loading">Carregando…</div></div>';
    $('#newGondola').onclick=openGondolaCreator;
    try{
      const data=await api('gondolas');
      if(!isCurrent())return;
      state.gondolas=data.gondolas||[];
      if(state.gondola){
        const id=state.gondola.id;
        const fresh=await api('gondola',{id});
        if(!isCurrent()||state.gondola?.id!==id)return;
        state.gondola=fresh.gondola;state.gondolaProducts=fresh.products||[];
      }
      if(isCurrent())paintGondolas();
    }catch(e){if(isCurrent())host().innerHTML='<div class="panel empty">Não consegui carregar as gôndolas.</div>'}
  }

  function setGondolaMode(mode){
    state.gondolaMode=mode==='count'?'count':'assign';
    state.gondolaCountProduct=null;state.gondolaCountQty='';
    paintGondolas();
  }

  function gondolaCountWorkspaceHtml(){
    const p=state.gondolaCountProduct;
    const scanner=p
      ? '<div id="gondolaScanner" class="scanner-hero ready"><div class="scan-title"><span class="scan-dot"></span>PRODUTO LIDO · BALANÇO</div><div class="scan-value">'+esc(p.name)+'</div><div class="scan-sub">EAN '+esc(p.gtin||'—')+' · estoque atual '+esc(fmtQty(p.stock_quantity||0))+(p.gondola_number?' · hoje na Gôndola '+esc(p.gondola_number):' · ainda sem gôndola')+'</div></div>'
      : '<div id="gondolaScanner" class="scanner-hero"><div class="scan-title"><span class="scan-dot"></span>AGUARDANDO EAN</div><div class="scan-value">Leia um produto</div><div class="scan-sub">A localização só será salva depois de confirmar a quantidade física.</div></div><input id="gondolaScannerInput" class="gondola-scanner-input" type="text" inputmode="numeric" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Leitor EAN da gôndola" placeholder="Leia o EAN aqui"><div class="gondola-scan-help">Leitor pronto · aceita Enter ou Tab no final do código.</div>';
    return scanner+
      '<div class="qty-label">Quantidade física contada</div><div class="qty-display" id="gondolaCountQty">'+(p?esc(state.gondolaCountQty||'0'):'—')+'</div>'+
      numericPadHtml('gondolacount')+
      '<button class="confirm-wide" id="gondolaCountConfirm" type="button" '+(!p||state.gondolaCountQty===''?'disabled':'')+'>Salvar localização e balanço</button>';
  }

  function paintGondolas(){
    if(state.tab!=='gondolas')return;
    const host=$('#gondolaHost'),countMode=state.gondolaMode==='count';
    const workspace=state.gondola?'<section class="panel gondola-workspace tool-card">'+
      '<div class="gondola-toolbar"><div class="gondola-badge">GÔNDOLA '+esc(state.gondola.number)+'</div><button class="secondary danger-action" id="clearGondola" type="button" '+(state.gondolaProducts.length?'':'disabled')+'>Limpar gôndola</button></div>'+
      '<div class="order-filters" style="margin:12px 0"><button class="filter-chip '+(!countMode?'active':'')+'" id="gondolaModeAssign" type="button">Só localizar</button><button class="filter-chip '+(countMode?'active':'')+'" id="gondolaModeCount" type="button">Localizar + balanço</button></div>'+
      (countMode?gondolaCountWorkspaceHtml():
        '<div class="scanner-hero ready" id="gondolaScanner"><div class="scan-title"><span class="scan-dot"></span>LEITOR ATIVO</div><div class="scan-value">Leia os produtos da Gôndola '+esc(state.gondola.number)+'</div><div class="scan-sub">Cada leitura salva somente a localização. Não altera o estoque.</div></div><input id="gondolaScannerInput" class="gondola-scanner-input" type="text" inputmode="numeric" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Leitor EAN da gôndola" placeholder="Leia o EAN aqui"><div class="gondola-scan-help">Leitor pronto · o foco volta automaticamente depois de cada produto.</div>')+
      '<div class="section-title">Produtos nesta gôndola · '+esc(state.gondolaProducts.length)+'</div>'+
      '<div class="panel" id="gondolaProducts">'+(state.gondolaProducts.length?state.gondolaProducts.map(gondolaProductRow).join(''):'<div class="history-empty">Nenhum produto nesta gôndola.</div>')+'</div>'+
    '</section>':'';
    const cards=state.gondolas.length?'<section class="panel"><div class="gondola-grid">'+state.gondolas.map(g=>
      '<button class="gondola-card" type="button" data-open-gondola="'+esc(g.id)+'"><strong>Gôndola '+esc(g.number)+'</strong><span>'+esc(g.id===state.gondola?.id?state.gondolaProducts.length:g.product_count||0)+' produtos</span></button>'
    ).join('')+'</div></section>':'<section class="panel"><div class="history-empty">Nenhuma gôndola cadastrada. Clique em “Nova gôndola”.</div></section>';
    host.innerHTML=workspace+cards;
    host.querySelectorAll('[data-open-gondola]').forEach(b=>b.onclick=()=>openGondola(b.dataset.openGondola));
    host.querySelectorAll('[data-save-gondola-shelf]').forEach(b=>b.onclick=()=>saveGondolaShelf(b.dataset.saveGondolaShelf,b));
    host.querySelectorAll('[data-remove-gondola-product]').forEach(b=>b.onclick=()=>removeGondolaProduct(b.dataset.removeGondolaProduct));
    if(state.gondola){
      $('#gondolaModeAssign').onclick=()=>setGondolaMode('assign');
      $('#gondolaModeCount').onclick=()=>setGondolaMode('count');
      $('#clearGondola').onclick=clearGondola;
      if(countMode){
        host.querySelectorAll('[data-gondolacount-key]').forEach(b=>b.onclick=()=>gondolaCountKey(b.dataset.gondolacountKey));
        $('#gondolaCountConfirm').onclick=confirmGondolaCount;
      }
      bindGondolaScannerInput();
    }
  }

  function gondolaProductRow(p){
    return '<div class="simple-row"><div class="simple-main"><strong>'+esc(p.name)+'</strong><small>EAN '+esc(p.gtin||'—')+' · estoque '+esc(fmtQty(p.stock_quantity||0))+(p.shelf_label?' · prateleira '+esc(p.shelf_label):' · sem prateleira')+'</small></div><div class="shelf-control"><input type="text" maxlength="24" data-gondola-shelf-input="'+esc(p.id)+'" value="'+esc(p.shelf_label||'')+'" placeholder="Prateleira"><button class="text" type="button" data-save-gondola-shelf="'+esc(p.id)+'">Salvar</button><button class="text danger" type="button" data-remove-gondola-product="'+esc(p.id)+'">Remover</button></div></div>';
  }

  async function openGondola(id){
    try{
      const data=await api('gondola',{id});
      state.gondola=data.gondola;state.gondolaProducts=data.products||[];
      state.gondolaCountProduct=null;state.gondolaCountQty='';
      paintGondolas();
    }catch(e){toast(errorMessage(e.message))}
  }

  function openGondolaCreator(){
    state.gondolaCreateNumber='';
    $('#editorTitle').textContent='Nova gôndola';
    $('#editorBody').innerHTML='<div class="muted">Digite somente o número da gôndola usando os botões abaixo.</div><div class="big-number" id="gondolaCreateDisplay">—</div>'+numericPadHtml('gcreate');
    $('#editorActions').innerHTML='<button class="secondary" id="cancelEditor">Cancelar</button><button class="primary" id="createGondola" disabled>Criar gôndola</button>';
    $('#cancelEditor').onclick=()=>$('#editor').close();
    document.querySelectorAll('[data-gcreate-key]').forEach(b=>b.onclick=()=>gondolaCreateKey(b.dataset.gcreateKey));
    $('#createGondola').onclick=createGondola;
    $('#editor').showModal();
  }

  function gondolaCreateKey(key){
    if(key==='clear')state.gondolaCreateNumber='';
    else if(key==='back')state.gondolaCreateNumber=state.gondolaCreateNumber.slice(0,-1);
    else if(/^\d$/.test(key)&&state.gondolaCreateNumber.length<4)state.gondolaCreateNumber=(state.gondolaCreateNumber==='0'?'':state.gondolaCreateNumber)+key;
    $('#gondolaCreateDisplay').textContent=state.gondolaCreateNumber||'—';
    $('#createGondola').disabled=!Number(state.gondolaCreateNumber);
  }

  async function createGondola(){
    const btn=$('#createGondola');btn.disabled=true;btn.textContent='Criando…';
    try{
      const data=await api('gondola_create',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({number:Number(state.gondolaCreateNumber)})
      });
      $('#editor').close();state.gondola=data.gondola;state.gondolaProducts=[];
      state.gondolaCountProduct=null;state.gondolaCountQty='';
      toast('Gôndola '+data.gondola.number+' pronta');
      await renderGondolas();
    }catch(e){toast(errorMessage(e.message));btn.disabled=false;btn.textContent='Criar gôndola'}
  }

  let gondolaScanTimer=null;
  function focusGondolaScanner(){
    if(state.tab!=='gondolas'||!state.gondola||state.gondolaCountProduct)return;
    setTimeout(()=>{
      const input=$('#gondolaScannerInput');
      if(input&&!document.querySelector('dialog[open]')){
        try{input.focus({preventScroll:true})}catch{input.focus()}
        input.select();
      }
    },50);
  }
  function submitGondolaScannerValue(raw){
    clearTimeout(gondolaScanTimer);
    const input=$('#gondolaScannerInput');
    const ean=String(raw??input?.value??'').replace(/\D+/g,'').slice(0,30);
    if(input)input.value='';
    if(ean.length<4){if(ean)toast('EAN inválido');focusGondolaScanner();return}
    handleGondolaScan(ean);
  }
  function bindGondolaScannerInput(){
    const input=$('#gondolaScannerInput');if(!input)return;
    input.onkeydown=e=>{
      if(e.key==='Enter'||e.key==='Tab'){
        e.preventDefault();e.stopPropagation();submitGondolaScannerValue(input.value);
      }
    };
    input.oninput=()=>{
      input.value=String(input.value||'').replace(/\D+/g,'').slice(0,30);
      clearTimeout(gondolaScanTimer);
      const digits=input.value.length;
      if(digits>=4)gondolaScanTimer=setTimeout(()=>submitGondolaScannerValue(input.value),700);
    };
    input.onpaste=()=>setTimeout(()=>{const digits=String(input.value||'').replace(/\D+/g,'');if(digits.length>=4)submitGondolaScannerValue(digits)},0);
    input.onblur=()=>{const digits=String(input.value||'').replace(/\D+/g,'');if(digits.length>=4)setTimeout(()=>submitGondolaScannerValue(digits),0)};
    focusGondolaScanner();
  }

  async function handleGondolaScan(ean){
    if(state.tab!=='gondolas'||!state.gondola){toast('Abra uma gôndola antes de ler os produtos.');return}
    if(state.gondolaMode==='count'){
      if(state.gondolaCountProduct){toast('Confirme a quantidade do produto atual antes de ler o próximo.');return}
      try{
        const data=await api('ean_lookup',{ean});
        state.gondolaCountProduct=data.product;state.gondolaCountQty='';
        paintGondolas();toast('Produto lido · informe a quantidade física');
      }catch(e){state.gondolaCountProduct=null;state.gondolaCountQty='';paintGondolas();toast(errorMessage(e.message))}
      return;
    }
    try{
      const data=await api('gondola_assign',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({gondola_id:state.gondola.id,ean})
      });
      state.gondolaProducts=state.gondolaProducts.filter(p=>p.id!==data.product.id);
      state.gondolaProducts.unshift(data.product);
      const moved=data.previous_gondola_number&&Number(data.previous_gondola_number)!==Number(state.gondola.number)?' · movido da Gôndola '+data.previous_gondola_number:'';
      toast(data.product.name+moved);paintGondolas();
    }catch(e){toast(errorMessage(e.message))}
  }

  function gondolaCountKey(key){
    if(!state.gondolaCountProduct)return;
    if(key==='clear')state.gondolaCountQty='';
    else if(key==='back')state.gondolaCountQty=state.gondolaCountQty.slice(0,-1);
    else if(/^\d$/.test(key)&&state.gondolaCountQty.length<7)state.gondolaCountQty=(state.gondolaCountQty==='0'?'':state.gondolaCountQty)+key;
    const display=$('#gondolaCountQty'),btn=$('#gondolaCountConfirm');
    if(display)display.textContent=state.gondolaCountQty||'0';
    if(btn)btn.disabled=state.gondolaCountQty==='';
  }

  async function confirmGondolaCount(){
    if(!state.gondola||!state.gondolaCountProduct||state.gondolaCountQty==='')return;
    const operator=requireOperator();if(!operator)return;
    const btn=$('#gondolaCountConfirm');if(btn){btn.disabled=true;btn.textContent='Salvando…'}
    const pending=state.gondolaCountProduct;
    try{
      const data=await api('gondola_assign_count',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({gondola_id:state.gondola.id,product_id:pending.id,quantity:Number(state.gondolaCountQty),operator})
      });
      state.gondolaProducts=state.gondolaProducts.filter(p=>p.id!==data.product.id);
      state.gondolaProducts.unshift(data.product);
      const moved=data.previous_gondola_number&&Number(data.previous_gondola_number)!==Number(state.gondola.number)?' · movido da Gôndola '+data.previous_gondola_number:'';
      const diff=Number(data.count?.difference||0);
      const countText=diff===0?' · estoque conferido':' · diferença '+fmtQty(diff)+' registrada';
      state.gondolaCountProduct=null;state.gondolaCountQty='';
      paintGondolas();toast(data.product.name+countText+moved);
      loadStockRecountQueue();loadOrderStockShortages();
    }catch(e){
      toast(errorMessage(e.message));
      if(btn&&document.contains(btn)){btn.disabled=false;btn.textContent='Salvar localização e balanço'}
    }
  }

  async function clearGondola(){
    if(!state.gondola||!state.gondolaProducts.length)return;
    const number=state.gondola.number,count=state.gondolaProducts.length;
    const ok=window.confirm('Limpar a Gôndola '+number+'?\n\nIsso vai retirar a gôndola e a prateleira dos '+count+' produto(s) desta gôndola. Os produtos NÃO serão apagados e o estoque NÃO será alterado.');
    if(!ok)return;
    const btn=$('#clearGondola');if(btn){btn.disabled=true;btn.textContent='Limpando…'}
    try{
      const data=await api('gondola_clear',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({gondola_id:state.gondola.id,confirmation:'LIMPAR_GONDOLA_'+number,operator:currentOperator()||'Operação'})
      });
      state.gondolaProducts=[];state.gondolaCountProduct=null;state.gondolaCountQty='';
      const card=state.gondolas.find(g=>g.id===state.gondola.id);if(card)card.product_count=0;
      paintGondolas();toast('Gôndola '+number+' limpa · '+Number(data.removed_count||count)+' produto(s) sem localização');
    }catch(e){
      toast(errorMessage(e.message));
      if(btn&&document.contains(btn)){btn.disabled=false;btn.textContent='Limpar gôndola'}
    }
  }

  async function saveGondolaShelf(productId,btn){
    if(!state.gondola)return;
    const input=document.querySelector('[data-gondola-shelf-input="'+CSS.escape(productId)+'"]');
    if(!input)return;
    if(btn){btn.disabled=true;btn.textContent='Salvando…'}
    try{
      const data=await api('gondola_shelf_update',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({gondola_id:state.gondola.id,product_id:productId,shelf_label:input.value})
      });
      const product=state.gondolaProducts.find(p=>p.id===productId);
      if(product)product.shelf_label=data.shelf_label||null;
      paintGondolas();toast(data.shelf_label?'Prateleira '+data.shelf_label+' salva':'Prateleira removida');
    }catch(e){
      toast(errorMessage(e.message));
      if(btn){btn.disabled=false;btn.textContent='Salvar'}
    }
  }

  async function removeGondolaProduct(productId){
    if(!state.gondola)return;
    try{
      await api('gondola_remove',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({gondola_id:state.gondola.id,product_id:productId})
      });
      state.gondolaProducts=state.gondolaProducts.filter(p=>p.id!==productId);
      const card=state.gondolas.find(g=>g.id===state.gondola.id);if(card)card.product_count=state.gondolaProducts.length;
      paintGondolas();toast('Produto removido da gôndola');
    }catch(e){toast(errorMessage(e.message))}
  }


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
