Warning: truncated output (original token count: 158729)
Total output lines: 7733


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
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=c=>(Number(c||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const cents=v=>Math.round(Number(v||0)*100);
  const fmtQty=n=>Number.isInteger(Number(n))?String(Number(n)):String(Number(n).toFixed(3)).replace(/\.?0+$/,'');
  const dateTime=v=>v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
  const dateOnly=v=>{const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'/'+m[2]+'/'+m[1]:(v||'—')};
  const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const state={tab:'today',orderFilter:'all',orderStatusTab:'manual',manualQueueIds:new Set(),manualQueueLoaded:false,manualQueueError:false,orderIssueFilter:'all',orderQuery:'',expeditionQuery:'',expeditionSelected:[],orderCustomerSearchTimer:null,orderCustomerSuggestion:null,orderFocusIssue:null,componentReplacement:null,fiscalByOrder:{},closureOrders:[],closurePendingCount:0,products:[],productOffset:0,productNext:null,productSort:'',baskets:[],basketSummary:null,basketDetail:null,basketLotDraft:null,basketKits:[],basketKitSummary:null,basketKitDetail:null,basketKitLotDraft:null,basketItemSelectedProduct:null,basketItemSearchTimer:null,productFilters:{category:'',subcategory:'',active:'',sourceSystem:'',basketKit:'',lotStatus:''},productFacets:{categories:[],subcategories:[]},expiryProducts:[],expirySummary:null,expiredDeactivated:[],expiryAlerts:null,productAudit:[],customers:[],customerProfile:null,customerHistoryOffset:0,orders:[],currentOrder:null,currentOrderBlingPreview:null,currentOrderFiscal:null,balanceProduct:null,balanceQty:'',balanceHistory:[],balanceMode:'count',balanceSubtab:'scanner',balanceGondola:'',balanceValidity:'',balanceLotId:'',balanceNeedsPhoto:false,balanceReadiness:null,balanceCameraStream:null,balanceCameraDetector:null,balanceCameraRunning:false,balanceLastCameraEan:'',balanceLastCameraAt:0,balanceManualSearchTimer:null,inventorySheetScan:null,inventorySheetBusy:false,inventorySheetPreviewUrl:'',inventorySheetBatches:[],inventorySheetOcrWorkers:null,inventorySheetQueue:[],inventorySheetProcessing:false,inventorySheetPendingManual:[],inventorySheetPendingSummary:{count:0},inventoryIncidentType:'damage',inventoryIncidentNote:'',inventoryIncidents:[],inventoryIncidentSummary:null,stockShortages:[],stockShortageSummary:null,gondolas:[],gondola:null,gondolaProducts:[],gondolaCreateNumber:'',gondolaMode:'assign',gondolaCountProduct:null,gondolaCountQty:'',bling:null,blingProbe:null,finance:null,financeCatalogs:null,financeContactSearchTimer:null,financeSelectedContact:null,financeAuthPromise:null,purchaseXml:null,purchaseXmlDetail:null,purchaseExpandedId:null,purchaseDetailCache:{},purchaseCatalogQueue:null,purchaseCatalogFilter:'pending',purchaseCatalogSearch:'',purchaseAdvancedOpen:false,purchaseAdvancedLoaded:false,purchaseAdvancedLoading:false,purchaseAdvancedError:'',purchaseBlingCompareOpen:false,purchaseBlingCompareLoaded:false,purchaseBlingCompareLoading:false,purchaseBlingCompareError:'',purchaseBlingCompareKey:'',opsSummary:null,opsAttention:null,opsShadow:null,opsPrintQueue:null,opsPapoAi:null,opsTimeline:[],manualSale:null,deliveryPaymentDraft:null,deliveryRuns:[],deliveryCatalog:{regions:[],drivers:[],vehicles:[]},deliveryPlan:{region_id:'',driver_id:'',vehicle_id:''},driverVehicle:'all'};
  function toast(msg){
    const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1800);
  }
  const MARKETING_BRANDS=[{key:'nivea',label:'NIVEA'},{key:'elseve',label:'Elseve'}];
  const MARKETING_SEGMENTS=[{key:'bebe',label:'Bebê'},{key:'cabelos',label:'Cabelos'},{key:'beleza',label:'Beleza e cuidados'},{key:'higiene',label:'Higiene pessoal'},{key:'limpeza',label:'Limpeza'},{key:'lavanderia',label:'Lavanderia'},{key:'pet',label:'Pet'},{key:'casa',label:'Casa'},{key:'doces-lanches',label:'Doces e lanches'}];
  function marketingSegmentOf(p){const sub=normalize(p?.subcategory||''),leaf=normalize(p?.subsubcategory||'');if(sub.includes('bebe')||leaf.includes('fralda')||leaf.includes('bebe'))return 'Bebê';if(sub==='cabelos')return 'Cabelos';if(sub.includes('beleza'))return 'Beleza e cuidados';if(sub.includes('higiene pessoal'))return 'Higiene pessoal';if(sub==='limpeza')return 'Limpeza';if(sub==='lavanderia')return 'Lavanderia';if(sub==='pets'||leaf.includes('pet')||leaf==='caes'||leaf==='gatos')return 'Pet';if(sub.includes('casa e utilidades'))return 'Casa';if(['biscoitos','chocolates e doces','balas e chicletes','salgadinhos e petiscos','bebidas','cereais e barras'].includes(leaf))return 'Doces e lanches';return 'Outros'}
  function adminSlug(v){return normalize(v).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)}
  function marketingCampaignSlug(v){return adminSlug(v||'')}
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
  // Consistent JSON/error handling for Admin service calls. Keep each endpoint's fallback code.
  async function readAdminServiceResponse(response,fallbackError){
    const data=await response.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!response.ok||data.ok===false)throw new Error(data.error||fallbackError);
    return data;
  }
  function appendAdminQueryParams(url,params){
    Object.entries(params).forEach(([k,v])=>{if(v!==''&&v!=null)url.searchParams.set(k,String(v))});
  }
  async function api(action,params={},options={},retryAuth=true){
    const token=await adminStepUp();
    const u=new URL(API);u.searchParams.set('action',action);
    appendAdminQueryParams(u,params);
    const response=await fetch(u,{...options,headers:{...(options.headers||{}),'Authorization':'Bearer '+token},cache:'no-store'});
    if(response.status===401&&retryAuth){
      clearFinanceSession(token);
      return await api(action,params,options,false);
    }
    return await readAdminServiceResponse(response,'service_error');
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
    return await readAdminServiceResponse(response,'product_image_service_error');
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
    return await readAdminServiceResponse(response,'service_error');
  }
  async function storefrontApi(action,params={},options={}){
    const u=new URL(STOREFRONT_API);u.searchParams.set('action',action);
    appendAdminQueryParams(u,params);
    const response=await fetch(u,{...options,cache:'no-store'});
    return await readAdminServiceResponse(response,'storefront_error');
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
    if(tab==='ana')import('/vitrine/admin/ana/ana-admin.js?v=1').then(module=>module.mountAnaAdmin($('#content'))).catch(error=>{$('#content').innerHTML='<section class="panel"><h1>ANA</h1><p>Não foi possível abrir a gestão da ANA.</p></section>';console.error('admin_ana_load',error)});
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

  async function renderMarketing(){
    const content=$('#content');content.innerHTML='<div class="page-head"><div><h1>Marketing</h1><p>Radar de oportunidades, segmentação e links de campanha. Nenhum envio é feito por esta tela.</p></div><button class="secondary" type="button" id="refreshMarketing">Atualizar</button></div><div class="panel"><div class="loading" id="marketingLoading">Lendo ofertas ativas do catálogo…</div></div>';
    if($('#refreshMarketing'))$('#refreshMarketing').onclick=renderMarketing;
    try{const data=await storefrontApi('offers'),offers=Array.isArray(data.offers)?data.offers:[],groups=new Map();for(const p of offers){const name=marketingSegmentOf(p),x=groups.get(name)||{name,offers:0,stock:0,brands:new Set()};x.offers++;x.stock+=Number(p.stock_quantity||0);if(p.brand)x.brands.add(p.brand);groups.set(name,x)}const cards=[...groups.values()].sort((a,b)=>b.offers-a.offers).map(x=>'<div class="marketing-card"><h3>'+esc(x.name)+'</h3><p>Oportunidade baseada nas ofertas públicas ativas agora.</p><div class="marketing-kpis"><span>'+x.offers+' ofertas</span><span>'+fmtQty(x.stock)+' un. disponíveis</span>'+(x.brands.size?'<span>'+esc([...x.brands].slice(0,3).join(' · '))+'</span>':'')+'</div></div>').join('')||'<div class="empty">Nenhuma oferta ativa para montar radar agora.</div>';
      content.innerHTML='<div class="page-head"><div><h1>Marketing</h1><p>Inteligência comercial sem disparo automático.</p></div><button class="secondary" type="button" id="refreshMarketing">Atualizar</button></div><section><div class="section-title" style="border-top:0;margin-top:0">Radar de Marketing</div><div class="marketing-grid">'+cards+'</div></section><section class="marketing-section"><div class="section-title">Segmentação</div><p class="muted">Os componentes automáticos das cestas não contam para afinidade de categoria ou marca. Só produtos avulsos alimentam os sinais do pedido.</p><div class="marketing-chip-list" style="margin-top:9px">'+MARKETING_SEGMENTS.map(x=>'<span class="marketing-chip">INT_'+esc(x.key.replace('-','_').toUpperCase())+'</span>').join('')+'</div><div class="section-title">Marcas autorizadas</div><div class="marketing-chip-list">'+MARKETING_BRANDS.map(x=>'<span class="marketing-chip">'+esc(x.label)+'</span>').join('')+'</div><p class="muted" style="margin-top:8px">A allowlist persistente já está preparada no banco. Enquanto o projeto está no limite de Edge Functions, esta versão usa a mesma lista fixa no site/Admin e não cria dependência de função nova.</p></section><section class="marketing-section"><div class="section-title">Links / Campanhas</div><div class="marketing-builder"><label><span>Canal</span><select id="mktChannel"><option value="0975">0975</option><option value="1018">1018</option></select></label><label><span>Destino</span><select id="mktTarget"><option value="offers">Ofertas</option>'+MARKETING_SEGMENTS.map(x=>'<option value="category:'+esc(x.key)+'">'+esc(x.label)+'</option>').join('')+'</select></label><label><span>Marca (opcional)</span><select id="mktBrand"><option value="">Nenhuma</option>'+MARKETING_BRANDS.map(x=>'<option value="'+esc(x.key)+'">'+esc(x.label)+'</option>').join('')+'</select></label><label style="grid-column:1/-1"><span>Nome da campanha (opcional)</span><input id="mktCampaign" placeholder="ex.: semana_bebe_out26"></label><div class="marketing-url"><input id="mktUrl" readonly><button class="primary" type="button" id="copyMktUrl">Copiar link</button></div></div></section><section class="marketing-section"><div class="section-title">Configuração</div><div class="panel" style="padding:12px"><strong>Prioridade atual de CTA pós-pedido</strong><p class="muted">Bebê → Cabelos → Beleza → Limpeza → Lavanderia → Pet → Ofertas para cesta.</p><p class="muted">O CTA só é sinalizado quando o cliente autorizou ofertas pelo WhatsApp.</p></div></section>';
      const updateLink=()=>{const channel=$('#mktChannel')?.value||'0975',target=$('#mktTarget')?.value||'offers',brand=$('#mktBrand')?.value||'',campaign=marketingCampaignSlug($('#mktCampaign')?.value||''),u=new URL('https://www.donaantonia.com.br/');u.searchParams.set('origem',channel);if(brand)u.searchParams.set('marca',brand);else if(target==='offers')u.searchParams.set('ofertas','1');else if(target.startsWith('category:'))u.searchParams.set('categoria',target.slice(9));if(campaign)u.searchParams.set('campanha',campaign);if($('#mktUrl'))$('#mktUrl').value=u.toString()};['mktChannel','mktTarget','mktBrand','mktCampaign'].forEach(id=>$('#'+id)?.addEventListener(id==='mktCampaign'?'input':'change',updateLink));$('#mktTarget')?.addEventListener('change',()=>{if($('#mktBrand'))$('#mktBrand').value='';updateLink()});$('#mktBrand')?.addEventListener('change',()=>updateLink());if($('#copyMktUrl'))$('#copyMktUrl').onclick=async()=>{updateLink();const value=$('#mktUrl')?.value||'';try{await navigator.clipboard.writeText(value);toast('Link copiado')}catch{const i=$('#mktUrl');i?.select();document.execCommand('copy');toast('Link copiado')}};if($('#refreshMarketing'))$('#refreshMarketing').onclick=renderMarketing;updateLink();
    }catch(e){content.innerHTML='<div class="page-head"><div><h1>Marketing</h1><p>Radar de oportunidades.</p></div></div><div class="empty">Não consegui carregar as ofertas agora.<br><button class="text" id="retryMarketing">Tentar novamente</button></div>';if($('#retryMarketing'))$('#retryMarketing').onclick=renderMarketing}
  }

  async function renderQuotes(){
    const content=$('#content');
    content.innerHTML='<div class="page-head"><div><h1>Orçamentos</h1><p>Crie propostas usando produtos, clientes e cestas atuais do Supabase.</p></div><a class="store-link" href="/orcamento/" title="Abre nesta aba para manter a sessão administrativa">Abrir em tela inteira</a></div><div class="quote-admin-shell"><div class="loading" id="quoteAdminLoading">Validando sessão administrativa…</div></div>';
    try{
      await adminStepUp();
      const shell=content.querySelector('.quote-admin-shell');
      if(shell)shell.innerHTML='<iframe class="quote-admin-frame" src="/orcamento/?embedded=1" title="Criador de Orçamentos Dona Antônia"></iframe>';
    }catch(e){
      const shell=content.querySelector('.quote-admin-shell');
      if(shell)shell.innerHTML='<div class="empty">Não foi possível abrir Orçamentos sem uma sessão administrativa válida.<br><button class="text" id="retryQuotes">Tentar novamente</button></div>';
      if($('#retryQuotes'))$('#retryQuotes').onclick=renderQuotes;
    }
  }

  function statusPill(status){
    const map={created:'Novo',storefront_received:'Recebido',confirmed:'Confirmado',sent_to_bling:'Bling',processing:'Separando',ready:'Pronto',out_for_delivery:'Em entrega',delivered:'Entregue',cancelled:'Cancelado',returned:'Devolvido'};
    const cls=status==='cancelled'?'danger':status==='created'?'warn':'';
    return '<span class="pill '+cls+'">'+esc(map[status]||status||'—')+'</span>';
  }

  function cuiabaDayKey(v){
    const d=v instanceof Date?v:new Date(v||Date.now());
    if(!Number.isFinite(d.getTime()))return '';
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Cuiaba',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
    const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    return map.year+'-'+map.month+'-'+map.day;
  }
  function deliveredToday(o){
    return o?.status==='delivered'&&Boolean(o?.delivered_at)&&cuiabaDayKey(o.delivered_at)===cuiabaDayKey(new Date());
  }
  function relativeAge(v){
    if(!v)return '';
    const ms=Date.now()-new Date(v).getTime();
    if(!Number.isFinite(ms)||ms<0)return '';
    const min=Math.floor(ms/60000);
    if(min<1)return 'agora';
    if(min<60)return 'há '+min+' min';
    const hours=Math.floor(min/60);
    if(hours<24)return 'há '+hours+' h';
    return 'há '+Math.floor(hours/24)+' d';
  }
  function orderSearchMatch(o,q){
    const needle=normalize(q);
    if(!needle)return true;
    const a=o?.delivery_address_snapshot||{};
    const payment=o?.payment_method_snapshot?.label||o?.payment_method_snapshot?.method||'';
    const haystack=[
      o?.order_number,o?.customer_name,o?.whatsapp_phone_e164,a.phone,a.customer_name,a.recipient_name,
      a.street,a.number,a.district,a.city,a.state,payment
    ].map(normalize).join(' ');
    return haystack.includes(needle);
  }
  function whatsappHref(value){
    let d=String(value||'').replace(/\D/g,'');
    if((d.length===10||d.length===11)&&!d.startsWith('55'))d='55'+d;
    return d.length>=12?'https://wa.me/'+d:'';
  }
  function whatsappMessageHref(value,message){
    const base=whatsappHref(value);
    return base?base+'?text='+encodeURIComponent(String(message||'')):'';
  }
  function orderMissingDataRequest(o){
    const problems=orderProblemReasons(o);
    const needName=problems.includes('Cliente não identificado');
    const needAddress=problems.includes('Endereço incompleto');
    if(!needName&&!needAddress)return null;
    const a=o?.delivery_address_snapshot||{};
    const phone=o?.whatsapp_phone_e164||a.phone||'';
    if(!whatsappHref(phone))return null;
    const rawName=String(o?.customer_name||a.customer_name||a.recipient_name||'').trim();
    const firstName=rawName?rawName.split(/\s+/)[0]:'';
    const greeting=firstName?'Olá, '+firstName+'!':'Olá!';
    let label='Pedir dados',request='';
    if(needName&&needAddress){
      label='Pedir dados';
      request='pode me enviar seu nome completo e seu endereço completo (rua, número, bairro e uma referência)?';
    }else if(needName){
      label='Pedir nome';
      request='pode me informar seu nome completo?';
    }else{
      label='Pedir endereço';
      request='pode me enviar seu endereço completo (rua, número, bairro e uma referência)?';
    }
    const message=greeting+' Para concluirmos seu pedido #'+orderDisplayCode(o)+' da Dona Antônia, '+request+(needAddress?' Se preferir, envie sua localização pelo WhatsApp.':'');
    return {href:whatsappMessageHref(phone,message),label};
  }
  function orderAddressRequestHref(o){
    const request=orderMissingDataRequest(o);
    return request&&orderProblemReasons(o).includes('Endereço incompleto')?request.href:'';
  }
  function mapsHrefFromAddress(a){
    const data=a&&typeof a==='object'?a:{};
    const provided=String(data.google_maps_url||'').trim();
    if(/^https:\/\/(?:www\.)?google\.(?:com|com\.br)\/maps/i.test(provided)||/^https:\/\/maps\.app\.goo\.gl\//i.test(provided))return provided;
    const parts=[data.street,data.number,data.district,data.city,data.state].filter(Boolean);
    return parts.length>=3?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(parts.join(', ')):'';
  }
  function orderContactActionsHtml(o,c={}){
    const a=o?.delivery_address_snapshot||c?.address||{};
    const phone=c?.phone||o?.whatsapp_phone_e164||a.phone||'';
    const wa=whatsappHref(phone),maps=mapsHrefFromAddress(a),dataRequest=orderMissingDataRequest(o);
    if(!wa&&!maps&&!dataRequest)return '';
    return '<div class="dispatch-actions" style="justify-content:flex-start;margin-top:10px">'+
      (dataRequest?'<a class="quick-link primary-link" href="'+esc(dataRequest.href)+'" target="_blank" rel="noopener">'+esc(dataRequest.label)+'</a>':'')+
      (wa?'<a class="quick-link" href="'+esc(wa)+'" target="_blank" rel="noopener">WhatsApp</a>':'')+
      (maps?'<a class="quick-link" href="'+esc(maps)+'" target="_blank" rel="noopener">Abrir no Maps</a>':'')+
    '</div>';
  }

    function orderProblemReasons(o){
  const reasons=[];
  if(o?.history_sync?.state==='failed')reasons.push('Histórico pendente do cliente');
  if(['delivered','cancelled'].includes(o?.status))return reasons;
  const a=o?.delivery_address_snapshot||{};
  const canonicalKnown=typeof o?.registration_complete==='boolean';
  if(canonicalKnown){
    const missing=Array.isArray(o?.registration_missing_fields)?o.registration_missing_fields:[];
    if(missing.includes('name'))reasons.push('Cliente não identificado');
    if(missing.includes('phone'))reasons.push('Telefone pendente');
    if(missing.includes('address')||missing.includes('city'))reasons.push('Endereço incompleto');
    if(o?.document_only_pending===true)reasons.push('CPF/CNPJ pendente');
  }else{
    const customerName=o?.customer_name||a.customer_name||a.recipient_name||'';
    if(!String(customerName).trim())reasons.push('Cliente não identificado');
    if(!String(a.street||'').trim()||!String(a.city||'').trim())reasons.push('Endereço incompleto');
  }
  const payment=o?.payment_method_snapshot?.label||o?.payment_method_snapshot?.method||'';
  if(!String(payment).trim())reasons.push('Pagamento não informado');
  if(o?.stock_readiness?.ok===false)reasons.push('Estoque insuficiente');
  if(o?.delivery_return?.status==='returned_review')reasons.push('Retorno aguardando revisão');
  return reasons;
}
  function isBacklogOrder(o){
    if(!o||!['created','confirmed','processing','ready','out_for_delivery'].includes(o.status))return false;
    const orderDay=cuiabaDayKey(o.created_at);
    const today=cuiabaDayKey(new Date());
    return Boolean(orderDay&&today&&orderDay<today);
  }
  function orderIssueMatch(o,key='all'){
    const reasons=orderProblemReasons(o);
    if(key==='all')return reasons.length>0;
    const labels={
      address:'Endereço incompleto',
      customer:'Cliente não identificado',
      payment:'Pagamento não informado',
      history:'Histórico pendente do cliente',
      stock:'Estoque insuficiente'
    };
    return reasons.includes(labels[key]||'');
  }
  function orderIssueCount(key){return state.orders.filter(o=>orderIssueMatch(o,key)).length}
  function orderOperationalPriority(o){
    if(orderProblemReasons(o).length)return 0;
    if(isBacklogOrder(o))return 1;
    const rank={created:2,confirmed:3,processing:4,ready:5,out_for_delivery:6,delivered:7,cancelled:8};
    return rank[o?.status]??8;
  }
    function sortOperationalOrders(rows){
  return [...rows].sort((a,b)=>{
    const at=Date.parse(a?.created_at||0)||0,bt=Date.parse(b?.created_at||0)||0;
    return bt-at;
  });
}
  function orderNextAction(o){
    const problems=orderProblemReasons(o);
    if(problems.length)return 'Corrigir: '+problems[0];
    const consumed=o?.payment_method_snapshot?.stock_consumed===true;
    const map={
      created:'Confirmar pedido',
      confirmed:consumed?'Continuar separação':'Iniciar separação',
      processing:consumed?'Finalizar separação':'Regularizar separação',
      ready:'Liberar para entrega',
      out_for_delivery:'Confirmar entrega',
      delivered:'Conferir pagamento / fiscal',
      cancelled:'Nenhuma ação'
    };
    return map[o?.status]||'Revisar pedido';
  }
  function orderFilterMatch(o,filter){
    if(filter==='all')return true;
    if(filter==='new')return o.status==='created';
    if(filter==='separate')return ['confirmed','processing'].includes(o.status);
    if(filter==='ready')return o.status==='ready';
    if(filter==='delivery')return o.status==='out_for_delivery';
    if(filter==='finalized')return o.status==='delivered';
    if(filter==='backlog')return isBacklogOrder(o);
    if(filter==='problems')return orderIssueMatch(o,state.orderIssueFilter);
    return true;
  }
  function orderFilterCount(filter){
    if(filter==='problems')return state.orders.filter(o=>orderProblemReasons(o).length>0).length;
    return state.orders.filter(o=>orderFilterMatch(o,filter)).length;
  }
  function todayCardCount(key){
    if(key==='closure')return Number(state.closurePendingCount||0);
    return orderFilterCount(key);
  }
  function renderTodayCards(){
    const cards=[
      ['new','Novos','Pedidos para confirmar'],
      ['separate','Separação','Pedidos para separar'],
      ['ready','Prontos','Aguardando saída'],
      ['delivery','Em entrega','Pedidos na rua'],
      ['delivered','Entregues hoje','Conferir fechamento'],
      ['closure','Fechamento','Recebimento ou fiscal pendente'],
      ['backlog','De dias anteriores','Não deixar pedido para trás'],
      ['problems','Precisa de você','Pendências operacionais']
    ];
    return '<div class="ops-cards">'+cards.map(([key,label,sub])=>{
      const count=todayCardCount(key);
      const danger=(key==='problems'||key==='backlog'||key==='closure')&&count;
      const target=key==='closure'?' data-today-tab="closure"':' data-today-filter="'+key+'"';
      return '<button class="ops-card '+(danger?'danger':'')+'" type="button"'+target+'><small>'+esc(label)+'</small><strong>'+count+'</strong><span>'+esc(sub)+'</span></button>';
    }).join('')+'</div>'+
      renderTodayIssueBreakdown();
  }
  function renderTodayIssueBreakdown(){
    const issues=[
      ['address','Endereço'],
      ['customer','Cliente'],
      ['payment','Pagamento'],
      ['history','Histórico'],
      ['stock','Estoque']
    ].map(([key,label])=>[key,label,orderIssueCount(key)]).filter(([, ,count])=>count>0);
    if(!issues.length)return '';
    return '<div class="order-filters" style="margin:-2px 0 14px"><span class="filter-count">Pendências:</span>'+
      issues.map(([key,label,count])=>'<button class="filter-chip danger" type="button" data-today-issue="'+key+'">'+esc(label)+' · '+count+'</button>').join('')+
    '</div>';
  }
  function renderTodayExpiryAlert(){
    const data=state.expiryAlerts||{},s=data.summary||{},total=Number(s.total||0);
    if(!total)return '';
    const urgent=Number(s.due_today||0)+Number(s.days_1_7||0);
    const cls=urgent?' danger':'';
    const parts=[];
    if(Number(s.due_today||0))parts.push(s.due_today+' vence(m) hoje');
    if(Number(s.days_1_7||0))parts.push(s.days_1_7+' em até 7 dias');
    if(Number(s.days_8_15||0))parts.push(s.days_8_15+' em 8–15 dias');
    if(Number(s.days_16_30||0))parts.push(s.days_16_30+' em 16–30 dias');
    return '<div class="bling-banner expiry-alert-banner'+cls+'"><strong>Validades exigem atenção · '+esc(total)+' produto(s) vencem em até 30 dias</strong><small>'+esc(parts.join(' · '))+'</small><div class="bling-actions"><button class="secondary" type="button" data-today-expiry>Ver validades</button></div></div>';
  }

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

  function attentionTargetTab(a){
    if(a?.type==='product_location_incomplete')return 'gondolas';
    if(a?.type==='bling_scope_missing')return 'bling';
    if(a?.type==='papoai_legacy_endpoint')return 'more';
    return 'today';
  }
  function renderOpsAttention(){
    if(state.opsAttention===null)return '<section class="panel" style="margin-bottom:14px"><div class="loading">Carregando pendências…</div></section>';
    const items=Array.isArray(state.opsAttention)?state.opsAttention:[];
    const rankLabel={critical:'Crítica',high:'Alta',normal:'Normal',low:'Baixa'};
    if(!items.length)return '<section class="panel" style="margin-bottom:14px"><div class="history-title" style="padding:14px"><strong>Precisa de você</strong><span class="muted">Nenhuma pendência aberta.</span></div></section>';
    return '<section class="panel" style="margin-bottom:14px"><div class="history-title" style="padding:14px 14px 0"><strong>Precisa de você</strong><span class="muted">'+items.length+' pendência'+(items.length===1?'':'s')+' aberta'+(items.length===1?'':'s')+'</span></div><div style="padding:8px 14px 14px">'+items.slice(0,8).map(a=>'<div class="history-row" style="align-items:center"><div><span class="pill '+(a.priority==='critical'||a.priority==='high'?'danger':'')+'">'+esc(rankLabel[a.priority]||a.priority)+'</span></div><div class="history-main"><strong>'+esc(a.summary)+'</strong><small>'+esc(a.recommended_action||'Abrir para revisar')+'</small></div><button class="quick-link" type="button" data-attention-open="'+esc(a.id)+'" data-attention-tab="'+esc(attentionTargetTab(a))+'">Abrir</button></div>').join('')+'</div></section>';
  }

  function renderOpsPrintQueue(){
    const q=state.opsPrintQueue||{},jobs=Array.isArray(q.jobs)?q.jobs:[];
    if(!jobs.length)return '';
    const active=jobs.filter(j=>['pending','failed','claimed'].includes(j.status));
    if(!active.length)return '';
    const label={pending:'Aguardando',failed:'Falhou',claimed:'Em impressão'};
    return '<section class="panel" style="margin-bottom:14px"><div class="history-title" style="padding:14px 14px 0"><strong>Fila de impressão</strong><span class="muted">a impressão automática ainda está em homologação</span></div><div style="padding:8px 14px 14px">'+active.slice(0,8).map(j=>'<div class="history-row" style="align-items:center"><span class="pill '+(j.status==='failed'?'danger':'')+'">'+esc(label[j.status]||j.status)+'</span><div class="history-main"><strong>Separação · #'+esc(orderDisplayCode(state.orders.find(o=>String(o.id)===String(j.entity_id))))+'</strong><small>'+esc(j.printer_profile||'85 mm')+(j.last_error?' · '+esc(j.last_error):'')+'</small></div><button class="quick-link" type="button" data-print-order="'+esc(j.entity_id)+'">Abrir pedido</button></div>').join('')+'</div></section>';
  }

  function renderOpsTimeline(){
    const rows=Array.isArray(state.opsTimeline)?state.opsTimeline:[];
    if(!rows.length)return '';
    const sourceLabel={dona_antonia:'Dona Antônia',storefront:'Site',bling:'Bling',papoai:'PapoAI',chatgpt:'ChatGPT'};
    return '<section class="panel" style="margin-bottom:14px"><div class="history-title" style="padding:14px 14px 0"><strong>Atividade recente</strong><span class="muted">eventos importantes · sem log técnico bruto</span></div><div style="padding:8px 14px 14px">'+rows.slice(0,12).map(e=>'<div class="history-row"><div><span class="pill '+(e.severity==='error'||e.severity==='critical'?'danger':'')+'">'+esc(sourceLabel[e.source_system]||e.source_system||'Sistema')+'</span></div><div class="history-main"><strong>'+esc(e.summary||e.event_type||'Evento')+'</strong><small>'+esc(e.actor_label||e.actor_type||'Sistema')+' · '+esc(dateTime(e.occurred_at))+'</small></div></div>').join('')+'</div></section>';
  }

  function renderOps2Summary(){
    if(state.opsSummary===null)return '<section class="panel" style="margin-bottom:14px"><div class="loading">Carregando indicadores operacionais…</div></section>';
    const s=state.opsSummary||{};
    const w=s.whatsapp||{},a=s.attention||{},ap=s.approvals||{},i=s.inventory||{},pr=s.printing||{},pay=s.payments||{},del=s.delivery||{},pa=state.opsPapoAi||{};
    const printNeeds=Number(pr.pending||0)+Number(pr.failed||0);
    const papoSeen=Number(pa.captured_24h||0),identity=pa.identity||{};
    const cards=[
      ['Precisa de humano',Number(w.human_required||0),'Conversas WhatsApp'],
      ['Atenções',Number(a.open||0),'Fila da Central'],
      ['Aprovações',Number(ap.pending||0),'Ações aguardando decisão'],
      ['Ocorrências estoque',Number(i.incidents_open||0),'Avaria / vencido / retorno'],
      ['Diferenças balanço',Number(i.count_differences_pending||0),'Aguardando reconciliação'],
      ['Pagamentos p/ Bling',Number(pay.captured_unsynced||0),'Recebidos · sincronização pendente'],
      ['Retornando',Number(del.returning||0),'Mercadoria voltando ao depósito'],
      ['Retorno em revisão',Number(del.return_review||0),'Bloqueado para nova saída'],
      ['PapoAI',papoSeen,pa.capture_enabled?(Number(pa.review_required||0)?Number(pa.review_required||0)+' precisa(m) revisão':Number(pa.conversation_unlinked_24h||0)?Number(pa.conversation_unlinked_24h||0)+' sem conversa':'ponte ok · '+Number(pa.conversation_linked_24h||0)+' vinculado(s)'):'captura desligada'],
      ['Cadastros pendentes',Number(identity.provisional_without_name||0),Number(identity.site_orders_without_customer_with_phone_31d||0)?Number(identity.site_orders_without_customer_with_phone_31d||0)+' pedido(s) sem cliente':'todos os pedidos com telefone têm cliente'],
      ['Impressões',printNeeds,printNeeds?'Fila de separação':'Fila em dia'],
      ['Sem estoque',Number(i.zero_or_negative||0),'Produtos ativos'],
      ['Vencem em 90 dias',Number(i.expires_90d||0),'Revisar lotes/validade']
    ];
    return '<section class="panel" style="margin-bottom:14px"><div class="history-title" style="padding:14px 14px 0"><strong>Central de Controle</strong><span class="muted">visão rápida · sem consultas externas extras</span></div><div class="ops-cards" style="padding:14px">'+cards.map(c=>'<div class="ops-card"><small>'+esc(c[0])+'</small><strong>'+esc(c[1])+'</strong><span>'+esc(c[2])+'</span></div>').join('')+'</div></section>';
  }

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
  function expeditionFiscalState(o){
    if(o?.status==='ready'&&o?.delivery_return?.dispatch_blocked===true)return {authorized:false,title:'Retorno em revisão',detail:'Inspecionar mercadoria antes de nova saída',kind:'warn'};
    if(o?.status!=='ready')return {authorized:true,title:'',detail:'',kind:'ok'};
    const f=state.fiscalByOrder[o.id];
    if(!f)return {authorized:false,title:'Fiscal carregando',detail:'Aguardando conferência',kind:'warn'};
    if(f.error)return {authorized:false,title:'Fiscal indisponível',detail:'Abra o pedido para revisar',kind:'warn'};
    const gate=f.dispatch_gate||{};
    if(gate.authorized===true&&gate.allowed===true){
      return {
        authorized:true,
        title:'Fiscal autorizado',
        detail:(gate.bling_invoice_number?'NF-e '+gate.bling_invoice_number:'Liberado para saída'),
        kind:'ok'
      };
    }
    return {
      authorized:false,
      title:'Fiscal pendente',
      detail:'Emitir NF-e antes da saída',
      kind:'warn'
    };
  }
  function fiscalAuthorizedForDispatch(o){
    return expeditionFiscalState(o).authorized===true;
  }

  function expeditionRow(o){
    const a=o.delivery_address_snapshot||{};
    const address=[a.street,a.number,a.district,a.city].filter(Boolean).join(', ')||'Endereço não informado';
    const payment=actualPaymentText(o)||(o.payment_method_snapshot?.label||o.payment_method_snapshot?.method||'Pagamento não informado');
    const fiscal=expeditionFiscalState(o),ret=o.delivery_return||null;
    const returnNote=ret
      ? '<small class="warn-text">'+(ret.status==='returning'?'Retornando ao depósito':ret.status==='returned_review'?'Retorno em revisão':'Retorno')+' · '+esc(ret.reason_label||'Motivo não informado')+'</small>'
      : '';
    const wa=whatsappHref(o.whatsapp_phone_e164||a.phone||'');
    const maps=mapsHrefFromAddress(a);
    const selected=state.expeditionSelected.includes(o.id);
    const deliveryActions=o.status==='out_for_delivery'
      ? (ret?.status==='returning'
        ? '<button class="quick-link primary-link" type="button" data-confirm-return="'+esc(o.id)+'">Confirmar retorno</button>'
        : '<button class="quick-link primary-link" type="button" data-confirm-delivery="'+esc(o.id)+'">Confirmar entrega</button><button class="quick-link" type="button" data-return-expedition="'+esc(o.id)+'">Não entregou</button>')
      : '';
    return '<div class="history-row dispatch-row">'+
      '<div>'+(o.status==='ready'&&fiscal.authorized?'<label class="dispatch-select"><input type="checkbox" data-dispatch-select="'+esc(o.id)+'" '+(selected?'checked':'')+'>#'+esc(orderDisplayCode(o))+'</label>':'<strong>#'+esc(orderDisplayCode(o))+'</strong>')+'<span class="sub">'+esc(relativeAge(o.created_at))+'</span>'+(o.status==='ready'?'<span class="sub '+(fiscal.authorized?'ok-text':'warn-text')+'">'+esc(fiscal.title)+'</span>':'')+'</div>'+
      '<div class="history-main"><strong>'+esc(o.customer_name||'Sem cliente')+'</strong><small>'+esc(address)+'</small>'+returnNote+'</div>'+
      '<div class="history-main"><strong>'+money(o.total_cents)+'</strong><small>'+esc(payment)+'</small>'+(o.status==='ready'?'<small class="'+(fiscal.authorized?'ok-text':'warn-text')+'">'+esc(fiscal.detail)+'</small>':'')+'</div>'+
      '<span>'+statusPill(o.status)+'</span>'+
      '<div class="dispatch-actions">'+
        (wa?'<a class="quick-link primary-link" href="'+esc(wa)+'" target="_blank" rel="noopener">WhatsApp</a>':'')+
        (maps?'<a class="quick-link" href="'+esc(maps)+'" target="_blank" rel="noopener">Maps</a>':'')+
        (ret?.status==='returned_review'?'<button class="quick-link primary-link" type="button" data-resolve-return="'+esc(o.id)+'">Resolver retorno</button>':'')+
        (o.status==='ready'&&!fiscal.authorized&&ret?.status!=='returned_review'?'<button class="quick-link primary-link" type="button" data-expedition-fiscal="'+esc(o.id)+'">Resolver fiscal</button>':'')+
        (o.status==='ready'&&fiscal.authorized?'<button class="quick-link" type="button" data-expedition-danfe="'+esc(o.id)+'">Imprimir DANFE</button>':'')+
        deliveryActions+
        '<button class="quick-link" type="button" data-expedition-order="'+esc(o.id)+'">Abrir</button>'+
      '</div>'+
    '</div>';
  }
  function expeditionSection(title,subtitle,rows,empty){
    return '<section class="panel dispatch-section"><div class="history-title dispatch-head"><div><strong>'+esc(title)+'</strong><span>'+esc(subtitle)+'</span></div><b>'+rows.length+'</b></div>'+
      '<div>'+(rows.length?rows.map(expeditionRow).join(''):'<div class="history-empty">'+esc(empty)+'</div>')+'</div></section>';
  }
  async function returnOrderToExpedition(id,fromDetail=false){
    const o=(fromDetail?state.currentOrder?.order:null)||state.orders.find(x=>x.id===id);
    if(!o||o.status!=='out_for_delivery'){toast('Este pedido não está mais em entrega');return}
    if(o.delivery_return?.status==='returning'){toast('Este pedido já está retornando ao depósito');return}
    const choice=prompt(
      'Por que a entrega não foi concluída?\n\n1 - Cliente ausente\n2 - Endereço não encontrado\n3 - Cliente pediu reagendamento\n4 - Problema no pagamento\n5 - Cliente recusou / desistiu\n6 - Veículo / rota\n7 - Outro\n\nDigite o número:'
    );
    if(choice===null)return;
    const reasons={
      '1':['customer_absent','Cliente ausente'],
      '2':['address_not_found','Endereço não encontrado'],
      '3':['reschedule','Cliente pediu reagendamento'],
      '4':['payment_failed','Problema no pagamento'],
      '5':['customer_refused','Cliente recusou / desistiu'],
      '6':['vehicle_route','Veículo / rota'],
      '7':['other','Outro']
    };
    const selected=reasons[String(choice||'').trim()];
    if(!selected){toast('Escolha uma opção de 1 a 7');return}
    const noteInput=prompt('Observação opcional sobre a tentativa de entrega:','');
    if(noteInput===null)return;
    if(!confirm('Registrar como não entregue por "'+selected[1]+'"?\n\nA mercadoria continuará fora do estoque vendável até o retorno físico ser confirmado.'))return;
    try{
      await api('delivery_fail_register',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:o.id,reason_code:selected[0],note:String(noteInput||'').trim(),operator:currentOperator()||'Entrega'})
      });
      const data=await api('orders');state.orders=data.orders||[];
      if(fromDetail){
        const fresh=await api('order',{id:o.id});state.currentOrder=fresh;
        await loadCurrentOrderFiscal(false);paintOrderDetail();loadOrders();
      }
      if(state.tab==='driver')paintDriverQueue();else if(state.tab==='expedition')paintExpeditionBody();
      toast('Não entrega registrada · aguardando retorno físico');
    }catch(e){toast(errorMessage(e.message))}
  }
  async function confirmPhysicalDeliveryReturn(id){
    const o=state.orders.find(x=>x.id===id)||state.currentOrder?.order;
    const ret=o?.delivery_return;
    if(!o||!ret||ret.status!=='returning'){toast('Não existe retorno físico pendente para este pedido');return}
    const suggested=ret.recommended_disposition==='redelivery'?'redelivery':'review';
    const promptText=suggested==='redelivery'
      ? 'A mercadoria voltou fisicamente ao depósito?\n\nOK = voltou íntegra e continuará separada para REENTREGA.\nCancelar = não registrar agora.'
      : 'A mercadoria voltou fisicamente ao depósito?\n\nOK = enviar para REVISÃO, sem voltar ao estoque geral e sem nova saída.\nCancelar = não registrar agora.';
    if(!confirm(promptText))return;
    const operator=requireOperator();if(!operator)return;
    try{
      await api('delivery_return_confirm',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({case_id:ret.id,disposition:suggested,operator})
      });
      const data=await api('orders');state.orders=data.orders||[];
      if(state.tab==='driver')paintDriverQueue();else if(state.tab==='expedition')paintExpeditionBody();
      if(state.currentOrder?.order?.id===id){const fresh=await api('order',{id});state.currentOrder=fresh;paintOrderDetail()}
      toast(suggested==='redelivery'?'Retorno confirmado · pedido pronto para reentrega':'Retorno confirmado · bloqueado para revisão');
    }catch(e){toast(errorMessage(e.message))}
  }
  function returnCurrentOrderToExpedition(){
    const id=state.currentOrder?.order?.id;if(id)returnOrderToExpedition(id,true);
  }

  async function resolveDeliveryReturnReview(id){
    const o=state.orders.find(x=>x.id===id)||state.currentOrder?.order,ret=o?.delivery_return;
    if(!o||!ret||ret.status!=='returned_review'){toast('Este retorno não está mais aguardando revisão');return}
    $('#editorTitle').textContent='Revisar retorno';
    $('#editorBody').innerHTML='<div class="rule-notice warn"><strong>Pedido #'+esc(orderDisplayCode(o))+'</strong><div>'+esc(ret.reason_label||'Não entregue')+(ret.note?' · '+esc(ret.note):'')+'<br>A mercadoria já voltou fisicamente, mas continua fora do estoque vendável.</div></div>'+
      '<div class="section-title">O que aconteceu com a mercadoria?</div>'+
      '<div class="panel" style="padding:14px;margin-bottom:10px"><strong>Tudo íntegro e haverá nova tentativa</strong><p class="sub">Mantém os itens alocados ao mesmo pedido e libera para reentrega.</p><button class="primary" id="returnResolveRedelivery" type="button">LIBERAR PARA REENTREGA</button></div>'+
      '<div class="panel" style="padding:14px;margin-bottom:10px"><strong>Cliente desistiu e tudo voltou íntegro</strong><p class="sub">Cancela comercialmente e restaura todo o estoque local. O fiscal fica pendente de revisão no Bling.</p><button class="secondary" id="returnResolveCancel" type="button">CANCELAR E DEVOLVER AO ESTOQUE</button></div>'+
      '<div class="panel" style="padding:14px"><strong>Há avaria, falta ou item impróprio</strong><p class="sub">Não faça restauração total. Registre os itens no Estoque mobile para revisão.</p><button class="secondary" id="returnResolveDamage" type="button">IR PARA ESTOQUE MOBILE</button></div>';
    $('#editorActions').innerHTML='<button class="secondary" id="returnResolveClose" type="button">Fechar</button>';
    $('#returnResolveClose').onclick=()=>$('#editor').close();
    $('#returnResolveDamage').onclick=()=>{$('#editor').close();state.balanceMode='incident';setTab('balance');toast('Leia cada item avariado ou faltante antes de resolver o retorno')};
    $('#returnResolveRedelivery').onclick=()=>submitDeliveryReturnResolution(o,'redelivery');
    $('#returnResolveCancel').onclick=()=>{
      if(!confirm('Confirme somente se TODOS os produtos voltaram fisicamente íntegros.\n\nO pedido será cancelado e o estoque local será restaurado por completo. O tratamento fiscal continuará pendente no Bling.'))return;
      submitDeliveryReturnResolution(o,'cancel_intact');
    };
    $('#editor').showModal();
  }
  async function submitDeliveryReturnResolution(o,action){
    const ret=o?.delivery_return;if(!ret)return;
    const operator=requireOperator();if(!operator)return;
    const buttons=[...document.querySelectorAll('#returnResolveRedelivery,#returnResolveCancel')];buttons.forEach(b=>b.disabled=true);
    try{
      const data=await api('delivery_return_resolve',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({case_id:ret.id,resolution_action:action,operator})
      });
      $('#editor').close();
      const rows=await api('orders');state.orders=rows.orders||[];
      if(state.tab==='expedition')paintExpeditionBody();else if(state.tab==='today')renderToday();
      toast(action==='redelivery'?'Retorno revisado · liberado para reentrega':'Pedido cancelado · estoque íntegro restaurado · fiscal pendente');
      return data;
    }catch(e){toast(errorMessage(e.message));buttons.forEach(b=>b.disabled=false)}
  }

  function deliveryPaymentMethodOptions(selected=''){
    const rows=[['pix','PIX'],['cash','Dinheiro'],['credit_card','Cartão de crédito'],['food_card','Cartão alimentação'],['meal_card','Cartão refeição'],['other','Outro']];
    return rows.map(([v,l])=>'<option value="'+v+'" '+(v===selected?'selected':'')+'>'+l+'</option>').join('');
  }
  function deliveryPaymentDefaultMethod(o){
    const raw=String(o?.payment_method_snapshot?.method||'').toLowerCase();
    const map={pix:'pix',cash:'cash',dinheiro:'cash',credit:'credit_card',credit_card:'credit_card',card:'credit_card',food_card:'food_card',meal_card:'meal_card'};
    return map[raw]||'pix';
  }
  function paymentAmountInput(cents){return (Number(cents||0)/100).toFixed(2).replace('.',',')}
  function parsePaymentAmountCents(value){
    let s=String(value||'').trim().replace(/R\$/gi,'').replace(/\s+/g,'');
    if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
    const n=Number(s);return Number.isFinite(n)?Math.round(n*100):0;
  }
  function actualPaymentText(o){
    const parts=o?.payment_method_snapshot?.actual?.parts||[];
    return parts.length?parts.map(p=>(p.label||p.method)+' '+money(p.amount_cents)).join(' + '):'';
  }
  function paintDeliveryPaymentDraft(){
    const d=state.deliveryPaymentDraft;if(!d)return;
    const host=$('#deliveryPaymentParts');if(!host)return;
    host.innerHTML=d.parts.map((p,index)=>'<div class="form-grid delivery-payment-row" data-payment-index="'+index+'" style="align-items:end;margin-bottom:10px">'+
      '<label><span>Forma '+(d.parts.length>1?index+1:'')+'</span><select data-payment-method>'+deliveryPaymentMethodOptions(p.method)+'</select></label>'+
      '<label><span>Valor</span><input data-payment-amount inputmode="decimal" value="'+esc(paymentAmountInput(p.amount_cents))+'"></label>'+
      (index>0?'<button class="text danger" type="button" data-remove-payment-part="'+index+'">Remover</button>':'')+
    '</div>').join('');
    const sum=d.parts.reduce((s,p)=>s+Number(p.amount_cents||0),0),diff=Number(d.order.total_cents||0)-sum;
    $('#deliveryPaymentSum').innerHTML='<strong>'+money(sum)+'</strong><span class="'+(diff===0?'ok-text':'warn-text')+'">'+(diff===0?'Total confere':'Diferença '+money(Math.abs(diff))+(diff>0?' faltando':' a mais'))+'</span>';
    host.querySelectorAll('[data-payment-method]').forEach((el,index)=>el.onchange=()=>{d.parts[index].method=el.value});
    host.querySelectorAll('[data-payment-amount]').forEach((el,index)=>el.oninput=()=>{d.parts[index].amount_cents=parsePaymentAmountCents(el.value);const sum2=d.parts.reduce((s,p)=>s+Number(p.amount_cents||0),0),diff2=Number(d.order.total_cents||0)-sum2;$('#deliveryPaymentSum').innerHTML='<strong>'+money(sum2)+'</strong><span class="'+(diff2===0?'ok-text':'warn-text')+'">'+(diff2===0?'Total confere':'Diferença '+money(Math.abs(diff2))+(diff2>0?' faltando':' a mais'))+'</span>'});
    host.querySelectorAll('[data-remove-payment-part]').forEach(b=>b.onclick=()=>{d.parts.splice(Number(b.dataset.removePaymentPart),1);paintDeliveryPaymentDraft()});
    const split=$('#addDeliveryPaymentPart');if(split)split.disabled=d.parts.length>=2;
  }
  async function finalizeDeliveredOrder(o){
    const actual=o?.payment_method_snapshot?.actual||{};
    const parts=Array.isArray(actual.parts)?actual.parts:[];
    if(parts.length!==1)throw new Error('delivery_already_captured_requires_canonical_review');
    const method=String(parts[0]?.method||'').trim();
    const amount=Number(parts[0]?.amount_cents||0);
    if(!method||amount!==Number(o.total_cents||0))throw new Error('delivery_already_captured_requires_canonical_review');
    await api('order_delivery_complete_v3',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:o.id,method,amount_cents:amount,operator:currentOperator()||'Entrega',idempotency_key:'delivery-v3:'+o.id})});
    const data=await api('orders');state.orders=data.orders||[];paintExpeditionBody();
  }
  async function captureDeliveryPaymentAndFinish(){
    const d=state.deliveryPaymentDraft;if(!d)return;
    const rows=[...document.querySelectorAll('.delivery-payment-row')];
    const parts=rows.map(row=>({method:row.querySelector('[data-payment-method]')?.value||'',amount_cents:parsePaymentAmountCents(row.querySelector('[data-payment-amount]')?.value||'')}));
    const total=parts.reduce((s,p)=>s+p.amount_cents,0);
    if(parts.some(p=>!p.method||p.amount_cents<=0)){toast('Informe a forma e o valor de cada pagamento');return}
    if(total!==Number(d.order.total_cents||0)){toast('Os pagamentos precisam somar exatamente '+money(d.order.total_cents));return}
    const operator=requireOperator();if(!operator)return;
    const btn=$('#deliveryPaymentConfirm');if(btn){btn.disabled=true;btn.textContent='SALVANDO…'}
    try{
      if(parts.length===1){
        await api('order_delivery_complete_v3',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:d.order.id,method:parts[0].method,amount_cents:parts[0].amount_cents,operator,idempotency_key:'delivery-v3:'+d.order.id})});
      }else{
        await api('order_payment_capture',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:d.order.id,parts,operator})});
        await api('order_delivery_finalize_v4',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:d.order.id,operator,idempotency_key:'delivery-finalize-v4:'+d.order.id})});
      }
      const data=await api('orders');state.orders=data.orders||[];paintExpeditionBody();
      $('#editor').close();state.deliveryPaymentDraft=null;
      toast('Entrega e pagamento registrados');
    }catch(e){
      toast(errorMessage(e.message));
      if(btn){btn.disabled=false;btn.textContent='CONFIRMAR ENTREGA E PAGAMENTO'}
    }
  }
  async function confirmDeliveryFromExpedition(id){
    const o=state.orders.find(x=>x.id===id);
    if(!o||o.status!=='out_for_delivery'){toast('Este pedido não está mais em entrega');return}
    if(o.payment_method_snapshot?.actual?.received){
      if(!confirm('O pagamento deste pedido já está registrado. Confirmar a entrega agora?'))return;
      try{await finalizeDeliveredOrder(o);toast('Entrega confirmada')}catch(e){toast(errorMessage(e.message))}
      return;
    }
    const planned=o.payment_method_snapshot?.label||o.payment_method_snapshot?.method||'Não informado';
    state.deliveryPaymentDraft={order:o,parts:[{method:deliveryPaymentDefaultMethod(o),amount_cents:Number(o.total_cents||0)}]};
    $('#editorTitle').textContent='Confirmar entrega';
    $('#editorBody').innerHTML='<div class="rule-notice"><strong>Pedido #'+esc(orderDisplayCode(o))+'</strong><div>'+esc(o.customer_name||'Cliente')+' · '+money(o.total_cents)+'<br>Previsto: '+esc(planned)+'</div></div>'+
      '<div class="section-title">Pagamento realmente recebido</div><div id="deliveryPaymentParts"></div>'+
      '<div class="dispatch-actions" style="justify-content:flex-start"><button class="secondary" id="addDeliveryPaymentPart" type="button">Dividir em 2 formas</button></div>'+
      '<div class="order-summary" style="margin-top:12px"><div class="summary-box"><small>Total do pedido</small><strong>'+money(o.total_cents)+'</strong></div><div class="summary-box"><small>Pagamentos</small><div id="deliveryPaymentSum"></div></div></div>'+
      '<div class="rule-notice" style="margin-top:12px"><strong>Se o pagamento falhou</strong><div>Não confirme a entrega. Feche esta janela e use “Não entregou” no pedido.</div></div>';
    $('#editorActions').innerHTML='<button class="secondary" id="deliveryPaymentCancel" type="button">Cancelar</button><button class="primary" id="deliveryPaymentConfirm" type="button">CONFIRMAR ENTREGA E PAGAMENTO</button>';
    $('#deliveryPaymentCancel').onclick=()=>{state.deliveryPaymentDraft=null;$('#editor').close()};
    $('#deliveryPaymentConfirm').onclick=captureDeliveryPaymentAndFinish;
    $('#addDeliveryPaymentPart').onclick=()=>{const d=state.deliveryPaymentDraft;if(!d||d.parts.length>=2)return;d.parts.push({method:'credit_card',amount_cents:0});paintDeliveryPaymentDraft()};
    paintDeliveryPaymentDraft();$('#editor').showModal();
  }

  function selectedDispatchOrders(readyRows=null){
    const source=readyRows||state.orders.filter(o=>o.status==='ready');
    const ids=new Set(state.expeditionSelected);
    return source.filter(o=>ids.has(o.id));
  }
  function toggleDispatchSelection(id,checked){
    const ids=new Set(state.expeditionSelected);
    if(checked)ids.add(id);else ids.delete(id);
    state.expeditionSelected=[...ids];
    paintExpeditionBody();
  }
  function toggleAllReady(rows,checked){
    const ids=new Set(state.expeditionSelected);
    for(const o of rows)checked?ids.add(o.id):ids.delete(o.id);
    state.expeditionSelected=[...ids];
    paintExpeditionBody();
  }
  function dispatchPaymentSummary(rows){
    const map=new Map();
    for(const o of rows||[]){
      const label=String(o?.payment_method_snapshot?.label||o?.payment_method_snapshot?.method||'Não informado').trim()||'Não informado';
      map.set(label,(map.get(label)||0)+Number(o?.total_cents||0));
    }
    return [...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR'));
  }
  function dispatchPaymentSummaryText(rows){
    return dispatchPaymentSummary(rows).map(([label,total])=>label+': '+money(total)).join(' · ');
  }

  function printDispatchManifest(){
    const selected=state.orders.filter(o=>o.status==='ready'&&state.expeditionSelected.includes(o.id));
    if(!selected.length){toast('Selecione ao menos um pedido pronto');return}
    const total=selected.reduce((sum,o)=>sum+Number(o.total_cents||0),0);
    const rows=selected.map((o,index)=>{
      const a=o.delivery_address_snapshot||{};
      const address=[a.street,a.number,a.complement,a.district,a.city,a.state].filter(Boolean).join(', ')||a.raw_text||'ENDEREÇO NÃO INFORMADO';
      const phone=o.whatsapp_phone_e164||a.phone||'';
      const payment=o.payment_method_snapshot?.label||o.payment_method_snapshot?.method||'NÃO INFORMADO';
      return '<tr>'+
        '<td>'+(index+1)+'</td>'+
        '<td><b>#'+esc(orderDisplayCode(o))+'</b><br>'+esc(o.customer_name||a.customer_name||a.recipient_name||'SEM CLIENTE')+(phone?'<br>'+esc(formatPhone(phone)):'')+'</td>'+
        '<td>'+esc(address)+'</td>'+
        '<td>'+esc(payment)+'</td>'+
        '<td class="right"><b>'+money(o.total_cents)+'</b></td>'+
        '<td class="sign"></td>'+
      '</tr>';
    }).join('');
    const paymentSummary=dispatchPaymentSummaryText(selected);
    const body='<div class="manifest-head"><h1>Dona Antônia · Romaneio de saída</h1><div>Gerado em '+esc(dateTime(new Date().toISOString()))+'</div><div><b>'+selected.length+' pedido(s)</b> · Total '+money(total)+'</div><div class="manifest-payments"><b>A receber:</b> '+esc(paymentSummary||'Nenhum pagamento informado')+'</div></div>'+
      '<table><thead><tr><th>#</th><th>Pedido / cliente</th><th>Endereço</th><th>Pagamento</th><th>Valor</th><th>Conferência</th></tr></thead><tbody>'+rows+'</tbody></table>'+
      '<div class="manifest-foot"><div>Motorista: ____________________________________</div><div>Saída: ____:____</div><div>Retorno: ____:____</div></div>';
    openManifestPrint('Romaneio de saída',body);
  }
  function openManifestPrint(title,body){
    const w=window.open('','_blank','width=1000,height=760');
    if(!w){toast('Libere pop-ups para imprimir');return}
    const css='@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;color:#000;font:11px Arial,sans-serif}.manifest-head{display:grid;grid-template-columns:1fr auto;gap:4px 16px;align-items:end;margin-bottom:8mm;border-bottom:2px solid #000;padding-bottom:4mm}.manifest-head h1{grid-column:1/-1;margin:0;font-size:20px}.manifest-head div:last-child{text-align:right}.manifest-payments{grid-column:1/-1;text-align:left!important;margin-top:2mm;padding-top:2mm;border-top:1px solid #000}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #000;padding:2.5mm;vertical-align:top}th{background:#eee;font-size:10px;text-align:left}th:nth-child(1),td:nth-child(1){width:6%}th:nth-child(2),td:nth-child(2){width:21%}th:nth-child(3),td:nth-child(3){width:30%}th:nth-child(4),td:nth-child(4){width:14%}th:nth-child(5),td:nth-child(5){width:12%}th:nth-child(6),td:nth-child(6){width:17%}.right{text-align:right}.sign{height:18mm}.manifest-foot{display:grid;grid-template-columns:1fr auto auto;gap:12mm;margin-top:8mm;padding-top:4mm;border-top:1px solid #000}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
    w.document.open();
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>'+css+'</style></head><body>'+body+'<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),300));<\/script></body></html>');
    w.document.close();
  }

  async function loadDeliveryRuns(){
    try{
      const data=await api('ops_delivery_runs'),delivery=data.delivery||{};
      state.deliveryRuns=delivery.runs||[];
      state.deliveryCatalog=delivery.catalog||state.deliveryCatalog||{regions:[],drivers:[],vehicles:[]};
      for(const key of ['region_id','driver_id','vehicle_id']){
        const bucket=key==='region_id'?'regions':key==='driver_id'?'drivers':'vehicles';
        const selected=state.deliveryPlan?.[key]||'';
        if(selected&&!(state.deliveryCatalog?.[bucket]||[]).some(x=>x.id===selected&&x.is_active!==false))state.deliveryPlan[key]='';
      }
      return state.deliveryRuns;
    }catch{
      state.deliveryRuns=[];return [];
    }
  }
  function activeDeliveryRun(vehicle){return (state.deliveryRuns||[]).find(r=>r.vehicle_key===vehicle&&['planned','dispatched'].includes(r.status))||null}
  function deliveryStopAddress(stop){const a=stop?.address||{};return [a.street,a.number,a.district,a.city,a.state].filter(Boolean).join(', ')||a.raw_text||''}
  function deliveryStopTarget(stop){
    const lat=Number(stop?.destination_latitude),lng=Number(stop?.destination_longitude);
    if(Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&stop?.destination_confidence)return lat.toFixed(7)+','+lng.toFixed(7);
    return deliveryStopAddress(stop);
  }
  function deliveryStopMapsHref(stop){
    const target=deliveryStopTarget(stop);
    return target?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(target):String(stop?.maps_url||'');
  }
  function runMapsHref(run){
    const stops=(run?.stops||[]).filter(s=>!['delivered','failed','cancelled'].includes(s.status)).slice(0,9);if(!stops.length)return '';
    if(stops.length===1)return deliveryStopMapsHref(stops[0]);
    const destination=deliveryStopTarget(stops[stops.length-1]);if(!destination)return '';
    const waypoints=stops.slice(0,-1).map(deliveryStopTarget).filter(Boolean);let url='https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='+encodeURIComponent(destination);
    if(waypoints.length)url+='&waypoints='+encodeURIComponent(waypoints.join('|'));return url;
  }
  function smartDeliveryActive(kind){return (state.deliveryCatalog?.[kind]||[]).filter(x=>x.is_active!==false)…118729 tokens truncated…_available||state.currentOrderFiscal?.authorized===true||state.currentOrderFiscal?.dispatch_gate?.authorized===true||state.currentOrderFiscal?.bling_invoice_id)?'<button class="secondary" id="printDanfe" type="button">Imprimir DANFE</button>':'')+'</div></div>':'';
    $('#editorBody').innerHTML=(customerPending?'<div class="rule-notice warn"><strong>AGUARDANDO DADOS DO CLIENTE</strong><div>'+esc(customerPendingReasons.join(' · '))+'</div></div>':'')+'<div class="order-v3-detail-head"><div><h2 style="margin:0">Pedido #'+esc(orderDisplayCode(o))+'</h2><div class="muted">'+esc(dateTime(o.created_at))+' · '+esc(o.customer_name||c.display_name||'Cliente')+'</div><div class="order-v3-tags">'+orderV3Tags(o)+'</div></div><div class="order-v3-total">'+separationMoney(missing>0?finalTotal:Number(o.total_cents||0)/100)+'</div></div>'+
      (missing>0?'<div class="order-v3-financial"><span>Total original: <strong>'+separationMoney(original)+'</strong></span><span class="discount">Abatimento por falta: <strong>− '+separationMoney(missing)+'</strong></span><span>Total final: <strong>'+separationMoney(finalTotal)+'</strong></span></div>':'')+
      '<div class="order-v3-section"><h3>Cliente e entrega</h3><div class="form-grid"><label class="span-2"><span>Nome</span><input id="orderDeliveryName" value="'+esc(delivery.customer_name||delivery.recipient_name||c.display_name||'')+'" '+(editable?'':'disabled')+'></label><label><span>Telefone / WhatsApp</span><input id="orderDeliveryPhone" value="'+esc(formatPhone(delivery.phone||c.phone||o.whatsapp_phone_e164||''))+'" '+(editable?'':'disabled')+'></label><label><span>Pagamento previsto</span><select id="orderPayment" '+(editable?'':'disabled')+'>'+orderV3PaymentOptions(o.payment_method_snapshot?.method||o.payment_method_snapshot?.label||'')+'</select></label><label class="span-2"><span>Rua / avenida</span><input id="orderDeliveryStreet" value="'+esc(delivery.street||'')+'" '+(editable?'':'disabled')+'></label><label><span>Número</span><input id="orderDeliveryNumber" value="'+esc(delivery.number||'')+'" '+(editable?'':'disabled')+'></label><label><span>Bairro</span><input id="orderDeliveryDistrict" value="'+esc(delivery.district||'')+'" '+(editable?'':'disabled')+'></label><label><span>Complemento</span><input id="orderDeliveryComplement" value="'+esc(delivery.complement||'')+'" '+(editable?'':'disabled')+'></label><label><span>CEP</span><input id="orderDeliveryPostalCode" value="'+esc(delivery.postal_code||'')+'" '+(editable?'':'disabled')+'></label><label><span>Cidade</span><input id="orderDeliveryCity" value="'+esc(delivery.city||'Cuiabá')+'" '+(editable?'':'disabled')+'></label><label><span>UF</span><input id="orderDeliveryState" maxlength="2" value="'+esc(delivery.state||'MT')+'" '+(editable?'':'disabled')+'></label><label class="span-2"><span>Referência</span><input id="orderDeliveryRawText" value="'+esc(delivery.raw_text||delivery.reference||'')+'" '+(editable?'':'disabled')+'></label></div></div>'+
      '<div class="order-v3-section"><h3>Itens</h3>'+(locked?'<div class="muted" style="margin-bottom:8px">Produtos e quantidades estão travados porque o pedido já foi confirmado.</div>':'')+'<div class="order-v3-items">'+(d.items||[]).map(i=>orderV3DetailItemHtml(i,states)).join('')+'</div></div>'+
      '<div class="order-v3-section"><h3>Atendimento</h3><div class="order-v3-ops"><button class="secondary" id="sendCustomerVitrineV3" type="button">VITRINE CLIENTE</button>'+(publicOrderUrlFor(o)?'<button class="secondary" id="openOrderVitrineV3" type="button">ABRIR VITRINE</button>':'')+'</div></div>'+
      '<div class="order-v3-section"><h3>Operação</h3><div class="order-v3-ops">'+(!milestones.confirmed&&!milestones.cancelled?'<button class="primary" id="confirmOrderV3" type="button" '+(customerPending?'disabled title="Complete os dados essenciais do cliente"':'')+'>CONFIRMAR PEDIDO</button>':'')+(milestones.confirmed&&!milestones.delivered&&!milestones.cancelled?'<button class="secondary" id="openSeparationV3" type="button" '+(customerPending?'disabled title="Complete os dados essenciais do cliente"':'')+'>ABRIR VITRINE SEPARAÇÃO</button>':'')+(o.status==='out_for_delivery'&&!milestones.delivered&&!milestones.cancelled?'<button class="primary" id="deliverOrderV3" type="button" '+(customerPending?'disabled title="Complete os dados essenciais do cliente"':'')+'>CONFIRMAR ENTREGA</button><button class="secondary" id="deliveryFailedV4" type="button">ENTREGA NÃO CONCLUÍDA</button>':'')+(o.status==='confirmed'&&!sepStarted?'<button class="secondary" id="reopenOrderV3" type="button">REABRIR PEDIDO</button>':'')+(!milestones.delivered&&!milestones.cancelled?'<button class="text danger" id="cancelOrderV3" type="button">Cancelar pedido</button>':'')+'</div></div>'+fiscal;
    $('#editorActions').innerHTML='<button class="secondary" id="cancelEditor">Fechar</button>'+(editable?'<button class="primary" id="saveOrder">Salvar dados</button>':'');$('#cancelEditor').onclick=()=>$('#editor').close();if($('#saveOrder'))$('#saveOrder').onclick=saveOrderV3;if($('#sendCustomerVitrineV3'))$('#sendCustomerVitrineV3').onclick=e=>sendOrderCustomerVitrineV3(o.id,e.currentTarget);if($('#openOrderVitrineV3'))$('#openOrderVitrineV3').onclick=openCurrentOrderVitrine;if($('#confirmOrderV3'))$('#confirmOrderV3').onclick=()=>quickConfirmOrder(o.id,$('#confirmOrderV3')).then(()=>openOrder(o.id));if($('#openSeparationV3'))$('#openSeparationV3').onclick=()=>{const id=o.id;$('#editor').close();openOrderSeparationSheet(id)};if($('#deliverOrderV3'))$('#deliverOrderV3').onclick=()=>openOrderDeliveryConfirm(o.id);if($('#deliveryFailedV4'))$('#deliveryFailedV4').onclick=()=>returnOrderToExpedition(o.id,true);if($('#startDispatchV4'))$('#startDispatchV4').onclick=startCurrentOrderDispatchV4;if($('#reopenOrderV3'))$('#reopenOrderV3').onclick=()=>reopenOrderV3(o.id);if($('#cancelOrderV3'))$('#cancelOrderV3').onclick=cancelCurrentOrder;if($('#executeFiscalCanary'))$('#executeFiscalCanary').onclick=executeCurrentOrderFiscalCanary;if($('#refreshFiscalCanary'))$('#refreshFiscalCanary').onclick=recheckCurrentOrderFiscal;if($('#recoverBlingOrder'))$('#recoverBlingOrder').onclick=recoverCurrentOrderBling;if($('#printDanfe'))$('#printDanfe').onclick=openCurrentDanfe;
  }

  function blingPreflightOperationalBlockers(p){
    if(!p||p.error)return [];
    const expected=new Set(['first_separation_required','stock_not_consumed']);
    const blockers=Array.isArray(p.write_blockers)&&p.write_blockers.length?p.write_blockers:(p.blockers||[]);
    return [...new Set(blockers)].filter(code=>!expected.has(code));
  }
  function blingPreflightAlertHtml(p){
    const blockers=blingPreflightOperationalBlockers(p);
    if(!blockers.length)return '';
    const canReconcile=blockers.some(x=>['customer_missing_bling_contact_id','unresolved_products'].includes(x));
    const needsCustomer=blockers.includes('customer_not_linked');
    const needsDocument=blockers.includes('customer_document_required');
    const needsBlingCustomer=blockers.includes('customer_missing_bling_contact_id');
    const needsProducts=blockers.includes('unresolved_products');
    const actions=(needsDocument?'<button class="secondary" id="completeCustomerDocument" type="button">Completar CPF</button>':'')+
      (needsBlingCustomer?'<button class="secondary" id="createBlingOrderCustomer" type="button">Cadastrar cliente no Bling</button>':'')+
      (needsProducts?'<button class="secondary" id="createBlingOrderProducts" type="button">Cadastrar produtos no Bling</button>':'')+
      (canReconcile?'<button class="secondary" id="resolveBlingDependencies" type="button">Tentar resolver vínculos</button>':'')+
      (needsCustomer?'<button class="secondary" id="focusOrderCustomer" type="button">Vincular cliente</button>':'');
    return '<div class="sync-alert"><div><strong>Antes de separar, revise o Bling</strong><small>'+blockers.slice(0,3).map(blingOrderBlockerLabel).map(esc).join(' · ')+(blockers.length>3?' · +'+(blockers.length-3):'')+'</small></div><div class="dispatch-actions">'+actions+'<span class="pill warn">Somente leitura</span></div></div>';
  }
  async function loadCurrentOrderBlingPreview(repaint=true){
    const id=state.currentOrder?.order?.id;if(!id)return;
    try{
      state.currentOrderBlingPreview=await api('bling_preview_order_sync',{},{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})
      });
    }catch(e){
      state.currentOrderBlingPreview={error:String(e?.message||'bling_preview_unavailable')};
    }
    if(repaint&&state.currentOrder?.order?.id===id&&$('#editor')?.open)paintOrderDetail();
  }

  function fiscalBlockReasonLabel(code){
    const map={
      delivery_not_confirmed:'Aguardando confirmação da entrega',
      payment_not_confirmed:'Aguardando confirmação do pagamento',
      payment_review_required:'Pagamento precisa de revisão',
      settled_amount_missing:'Valor recebido não informado',
      settled_amount_mismatch:'Valor recebido diferente do pedido',
      order_cancelled:'Pedido cancelado',
      order_returned:'Pedido devolvido',
      fiscal_control_missing:'Controle fiscal ainda não iniciado',
      fiscal_subtotal_item_sum_mismatch:'A soma dos produtos não confere com o subtotal fiscal',
      canonical_total_not_balanced:'O total do pedido não confere com subtotal, acréscimos e descontos',
      bling_order_not_linked:'O pedido ainda não está vinculado à venda no Bling',
      bling_order_not_verified:'A venda ainda não chegou ao status Verificado no Bling',
      invoice_generation_failed:'O Bling recebeu a solicitação, mas não conseguiu gerar a NF-e',
      fiscal_dispatch_preflight_failed:'A conferência fiscal encontrou dados inconsistentes',
      fiscal_dispatch_not_eligible:'O pedido ainda não está apto para emissão',
      invoice_generation_recovery_required:'Tentativa anterior teve erro ou tempo de resposta excedido. A recuperação automática está verificando a nota antes de permitir novo envio.',
      fiscal_status_unavailable:'Não foi possível consultar o retorno fiscal no Bling'
    };
    return map[code]||String(code||'').replaceAll('_',' ');
  }
  function fiscalDiagnosticHtml(f){
    if(!f||f.authorized===true)return '';
    const provider=f.provider||{},job=provider.job||{},readiness=f.readiness||{},raw=[
      ...(Array.isArray(f.hard_blockers)?f.hard_blockers:[]),
      ...(Array.isArray(f.blockers)?f.blockers:[]),
      job.error_code,f.fiscal_block_reason
    ].filter(Boolean),reasons=[...new Set(raw)].map(fiscalBlockReasonLabel);
    const detail=job.error_detail||provider.error_detail||provider.detail||'';
    const attempts=job.attempts!=null?Number(job.attempts):null;
    const lines=[];
    if(reasons.length)lines.push('<strong>Motivo identificado</strong><div>'+reasons.map(esc).join(' · ')+'</div>');
    if(detail)lines.push('<div style="margin-top:6px">'+esc(detail)+'</div>');
    if(readiness?.eligible===false&&readiness?.reason)lines.push('<div style="margin-top:6px">Pré-validação: '+esc(fiscalBlockReasonLabel(readiness.reason))+'</div>');
    if(attempts!=null)lines.push('<div style="margin-top:6px">Tentativas registradas: '+attempts+'</div>');
    const repair=f.fiscal_recovery||null,diagnosis=repair?.diagnostics||{};
    const repairLabels={
      started:'Verificação automática iniciada',
      existing_invoice_reconciled:'NF-e existente encontrada e reconciliada',
      existing_invoice_needs_authorization_or_review:'NF-e encontrada no Bling: aguarda autorização ou revisão',
      generation_result_uncertain_manual_reconcile_required:'O Bling não confirmou a geração; nenhuma nova nota foi criada para evitar duplicidade',
      unverified_ncm_requires_review:'NCM não possui documentação fiscal suficiente para correção automática',
      proposed_ncm_not_in_official_active_catalog:'Código proposto não consta na tabela NCM vigente',
      official_classif_unavailable:'Tabela oficial de NCM temporariamente indisponível',
      official_classif_data_unrecognized:'Tabela oficial de NCM precisa ser validada antes da correção',
      auto_invoice_authorized:'NF-e corrigida e autorizada automaticamente',
      auto_invoice_authorization_pending:'NF-e enviada; aguardando retorno da SEFAZ',
      auto_invoice_retry_failed:'Nova tentativa falhou; erro registrado',
      fiscal_preflight_blocked:'A conferência fiscal ainda possui bloqueios',
      unrecognized_fiscal_error:'Erro fiscal não reconhecido com segurança',
      separation_not_completed:'Separação física ainda não foi concluída',
      unable_to_identify_fiscal_products:'Não foi possível identificar inequivocamente o item fiscal',
      ambiguous_product_name:'Há ambiguidade entre os nomes dos produtos; bloqueio preventivo'
    };
    if(repair){
      const label=repairLabels[repair.stage]||String(repair.stage||'').replaceAll('_',' ');
      lines.push('<div style="margin-top:8px"><strong>Recuperação automática</strong><div>'+esc(label)+'</div></div>');
      const corrected=Array.isArray(diagnosis.corrected_products)?diagnosis.corrected_products.length:0;
      if(corrected)lines.push('<div>'+corrected+' produto(s) com NCM corrigido e conferido no Bling.</div>');
      if(Array.isArray(diagnosis.issues)&&diagnosis.issues.length)lines.push('<div>Itens para revisão: '+diagnosis.issues.length+'. Nenhum NCM será adivinhado.</div>');
      if(repair.created_at)lines.push('<div class="muted">Última análise: '+esc(dateTime(repair.created_at))+'</div>');
    }
    if(!lines.length&&f.stage==='pending')lines.push('<strong>Aguardando retorno do Bling</strong><div>A solicitação fiscal ainda não trouxe NF-e nem erro específico.</div>');
    return lines.length?'<div class="rule-notice warn" style="margin-top:8px">'+lines.join('')+'</div>':'';
  }

  function orderFiscalHtml(f,o){
    if(!f)return '<div class="rule-notice"><strong>Carregando controle fiscal…</strong><div>Consultando a situação da NF-e.</div></div>';
    if(f.error)return '<div class="rule-notice warn"><strong>NF-e INDISPONÍVEL</strong><div>A saída continua bloqueada até o controle fiscal voltar.</div></div>';
    const blockers=Array.isArray(f.blockers)?f.blockers:[];
    if(f.authorized===true||f.stage==='authorized')return '<div class="rule-notice"><strong>NF-e AUTORIZADA</strong><div>'+(f.invoice_number?'Nota '+esc(f.invoice_number)+' · ':'')+esc(f.sefaz_status||'Autorizada pela SEFAZ')+'</div></div>';
    if(f.stage==='processing')return '<div class="rule-notice warn"><strong>NF-e EM PROCESSAMENTO</strong><div>Aguarde a autorização. Não repita a geração da nota.</div></div>';
    if(f.stage==='rejected')return '<div class="rule-notice warn"><strong>NF-e REJEITADA</strong><div>'+esc(f.sefaz_status||blockers.map(fiscalBlockReasonLabel).join(' · ')||'Revise o retorno fiscal antes de tentar novamente.')+'</div></div>'+fiscalDiagnosticHtml(f);
    if(f.stage==='blocked')return '<div class="rule-notice warn"><strong>NF-e BLOQUEADA</strong><div>'+esc(blockers.map(fiscalBlockReasonLabel).join(' · ')||'Existem requisitos pendentes para emissão.')+'</div></div>'+fiscalDiagnosticHtml(f);
    return '<div class="rule-notice warn"><strong>NF-e PENDENTE</strong><div>A nota ainda não foi autorizada. Veja abaixo o retorno mais recente da integração.</div></div>'+fiscalDiagnosticHtml(f);
  }
  function fiscalCanaryActionHtml(f,o){
    if(!o||!['ready','out_for_delivery','delivered'].includes(o.status))return '';
    const busy=state.fiscalActionBusy===true,disabled=busy?' disabled':'';
    const latest=state.fiscalActionByOrder?.[o.id]||'';
    const feedback=latest?'<div class="rule-notice" role="status" style="margin-top:8px"><strong>Última consulta / tentativa</strong><div>'+esc(latest)+'</div></div>':'';
    const check='<button class="secondary" id="refreshFiscalCanary" type="button"'+disabled+'>CONSULTAR BLING / NF-e</button>';
    if(o.status!=='ready')return feedback+(o.status==='out_for_delivery'?'<div class="rule-notice"><strong>SAIU PARA ENTREGA</strong><div>NF-e deve estar autorizada antes da expedição.</div></div>':'')+'<div class="print-actions">'+check+'</div>';
    if(f?.authorized===true||f?.stage==='authorized')return feedback+'<div class="print-actions"><button class="primary" id="startDispatchV4" type="button">SAIU PARA ENTREGA</button>'+check+'</div>';
    const blockers=[...(f?.hard_blockers||[]),...(f?.blockers||[])].map(String);
    const missingLink=blockers.some(x=>['bling_order_not_linked','bling_order_not_verified','external_order_key_missing'].includes(x));
    const recover=missingLink?'<button class="primary" id="recoverBlingOrder" type="button"'+disabled+'>RECUPERAR VENDA NO BLING</button>':'';
    const invoiceId=Number(f?.invoice_id||f?.bling_invoice_id||0);
    const issue=f?.can_issue===true&&!missingLink?'<button class="primary" id="executeFiscalCanary" type="button"'+disabled+'>'+(invoiceId?'TENTAR AUTORIZAR NF-e':'TENTAR EMITIR NF-e')+'</button>':'';
    const explanation=missingLink
      ?'<div class="muted" style="margin-top:8px">Recupera a venda existente e confirma o status Verificado. Não cria uma segunda venda para o mesmo pedido.</div>'
      :invoiceId?'<div class="muted" style="margin-top:8px">NF-e localizada no Bling. Consulte primeiro a situação antes de tentar autorizar; o sistema impede o reenvio quando a transmissão já está em andamento.</div>':'';
    return feedback+explanation+'<div class="print-actions" style="margin-top:8px">'+recover+issue+check+'</div>';
  }
  async function recoverCurrentOrderBling(){
    const o=state.currentOrder?.order;
    if(!o||o.status!=='ready'||state.fiscalActionBusy)return;
    if(!confirm('Recuperar a venda do pedido #'+orderDisplayCode(o)+' no Bling?\\n\\nSerá consultada a venda existente e atualizado seu vínculo e status, sem emitir NF-e nesta etapa.'))return;
    state.fiscalActionBusy=true;paintOrderDetail();
    try{
      const result=await api('order_fiscal_recover_bling_v1',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:o.id,operator:currentOperator()||'Operação'})
      });
      state.fiscalActionByOrder??={};
      state.fiscalActionByOrder[o.id]='Venda no Bling recuperada e confirmada como Verificado. '+(result.fiscal?.can_issue?'A NF-e está liberada para tentativa manual.':result.fiscal?.authorized?'NF-e já autorizada.':'Consulte a situação fiscal antes de prosseguir.');
      state.currentOrderFiscal=result.fiscal||null;
      toast('Venda recuperada no Bling · confira a NF-e');
    }catch(e){
      state.fiscalActionByOrder??={};
      state.fiscalActionByOrder[o.id]='Falha na recuperação: '+fiscalBlockReasonLabel(e?.message||'bling_recovery_failed')+'. Os itens separados foram preservados.';
      toast(state.fiscalActionByOrder[o.id]);
    }finally{
      state.fiscalActionBusy=false;
      await loadCurrentOrderFiscal(false);
      if(state.currentOrder?.order?.id===o.id)paintOrderDetail();
    }
  }
  async function recheckCurrentOrderFiscal(){
    const o=state.currentOrder?.order;
    if(!o||state.fiscalActionBusy)return;
    state.fiscalActionBusy=true;paintOrderDetail();
    try{
      const result=await api('order_fiscal_recheck_v1',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:o.id})
      });
      state.currentOrderFiscal=result.fiscal||null;
      state.fiscalByOrder[o.id]=state.currentOrderFiscal;
      const f=result.fiscal||{},reason=result.reconcile?.reason||'';
      state.fiscalActionByOrder??={};
      state.fiscalActionByOrder[o.id]=f.authorized?'Nota autorizada pela SEFAZ.'
        :f.invoice_id?'Nota '+(f.invoice_number||f.invoice_id)+' encontrada; situação: '+(f.sefaz_status||f.stage||'pendente')+'.'
        :reason==='invoice_not_found'?'Consulta concluída: nenhuma NF-e encontrada no Bling para esta venda.'
        :reason==='fiscal_dispatch_not_eligible'?'Consulta concluída: ainda existe bloqueio de vínculo ou de verificação da venda.'
        :'Consulta concluída: '+(f.stage||'pendente')+'. Nenhuma NF-e foi enviada nesta consulta.';
      toast(state.fiscalActionByOrder[o.id]);
    }catch(e){
      state.fiscalActionByOrder??={};
      state.fiscalActionByOrder[o.id]='Não foi possível consultar o Bling: '+fiscalBlockReasonLabel(e?.message||'fiscal_status_unavailable');
      toast(state.fiscalActionByOrder[o.id]);
    }finally{
      state.fiscalActionBusy=false;
      if(state.currentOrder?.order?.id===o.id)paintOrderDetail();
    }
  }
  async function executeCurrentOrderFiscalCanary(){
    const o=state.currentOrder?.order;if(!o||o.status!=='ready')return;
    const f=state.currentOrderFiscal||{};if(f.can_issue!==true){toast('A NF-e ainda não está liberada para emissão');return}
    if(!confirm('EMITIR NF-e do pedido #'+orderDisplayCode(o)+' agora?\n\nA emissão será enviada ao Bling/SEFAZ.'))return;
    const btn=$('#executeFiscalCanary');if(btn){btn.disabled=true;btn.textContent='EMITINDO NF-e…'}
    try{
      const result=await api('order_fiscal_issue_v4',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:o.id,confirmation:'EMITIR_NFE',operator:currentOperator()||'Operação'})});
      state.currentOrderFiscal=result.fiscal||result;state.fiscalByOrder[o.id]=state.currentOrderFiscal;
      toast(state.currentOrderFiscal?.authorized?'NF-e autorizada':state.currentOrderFiscal?.stage==='rejected'?'NF-e não gerada · veja o motivo no pedido':'Solicitação enviada ao Bling · consultando retorno');
      await loadCurrentOrderFiscal(true);
    }catch(e){
      await loadCurrentOrderFiscal(true);
      const current=state.currentOrderFiscal||{},job=current.provider?.job||{},reason=job.error_detail||job.error_code||e?.message||'fiscal_issue_failed';
      toast('NF-e NÃO GERADA · '+fiscalBlockReasonLabel(reason));
    }
  }
  async function startCurrentOrderDispatchV4(){
    const o=state.currentOrder?.order;if(!o||o.status!=='ready')return;
    const f=state.currentOrderFiscal||{};if(f.authorized!==true&&f.stage!=='authorized'){toast('A NF-e precisa estar autorizada antes da saída');return}
    if(!confirm('Confirmar que o pedido #'+orderDisplayCode(o)+' SAIU PARA ENTREGA?'))return;
    const btn=$('#startDispatchV4');if(btn){btn.disabled=true;btn.textContent='REGISTRANDO SAÍDA…'}
    try{await api('order_dispatch_start_v4',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:o.id,operator:currentOperator()||'Expedição',idempotency_key:'dispatch-v4:'+o.id})});toast('Saída para entrega registrada');delete state.fiscalByOrder[o.id];await loadOrders();await openOrder(o.id)}catch(e){toast(errorMessage(e.message));if(btn){btn.disabled=false;btn.textContent='SAIU PARA ENTREGA'}}
  }
  async function openDanfeForOrder(id,orderCode=''){
    if(!id)return;
    const w=window.open('','_blank','width=900,height=900');
    if(!w){toast('Libere pop-ups para abrir o DANFE');return}
    try{
      w.document.open();
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>DANFE</title></head><body style="font:16px system-ui;padding:30px;text-align:center"><strong>Carregando DANFE…</strong><p>Buscando o PDF oficial no Bling.</p></body></html>');
      w.document.close();
      const data=await api('order_fiscal_document_pdf',{},{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})
      });
      const raw=atob(String(data.base64||''));
      if(!raw)throw new Error('fiscal_document_empty');
      const bytes=new Uint8Array(raw.length);
      for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
      const blob=new Blob([bytes],{type:'application/pdf'});
      const url=URL.createObjectURL(blob);
      w.location.replace(url);
      setTimeout(()=>URL.revokeObjectURL(url),120000);
      toast('DANFE '+(data.invoice_number?data.invoice_number+' ':orderCode?'#'+orderCode+' ':'')+'aberto para impressão');
    }catch(e){
      try{w.close()}catch{}
      toast(errorMessage(e?.message||'fiscal_document_download_failed'));
    }
  }
  async function openCurrentDanfe(){
    const o=state.currentOrder?.order;if(!o)return;
    const fiscal=state.currentOrderFiscal||{};
    const gate=fiscal.dispatch_gate||{};
    if(fiscal.authorized!==true&&gate.authorized!==true&&!fiscal.bling_invoice_id&&!fiscal.invoice_id){
      toast('A NF-e ainda não está autorizada');return;
    }
    return openDanfeForOrder(o.id,orderDisplayCode(o));
  }

  async function loadCurrentOrderFiscal(repaint=true){
    const id=state.currentOrder?.order?.id;if(!id)return;
    try{
      state.currentOrderFiscal=await api('order_fiscal_status',{},{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})
      });
      state.fiscalByOrder[id]=state.currentOrderFiscal;
    }catch(e){
      state.currentOrderFiscal={error:String(e?.message||'fiscal_unavailable')};
    }
    if(repaint)paintOrderDetail();
  }

  async function confirmCurrentOrderPayment(){
    const o=state.currentOrder?.order;if(!o)return;
    if(o.status!=='delivered'){toast('Confirme a entrega antes do pagamento');return}
    const payment=o.payment_method_snapshot?.label||o.payment_method_snapshot?.method||'Pagamento não informado';
    const amount=money(o.total_cents);
    const ok=confirm('Confirmar recebimento de '+amount+' via '+payment+'?\n\nEsta ação registra o pagamento do pedido #'+orderDisplayCode(o)+'.');
    if(!ok)return;
    const btn=$('#confirmFiscalPayment');
    if(btn){btn.disabled=true;btn.textContent='Confirmando recebimento…'}
    try{
      state.currentOrderFiscal=await api('order_fiscal_confirm_payment',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:o.id,payment_method:payment})
      });
      state.fiscalByOrder[o.id]=state.currentOrderFiscal;
      paintOrderDetail();
      if(state.tab==='closure')renderClosure();
      toast(state.currentOrderFiscal?.fiscal_status==='ready'?'Recebimento confirmado · fiscal pronto':'Recebimento confirmado');
    }catch(e){
      toast(errorMessage(e.message));
      if(btn){btn.disabled=false;btn.textContent='Confirmar '+amount+' recebido · '+payment}
    }
  }

  function orderStockAlertHtml(readiness){
    const focused=state.orderFocusIssue==='stock';
    if(!readiness)return focused?'<div class="rule-notice warn" id="orderStockAlert" tabindex="-1"><strong>⚠️ Não consegui conferir o estoque agora</strong><div>Feche o pedido, clique em Atualizar e tente novamente.</div></div>':'';
    if(readiness.ok!==false)return focused?'<div class="rule-notice" id="orderStockAlert" tabindex="-1" style="border-color:#b9dec9;background:#f2fbf5"><strong style="color:#176b43">✓ Estoque conferido agora</strong><div>Nenhuma falta de estoque foi encontrada neste momento. O aviso da lista estava desatualizado; ao fechar este pedido, clique em Atualizar.</div></div>':'';
    const rows=Array.isArray(readiness.shortages)?readiness.shortages:[];
    const cards=rows.map(x=>{
      const required=Number(x.required??x.requested??0)||0;
      const available=Number(x.available||0)||0;
      const shortage=Number(x.shortage??Math.max(0,required-available))||0;
      const locator=[x.gondola_number!=null?'Gôndola '+x.gondola_number:'',x.shelf_label?'Prateleira '+x.shelf_label:''].filter(Boolean).join(' · ');
      const code=x.gtin||x.sku||'';
      return '<div style="border:1px solid #f0c8c3;background:#fff;border-radius:10px;padding:10px 12px;margin-top:8px">'+
        '<strong style="display:block;color:#18221c;font-size:13px">'+esc(x.name||'Produto')+'</strong>'+
        '<div style="margin-top:4px;color:#5f6962;font-size:12px">Precisa <b>'+esc(fmtQty(required))+'</b> · Disponível <b>'+esc(fmtQty(available))+'</b> · <b style="color:#b3261e">Faltam '+esc(fmtQty(shortage))+'</b></div>'+
        ((code||locator)?'<div style="margin-top:3px;color:#66716a;font-size:11px">'+(code?'Código '+esc(code):'')+(code&&locator?' · ':'')+esc(locator)+'</div>':'')+
      '</div>';
    }).join('');
    const total=Number(readiness.shortage_count||rows.length||0);
    const extra=total>rows.length?'<div style="margin-top:7px;font-size:11px;color:#66716a">Há mais '+esc(String(total-rows.length))+' item(ns) com falta além dos exibidos.</div>':'';
    return '<div class="rule-notice warn" id="orderStockAlert" tabindex="-1" style="border-color:#e6a9a2;background:#fff8f7">'+
      '<strong style="display:block;color:#b3261e;font-size:14px">⚠️ Revisar estoque antes de confirmar</strong>'+
      '<div style="margin-top:3px">O pedido está bloqueado porque o estoque disponível não cobre todos os itens abaixo.</div>'+
      (cards||'<div style="margin-top:8px">Não há estoque disponível suficiente para este pedido.</div>')+extra+
      '<div class="print-actions" style="margin-top:10px"><button class="secondary" id="openBalanceFromOrder" type="button">Abrir Balanço para corrigir estoque</button></div>'+
    '</div>';
  }

  function orderBlingLinkHtml(link){
    if(!link)return '<div class="rule-notice"><strong>Aguardando primeira separação</strong><div>O pedido ainda não foi enviado ao Bling. O envio acontece automaticamente quando a separação começar e todas as validações estiverem corretas.</div></div>';
    const job=link.job||{};
    const jobAttention=job.status==='review_required'||job.status==='failed';
    const statusAttention=job.operation==='sync_order_status'&&jobAttention;
    if(link.linked&&statusAttention){
      return '<div class="rule-notice warn"><strong>Pedido vinculado · situação pendente no Bling</strong><div>'+esc(blingOrderJobErrorLabel(job.error_code))+'</div><div class="sub" style="margin-top:6px">O pedido continua válido no Admin. Confira a situação no Bling enquanto essa permissão estiver indisponível.</div></div>';
    }
    if(link.linked){
      return '<div class="rule-notice"><strong class="ok-text">Bling #'+esc(link.bling_order_id)+' ✓</strong><div>Pedido vinculado e verificado'+(link.last_verified_at?' · '+esc(dateTime(link.last_verified_at)):'')+'.</div></div>';
    }
    if(job.status==='pending'||job.status==='processing'||job.status==='retry'){
      return '<div class="rule-notice"><strong>Sincronização Bling em andamento</strong><div>Status: '+esc(job.status||'pendente')+'.</div></div>';
    }
    if(jobAttention){
      return '<div class="rule-notice warn"><strong>Bling precisa de revisão</strong><div>'+esc(blingOrderJobErrorLabel(job.error_code))+'</div></div>';
    }
    return '<div class="rule-notice"><strong>Ainda não vinculado</strong><div>Será processado automaticamente após a primeira separação elegível.</div></div>';
  }

  function blingOrderJobErrorLabel(code){
    const map={
      order_not_write_eligible:'Pedido ainda não estava apto para envio',
      duplicate_external_order_key:'Foi encontrado mais de um pedido com a mesma chave no Bling',
      order_creation_uncertain:'O resultado da criação precisa ser conferido',
      bling_order_id_missing:'O Bling não retornou um identificador seguro',
      post_create_order_mismatch:'O pedido criado no Bling não conferiu com o total local',
      order_status_updates_disabled:'A situação foi atualizada no Admin, mas o aplicativo Bling ainda não tem permissão para alterar situações de pedidos',
      order_status_mapping_not_approved:'A situação foi atualizada no Admin, mas o mapeamento de situações do Bling ainda não foi aprovado',
      fiscal_dispatch_gate_unavailable:'Não consegui conferir o fiscal antes da saída. Tente novamente.',
      fiscal_dispatch_not_authorized:'A saída está bloqueada até a autorização fiscal.',
      customer_not_linked:'Cliente ainda não vinculado ao Bling',
      unresolved_products:'Há produtos sem vínculo com o Bling'
    };
    return map[code]||'A sincronização foi interrompida com segurança.';
  }

  function blingOrderBlockerLabel(code){
    const map={
      first_separation_required:'A separação ainda não começou',
      stock_not_consumed:'Estoque ainda não foi tratado na separação',
      order_cancelled:'Pedido cancelado',
      minimum_order_not_met:'Pedido abaixo do mínimo de R$ 75',
      customer_not_linked:'Cliente ainda não vinculado',
      customer_not_found:'Cliente não encontrado',
      customer_missing_bling_contact_id:'Cliente ainda precisa ser vinculado ao Bling',
      customer_document_required:'Informe um CPF válido no cadastro do cliente para vincular ao Bling',
      customer_inactive:'Cliente inativo',
      unresolved_products:'Há produto sem vínculo seguro com o Bling',
      product_total_mismatch:'Subtotal dos produtos não confere',
      commercial_delta_mismatch:'Diferença comercial não confere',
      invalid_order_total:'Total do pedido inválido',
      order_without_items:'Pedido sem itens',
      delivery_street_required:'Rua de entrega ausente',
      delivery_number_required:'Número de entrega ausente',
      delivery_city_required:'Cidade de entrega ausente',
      delivery_state_required:'UF de entrega ausente'
    };
    return map[code]||String(code||'').replaceAll('_',' ');
  }

  function orderBlingPreviewHtml(p){
    if(!p)return '<div class="rule-notice"><strong>Prévia ainda não verificada</strong><div>Use o botão abaixo para conferir o pedido. Esta verificação não envia nem altera nada no Bling.</div></div>';
    const totals=p.totals||{};
    const blockers=Array.isArray(p.write_blockers)&&p.write_blockers.length?p.write_blockers:(p.blockers||[]);
    const stateText=p.write_eligible?'Apto tecnicamente':'Envio bloqueado com segurança';
    const stateClass=p.write_eligible?'ok-text':'warn-text';
    return '<div class="rule-notice">'+
      '<strong class="'+stateClass+'">'+esc(stateText)+'</strong>'+
      '<div>'+esc(p.resolved_items_count||0)+' itens individualizados · Produtos '+money(totals.product_lines_cents||0)+' · Ajuste '+money((totals.other_expenses_cents||0)-(totals.discount_cents||0))+' · Total '+money(totals.order_total_cents||0)+'</div>'+
      (blockers.length?'<div class="sub" style="margin-top:6px">'+blockers.map(x=>'• '+esc(blingOrderBlockerLabel(x))).join('<br>')+'</div>':'<div class="sub" style="margin-top:6px">Sem bloqueios de dados. O processamento continua controlado pelo Hub Bling.</div>')+
      ((p.unresolved_products||[]).length?'<div class="sub" style="margin-top:6px"><b>Produtos sem vínculo:</b> '+(p.unresolved_products||[]).slice(0,5).map(x=>esc(x.name||x.sku||x.gtin||'Produto')).join(' · ')+((p.unresolved_products||[]).length>5?' · +'+((p.unresolved_products||[]).length-5):'')+'</div>':'')+
      '<div class="sub" style="margin-top:6px">Somente prévia: nenhuma alteração externa é feita por esta tela.</div>'+
    '</div>';
  }

  async function previewCurrentOrderBling(){
    const id=state.currentOrder?.order?.id;if(!id)return;
    const btn=$('#previewBlingOrder');if(btn){btn.disabled=true;btn.textContent='Verificando…'}
    try{
      const data=await api('bling_preview_order_sync',{},{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})
      });
      state.currentOrderBlingPreview=data;
      paintOrderDetail();
      toast(data.write_eligible?'Pedido apto para o fluxo Bling':'Prévia conferida · envio continua bloqueado');
    }catch(e){
      toast('Não consegui verificar a prévia do Bling agora');
      if(btn){btn.disabled=false;btn.textContent='Verificar prévia Bling'}
    }
  }

  async function createCurrentOrderCustomerInBling(){
    const id=state.currentOrder?.order?.id;if(!id)return;
    const d=state.currentOrder||{},o=d.order||{},c=d.customer||{};
    const customerId=c.source_customer_id||o.delivery_address_snapshot?.source_customer_id||o.customer_id||'';
    let customer=state.customers.find(x=>x.id===customerId)||null;
    if(!customer&&customerId){
      try{
        const one=await customerApi('vitrine_customer_get',{id:customerId});
        customer=one.customer||null;
        if(customer)state.customers=[customer];
      }catch{}
    }
    const name=customer?.display_name||o.delivery_address_snapshot?.customer_name||o.delivery_address_snapshot?.recipient_name||'Cliente';
    const cpf=customer?.cpf||o.delivery_address_snapshot?.cpf||'';
    if(!cpf){toast('Informe o CPF do cliente antes de cadastrar no Bling');return}
    if(!confirm('Cadastrar este cliente no Bling?\n\n'+name+' · CPF '+formatCpf(cpf)+'\n\nO Hub confere o CPF antes de criar para evitar duplicidade.'))return;
    const btn=$('#createBlingOrderCustomer');if(btn){btn.disabled=true;btn.textContent='Cadastrando…'}
    try{
      const data=await api('bling_create_order_customer',{},{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})
      });
      state.currentOrderBlingPreview=data.preview||state.currentOrderBlingPreview;
      paintOrderDetail();
      const blockers=blingPreflightOperationalBlockers(state.currentOrderBlingPreview);
      toast(blockers.includes('customer_missing_bling_contact_id')?'Cadastro solicitado · vínculo ainda está processando':'Cliente vinculado ao Bling · pedido revalidado');
    }catch(e){
      toast(errorMessage(e.message));
      if(btn){btn.disabled=false;btn.textContent='Cadastrar cliente no Bling'}
    }
  }

  async function createCurrentOrderProductsInBling(){
    const id=state.currentOrder?.order?.id;if(!id)return;
    let preview=state.currentOrderBlingPreview;
    if(!preview||preview.error){
      try{
        preview=await api('bling_preview_order_sync',{},{
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})
        });
        state.currentOrderBlingPreview=preview;
      }catch{toast('Não consegui conferir os produtos agora');return}
    }
    const missing=(preview.unresolved_products||[]).filter(x=>x?.reason==='product_not_linked');
    if(!missing.length){toast('Nenhum produto precisa ser cadastrado no Bling');return}
    const names=missing.slice(0,5).map(x=>'• '+(x.name||x.sku||x.gtin||'Produto')).join('\n');
    const extra=missing.length>5?'\n• +'+(missing.length-5)+' produto(s)':'';
    if(!confirm('Cadastrar '+missing.length+' produto(s) ausente(s) no Bling?\n\n'+names+extra+'\n\nO Hub verifica GTIN/código antes de criar para evitar duplicidade.'))return;
    const btn=$('#createBlingOrderProducts');if(btn){btn.disabled=true;btn.textContent='Cadastrando…'}
    try{
      const data=await api('bling_create_order_products',{},{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})
      });
      state.currentOrderBlingPreview=data.preview||state.currentOrderBlingPreview;
      paintOrderDetail();
      const remaining=(state.currentOrderBlingPreview?.unresolved_products||[]).filter(x=>x?.reason==='product_not_linked');
      toast(remaining.length?'Cadastro solicitado · ainda há produto(s) pendente(s)':'Produtos vinculados · pedido revalidado');
    }catch(e){
      toast(errorMessage(e.message));
      if(btn){btn.disabled=false;btn.textContent='Cadastrar produtos no Bling'}
    }
  }

  async function resolveCurrentOrderBlingDependencies(){
    const id=state.currentOrder?.order?.id;if(!id)return;
    const btn=$('#resolveBlingDependencies');if(btn){btn.disabled=true;btn.textContent='Conferindo vínculos…'}
    try{
      const data=await api('bling_reconcile_order_dependencies_readonly',{},{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})
      });
      state.currentOrderBlingPreview=data.preview||null;
      const remaining=blingPreflightOperationalBlockers(state.currentOrderBlingPreview);
      paintOrderDetail();
      toast(remaining.length?'Vínculos conferidos · ainda há pendências':'Vínculos conferidos · pedido apto para separar');
    }catch(e){
      toast('Não consegui conferir os vínculos agora');
      if(btn){btn.disabled=false;btn.textContent='Tentar resolver vínculos'}
    }
  }
  async function completeCurrentOrderCustomerDocument(){
    const orderId=state.currentOrder?.order?.id;if(!orderId)return;
    const d=state.currentOrder||{},o=d.order||{},c=d.customer||{};
    const customerId=c.source_customer_id||o.delivery_address_snapshot?.source_customer_id||o.customer_id||'';
    if(!customerId){focusOrderCustomerForBling();return}
    let customer=state.customers.find(x=>x.id===customerId)||null;
    if(!customer){
      try{
        const one=await customerApi('vitrine_customer_get',{id:customerId});
        customer=one.customer||null;
        if(customer)state.customers=[customer];
      }catch{}
    }
    if(!customer){toast('Não consegui abrir o cadastro do cliente agora');return}
    openCustomerEditor(customer,orderId);
  }

  function focusOrderCustomerForBling(){
    const input=$('#orderCustomerSearch');
    if(!input)return;
    input.focus();
    input.scrollIntoView({behavior:'smooth',block:'center'});
    toast('Localize e vincule o cliente correto');
  }

  async function retryHistorySync(){
    const id=state.currentOrder?.order?.id;if(!id)return;
    const btn=$('#retryHistorySync');if(btn){btn.disabled=true;btn.textContent='Sincronizando…'}
    try{
      await api('history_sync_retry',{},{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})
      });
      const fresh=await api('order',{id});state.currentOrder=fresh;paintOrderDetail();loadOrders();
      toast('Histórico sincronizado');
    }catch(e){
      toast('Não consegui sincronizar agora');
      if(btn){btn.disabled=false;btn.textContent='Tentar novamente'}
    }
  }

  function orderActionButtonsHtml(o){
    const consumed=o.payment_method_snapshot?.stock_consumed===true;
    const problems=orderProblemReasons(o);
    const mustFix=problems.length>0&&['created','confirmed','ready','out_for_delivery'].includes(o.status);
    const dispatchGate=state.currentOrderFiscal?.dispatch_gate||null;
    const fiscalDispatchBlocked=o.status==='ready'&&dispatchGate?.enforced===true&&dispatchGate?.allowed!==true;
    let primary='';
    if(mustFix)primary='<button class="primary" type="button" disabled>Corrija os dados antes de avançar</button>';
    if(!mustFix&&o.status==='created')primary='<button class="primary" id="advanceOrder" data-next="confirmed" type="button">Confirmar pedido</button>';
    else if(!mustFix&&o.status==='confirmed'&&!consumed)primary='<button class="primary" id="startSeparation" type="button">Iniciar separação</button>';
    else if(!mustFix&&o.status==='confirmed'&&consumed)primary='<button class="primary" id="advanceOrder" data-next="processing" type="button">Continuar separação</button>';
    else if(o.status==='processing'&&!consumed)primary='<button class="primary" id="startSeparation" type="button">Regularizar separação</button>';
    else if(o.status==='processing')primary='<button class="primary" id="advanceOrder" data-next="ready" type="button">Finalizar separação</button>';
    else if(!mustFix&&o.status==='ready'&&fiscalDispatchBlocked)primary='<button class="primary" type="button" disabled>Fiscal pendente antes da saída</button>';
    else if(!mustFix&&o.status==='ready')primary='<button class="primary" id="advanceOrder" data-next="out_for_delivery" type="button">Marcar saída para entrega</button>';
    else if(!mustFix&&o.status==='out_for_delivery')primary='<button class="primary" id="advanceOrder" data-next="delivered" type="button">Confirmar entrega</button>';
    const docs=[];
    if(o.status==='out_for_delivery')docs.push('<button class="secondary" id="returnToExpedition" type="button">Entrega não concluída</button>');
    if(consumed)docs.push('<button class="secondary" id="reprintSeparation" type="button">Reimprimir separação</button>');
    if(['ready','out_for_delivery','delivered'].includes(o.status))docs.push('<button class="secondary" id="printDelivery" type="button">Imprimir via do entregador</button>');
    const cancel=!['delivered','cancelled'].includes(o.status)?'<button class="text danger" id="cancelOrder" type="button">Cancelar pedido</button>':'';
    return '<div class="order-action-zone"><strong>'+esc(orderNextAction(o))+'</strong><small>Use a próxima ação abaixo; o sistema atualiza estoque e integrações quando necessário.</small><div class="print-actions">'+(primary||'')+docs.join('')+'</div>'+cancel+'</div>';
  }
  function orderItemHtml(i){
    const o=state.currentOrder?.order||{};
    const payment=o.payment_method_snapshot||{};
    const editable=o.status==='created'&&!(payment.stock_reserved===true&&payment.stock_released!==true);
    const shortages=state.currentOrder?.stock_readiness?.shortages||[];
    const shortageIds=new Set(shortages.map(x=>x.product_id));
    const comp=i.components?.length?'<div class="composition">'+i.components.map(c=>{
      const totalQty=Number(c.quantity)*Number(i.quantity);
      const shortage=shortageIds.has(c.product_id);
      return '<div class="component-line"><span>'+fmtQty(totalQty)+'× '+esc(c.name_snapshot)+(shortage?' <b class="danger-text">· falta estoque</b>':'')+'</span>'+
        (editable&&shortage?'<button class="text" type="button" data-replace-component="'+esc(c.id)+'" data-order-item="'+esc(i.id)+'" data-component-name="'+esc(c.name_snapshot)+'">Substituir</button>':'')+
      '</div>';
    }).join('')+'</div>':'';
    return '<div class="order-item"><div class="order-item-head"><strong>'+fmtQty(i.quantity)+'× '+esc(i.name_snapshot)+'</strong><b>'+money(i.total_cents)+'</b></div>'+comp+'</div>';
  }
  function openComponentReplacement(orderItemId,componentId,currentName){
    const host=$('#componentReplacementPanel');if(!host)return;
    state.componentReplacement={order_item_id:orderItemId,component_id:componentId,current_name:currentName||''};
    host.innerHTML='<div class="replacement-panel"><strong>Substituir '+esc(currentName||'item da cesta')+'</strong><span class="sub">O valor da cesta não muda. Escolha um produto físico com estoque disponível.</span><div class="replacement-search"><input id="componentReplacementSearch" type="search" placeholder="Nome, EAN ou código"><button class="secondary" id="searchComponentReplacement" type="button">Buscar</button><button class="text" id="cancelComponentReplacement" type="button">Fechar</button></div><div class="replacement-results" id="componentReplacementResults"></div></div>';
    $('#searchComponentReplacement').onclick=searchComponentReplacement;
    $('#cancelComponentReplacement').onclick=()=>{state.componentReplacement=null;host.innerHTML=''};
    $('#componentReplacementSearch').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchComponentReplacement()}};
    $('#componentReplacementSearch').focus();
    host.scrollIntoView({behavior:'smooth',block:'center'});
  }
  async function searchComponentReplacement(){
    const ctx=state.componentReplacement;if(!ctx)return;
    const q=String($('#componentReplacementSearch')?.value||'').trim();
    const host=$('#componentReplacementResults');if(!host)return;
    if(q.length<2){host.innerHTML='<div class="sub">Digite pelo menos 2 caracteres.</div>';return}
    host.innerHTML='<div class="loading">Buscando produtos…</div>';
    try{
      const data=await api('products',{q,limit:12});
      const rows=(data.products||[]).filter(p=>p.active!==false&&Number(p.stock_quantity||0)>0);
      host.innerHTML=rows.length?rows.map(p=>'<div class="replacement-option"><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.gtin||p.sku||'Sem código')+' · estoque físico '+esc(fmtQty(p.stock_quantity||0))+'</small></div><button class="secondary" type="button" data-replacement-product="'+esc(p.id)+'">Usar</button></div>').join(''):'<div class="sub">Nenhum produto ativo com estoque encontrado.</div>';
      host.querySelectorAll('[data-replacement-product]').forEach(b=>b.onclick=()=>replaceComponentWithProduct(b.dataset.replacementProduct,b));
    }catch(e){
      host.innerHTML='<div class="sub">Não consegui buscar agora. Tente novamente.</div>';
    }
  }
  async function replaceComponentWithProduct(productId,btn){
    const ctx=state.componentReplacement,o=state.currentOrder?.order;
    if(!ctx||!o)return;
    if(!confirm('Substituir este item da cesta pelo produto escolhido?\n\nO valor comercial da cesta permanecerá o mesmo.'))return;
    if(btn){btn.disabled=true;btn.textContent='Substituindo…'}
    try{
      await persistCurrentOrder();
      const data=await api('order_component_replace',{},{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          order_id:o.id,
          order_item_id:ctx.order_item_id,
          component_id:ctx.component_id,
          replacement_product_id:productId
        })
      });
      state.currentOrder=data.detail||await api('order',{id:o.id});
      state.componentReplacement=null;
      await loadCurrentOrderBlingPreview(false);
      paintOrderDetail();
      loadOrders();
      toast('Item da cesta substituído · valor mantido');
    }catch(e){
      toast(errorMessage(e.message));
      if(btn){btn.disabled=false;btn.textContent='Usar'}
    }
  }

  function customerOptions(current){
    return state.customers.map(c=>'<option value="'+esc(c.id)+'" '+(c.id===current?'selected':'')+'>'+esc(c.display_name||'Sem nome')+(c.phone?' · '+esc(formatPhone(c.phone)):'')+(c.cpf?' · CPF '+esc(formatCpf(c.cpf)):'')+'</option>').join('');
  }
  function setOrderDeliveryField(id,value){
    const el=$(id);if(el)el.value=value??'';
  }
  function applySelectedCustomerToDelivery(){
    const id=$('#orderCustomer')?.value||'';
    const customer=state.customers.find(c=>c.id===id);
    if(!customer)return;
    const a=customer.address||{};
    setOrderDeliveryField('#orderDeliveryName',customer.display_name||'');
    setOrderDeliveryField('#orderDeliveryPhone',formatPhone(customer.phone||''));
    setOrderDeliveryField('#orderDeliveryPostalCode',a.postal_code||'');
    setOrderDeliveryField('#orderDeliveryStreet',a.street||'');
    setOrderDeliveryField('#orderDeliveryNumber',a.number||'');
    setOrderDeliveryField('#orderDeliveryDistrict',a.district||'');
    setOrderDeliveryField('#orderDeliveryComplement',a.complement||'');
    setOrderDeliveryField('#orderDeliveryCity',a.city||'Cuiabá');
    setOrderDeliveryField('#orderDeliveryState',a.state||'MT');
    setOrderDeliveryField('#orderDeliveryRawText',a.raw_text||'');
    toast('Dados de entrega preenchidos pelo cliente selecionado');
  }
  function mergeOrderCustomerResults(rows,currentId){
    const current=state.customers.find(c=>c.id===currentId)||null;
    const map=new Map();
    if(current)map.set(current.id,current);
    for(const c of rows||[])if(c?.id)map.set(c.id,c);
    state.customers=[...map.values()];
  }
  function scheduleOrderCustomerSearch(value){
    clearTimeout(state.orderCustomerSearchTimer);
    const q=String(value||'').trim();
    const hint=$('#orderCustomerSearchHint');
    if(q.length<2){
      if(hint)hint.textContent='Digite pelo menos 2 caracteres. A busca consulta a base oficial.';
      return;
    }
    if(hint)hint.textContent='Buscando…';
    state.orderCustomerSearchTimer=setTimeout(()=>searchOrderCustomers(q),250);
  }
  async function searchOrderCustomers(q){
    const select=$('#orderCustomer');if(!select)return;
    const selectedId=select.value;
    const hint=$('#orderCustomerSearchHint');
    try{
      const data=await customerApi('vitrine_customers_list',{q,limit:30});
      mergeOrderCustomerResults(data.customers||[],selectedId);
      select.innerHTML='<option value="">Sem cliente vinculado</option>'+customerOptions(selectedId);
      if(selectedId)select.value=selectedId;
      if(hint)hint.textContent=(data.customers||[]).length+' cliente(s) encontrado(s). Selecione acima.';
    }catch(e){
      if(hint)hint.textContent='Não consegui buscar agora. Tente novamente.';
    }
  }
  function canonicalOrderPayment(value){
    const raw=String(value||'').trim(),key=normalize(raw);
    const map={pix:'pix',dinheiro:'cash',cash:'cash','cartao de credito':'credit_card',credit:'credit_card',credit_card:'credit_card','cartao alimentacao':'food_card','cartao alimentacao/refeicao':'food_card',food_card:'food_card','cartao refeicao':'meal_card',meal_card:'meal_card'};
    return map[key]||map[raw]||'';
  }
  function paymentOptions(current){
    const selected=canonicalOrderPayment(current);
    const standard=[['pix','PIX'],['cash','Dinheiro'],['credit_card','Cartão de crédito'],['food_card','Cartão alimentação'],['meal_card','Cartão refeição']];
    return standard.map(([value,label])=>'<option value="'+value+'" '+(value===selected?'selected':'')+'>'+esc(label)+'</option>').join('');
  }
  function currentOrderEditablePayload(status){
    const order=state.currentOrder?.order||{};
    const currentCustomer=state.currentOrder?.customer||{};
    const currentCustomerId=currentCustomer.source_customer_id||order.delivery_address_snapshot?.source_customer_id||order.customer_id||'';
    const id=order.id;
    const selectedId=$('#orderCustomer')?.value||'';
    const selectedCustomer=state.customers.find(c=>c.id===selectedId)||null;
    const payload={id,payment_method:$('#orderPayment')?.value||''};
    if(selectedCustomer)payload.customer_snapshot=selectedCustomer;
    else if(!currentCustomerId)payload.customer_snapshot=null;
    if($('#orderDeliveryStreet'))payload.delivery_address={
      customer_name:$('#orderDeliveryName')?.value||'',
      phone:$('#orderDeliveryPhone')?.value||'',
      postal_code:$('#orderDeliveryPostalCode')?.value||'',
      street:$('#orderDeliveryStreet')?.value||'',
      number:$('#orderDeliveryNumber')?.value||'',
      district:$('#orderDeliveryDistrict')?.value||'',
      complement:$('#orderDeliveryComplement')?.value||'',
      city:$('#orderDeliveryCity')?.value||'',
      state:$('#orderDeliveryState')?.value||'',
      raw_text:$('#orderDeliveryRawText')?.value||''
    };
    if(status)payload.status=status;
    return payload;
  }
  async function persistCurrentOrder(status,extra={}){
    const payload={...currentOrderEditablePayload(status),...(extra&&typeof extra==='object'?extra:{})};
    await api('order_update',{},{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const fresh=await api('order',{id:payload.id});state.currentOrder=fresh;
    await loadCurrentOrderFiscal(false);
    await loadCurrentOrderBlingPreview(false);
    return fresh;
  }
  async function advanceCurrentOrder(next){
    const btn=$('#advanceOrder');if(btn){btn.disabled=true;btn.textContent='Atualizando…'}
    try{
      await persistCurrentOrder(next);
      paintOrderDetail();loadOrders();
      toast('Pedido atualizado · '+orderNextAction(state.currentOrder.order));
    }catch(e){
      toast(errorMessage(e.message));
      if(btn){btn.disabled=false;btn.textContent='Tentar novamente'}
    }
  }
  async function cancelCurrentOrder(){
    const linked=state.currentOrder?.bling_link?.linked===true;
    const choice=prompt(
      'Motivo do cancelamento:\n\n1 - Cliente desistiu\n2 - Produto indisponível\n3 - Endereço / área de entrega\n4 - Pedido duplicado\n5 - Problema de pagamento\n6 - Erro no pedido\n7 - Outro\n\nDigite o número ou escreva o motivo:'
    );
    if(choice===null)return;
    const value=String(choice||'').trim();
    const reasons={
      '1':'Cliente desistiu',
      '2':'Produto indisponível',
      '3':'Endereço / área de entrega',
      '4':'Pedido duplicado',
      '5':'Problema de pagamento',
      '6':'Erro no pedido',
      '7':'Outro'
    };
    const reason=reasons[value]||value;
    if(!reason){toast('Informe o motivo do cancelamento');return}
    const noteInput=prompt('Observação opcional sobre o cancelamento:', '');
    if(noteInput===null)return;
    const note=String(noteInput||'').trim();
    const message=linked
      ? 'Cancelar este pedido por "'+reason+'"?\n\nO estoque reservado será devolvido quando aplicável. Como o pedido já está vinculado ao Bling, qualquer situação que não puder ser atualizada automaticamente ficará registrada para revisão.'
      : 'Cancelar este pedido por "'+reason+'"? O estoque reservado será devolvido quando aplicável.';
    if(!confirm(message))return;
    try{
      await persistCurrentOrder('cancelled',{cancellation_reason:reason,cancellation_note:note});
      paintOrderDetail();loadOrders();
      toast(linked?'Pedido cancelado · Bling será conferido':'Pedido cancelado');
    }catch(e){toast(errorMessage(e.message))}
  }
  async function saveOrder(){
    const btn=$('#saveOrder');btn.disabled=true;btn.textContent='Salvando…';
    try{
      await persistCurrentOrder();
      paintOrderDetail();toast('Dados do pedido salvos');loadOrders();
    }catch(e){toast(errorMessage(e.message));btn.disabled=false;btn.textContent='Salvar dados'}
  }

  function customerSummary(c,snapshot){
    const a=snapshot||c?.address||{};
    if(!c?.id&&!snapshot)return '<span class="muted">Cliente ainda não vinculado. Cadastre em Clientes e selecione acima.</span>';
    const address=[a.street,a.number,a.complement,a.district,a.city,a.state].filter(Boolean).join(', ')||a.raw_text||'Endereço não informado';
    return '<strong>'+esc(c.display_name||a.recipient_name||'Cliente')+'</strong><br>'+
      (c.phone?'Telefone: '+esc(formatPhone(c.phone))+'<br>':'')+
      (c.cpf?'CPF: '+esc(formatCpf(c.cpf))+'<br>':'')+
      (c.email?'E-mail: '+esc(c.email)+'<br>':'')+
      'Endereço: '+esc(address);
  }

  function separationItems(detail){
    const map=new Map();
    const add=(key,name,qty,image,gondola,shelf,gtin='',prefix='')=>{
      const n=Number(qty||0);if(n<=0)return;
      const k=String(key||name)+'|'+prefix;const old=map.get(k);
      if(old)old.quantity+=n;
      else map.set(k,{name:(prefix?prefix+' · ':'')+(name||'Produto'),quantity:n,image_url:image||'/img/logoantonia5.png',gondola_number:gondola??null,shelf_label:String(shelf||'').trim()||null,gtin:String(gtin||'').replace(/\D/g,'')});
    };
    for(const item of detail?.items||[]){
      if(item?.item_kind==='basket'){
        for(const c of item.components||[]){
          const m=c?.metadata||{},loose=Number(m.loose_quantity??c.quantity??0),preassembled=Number(m.preassembled_units||0);
          if(loose<=0)continue;
          add(c.product_id||c.id||c.name_snapshot,c.name_snapshot,loose,c.image_url,c.gondola_number,c.shelf_label,c.gtin,preassembled>0?'EXTRA':'MONTAR');
        }
        continue;
      }
      add(item.product_id||item.id||item.name_snapshot,item.name_snapshot,item.quantity,item.image_url,item.gondola_number,item.shelf_label,item.gtin,'');
    }
    return [...map.values()].sort((a,b)=>{
      const ga=Number.isFinite(Number(a.gondola_number))?Number(a.gondola_number):999999,gb=Number.isFinite(Number(b.gondola_number))?Number(b.gondola_number):999999;
      return ga-gb||String(a.shelf_label||'').localeCompare(String(b.shelf_label||''),'pt-BR',{numeric:true})||String(a.name||'').localeCompare(String(b.name||''),'pt-BR');
    });
  }
  function separationKitRefs(detail){
    const out=[];
    for(const plan of detail?.checkout_separation_plan||[]){
      const qty=Number(plan?.quantity||1),food=plan?.food||{},hygiene=plan?.hygiene||{};
      if(food.mode==='lot'){
        const codes=[food.short_code,hygiene.mode==='lot'?hygiene.short_code:null].filter(Boolean).join(' + ');
        out.push({label:'CESTA ORIGINAL · permanece original',code:codes||'LOTE',quantity:qty,basket:plan.basket_name||'Cesta'});
      }
    }
    return out;
  }
  function separationTicketBody(detail){
    const o=detail.order,items=separationItems(detail),kitRefs=separationKitRefs(detail),groups=[];
    for(const item of items){
      const key=item.gondola_number??'none';
      let group=groups.find(g=>g.key===key);
      if(!group){group={key,label:item.gondola_number?'GÔNDOLA '+item.gondola_number:'SEM GÔNDOLA',shelves:[]};groups.push(group)}
      const shelfKey=item.shelf_label||'none';
      let shelf=group.shelves.find(s=>s.key===shelfKey);
      if(!shelf){shelf={key:shelfKey,label:item.shelf_label?'PRATELEIRA '+item.shelf_label:'SEM PRATELEIRA',items:[]};group.shelves.push(shelf)}
      shelf.items.push(item);
    }
    const kitBlock=kitRefs.length?'<div class="block"><b>PEGAR PRONTO</b>'+kitRefs.map(x=>'<div style="border:2px solid #000;padding:1.5mm;margin:1mm 0;font-size:13px;font-weight:900">'+esc(fmtQty(x.quantity))+'× '+esc(x.label)+' · '+esc(x.code)+(x.basket?'<div style="font-size:8px;font-weight:600;margin-top:.5mm">'+esc(x.basket)+'</div>':'')+'</div>').join('')+'</div>':'';
    const sections=groups.map(g=>'<div class="gondola-title">'+esc(g.label)+'</div>'+g.shelves.map(s=>'<div class="shelf-title-print">'+esc(s.label)+'</div><div class="sep-grid">'+s.items.map(i=>'<div class="sep-card"><img src="'+esc(i.image_url||'/img/logoantonia5.png')+'" alt=""><div class="sep-name">'+esc(i.name)+'</div>'+(i.gtin?'<div class="sep-ean">EAN '+esc(i.gtin)+'</div>':'<div class="sep-ean missing">SEM EAN</div>')+'<div class="sep-qty">'+esc(fmtQty(i.quantity))+'×</div></div>').join('')+'</div>').join('')).join('');
    const units=items.reduce((sum,i)=>sum+Number(i.quantity||0),0),kitUnits=kitRefs.reduce((sum,x)=>sum+Number(x.quantity||0),0);
    return '<div class="ticket-head"><strong>DONA ANTÔNIA</strong><span>SEPARAÇÃO · Pedido #'+esc(orderDisplayCode(o))+'</span><small>'+esc(dateTime(o.created_at))+'</small></div>'+kitBlock+sections+'<div class="foot">'+kitRefs.length+' referência(s) pronta(s) · '+items.length+' produto(s) avulso(s) · '+esc(fmtQty(kitUnits+units))+' unidades/volumes</div>';
  }
  async function markPickingPresented(orderId){
    try{await api('ops_print_presented',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:orderId})})}catch{}
  }
  function printSeparationOnly(detail,existingWindow=null){
    const o=detail.order,w=existingWindow||window.open('','_blank','width=420,height=700');
    if(!w){toast('Libere pop-ups para imprimir');return false}
    openPrint('Separação #'+orderDisplayCode(o),separationTicketBody(detail),'separation',w);
    markPickingPresented(o.id);
    return true;
  }
  async function startSeparationFlow(detail,existingWindow=null){
    const o=detail.order,w=existingWindow||window.open('','_blank','width=420,height=700');
    if(!w){toast('Libere pop-ups para imprimir');return}
    try{
      w.document.open();
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Preparando separação</title></head><body style="font:16px system-ui;padding:30px;text-align:center"><strong>Preparando separação…</strong><p>Validando pedido e estoque antes de imprimir.</p></body></html>');
      w.document.close();
      await persistCurrentOrder();
      const blingReady=await validateBlingBeforeSeparation(o.id);
      if(!blingReady){try{w.close()}catch{};return}
      await api('order_update',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:o.id,status:'processing',operator:currentOperator()||'Operação'})});
      printSeparationOnly(detail,w);
      toast('Separação iniciada · estoque e status atualizados juntos');
      const fresh=await api('order',{id:o.id});state.currentOrder=fresh;
      await loadCurrentOrderFiscal(false);
      paintOrderDetail();loadOrders();
    }catch(e){try{w.close()}catch{};toast(errorMessage(e.message))}
  }
  function printDelivery(detail){
    const o=detail.order,c=detail.customer||{},a=o.delivery_address_snapshot||c.address||{},payment=o.payment_method_snapshot?.label||o.payment_method_snapshot?.method||'—';
    const products=separationItems(detail).map(i=>'<div class="delivery-item"><b>'+esc(fmtQty(i.quantity))+'×</b><span>'+esc(i.name)+'</span></div>').join('');
    const address=[a.street,a.number,a.complement,a.district,a.city,a.state].filter(Boolean).join(', ')||a.raw_text||'NÃO INFORMADO';
    const body='<div class="ticket-head"><strong>DONA ANTÔNIA</strong><span>ENTREGA · Pedido #'+esc(orderDisplayCode(o))+'</span><small>'+esc(dateTime(o.created_at))+'</small></div>'+
      '<div class="block"><b>CLIENTE</b><div>'+esc(c.display_name||a.recipient_name||'NÃO VINCULADO')+'</div>'+(c.phone?'<div>Tel: '+esc(formatPhone(c.phone))+'</div>':'')+(c.cpf?'<div>CPF: '+esc(formatCpf(c.cpf))+'</div>':'')+(c.email?'<div>E-mail: '+esc(c.email)+'</div>':'')+'</div>'+
      '<div class="block"><b>ENDEREÇO</b><div>'+esc(address)+'</div>'+(a.postal_code?'<div>CEP: '+esc(a.postal_code)+'</div>':'')+'</div>'+
      '<div class="block"><b>PAGAMENTO</b><div>'+esc(payment)+'</div><div>Status: '+esc(o.status||'')+'</div><div class="big-total">TOTAL: '+money(o.total_cents)+'</div></div>'+
      '<div class="block"><b>PRODUTOS</b>'+products+'</div>'+
      '<div class="block lines"><div>Observações:</div><br><br><div>Recebido por: __________________</div></div>';
    openPrint('Entrega #'+orderDisplayCode(o),body,'delivery');
  }
  function openPrint(title,body,mode,existingWindow=null){
    const w=existingWindow||window.open('','_blank','width=420,height=700');
    if(!w){toast('Libere pop-ups para imprimir');return}
    const css='@page{size:85mm auto;margin:2mm}*{box-sizing:border-box}html,body{margin:0;padding:0;width:81mm;background:#fff;color:#000;font-family:Arial,sans-serif}body{font-size:10px}.ticket-head{text-align:center;border-bottom:1px dashed #000;padding:1mm 0 2mm;margin-bottom:2mm}.ticket-head strong{display:block;font-size:15px}.ticket-head span{display:block;font-weight:700;font-size:11px;margin-top:1mm}.ticket-head small{display:block;margin-top:.6mm}.gondola-title{font-weight:900;font-size:13px;border:2px solid #000;padding:1.5mm;margin:2mm 0 1.5mm;text-align:center}.shelf-title-print{font-weight:800;font-size:10px;border-bottom:1px solid #000;padding:1mm 0 .8mm;margin:1.5mm 0 1mm}.sep-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.8mm}.sep-card{border:1px solid #000;padding:1mm;min-height:48mm;display:flex;flex-direction:column;align-items:center;text-align:center;break-inside:avoid}.sep-card img{width:32mm;height:26mm;object-fit:contain;filter:grayscale(1);margin:auto}.sep-name{font-weight:700;font-size:9px;line-height:1.15;min-height:9mm}.sep-ean{font:700 8px monospace;line-height:1.2;margin:.6mm 0;word-break:break-all}.sep-ean.missing{font-family:Arial,sans-serif;font-weight:700}.sep-qty{font-weight:900;font-size:20px;line-height:1}.foot{text-align:center;border-top:1px dashed #000;margin-top:2mm;padding-top:1.5mm}.block{border-bottom:1px dashed #000;padding:2mm 0}.block>b{display:block;font-size:10px;margin-bottom:1mm}.big-total{font-size:15px;font-weight:900;margin-top:1mm}.delivery-item{display:grid;grid-template-columns:9mm 1fr;gap:1mm;padding:1mm 0;border-bottom:1px dotted #777}.delivery-item b{font-size:11px}.lines{min-height:28mm}@media print{button{display:none!important}}';
    w.document.open();
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>'+css+'</style></head><body class="'+esc(mode)+'">'+body+'<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),350));<\/script></body></html>');
    w.document.close();
  }

  function orderDisplayCode(o){const code=String(o?.public_code||o?.public_order_code||'').trim().toUpperCase();return /^[A-Z]{2}\d{3}$/.test(code)?code:'—'}
  function phoneDigits(v){
    let d=String(v||'').replace(/\D/g,'');
    if((d.length===10||d.length===11)&&!d.startsWith('55'))d='55'+d;
    return d;
  }
  function formatPhone(v){
    const d=String(v||'').replace(/\D/g,'');
    const local=d.startsWith('55')?d.slice(2):d;
    if(local.length===11)return '('+local.slice(0,2)+') '+local.slice(2,7)+'-'+local.slice(7);
    if(local.length===10)return '('+local.slice(0,2)+') '+local.slice(2,6)+'-'+local.slice(6);
    return v||'';
  }
  function formatCpf(v){const d=String(v||'').replace(/\D/g,'');return d.length===11?d.slice(0,3)+'.'+d.slice(3,6)+'.'+d.slice(6,9)+'-'+d.slice(9):v||''}
  function errorMessage(code){
    if(/^bling_reauthentication_required$|^oauth_http_(400|401|403)/.test(String(code||'')))return 'Conexão com Bling expirada. Clique em Reconectar Bling na tela de Produtos e autorize novamente. Estoque NÃO foi salvo.';
    const map={name_required:'Informe o nome.',phone_already_in_use:'Telefone já pertence a outro cliente.',cpf_already_in_use:'CPF já pertence a outro cliente.',email_already_in_use:'E-mail já pertence a outro cliente.',duplicate_value:'Código, EAN ou outro valor já está em uso.',gtin_already_exists:'Este EAN já pertence a outro produto.',sku_already_exists:'Este SKU já pertence a outro produto.',duplicate_source_not_found:'O produto original não foi encontrado.',invalid_ean:'EAN inválido.',product_not_found:'Produto não encontrado para este EAN.',duplicate_ean:'Há mais de um produto com este EAN.',invalid_quantity:'Quantidade inválida.',invalid_expiration_date:'Data de validade inválida.',lot_tracking_requires_lot:'Cadastre pelo menos um lote antes de ativar o FEFO.',lot_tracking_has_unquantified_lot:'Todos os lotes precisam ter quantidade informada.',lot_tracking_bling_physical_missing:'Ainda não consegui conferir o estoque físico deste produto no Bling.',lot_tracking_physical_mismatch:'A soma dos lotes ainda não confere com o estoque físico do Bling.',receipt_lots_required:'Defina e salve as validades/lotes de todos os itens antes de preparar a entrada.',expiration_lot_required:'Informe ao menos uma validade para este produto.',expiration_date_required:'Informe a data de validade.',lot_quantity_required:'Informe a quantidade deste lote.',lot_quantity_mismatch:'A soma das quantidades dos lotes precisa ser igual à quantidade recebida.',all_receipt_items_required:'Revise os lotes de todos os itens da nota.',product_inactive:'Produto inativo não pode ter oferta ativa.',product_expired:'Produto vencido não pode ter oferta ativa.',invalid_offer_price:'O valor da oferta deve ser menor que o preço normal.',invalid_offer_duration:'Validade da oferta inválida.',invalid_gondola:'Número de gôndola inválido.',invalid_product:'Produto inválido.',gondola_not_found:'Gôndola não encontrada.',gondola_clear_confirmation_required:'Confirme a limpeza da gôndola novamente.',order_cancelled:'Pedido cancelado não pode ser separado.',order_not_ready_for_separation:'Confirme o pedido antes de iniciar a separação.',invalid_component_replacement:'Não consegui identificar a troca.',order_component_edit_requires_created:'Só é possível substituir item enquanto o pedido está Novo.',order_stock_reserved_edit_forbidden:'Este pedido já tem estoque reservado. Cancele/reabra com cuidado antes de alterar itens.',component_edit_requires_basket:'Esta troca é permitida apenas dentro de uma cesta.',order_component_not_found:'Item da cesta não encontrado.',replacement_same_product:'Escolha um produto diferente.',replacement_duplicate_component:'Esse produto já existe nesta cesta.',replacement_product_unavailable:'O produto escolhido não está disponível.',replacement_insufficient_stock:'O produto escolhido também não tem estoque livre suficiente.',invalid_component_quantity:'Quantidade do item da cesta inválida.',insufficient_stock:'Estoque disponível insuficiente para confirmar este pedido. Faça um balanço ou ajuste o estoque.',insufficient_physical_stock:'Estoque físico insuficiente para separar este pedido. Faça um balanço ou ajuste o pedido.',stock_reservation_released:'A reserva deste pedido foi liberada. Reabra o pedido antes de separar.',stock_reservation_not_found:'Não encontrei a reserva de estoque deste pedido.',stock_consume_failed:'Não consegui dar baixa no estoque.',ean_not_in_order:'Este produto não pertence ao pedido.',checked_quantity_exceeds_expected:'Esta quantidade já foi totalmente conferida.',duplicate_ean_in_order:'EAN duplicado no pedido. Revise o cadastro.',check_incomplete:'Ainda faltam produtos para conferir.',invalid_status_transition:'Este pedido precisa seguir a ordem normal das etapas.',stock_not_consumed_for_status:'Inicie ou regularize a separação antes de avançar.',order_operational_data_incomplete:'Complete cliente, endereço e pagamento antes de avançar.',delivery_payment_required:'Registre o pagamento recebido antes de confirmar a entrega.',delivery_payment_mismatch:'O pagamento registrado não confere com o total do pedido.',legacy_order_read_only:'Este pedido é anterior ao corte operacional e ficou somente leitura.',fiscal_human_confirmation_required:'Confirme explicitamente a emissão fiscal.',fiscal_canary_not_armed_for_order:'Este pedido não está armado para emissão fiscal.',fiscal_canary_arm_race:'O canário fiscal mudou durante a operação. Atualize e tente novamente.',fiscal_human_issue_not_enabled:'A emissão fiscal humana ainda não está habilitada.',fiscal_operation_in_progress:'Outra emissão fiscal está em andamento. Aguarde e atualize.',fiscal_operation_lock_lost:'A trava de emissão fiscal mudou. Atualize antes de tentar novamente.',fiscal_dispatch_not_eligible:'O pedido ainda não está apto para emissão fiscal.',fiscal_generation_gate_closed:'A geração da NF-e está bloqueada pelo gate fiscal.',fiscal_generation_already_attempted:'A geração já foi tentada. O sistema não repetirá automaticamente.',invoice_generation_failed:'O Bling recusou a geração da NF-e. Revise os dados fiscais.',invoice_generation_uncertain:'O resultado da geração ficou incerto. O sistema não fará nova tentativa automática.',invoice_authorization_failed:'A NF-e foi gerada, mas a autorização precisa de revisão.',fiscal_document_not_authorized:'O DANFE só fica disponível depois da autorização da NF-e.',fiscal_document_access_key_missing:'A NF-e está autorizada, mas a chave de acesso ainda não foi localizada.',fiscal_document_download_failed:'Não consegui baixar o DANFE do Bling agora.',empty_danfe_document:'O Bling retornou um DANFE vazio.',invalid_danfe_pdf:'O documento retornado pelo Bling não é um PDF válido.',danfe_document_too_large:'O DANFE retornado é maior que o limite de segurança.',fiscal_document_empty:'O DANFE retornado está vazio.',bling_finance_scope_missing:'A autorização atual do Bling não liberou o módulo financeiro.',bling_finance_unavailable:'Não consegui consultar o financeiro do Bling agora.',fiscal_canary_failed:'O canário fiscal foi interrompido com segurança.',stale_order_version:'A tela mudou desde a última leitura. Atualizei e tentei salvar novamente.',order_version_conflict:'A tela mudou desde a última leitura. Atualize e tente novamente.',separator_assignment_changed:'O responsável pela separação foi alterado.',separator_required:'Escolha quem está separando este pedido.',invalid_separator:'Separador inválido. Atualize a tela.',separation_incomplete:'Ainda existem produtos pendentes na separação.',bling_approval_required_before_separation:'O pedido ainda precisa ser liberado no Bling antes de concluir a separação.'};
    return map[code]||'Não consegui salvar agora.';
  }

  const scanner={buffer:'',timer:null};
  document.addEventListener('keydown',e=>{
    if(!['balance','gondolas'].includes(state.tab))return;
    const tag=e.target?.tagName||'';
    if(['INPUT','TEXTAREA','SELECT'].includes(tag))return;
    if(/^\d$/.test(e.key)){
      scanner.buffer+=e.key;
      clearTimeout(scanner.timer);
      scanner.timer=setTimeout(()=>{scanner.buffer=''},900);
      e.preventDefault();
      return;
    }
    if(e.key==='Enter'||e.key==='Tab'){
      const ean=scanner.buffer;scanner.buffer='';clearTimeout(scanner.timer);
      if(ean.length>=4){
        if(state.tab==='balance')handleBalanceScan(ean);
        if(state.tab==='gondolas')handleGondolaScan(ean);
      }
      e.preventDefault();
    }
  });

  $('#closeEditor').onclick=()=>$('#editor').close();
  $('#editor').addEventListener('click',e=>{if(e.target===$('#editor'))$('#editor').close()});

  window.DonaAntoniaAdminBridge={
    api,
    token:adminStepUp,
    operator:requireOperator,
    toast,
    refresh:renderBaskets,
    errorMessage
  };

  async function start(){
    const params=new URLSearchParams(location.search),sharedSeparationId=params.get('separacao')||'',pickerMode=params.get('montar')==='1';
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if(pickerMode){
      if(!uuid.test(sharedSeparationId)){location.replace('/montar/?erro=pedido_invalido');return}
      try{
        // Verify current membership server-side. Do not show other Admin orders.
        const allowed=await manualQueueRpc('list');
        if(!Array.isArray(allowed.order_ids)||!allowed.order_ids.some(x=>String(x)===sharedSeparationId)){
          location.replace('/montar/?erro=pedido_indisponivel');return;
        }
        // Load only this one order, preserving the exact customer/status checks used by
        // the canonical separation sheet, without rendering the full Admin order list.
        const detail=await api('order',{id:sharedSeparationId});
        const selectedOrder=detail?.order||null;
        if(!selectedOrder||String(selectedOrder.id)!==sharedSeparationId){
          location.replace('/montar/?erro=pedido_indisponivel');return;
        }
        if(orderCustomerDataPending(selectedOrder)){
          location.replace('/montar/?erro=dados_pendentes');return;
        }
        if(!orderV3Milestones(selectedOrder).confirmed||orderV3Milestones(selectedOrder).separated||
            orderV3Milestones(selectedOrder).cancelled){
          location.replace('/montar/?erro=pedido_indisponivel');return;
        }
        state.orders=[selectedOrder];
        await openOrderSeparationSheet(sharedSeparationId);
        const sheet=document.querySelector('.orders-bottom-sheet-backdrop');
        if(!sheet){location.replace('/montar/?erro=vitrine_indisponivel');return}
        const close=sheet.querySelector('.orders-sheet-close');
        if(close)close.onclick=()=>location.replace('/montar/');
        sheet.addEventListener('click',e=>{
          if(e.target===sheet){e.stopImmediatePropagation();location.replace('/montar/')}
        },true);
      }catch(error){
        console.error('montar_existing_vitrine',error);
        location.replace('/montar/?erro=acesso');
      }
      return;
    }
    // Abre o cadastro completo em nova aba a partir dos mini cards de Cestas Molde.
    const directProductId=params.get('editar_produto')||'';
    if(directProductId){
      if(!uuid.test(directProductId)){setTab('products');toast('Link de produto inválido');return}
      setTab('products');
      await openProductEditor({id:directProductId});
      history.replaceState({},'',location.pathname+location.hash);
      return;
    }
    // Link direto vindo do Atendimento: exibir pedido no modal para revisão e confirmação humana.
    const directOrderId=params.get('pedido')||'';
    if(directOrderId){
      if(!uuid.test(directOrderId)){setTab('today');toast('Link de pedido inválido');return}
      state.orderStatusTab='received';
      await setTab('orders');
      await openOrder(directOrderId);
      history.replaceState({},'',location.pathname+location.hash);
      return;
    }
    if(!uuid.test(sharedSeparationId)){setTab('today');return}
    await setTab('orders');
    await openOrderSeparationSheet(sharedSeparationId);
    history.replaceState({},'',location.pathname+location.hash);
  }
  start();
})();
