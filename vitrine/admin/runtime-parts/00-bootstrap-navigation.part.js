(()=>{
  const API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-products-live-v1';
  const CUSTOMER_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-service-intelligence-v1';
  const STOREFRONT_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/storefront-v2';
  const PRODUCT_IMAGE_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/product-image-openai-v1';
  const FINANCE_AUTH_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-pin-auth-v1';
  const FINANCE_VERIFY_API='https://ssbesxgaijknwsjbsbcz.supabase.co/auth/v1/verify';
  const FINANCE_PUBLIC_KEY='sb_publishable_tFXHtH0HCXZepVtwgKElIg_DxS76Gu8';
  const BASKET_AUTO_RPC='https://ssbesxgaijknwsjbsbcz.supabase.co/rest/v1/rpc/';
  const $=s=>document.querySelector(s);
  const {esc,money,cents,fmtQty,dateTime,dateOnly,normalize}=window.DonaAntoniaAdminFormatters;
  const {orderDisplayCode,phoneDigits,formatPhone,formatCpf}=window.DonaAntoniaAdminIdentifiers;
  const {errorMessage}=window.DonaAntoniaAdminErrors;
  const state={tab:'today',orderFilter:'all',orderIssueFilter:'all',orderFocusIssue:null,fiscalByOrder:{},closurePendingCount:0,products:[],productOffset:0,productNext:null,productSort:'',baskets:[],basketSummary:null,basketDetail:null,basketLotDraft:null,basketKits:[],basketKitSummary:null,basketKitDetail:null,basketKitLotDraft:null,basketItemSelectedProduct:null,basketItemSearchTimer:null,productFilters:{category:'',subcategory:'',active:'',basketKit:'',lotStatus:''},productFacets:{categories:[],subcategories:[]},expiryProducts:[],expirySummary:null,expiredDeactivated:[],expiryAlerts:null,productAudit:[],customers:[],orders:[],balanceProduct:null,balanceQty:'',balanceHistory:[],balanceMode:'count',balanceSubtab:'scanner',balanceGondola:'',balanceValidity:'',balanceLotId:'',balanceNeedsPhoto:false,balanceReadiness:null,balanceCameraStream:null,balanceCameraDetector:null,balanceCameraRunning:false,balanceLastCameraEan:'',balanceLastCameraAt:0,balanceManualSearchTimer:null,inventorySheetScan:null,inventorySheetBusy:false,inventorySheetPreviewUrl:'',inventorySheetBatches:[],inventorySheetOcrWorkers:null,inventorySheetQueue:[],inventorySheetProcessing:false,inventorySheetPendingManual:[],inventorySheetPendingSummary:{count:0},inventoryIncidentType:'damage',inventoryIncidentNote:'',inventoryIncidents:[],inventoryIncidentSummary:null,stockShortages:[],stockShortageSummary:null,gondolas:[],gondola:null,gondolaProducts:[],gondolaCreateNumber:'',gondolaMode:'assign',gondolaCountProduct:null,gondolaCountQty:'',bling:null,blingProbe:null,finance:null,financeCatalogs:null,financeContactSearchTimer:null,financeSelectedContact:null,financeAuthPromise:null,purchaseXml:null,purchaseXmlDetail:null,purchaseExpandedId:null,purchaseDetailCache:{},purchaseCatalogQueue:null,purchaseCatalogFilter:'pending',purchaseCatalogSearch:'',purchaseAdvancedOpen:false,purchaseAdvancedLoaded:false,purchaseAdvancedLoading:false,purchaseAdvancedError:'',purchaseBlingCompareOpen:false,purchaseBlingCompareLoaded:false,purchaseBlingCompareLoading:false,purchaseBlingCompareError:'',purchaseBlingCompareKey:'',opsSummary:null,opsAttention:null,opsShadow:null,opsPrintQueue:null,opsPapoAi:null,opsTimeline:[],manualSale:null};
  const orderSession=window.DonaAntoniaAdminOrderSession.create({isOpen:()=>$('#editor')?.open&&$('#editorTitle')?.textContent==='Pedido'});
  const {load:loadFiscalForOrders}=window.DonaAntoniaAdminFiscalLoader.create({api,getCache:()=>state.fiscalByOrder});
  function toast(msg){
    const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1800);
  }
  const {MARKETING_BRANDS,MARKETING_SEGMENTS,marketingSegmentOf,marketingCampaignSlug}=window.DonaAntoniaAdminMarketingHelpers.createMarketingHelpers(normalize);
  const OPERATOR_KEY='da_operator_name_v1';
  function currentOperator(){return 'Operação'}
  function paintOperatorBadge(){
    const b=$('#operatorBadge');if(!b)return;
    const name=currentOperator();
    b.innerHTML='<span class="operator-prefix">Operador: </span><span class="operator-name">'+esc(name||'Identificar')+'</span>';
    b.title=name?'Operador atual: '+name:'Identifique o operador para registrar as alterações';
    b.classList.toggle('unset',!name);
  }
  function changeOperator(){return 'Operação'}
  function requireOperator(){return 'Operação'}
  if($('#operatorBadge'))$('#operatorBadge').onclick=changeOperator;
  paintOperatorBadge();
  async function api(action,params={},options={},retryAuth=true){
    const token=await adminStepUp();
    const u=new URL(API);u.searchParams.set('action',action);
    Object.entries(params).forEach(([k,v])=>{if(v!==''&&v!=null)u.searchParams.set(k,String(v))});
    const response=await fetch(u,{...options,headers:{...(options.headers||{}),'Authorization':'Bearer '+token},cache:'no-store'});
    if(response.status===401&&retryAuth){
      clearFinanceSession(token);
      return await api(action,params,options,false);
    }
    const data=await response.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!response.ok||data.ok===false)throw new Error(data.error||'service_error');
    return data;
  }
  async function productImageApi(event,payload=null,retryAuth=true){
    const token=await adminStepUp();
    let response;
    if(payload instanceof FormData){
      response=await fetch(PRODUCT_IMAGE_API,{method:'POST',headers:{'Authorization':'Bearer '+token},body:payload,cache:'no-store'});
    }else{
      response=await fetch(PRODUCT_IMAGE_API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({event,...(payload||{})}),cache:'no-store'});
    }
    if(response.status===401&&retryAuth){
      clearFinanceSession(token);
      return await productImageApi(event,payload,false);
    }
    const data=await response.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!response.ok||data.ok===false)throw new Error(data.error||'product_image_service_error');
    return data;
  }
  function productImageStatusText(p){
    if(p?.image_ai_status==='completed')return 'Imagem padronizada pela IA'+(p.image_ai_processed_at?' · '+dateTime(p.image_ai_processed_at):'');
    if(p?.image_ai_status==='processing')return 'Padronização em andamento…';
    if(p?.image_ai_status==='error')return 'Última padronização falhou. A foto original continua preservada.';
    if(p?.image_original_url)return 'Foto original salva. Você pode padronizar quando quiser.';
    return p?.image_url?'Imagem atual do produto. Envie uma foto original para poder padronizar.':'Produto ainda sem foto.';
  }
  async function uploadProductImageSource(productId,file){
    if(!productId)throw new Error('Salve o produto antes de enviar a foto.');
    if(!file)throw new Error('Escolha uma imagem.');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Use JPG, PNG ou WEBP.');
    if(file.size>6*1024*1024)throw new Error('A imagem deve ter no máximo 6 MB.');
    const form=new FormData();form.append('product_id',productId);form.append('file',file,file.name||'produto.jpg');
    return await productImageApi('upload_source',form);
  }
  async function standardizeProductImage(productId){return await productImageApi('standardize',{product_id:productId})}

  async function customerApi(action,payload={},retryAuth=true){
    const token=await adminStepUp();
    const response=await fetch(CUSTOMER_API,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
      body:JSON.stringify({action,...payload}),
      cache:'no-store'
    });
    if(response.status===401&&retryAuth){
      clearFinanceSession(token);
      return await customerApi(action,payload,false);
    }
    const data=await response.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!response.ok||data.ok===false)throw new Error(data.error||'service_error');
    return data;
  }
  async function storefrontApi(action,params={},options={}){
    const u=new URL(STOREFRONT_API);u.searchParams.set('action',action);
    Object.entries(params).forEach(([k,v])=>{if(v!==''&&v!=null)u.searchParams.set(k,String(v))});
    const response=await fetch(u,{...options,cache:'no-store'});
    const data=await response.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!response.ok||data.ok===false)throw new Error(data.error||'storefront_error');
    return data;
  }

  const OAUTH_PARAMS=new URLSearchParams(location.search);
  const OAUTH_RESULT=OAUTH_PARAMS.get('bling_oauth');
  const OAUTH_DETAIL=OAUTH_PARAMS.get('detail')||'';
  if(OAUTH_RESULT==='success'){
    history.replaceState({},'',location.pathname+location.hash);
    const msg=OAUTH_DETAIL==='status_catalog_ok'
      ?'Bling reconectado e Situações validadas.'
      :'Bling reconectado, mas o acesso a Situações ainda precisa ser liberado.';
    setTimeout(()=>toast(msg),500)
  }
  if(OAUTH_RESULT==='error'){const d=OAUTH_DETAIL||'erro';history.replaceState({},'',location.pathname+location.hash);setTimeout(()=>toast('Falha ao reconectar Bling: '+d),500)}


  const adminNavIsMobile=()=>window.matchMedia('(max-width:760px)').matches;
  function setAdminNavOpen(open){
    const shouldOpen=Boolean(open&&adminNavIsMobile());
    document.body.classList.toggle('admin-nav-open',shouldOpen);
    const toggle=$('#adminNavToggle');
    if(toggle){
      toggle.setAttribute('aria-expanded',shouldOpen?'true':'false');
      toggle.setAttribute('aria-label',shouldOpen?'Fechar menu':'Abrir menu');
    }
  }
  function closeNavMenus(){setAdminNavOpen(false)}
  function syncNavGroups(){
    document.querySelectorAll('.admin-sidebar-section').forEach(section=>{
      section.classList.toggle('active',Boolean(section.querySelector('[data-tab="'+state.tab+'"]')));
    });
    document.querySelectorAll('#adminNav [data-tab]').forEach(item=>{
      if(item.dataset.tab===state.tab)item.setAttribute('aria-current','page');
      else item.removeAttribute('aria-current');
    });
  }
  if($('#adminNavToggle'))$('#adminNavToggle').onclick=()=>setAdminNavOpen(!document.body.classList.contains('admin-nav-open'));
  if($('#adminNavBackdrop'))$('#adminNavBackdrop').onclick=()=>setAdminNavOpen(false);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')setAdminNavOpen(false)});
  window.addEventListener('resize',()=>{if(!adminNavIsMobile())setAdminNavOpen(false)});


  function renderAttendance(){
    location.assign('/vitrine/admin/atendimento/');
  }

  function setTab(tab){
    if(tab!=='products'){disconnectProductScrollObserver();productListGeneration++}
    if(state.tab==='balance'&&tab!=='balance')stopBalanceCamera();
    if(tab!=='orders')document.body.classList.remove('orders-tab-active');
    state.tab=tab;
    document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    syncNavGroups();
    closeNavMenus();
    if(tab==='today')renderToday();
    if(tab==='attendance')renderAttendance();
    if(tab==='ana')import('/vitrine/admin/ana/ana-admin.js?v=1').then(module=>{if(state.tab==='ana')return module.mountAnaAdmin($('#content'))}).catch(error=>{if(state.tab==='ana')$('#content').innerHTML='<section class="panel"><h1>ANA</h1><p>Não foi possível abrir a gestão da ANA.</p></section>';console.error('admin_ana_load',error)});
    if(tab==='products')renderProducts();
    if(tab==='baskets')renderBaskets();
    if(tab==='quotes')renderQuotes();
    if(tab==='marketing')renderMarketing();
    if(tab==='expiry')renderExpirations();
    if(tab==='purchases')renderPurchases();
    if(tab==='balance')renderBalance();
    if(tab==='gondolas')renderGondolas();
    if(tab==='customers')renderCustomers();
    if(tab==='finance')renderFinance();
    if(tab==='bling')renderBling();
    if(tab==='orders')return renderOrders();
    if(tab==='expedition')renderExpedition();
    if(tab==='driver')renderDriver();
    if(tab==='closure')renderClosure();
  }
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));

  let marketingLoadGeneration=0;
  async function renderMarketing(){
    const generation=++marketingLoadGeneration;
    const content=$('#content');
    const isCurrent=()=>generation===marketingLoadGeneration&&state.tab==='marketing'&&content===$('#content');content.innerHTML='<div class="page-head"><div><h1>Marketing</h1><p>Radar de oportunidades, segmentação e links de campanha. Nenhum envio é feito por esta tela.</p></div><button class="secondary" type="button" id="refreshMarketing">Atualizar</button></div><div class="panel"><div class="loading" id="marketingLoading">Lendo ofertas ativas do catálogo…</div></div>';
    if($('#refreshMarketing'))$('#refreshMarketing').onclick=renderMarketing;
    try{const data=await storefrontApi('offers');if(!isCurrent())return;const offers=Array.isArray(data.offers)?data.offers:[],groups=new Map();for(const p of offers){const name=marketingSegmentOf(p),x=groups.get(name)||{name,offers:0,stock:0,brands:new Set()};x.offers++;x.stock+=Number(p.stock_quantity||0);if(p.brand)x.brands.add(p.brand);groups.set(name,x)}const cards=[...groups.values()].sort((a,b)=>b.offers-a.offers).map(x=>'<div class="marketing-card"><h3>'+esc(x.name)+'</h3><p>Oportunidade baseada nas ofertas públicas ativas agora.</p><div class="marketing-kpis"><span>'+x.offers+' ofertas</span><span>'+fmtQty(x.stock)+' un. disponíveis</span>'+(x.brands.size?'<span>'+esc([...x.brands].slice(0,3).join(' · '))+'</span>':'')+'</div></div>').join('')||'<div class="empty">Nenhuma oferta ativa para montar radar agora.</div>';
      content.innerHTML='<div class="page-head"><div><h1>Marketing</h1><p>Inteligência comercial sem disparo automático.</p></div><button class="secondary" type="button" id="refreshMarketing">Atualizar</button></div><section><div class="section-title" style="border-top:0;margin-top:0">Radar de Marketing</div><div class="marketing-grid">'+cards+'</div></section><section class="marketing-section"><div class="section-title">Segmentação</div><p class="muted">Os componentes automáticos das cestas não contam para afinidade de categoria ou marca. Só produtos avulsos alimentam os sinais do pedido.</p><div class="marketing-chip-list" style="margin-top:9px">'+MARKETING_SEGMENTS.map(x=>'<span class="marketing-chip">INT_'+esc(x.key.replace('-','_').toUpperCase())+'</span>').join('')+'</div><div class="section-title">Marcas autorizadas</div><div class="marketing-chip-list">'+MARKETING_BRANDS.map(x=>'<span class="marketing-chip">'+esc(x.label)+'</span>').join('')+'</div><p class="muted" style="margin-top:8px">A allowlist persistente já está preparada no banco. Enquanto o projeto está no limite de Edge Functions, esta versão usa a mesma lista fixa no site/Admin e não cria dependência de função nova.</p></section><section class="marketing-section"><div class="section-title">Links / Campanhas</div><div class="marketing-builder"><label><span>Canal</span><select id="mktChannel"><option value="0975">0975</option><option value="1018">1018</option></select></label><label><span>Destino</span><select id="mktTarget"><option value="offers">Ofertas</option>'+MARKETING_SEGMENTS.map(x=>'<option value="category:'+esc(x.key)+'">'+esc(x.label)+'</option>').join('')+'</select></label><label><span>Marca (opcional)</span><select id="mktBrand"><option value="">Nenhuma</option>'+MARKETING_BRANDS.map(x=>'<option value="'+esc(x.key)+'">'+esc(x.label)+'</option>').join('')+'</select></label><label style="grid-column:1/-1"><span>Nome da campanha (opcional)</span><input id="mktCampaign" placeholder="ex.: semana_bebe_out26"></label><div class="marketing-url"><input id="mktUrl" readonly><button class="primary" type="button" id="copyMktUrl">Copiar link</button></div></div></section><section class="marketing-section"><div class="section-title">Configuração</div><div class="panel" style="padding:12px"><strong>Prioridade atual de CTA pós-pedido</strong><p class="muted">Bebê → Cabelos → Beleza → Limpeza → Lavanderia → Pet → Ofertas para cesta.</p><p class="muted">O CTA só é sinalizado quando o cliente autorizou ofertas pelo WhatsApp.</p></div></section>';
      const updateLink=()=>{const channel=$('#mktChannel')?.value||'0975',target=$('#mktTarget')?.value||'offers',brand=$('#mktBrand')?.value||'',campaign=marketingCampaignSlug($('#mktCampaign')?.value||''),u=new URL('https://www.donaantonia.com.br/');u.searchParams.set('origem',channel);if(brand)u.searchParams.set('marca',brand);else if(target==='offers')u.searchParams.set('ofertas','1');else if(target.startsWith('category:'))u.searchParams.set('categoria',target.slice(9));if(campaign)u.searchParams.set('campanha',campaign);if($('#mktUrl'))$('#mktUrl').value=u.toString()};['mktChannel','mktTarget','mktBrand','mktCampaign'].forEach(id=>$('#'+id)?.addEventListener(id==='mktCampaign'?'input':'change',updateLink));$('#mktTarget')?.addEventListener('change',()=>{if($('#mktBrand'))$('#mktBrand').value='';updateLink()});$('#mktBrand')?.addEventListener('change',()=>updateLink());if($('#copyMktUrl'))$('#copyMktUrl').onclick=async()=>{updateLink();const value=$('#mktUrl')?.value||'';try{await navigator.clipboard.writeText(value);toast('Link copiado')}catch{const i=$('#mktUrl');i?.select();document.execCommand('copy');toast('Link copiado')}};if($('#refreshMarketing'))$('#refreshMarketing').onclick=renderMarketing;updateLink();
    }catch(e){if(!isCurrent())return;content.innerHTML='<div class="page-head"><div><h1>Marketing</h1><p>Radar de oportunidades.</p></div></div><div class="empty">Não consegui carregar as ofertas agora.<br><button class="text" id="retryMarketing">Tentar novamente</button></div>';if($('#retryMarketing'))$('#retryMarketing').onclick=renderMarketing}
  }

  let quotesRenderGeneration=0;
  async function renderQuotes(){
    const generation=++quotesRenderGeneration;
    const content=$('#content');
    const isCurrent=()=>generation===quotesRenderGeneration&&state.tab==='quotes'&&content===$('#content');
    content.innerHTML='<div class="page-head"><div><h1>Orçamentos</h1><p>Crie propostas usando produtos, clientes e cestas atuais do Supabase.</p></div><a class="store-link" href="/orcamento/" title="Abre nesta aba para manter a sessão administrativa">Abrir em tela inteira</a></div><div class="quote-admin-shell"><div class="loading" id="quoteAdminLoading">Validando sessão administrativa…</div></div>';
    try{
      await adminStepUp();
      if(!isCurrent())return;
      const shell=content.querySelector('.quote-admin-shell');
      if(shell)shell.innerHTML='<iframe class="quote-admin-frame" src="/orcamento/?embedded=1" title="Criador de Orçamentos Dona Antônia"></iframe>';
    }catch(e){
      if(!isCurrent())return;
      const shell=content.querySelector('.quote-admin-shell');
      if(shell)shell.innerHTML='<div class="empty">Não foi possível abrir Orçamentos sem uma sessão administrativa válida.<br><button class="text" id="retryQuotes">Tentar novamente</button></div>';
      if($('#retryQuotes'))$('#retryQuotes').onclick=renderQuotes;
    }
  }

