
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
  const state={tab:'attendance',orderFilter:'all',orderStatusTab:'new',orderCounts:{},orderOffset:0,orderHasMore:false,orderRequestSequence:0,orderSearchTimer:null,orderIssueFilter:'all',orderQuery:'',orderCustomerSearchTimer:null,orderCustomerSuggestion:null,orderFocusIssue:null,componentReplacement:null,fiscalByOrder:{},products:[],productOffset:0,productNext:null,productSort:'',baskets:[],basketSummary:null,basketDetail:null,basketLotDraft:null,basketKits:[],basketKitSummary:null,basketKitDetail:null,basketKitLotDraft:null,basketItemSelectedProduct:null,basketItemSearchTimer:null,productFilters:{category:'',subcategory:'',active:'',sourceSystem:'',basketKit:'',lotStatus:''},productFacets:{categories:[],subcategories:[]},productFacetsCache:{},expiryProducts:[],expirySummary:null,expiredDeactivated:[],expiryAlerts:null,productAudit:[],customers:[],customerProfile:null,customerHistoryOffset:0,orders:[],currentOrder:null,currentOrderBlingPreview:null,currentOrderFiscal:null,balanceProduct:null,balanceQty:'',balanceHistory:[],balanceMode:'count',balanceSubtab:'scanner',balanceGondola:'',balanceValidity:'',balanceLotId:'',balanceNeedsPhoto:false,balanceReadiness:null,balanceCameraStream:null,balanceCameraDetector:null,balanceCameraRunning:false,balanceLastCameraEan:'',balanceLastCameraAt:0,balanceManualSearchTimer:null,inventorySheetScan:null,inventorySheetBusy:false,inventorySheetPreviewUrl:'',inventorySheetBatches:[],inventorySheetOcrWorkers:null,inventorySheetQueue:[],inventorySheetProcessing:false,inventorySheetPendingManual:[],inventorySheetPendingSummary:{count:0},inventoryIncidentType:'damage',inventoryIncidentNote:'',inventoryIncidents:[],stockShortages:[],stockShortageSummary:null,gondolas:[],gondola:null,gondolaProducts:[],gondolaCreateNumber:'',gondolaMode:'assign',gondolaCountProduct:null,gondolaCountQty:'',bling:null,blingProbe:null,financeAuthPromise:null,purchaseXml:null,purchaseXmlDetail:null,purchaseExpandedId:null,purchaseDetailCache:{},purchaseCatalogQueue:null,purchaseCatalogFilter:'pending',purchaseCatalogSearch:'',purchaseAdvancedOpen:false,purchaseAdvancedLoaded:false,purchaseAdvancedLoading:false,purchaseAdvancedError:'',purchaseBlingCompareOpen:false,purchaseBlingCompareLoaded:false,purchaseBlingCompareLoading:false,purchaseBlingCompareError:'',purchaseBlingCompareKey:'',opsSummary:null,opsAttention:null,opsShadow:null,opsPrintQueue:null,opsPapoAi:null,opsTimeline:[],manualSale:null,};
  function toast(msg){
    const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1800);
  }
  function adminSlug(v){return normalize(v).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)}
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
    const allowedTabs=new Set(['attendance','orders','products','customers','ana','baskets','quotes','bling','balance']);
    if(!allowedTabs.has(tab))tab='attendance';
    if(tab!=='products')disconnectProductScrollObserver();
    if(tab!=='orders')document.body.classList.remove('orders-tab-active');
    state.tab=tab;
    try{
      sessionStorage.setItem('da_admin_current_tab_v1',tab);
      const hash='#'+encodeURIComponent(tab);
      if(location.hash!==hash)history.replaceState(history.state,'',location.pathname+location.search+hash);
    }catch{}
    document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    syncNavGroups();
    closeNavMenus();
    if(tab==='attendance')renderAttendance();
    if(tab==='products')renderProducts();
    if(tab==='baskets')renderBaskets();
    if(tab==='quotes')renderQuotes();
    if(tab==='customers')renderCustomers();
    if(tab==='ana')import('/vitrine/admin/ana/ana-admin.js?v=1').then(module=>module.mountAnaAdmin($('#content'))).catch(error=>{$('#content').innerHTML='<section class="panel"><h1>ANA</h1><p>Não foi possível abrir a gestão da ANA.</p></section>';console.error('admin_ana_load',error)});
    if(tab==='bling')renderBling();
    if(tab==='balance')renderBalance();
    if(tab==='orders')return renderOrders();
  }
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));

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
      await loadBlingStatus();
      return data;
    }catch(e){
      toast(errorMessage(e.message));
      if(btn){btn.disabled=false;btn.textContent='Testar novamente'}
    }
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
      if(fresh?.papoai){state.opsPapoAi=fresh.papoai;const host=$('#papoAiBridgeSlot');if(host){host.innerHTML=renderPapoAiBridgePanel();host.querySelector('[data-papoai-create-link]')?.addEventListener('click',createPapoAiCatalogLink)}}
    }catch(e){toast(errorMessage(e.message))}
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
      if(state.tab==='orders')await renderOrders();else await setTab('orders');
      toast(action==='redelivery'?'Retorno revisado · liberado para reentrega':'Pedido cancelado · estoque íntegro restaurado · fiscal pendente');
      return data;
    }catch(e){toast(errorMessage(e.message));buttons.forEach(b=>b.disabled=false)}
  }
  async function loadFiscalForOrders(rows){
    const queue=(rows||[]).filter(o=>!state.fiscalByOrder[o.id]);
    let cursor=0;
    async function worker(){
      while(cursor<queue.length){
        const o=queue[cursor++];
        if(state.fiscalByOrder[o.id])continue;
        try{
          state.fiscalByOrder[o.id]=await api('order_fiscal_status',{}, {
            method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:o.id})
          });
        }catch(e){
          state.fiscalByOrder[o.id]={error:String(e?.message||'fiscal_unavailable')};
        }
      }
    }
    await Promise.all([worker(),worker(),worker()]);
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
  function clearFinanceSession(expectedToken=''){
    const current=financeSessionToken();
    if(expectedToken&&current&&current!==expectedToken)return false;
    sessionStorage.removeItem('da_finance_access_token_v1');
    return true;
  }
  async function adminStepUp(){return await financeStepUp()}
  async function financeStepUp(){
    const existing=financeSessionToken();
    if(existing)return existing;
    if(state.financeAuthPromise)return await state.financeAuthPromise;
    state.financeAuthPromise=(async()=>{
      try{
        const authRes=await fetch(FINANCE_AUTH_API,{
          method:'POST',
          headers:{'Content-Type':'application/json','apikey':FINANCE_PUBLIC_KEY},
          body:JSON.stringify({pin:'000000'}),
          cache:'no-store'
        });
        const auth=await authRes.json().catch(()=>({}));
        if(!authRes.ok||!auth?.ok)throw new Error(auth?.error||'admin_auto_auth_failed');
        const verifyRes=await fetch(FINANCE_VERIFY_API,{
          method:'POST',
          headers:{'Content-Type':'application/json','apikey':FINANCE_PUBLIC_KEY},
          body:JSON.stringify({token_hash:auth.token_hash,type:auth.verification_type||'email'}),
          cache:'no-store'
        });
        const verified=await verifyRes.json().catch(()=>({}));
        const token=String(verified?.access_token||'').trim();
        if(!verifyRes.ok||!token)throw new Error(verified?.msg||verified?.error_description||verified?.error||'admin_auto_session_failed');
        sessionStorage.setItem('da_finance_access_token_v1',token);
        return token;
      }finally{
        state.financeAuthPromise=null;
      }
    })();
    return await state.financeAuthPromise;
  }
  async function renderBaskets(){
    const host=$('#content');
    if(!window.DonaAntoniaBasketAdmin?.render){
      host.innerHTML='<div class="empty">O módulo de cestas não carregou. <button class="text" id="retryBasketModule" type="button">Tentar novamente</button></div>';
      $('#retryBasketModule')?.addEventListener('click',renderBaskets);
      return;
    }
    await window.DonaAntoniaBasketAdmin.render();
  }

  let productListGeneration=0,productAppendLoading=false;
  function disconnectProductScrollObserver(){productListGeneration++}

  async function renderProducts(q=''){
    disconnectProductScrollObserver();
    state.productFilters??={category:'',active:''};
    const content=$('#content');
    content.innerHTML='<div class="page-head"><div><h1>Produtos</h1><p>Nome, foto, preço, categoria e estoque.</p></div><button class="primary" id="newProduct" type="button">+ Produto</button></div>'+
      '<div class="toolbar product-toolbar"><input id="productSearch" type="search" placeholder="Buscar produto, SKU ou EAN"><select id="productCategory" aria-label="Categoria"><option value="">Todas as categorias</option></select><select id="productActive" aria-label="Status"><option value="">Todos</option><option value="true">Ativos</option><option value="false">Inativos</option></select><button class="secondary" id="productSearchBtn" type="button">Buscar</button></div>'+
      '<div class="panel" id="productsPanel"><div id="productRows"><div class="loading">Carregando…</div></div><div class="more" id="productMore"></div></div>';
    $('#newProduct').onclick=()=>openProductEditor();
    $('#productSearch').value=q;
    $('#productCategory').value=state.productFilters.category||'';
    $('#productActive').value=state.productFilters.active||'';
    await loadProductFacets();
    const search=()=>loadProducts($('#productSearch').value.trim());
    $('#productSearchBtn').onclick=search;
    $('#productSearch').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();search()}};
    $('#productCategory').onchange=event=>{state.productFilters.category=event.target.value;search()};
    $('#productActive').onchange=event=>{state.productFilters.active=event.target.value;search()};
    await search();
  }

  async function loadProductFacets(){
    try{
      const result=await api('product_facets',{category:state.productFilters.category||'',active:state.productFilters.active||''});
      const select=$('#productCategory');
      if(!select)return;
      const current=state.productFilters.category||'';
      select.innerHTML='<option value="">Todas as categorias</option>'+(result.categories||[]).map(item=>
        '<option value="'+esc(item.value)+'" '+(item.value===current?'selected':'')+'>'+esc(item.label)+'</option>').join('');
      select.value=current;
    }catch{toast('Não consegui carregar as categorias de produtos')}
  }

  function bindProductListActions(root){
    root.querySelectorAll('[data-edit-product]').forEach(button=>button.onclick=()=>
      openProductEditor(state.products.find(product=>String(product.id)===button.dataset.editProduct)));
  }

  async function loadProducts(q='',append=false){
    const host=$('#productRows'),more=$('#productMore');
    if(!host||!more||state.tab!=='products'||(append&&(productAppendLoading||state.productNext==null)))return;
    const generation=append?productListGeneration:++productListGeneration;
    if(!append){host.innerHTML='<div class="loading">Carregando produtos…</div>';more.innerHTML=''}
    else{productAppendLoading=true;more.textContent='Carregando…'}
    try{
      const data=await api('products',{q,category:state.productFilters.category||'',active:state.productFilters.active||'',offset:append?state.productNext:0,limit:30});
      if(generation!==productListGeneration||host!==$('#productRows')||state.tab!=='products')return;
      const products=Array.isArray(data.products)?data.products:[];
      state.products=append?[...(state.products||[]),...products]:products;
      state.productNext=products.length?(data.next_offset??null):null;
      const rows=products.map(productRow).join('');
      if(append)host.insertAdjacentHTML('beforeend',rows);else host.innerHTML=rows||'<div class="empty">Nenhum produto encontrado.</div>';
      bindProductListActions(host);
      if(state.productNext!=null){more.innerHTML='<button class="secondary" id="moreProducts" type="button">Carregar mais</button>';$('#moreProducts').onclick=()=>loadProducts(q,true)}
      else more.innerHTML='';
    }catch{
      if(generation!==productListGeneration||host!==$('#productRows')||state.tab!=='products')return;
      if(!append){host.innerHTML='<div class="empty">Erro ao carregar produtos. <button class="text" id="retryProducts" type="button">Tentar novamente</button></div>';$('#retryProducts').onclick=()=>loadProducts(q)}
      else{more.innerHTML='<button class="secondary" id="moreProducts" type="button">Tentar novamente</button>';$('#moreProducts').onclick=()=>loadProducts(q,true)}
    }finally{if(append)productAppendLoading=false}
  }

  function productRow(product){
    const active=product.active!==false;
    return '<article class="simple-product-row" data-product-id="'+esc(product.id)+'">'+
      '<img class="simple-product-image" src="'+esc(product.image_url||'/img/logoantonia5.png')+'" alt="" loading="lazy">'+
      '<div class="simple-product-info"><strong>'+esc(product.name||'Produto')+'</strong><small>'+esc(product.category||'Sem categoria')+(product.sku?' · SKU '+esc(product.sku):'')+(product.gtin?' · EAN '+esc(product.gtin):'')+'</small></div>'+
      '<div class="simple-product-price">'+money(product.sale_price_cents)+'<small>Estoque '+esc(fmtQty(product.stock_quantity||0))+'</small></div>'+
      '<span class="simple-product-status '+(active?'':'inactive')+'">'+(active?'Ativo':'Inativo')+'</span>'+
      '<button class="secondary" type="button" data-edit-product="'+esc(product.id)+'">Editar</button></article>';
  }
  async function openProductEditor(product=null){
    if(product?.id&&product?._detail_loaded!==true){
      $('#editorTitle').textContent='Editar produto';
      $('#editorBody').innerHTML='<div class="loading">Carregando produto…</div>';
      $('#editorActions').innerHTML='';
      const dialog=$('#editor');dialog.classList.add('product-editor-dialog');
      if(!dialog.open)dialog.showModal();
      try{const result=await api('product_detail',{id:product.id});return openProductEditor({...product,...(result.product||{}),_detail_loaded:true})}
      catch(error){$('#editorBody').innerHTML='<div class="empty">Não consegui carregar o produto. '+esc(errorMessage(error.message))+'</div>';return}
    }
    const dialog=$('#editor');
    $('#editorTitle').textContent=product?'Editar produto':'Novo produto';
    const price=(Number(product?.sale_price_cents||0)/100).toFixed(2).replace('.',',');
    const cost=(Number(product?.cost_cents||0)/100).toFixed(2).replace('.',',');
    $('#editorBody').innerHTML='<form id="productForm" class="form-grid">'+
      '<label class="span-2"><span>Nome *</span><input name="name" required maxlength="300" value="'+esc(product?.name||'')+'"></label>'+
      '<label><span>SKU</span><input name="sku" maxlength="120" value="'+esc(product?.sku||'')+'"></label>'+
      '<label><span>EAN / GTIN</span><input name="gtin" inputmode="numeric" value="'+esc(product?.gtin||'')+'"></label>'+
      '<label><span>Categoria</span><select name="category">'+categoryOptions(product?.category||'')+'</select></label>'+
      '<label><span>Marca</span><input name="brand" value="'+esc(product?.brand||'')+'"></label>'+
      '<label><span>Preço de venda</span><input name="price" inputmode="decimal" value="'+esc(price)+'" required></label>'+
      '<label><span>Custo interno</span><input name="cost" inputmode="decimal" value="'+esc(cost)+'"></label>'+
      '<label><span>Estoque</span><input name="stock" inputmode="decimal" value="'+esc(fmtQty(product?.stock_quantity||0))+'"></label>'+
      '<label class="check"><input name="active" type="checkbox" '+(product?.active!==false?'checked':'')+'><strong>Produto ativo</strong></label>'+
      '<div class="span-2 simple-product-image-editor"><img id="productImagePreview" src="'+esc(product?.image_url||'/img/logoantonia5.png')+'" alt="Foto do produto"><div><label><span>Imagem · URL</span><input name="image_url" value="'+esc(product?.image_url||'')+'"></label>'+(product?.id?'<input id="productImageFile" type="file" accept="image/jpeg,image/png,image/webp" hidden><button class="secondary" id="chooseProductImage" type="button">Enviar imagem</button>':'<small>Salve o produto para enviar uma imagem.</small>')+'</div></div>'+
      '<label class="span-2"><span>Descrição</span><textarea name="description" rows="4" maxlength="1000">'+esc(product?.description||'')+'</textarea></label>'+
      '<input type="hidden" name="subcategory" value="'+esc(product?.subcategory||'')+'"><input type="hidden" name="packaging" value="'+esc(product?.packaging||'')+'">'+
      '<input type="hidden" name="expiration_date" value="'+esc(product?.expiration_date||'')+'"><input type="hidden" name="auto_expiry_offer_enabled" value="'+(product?.auto_expiry_offer_enabled===true?'true':'false')+'"></form>';
    $('#editorActions').innerHTML='<button class="primary" id="saveProduct" type="button">Salvar produto</button>';
    $('#saveProduct').onclick=()=>saveProduct(product?.id||'');
    dialog.classList.add('product-editor-dialog');
    if(!dialog.open)dialog.showModal();
    const image=$('#productForm [name="image_url"]');
    image.oninput=()=>$('#productImagePreview').src=image.value||'/img/logoantonia5.png';
    if(product?.id&&$('#chooseProductImage'))$('#chooseProductImage').onclick=()=>$('#productImageFile').click();
    if(product?.id&&$('#productImageFile'))$('#productImageFile').onchange=async event=>{
      const file=event.currentTarget.files?.[0];if(!file)return;
      const button=$('#chooseProductImage');button.disabled=true;button.textContent='Enviando…';
      try{const result=await uploadProductImageSource(product.id,file);image.value=result.image_url;$('#productImagePreview').src=result.image_url;toast('Imagem salva')}
      catch(error){toast(errorMessage(error.message))}
      finally{button.disabled=false;button.textContent='Enviar imagem';event.currentTarget.value=''}
    };
  }

  function categoryOptions(current){
    const categories=[['','Sem categoria'],['mercearia','Mercearia'],['limpeza','Limpeza'],['lavanderia','Lavanderia'],['higiene','Higiene'],['beleza','Beleza'],['casa','Casa'],['pet','Pet'],['limpeza_lavanderia','Limpeza e lavanderia · legado'],['higiene_beleza','Higiene e beleza · legado'],['casa_pet','Casa e pet · legado']];
    if(current&&!categories.some(([value])=>value===current))categories.push([current,'Atual: '+current+' · manter']);
    return categories.map(([value,label])=>'<option value="'+esc(value)+'" '+(value===current?'selected':'')+'>'+esc(label)+'</option>').join('');
  }

  function centsFromInput(value){
    const clean=String(value||'0').replace(/\./g,'').replace(',','.');
    const number=Number(clean);
    return Number.isFinite(number)?Math.max(0,Math.round(number*100)):0;
  }

  async function saveProduct(id){
    const form=new FormData($('#productForm')),button=$('#saveProduct');
    const operator=requireOperator();if(!operator)return;
    const stock=Number(String(form.get('stock')||0).replace(',','.'))||0;
    let saved=false,productId=id,stage='product';
    button.disabled=true;button.textContent='Salvando…';
    try{
      const result=await api('product_save',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        id,name:form.get('name'),sku:form.get('sku'),gtin:form.get('gtin'),sale_price_cents:centsFromInput(form.get('price')),
        cost_cents:centsFromInput(form.get('cost')),stock_quantity:stock,expiration_date:form.get('expiration_date')||null,
        auto_expiry_offer_enabled:form.get('auto_expiry_offer_enabled')==='true',category:form.get('category'),subcategory:form.get('subcategory'),
        packaging:form.get('packaging'),brand:form.get('brand'),image_url:form.get('image_url'),description:form.get('description'),
        active:form.get('active')==='on',operator
      })});
      saved=true;productId=String(result.product_id||id||'');
      const savedStock=Number(result.product?.stock_quantity??stock);
      if(id&&Math.abs(savedStock-stock)>0.0001){
        stage='stock';button.textContent='Atualizando estoque no Bling…';
        await api('product_stock_set',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:productId,stock_quantity:stock,operator})});
      }
      state.productFacetsCache={};$('#editor').close();toast('Produto salvo');
      if(state.tab==='products')await renderProducts($('#productSearch')?.value.trim()||'');
    }catch(error){
      if(saved&&productId){button.disabled=false;button.textContent=stage==='stock'?'Tentar atualizar estoque':'Tentar novamente';button.onclick=()=>saveProduct(productId);toast(stage==='stock'?'Produto salvo, mas o estoque não foi confirmado no Bling. '+errorMessage(error.message):errorMessage(error.message))}
      else{button.disabled=false;button.textContent='Salvar produto';toast(errorMessage(error.message))}
    }
  }
  function inventoryIncidentLabel(v){
    return ({damage:'Avaria',expired:'Vencido',loss:'Perda / extravio',return:'Retorno',other:'Outro'})[v]||v||'Ocorrência';
  }
  async function loadInventoryIncidents(){
    try{
      const data=await api('inventory_incidents',{limit:30});
      state.inventoryIncidentSummary=data.inventory||{};
      state.inventoryIncidents=data.inventory?.incidents||[];
      paintBalance();
    }catch{}
  }
  async function renderBalance(){
    const content=$('#content');
    content.innerHTML='<div class="page-head"><div><h1>Revisar retorno</h1><p>Registre apenas os itens avariados, vencidos ou faltantes que voltaram do cliente.</p></div></div>'+
      '<section class="panel" style="padding:16px"><label><span>Buscar produto</span><input id="balanceManualSearch" type="search" autocomplete="off" placeholder="Nome ou código"></label><div id="balanceManualResults" class="balance-search-results"></div>'+
      '<div id="balanceSelectedProduct" class="sub" style="margin:12px 0">Selecione um produto para continuar.</div>'+
      '<div class="form-grid"><label><span>Tipo</span><select id="inventoryIncidentType"><option value="damage">Avaria</option><option value="expired">Vencido</option><option value="loss">Perda / extravio</option><option value="return">Retorno para inspeção</option><option value="other">Outro</option></select></label><label><span>Quantidade</span><input id="balanceQuantity" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0"></label></div>'+
      '<label style="display:block;margin-top:12px"><span>Observação</span><input id="inventoryIncidentNote" maxlength="500" placeholder="Opcional"></label>'+
      '<button class="primary" id="balanceConfirm" type="button" disabled style="margin-top:14px">Registrar ocorrência</button></section>'+
      '<section class="panel" style="margin-top:14px;padding:16px"><strong>Ocorrências abertas</strong><div id="balanceHistory" class="simple-list" style="margin-top:10px"></div></section>';
    $('#inventoryIncidentType').value=state.inventoryIncidentType||'damage';
    $('#inventoryIncidentType').onchange=e=>state.inventoryIncidentType=e.currentTarget.value;
    $('#inventoryIncidentNote').value=state.inventoryIncidentNote||'';
    $('#inventoryIncidentNote').oninput=e=>state.inventoryIncidentNote=e.currentTarget.value;
    $('#balanceQuantity').value=state.balanceQty||'';
    $('#balanceQuantity').oninput=e=>{state.balanceQty=e.currentTarget.value;paintBalance()};
    $('#balanceManualSearch').oninput=e=>{
      clearTimeout(state.balanceManualSearchTimer);
      const query=String(e.currentTarget.value||'').trim();
      if(query.length<2){$('#balanceManualResults').innerHTML='';return}
      state.balanceManualSearchTimer=setTimeout(()=>searchBalanceProducts(query),220);
    };
    $('#balanceConfirm').onclick=confirmBalance;
    paintBalance();
    await loadInventoryIncidents();
  }

  async function searchBalanceProducts(query){
    const host=$('#balanceManualResults');if(!host)return;
    host.innerHTML='<div class="loading">Buscando…</div>';
    try{
      const data=await api('products',{q:query,limit:10});
      const rows=data.products||[];
      host.innerHTML=rows.length?rows.map(p=>'<button class="balance-search-result" type="button" data-balance-pick="'+esc(p.id)+'"><span><strong>'+esc(p.name)+'</strong><small class="sub">'+esc(p.gtin||p.sku||'Sem código')+'</small></span></button>').join(''):'<div class="history-empty">Nenhum produto encontrado.</div>';
      host.querySelectorAll('[data-balance-pick]').forEach(button=>button.onclick=()=>{
        const product=rows.find(row=>row.id===button.dataset.balancePick);
        if(product)selectBalanceProduct(product);
      });
    }catch{
      host.innerHTML='<div class="history-empty">Não consegui buscar agora.</div>';
    }
  }

  function selectBalanceProduct(product){
    state.balanceProduct=product;
    paintBalance();
  }

  function paintBalance(){
    if(state.tab!=='balance')return;
    const selected=$('#balanceSelectedProduct'),quantity=$('#balanceQuantity'),confirm=$('#balanceConfirm');
    if(!selected||!quantity||!confirm)return;
    selected.textContent=state.balanceProduct?state.balanceProduct.name+' · '+(state.balanceProduct.gtin||state.balanceProduct.sku||'Sem código'):'Selecione um produto para continuar.';
    confirm.disabled=!state.balanceProduct||!(Number(quantity.value)>0);
    const history=$('#balanceHistory');
    const rows=state.inventoryIncidents||[];
    if(history)history.innerHTML=rows.length?rows.map(row=>'<div class="simple-row"><div class="simple-main"><strong>'+esc(row.product_name)+'</strong><small>'+esc(inventoryIncidentLabel(row.incident_type))+' · '+esc(dateTime(row.created_at))+(row.note?' · '+esc(row.note):'')+'</small></div><div class="simple-number">'+esc(fmtQty(row.quantity))+'</div></div>').join(''):'<div class="history-empty">Nenhuma ocorrência aberta.</div>';
  }

  async function confirmBalance(){
    if(!state.balanceProduct||!(Number(state.balanceQty)>0))return;
    const button=$('#balanceConfirm'),operator=requireOperator();if(!operator)return;
    button.disabled=true;button.textContent='Salvando…';
    try{
      const data=await api('inventory_incident_create',{},{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          product_id:state.balanceProduct.id,
          incident_type:state.inventoryIncidentType||'damage',
          quantity:Number(state.balanceQty),
          operator,
          note:state.inventoryIncidentNote||''
        })
      });
      toast(inventoryIncidentLabel(data.incident?.incident_type)+' registrada');
      state.balanceProduct=null;state.balanceQty='';state.inventoryIncidentNote='';
      $('#balanceManualSearch').value='';
      $('#balanceManualResults').innerHTML='';
      $('#balanceQuantity').value='';
      $('#inventoryIncidentNote').value='';
      await loadInventoryIncidents();
      button.textContent='Registrar ocorrência';
    }catch(error){
      toast(errorMessage(error.message));
      button.disabled=false;button.textContent='Registrar ocorrência';
    }
  }  async function renderBling(){
    const content=$('#content');
    content.innerHTML='<div class="page-head"><div><h1>Integrações · Técnico</h1><p>Estado do Supabase, Meta e Bling.</p></div><button class="secondary" id="refreshBling">Atualizar</button></div>'+
      '<section id="papoAiBridgeSlot"><div class="panel loading">Consultando Meta / WhatsApp…</div></section>'+
      '<div class="bling-banner" id="blingRuntimeBanner"><strong>Carregando estado do Hub…</strong><small>Consultando quais domínios estão ativos e quais continuam bloqueados.</small></div>'+
      '<div id="blingStatus"><div class="loading">Carregando status…</div></div>';
    $('#refreshBling').onclick=renderBling;
    const [metaStatus]=await Promise.all([
      api('ops_papoai_capture_status').catch(()=>null),
      loadBlingStatus(),
      loadOpsShadowReadiness()
    ]);
    state.opsPapoAi=metaStatus?.papoai||null;
    const metaSlot=$('#papoAiBridgeSlot');
    if(metaSlot){
      metaSlot.innerHTML=state.opsPapoAi?renderPapoAiBridgePanel():'<div class="panel empty">Não consegui consultar a conexão Meta / WhatsApp.</div>';
      metaSlot.querySelector('[data-papoai-create-link]')?.addEventListener('click',createPapoAiCatalogLink);
    }
    if($('#blingStatus')&&state.opsShadow)$('#blingStatus').insertAdjacentHTML('beforebegin',renderOpsShadowReadiness());
  }

  function yesNo(value,yes='OK',no='Pendente'){
    return value?'<span class="ok-text">'+esc(yes)+'</span>':'<span class="warn-text">'+esc(no)+'</span>';
  }

  async function loadOpsShadowReadiness(){
    try{const data=await api('ops_shadow_readiness');state.opsShadow=data.readiness||{};return state.opsShadow}catch{state.opsShadow=null;return null}
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

  async function loadBlingStatus(){
    const host=$('#blingStatus');if(!host)return;
    host.innerHTML='<div class="loading">Carregando status…</div>';
    try{
      const data=await api('bling_status');
      state.bling=data.bling||{};
      paintBling();
    }catch(e){
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

  async function renderCustomers(q=''){
    const content=$('#content');
    content.innerHTML='<div class="page-head"><div><h1>Clientes</h1><p>Cadastre e edite os dados dos clientes.</p></div><button class="primary" id="newCustomer" type="button">+ Cliente</button></div>'+
      '<div class="toolbar"><input id="customerSearch" type="search" placeholder="Buscar nome, telefone ou CPF"><button class="secondary" id="customerSearchBtn" type="button">Buscar</button></div>'+
      '<div class="panel"><div id="customerRows"><div class="loading">Carregando…</div></div></div>';
    $('#newCustomer').onclick=()=>openCustomerEditor();
    $('#customerSearch').value=q;
    $('#customerSearchBtn').onclick=()=>loadCustomers($('#customerSearch').value.trim());
    $('#customerSearch').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();loadCustomers(event.currentTarget.value.trim())}};
    await loadCustomers(q);
  }

  async function loadCustomers(q=''){
    const host=$('#customerRows');host.innerHTML='<div class="loading">Carregando…</div>';
    try{
      const data=await customerApi('vitrine_customers_list',{q,limit:120});
      state.customers=data.customers||[];
      host.innerHTML=state.customers.length?state.customers.map(customerRow).join(''):'<div class="empty">Nenhum cliente encontrado.</div>';
      host.querySelectorAll('[data-edit-customer]').forEach(button=>button.onclick=()=>openCustomerEditor(state.customers.find(customer=>customer.id===button.dataset.editCustomer)));
    }catch(error){
      host.innerHTML='<div class="empty">Erro ao carregar clientes. <button class="text" id="retryCustomers" type="button">Tentar novamente</button></div>';
      $('#retryCustomers')?.addEventListener('click',()=>loadCustomers(q));
    }
  }

  function customerRow(customer){
    return '<div class="list-row customers-layout"><div><span class="row-title">'+esc(customer.display_name||'Sem nome')+'</span><span class="sub">'+esc(customer.email||'')+'</span></div>'+
      '<span class="mobile-wide">'+esc(formatPhone(customer.phone)||'—')+'</span>'+
      '<div class="customer-row-actions"><button class="text" type="button" data-edit-customer="'+esc(customer.id)+'">Editar</button></div></div>';
  }

  function openCustomerEditor(customer=null,returnOrderId=''){
    const address=customer?.address||{};
    $('#editorTitle').textContent=customer?'Editar cliente':'Novo cliente';
    $('#editorBody').innerHTML='<form id="customerForm" class="form-grid">'+
      '<label class="span-2"><span>Nome *</span><input name="display_name" required value="'+esc(customer?.display_name||'')+'"></label>'+
      '<label><span>WhatsApp / telefone</span><input name="phone" inputmode="tel" value="'+esc(formatPhone(customer?.phone||''))+'"></label>'+
      '<label><span>CPF</span><input name="cpf" inputmode="numeric" value="'+esc(formatCpf(customer?.cpf||''))+'"></label>'+
      '<label class="span-2"><span>E-mail</span><input name="email" type="email" value="'+esc(customer?.email||'')+'"></label>'+
      '<div class="section-title span-2">Endereço</div>'+
      '<label><span>CEP</span><input name="postal_code" inputmode="numeric" value="'+esc(address.postal_code||'')+'"></label>'+
      '<label><span>Cidade</span><input name="city" value="'+esc(address.city||'Cuiabá')+'"></label>'+
      '<label class="span-2"><span>Rua / avenida</span><input name="street" value="'+esc(address.street||'')+'"></label>'+
      '<label><span>Número</span><input name="number" value="'+esc(address.number||'')+'"></label>'+
      '<label><span>Bairro</span><input name="district" value="'+esc(address.district||'')+'"></label>'+
      '<label><span>Complemento</span><input name="complement" value="'+esc(address.complement||'')+'"></label>'+
      '<label><span>UF</span><input name="state" maxlength="2" value="'+esc(address.state||'MT')+'"></label>'+
      '<label class="span-2"><span>Referência</span><input name="raw_text" value="'+esc(address.raw_text||'')+'"></label>'+
      '<input type="hidden" name="birthday_day" value="'+esc(customer?.birthday_day??'')+'">'+
      '<input type="hidden" name="birthday_month" value="'+esc(customer?.birthday_month??'')+'">'+
      '<input type="hidden" name="status" value="'+esc(customer?.status||'active')+'"></form>';
    $('#editorActions').innerHTML='<button class="secondary" id="cancelEditor" type="button">Cancelar</button><button class="primary" id="saveCustomer" type="button">Salvar cliente</button>';
    $('#cancelEditor').onclick=()=>{$('#editor').close();if(returnOrderId)openOrder(returnOrderId)};
    $('#saveCustomer').onclick=()=>saveCustomer(customer?.id||'',returnOrderId);
    if(!$('#editor').open)$('#editor').showModal();
    if(returnOrderId){const cpf=$('#customerForm [name="cpf"]');if(cpf){cpf.focus();cpf.scrollIntoView({behavior:'smooth',block:'center'})}}
  }

  async function saveCustomer(id,returnOrderId=''){
    const form=new FormData($('#customerForm')),button=$('#saveCustomer');
    button.disabled=true;button.textContent='Salvando…';
    try{
      await customerApi('vitrine_customer_save',{
        id,display_name:form.get('display_name'),phone:form.get('phone'),cpf:form.get('cpf'),email:form.get('email'),
        birthday_day:form.get('birthday_day'),birthday_month:form.get('birthday_month'),status:form.get('status'),
        address:{postal_code:form.get('postal_code'),street:form.get('street'),number:form.get('number'),district:form.get('district'),
          complement:form.get('complement'),city:form.get('city'),state:form.get('state'),raw_text:form.get('raw_text')}
      });
      $('#editor').close();
      toast(returnOrderId?'Cliente salvo · sincronização com Bling enfileirada':'Cliente salvo na base oficial');
      if(returnOrderId)await openOrder(returnOrderId);
      else await renderCustomers($('#customerSearch')?.value.trim()||'');
    }catch(error){toast(errorMessage(error.message));button.disabled=false;button.textContent='Salvar cliente'}
  }
  function manualSaleTotalCents(){
    return (state.manualSale?.cart||[]).reduce((s,x)=>s+Number(x.price_cents||0)*Number(x.qty||0),0);
  }
  function manualSaleFormValue(id){return String($(id)?.value||'').trim()}
  function manualSaleFillCustomer(customer){
    if(!customer)return;state.manualSale.customer=customer;
    const a=customer.address||{};
    if($('#manualName'))$('#manualName').value=customer.display_name||'';
    if($('#manualPhone'))$('#manualPhone').value=formatPhone(customer.phone||'');
    if($('#manualStreet'))$('#manualStreet').value=a.street||'';
    if($('#manualNumber'))$('#manualNumber').value=a.number||'';
    if($('#manualDistrict'))$('#manualDistrict').value=a.district||a.neighborhood||'';
    if($('#manualComplement'))$('#manualComplement').value=a.complement||'';
    if($('#manualCity'))$('#manualCity').value=a.city||'Cuiabá';
    if($('#manualState'))$('#manualState').value=a.state||'MT';
    if($('#manualCustomerResults'))$('#manualCustomerResults').innerHTML='<div class="rule-notice"><strong>Cliente selecionado: '+esc(customer.display_name||'Sem nome')+'</strong><div>'+esc(formatPhone(customer.phone||''))+(customer.cpf?' · CPF '+esc(formatCpf(customer.cpf)):'')+'</div></div>';
  }
  function paintManualSaleCart(){
    const host=$('#manualSaleCart');if(!host||!state.manualSale)return;
    const cart=state.manualSale.cart||[];
    host.innerHTML=cart.length?cart.map((x,i)=>'<div class="replacement-option"><div><strong>'+esc(x.name)+'</strong><small>'+esc(x.type==='basket'?'Cesta personalizada':'Produto')+' · '+money(x.price_cents)+' cada</small></div><div class="dispatch-actions"><button class="secondary" type="button" data-manual-dec="'+i+'">−</button><span class="pill">'+esc(x.qty)+'</span><button class="secondary" type="button" data-manual-inc="'+i+'">+</button><button class="text danger" type="button" data-manual-remove="'+i+'">Remover</button></div></div>').join(''):'<div class="history-empty">Nenhum item adicionado.</div>';
    const total=manualSaleTotalCents();
    if($('#manualSaleTotal'))$('#manualSaleTotal').textContent=money(total);
    if($('#manualSaleMinimum'))$('#manualSaleMinimum').textContent=total>=7500?'Pedido mínimo atingido':'Faltam '+money(7500-total)+' para o mínimo';
    host.querySelectorAll('[data-manual-inc]').forEach(b=>b.onclick=()=>{const x=state.manualSale.cart[Number(b.dataset.manualInc)];if(x&&x.qty<30){x.qty++;paintManualSaleCart()}});
    host.querySelectorAll('[data-manual-dec]').forEach(b=>b.onclick=()=>{const x=state.manualSale.cart[Number(b.dataset.manualDec)];if(x&&x.qty>1){x.qty--;paintManualSaleCart()}});
    host.querySelectorAll('[data-manual-remove]').forEach(b=>b.onclick=()=>{state.manualSale.cart.splice(Number(b.dataset.manualRemove),1);paintManualSaleCart()});
  }
  async function searchManualCustomers(){
    const q=manualSaleFormValue('#manualCustomerSearch'),host=$('#manualCustomerResults');if(!host)return;
    if(q.length<2){host.innerHTML='<div class="sub">Digite pelo menos 2 caracteres.</div>';return}
    host.innerHTML='<div class="loading">Buscando cliente…</div>';
    try{
      const data=await customerApi('vitrine_customers_list',{q,limit:12});
      const rows=data.customers||[];state.manualSale.customerResults=rows;
      host.innerHTML=rows.length?rows.map((x,i)=>'<button class="history-row" type="button" data-manual-customer="'+i+'" style="grid-template-columns:1fr 140px"><div class="history-main"><strong>'+esc(x.display_name||'Sem nome')+'</strong><small>'+esc(formatPhone(x.phone||''))+(x.cpf?' · CPF '+esc(formatCpf(x.cpf)):'')+'</small></div><span>Selecionar</span></button>').join(''):'<div class="history-empty">Cliente não encontrado. Preencha os dados abaixo e o pedido será criado sem cadastro vinculado.</div>';
      host.querySelectorAll('[data-manual-customer]').forEach(b=>b.onclick=()=>manualSaleFillCustomer(rows[Number(b.dataset.manualCustomer)]));
    }catch{host.innerHTML='<div class="history-empty">Não consegui buscar clientes agora.</div>'}
  }
  async function searchManualItems(){
    const q=manualSaleFormValue('#manualItemSearch'),host=$('#manualItemResults');if(!host)return;
    if(q.length<2){host.innerHTML='<div class="sub">Digite nome, EAN ou código.</div>';return}
    host.innerHTML='<div class="loading">Buscando produtos e cestas…</div>';
    try{
      const products=await api('products',{q,limit:16,active:'true'});
      const pn=normalize(q),baskets=(state.manualSale.baskets||[]).filter(b=>normalize(b.name).includes(pn)).slice(0,8);
      const rows=(products.products||[]).filter(p=>Number(p.stock_quantity||0)>0);
      host.innerHTML=(baskets.length?'<div class="section-title">Cestas</div>'+baskets.map(b=>'<div class="replacement-option"><div><strong>'+esc(b.name)+'</strong><small>'+money(b.display_price_cents)+' · personalizável</small></div><button class="secondary" type="button" data-manual-basket="'+esc(b.id)+'">Configurar</button></div>').join(''):'')+
        (rows.length?'<div class="section-title">Produtos</div>'+rows.map(p=>'<div class="replacement-option"><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.gtin||p.sku||'Sem código')+' · '+money(p.sale_price_cents)+' · estoque '+esc(fmtQty(p.stock_quantity||0))+'</small></div><button class="secondary" type="button" data-manual-product="'+esc(p.id)+'">Adicionar</button></div>').join(''):'')+
        (!baskets.length&&!rows.length?'<div class="history-empty">Nenhum item encontrado.</div>':'');
      host.querySelectorAll('[data-manual-product]').forEach(b=>b.onclick=()=>{
        const p=rows.find(x=>x.id===b.dataset.manualProduct);if(!p)return;
        const existing=state.manualSale.cart.find(x=>x.type==='product'&&x.id===p.id);
        if(existing)existing.qty=Math.min(30,existing.qty+1);else state.manualSale.cart.push({type:'product',id:p.id,name:p.name,qty:1,price_cents:Number(p.sale_price_cents||0)});
        paintManualSaleCart();toast('Produto adicionado');
      });
      host.querySelectorAll('[data-manual-basket]').forEach(b=>b.onclick=()=>openManualBasketConfig(b.dataset.manualBasket));
    }catch{host.innerHTML='<div class="history-empty">Não consegui buscar itens agora.</div>'}
  }
  async function openManualBasketConfig(basketId){
    const host=$('#manualBasketConfig');if(!host)return;host.innerHTML='<div class="loading">Carregando cesta…</div>';
    try{
      const data=await storefrontApi('basket',{basket_id:basketId});
      state.manualSale.basketConfig={basket:data.basket,items:(data.items||[]).map(x=>({...x,selected_quantity:Number(x.quantity||0)}))};
      const cfg=state.manualSale.basketConfig;
      host.innerHTML='<div class="panel" style="padding:12px"><div class="history-title"><div><strong>'+esc(cfg.basket.name)+'</strong><span class="muted">Ajuste as quantidades permitidas</span></div><button class="text" id="manualBasketClose" type="button">Fechar</button></div><div>'+cfg.items.map((x,i)=>{
        const editable=x.quantity_editable===true||x.removable===true;
        const max=Math.max(Number(x.quantity||0),Math.min(Number((x.max_quantity??x.stock_quantity??x.quantity)||0),Number(x.stock_quantity??9999)));
        const min=Math.max(0,Number((x.min_quantity??(x.removable?0:x.quantity))||0));
        return '<div class="replacement-option"><div><strong>'+esc(x.name)+'</strong><small>Base '+esc(fmtQty(x.quantity))+' · estoque '+esc(fmtQty(x.stock_quantity||0))+(x.removable?' · removível':'')+'</small></div><input style="width:86px" type="number" inputmode="numeric" min="'+esc(min)+'" max="'+esc(max)+'" step="1" value="'+esc(x.selected_quantity)+'" data-manual-basket-qty="'+i+'" '+(editable?'':'disabled')+'></div>';
      }).join('')+'</div><div class="dispatch-actions" style="justify-content:flex-end;margin-top:12px"><button class="primary" id="manualBasketAdd" type="button">Adicionar cesta</button></div></div>';
      $('#manualBasketClose').onclick=()=>{state.manualSale.basketConfig=null;host.innerHTML=''};
      $('#manualBasketAdd').onclick=addConfiguredManualBasket;
    }catch(e){host.innerHTML='<div class="history-empty">Não consegui abrir a cesta.</div>'}
  }
  async function addConfiguredManualBasket(){
    const cfg=state.manualSale?.basketConfig;if(!cfg)return;
    const inputs=[...document.querySelectorAll('[data-manual-basket-qty]')];
    for(const input of inputs){const i=Number(input.dataset.manualBasketQty),x=cfg.items[i];if(x)x.selected_quantity=Math.max(0,Math.floor(Number(input.value||0)))}
    const components=cfg.items.map(x=>({product_id:x.product_id,quantity:x.selected_quantity,component_group:x.component_group||'legacy'}));
    const btn=$('#manualBasketAdd');if(btn){btn.disabled=true;btn.textContent='Calculando…'}
    try{
      const payload=cfg.basket.split_mode?{
        basket_id:cfg.basket.id,food_lot_id:cfg.basket.food_lot_id,hygiene_lot_id:cfg.basket.hygiene_lot_id,
        food_lot_code:cfg.basket.food_lot_code,hygiene_lot_code:cfg.basket.hygiene_lot_code,items:components
      }:{basket_id:cfg.basket.id,lot_id:cfg.basket.lot_id,items:components};
      const quote=await storefrontApi('basket_quote',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      state.manualSale.cart.push({
        type:'basket',id:cfg.basket.id,name:cfg.basket.name,qty:1,price_cents:Number(quote.total_cents||0),components,
        split_mode:cfg.basket.split_mode===true,lot_id:cfg.basket.lot_id||null,
        food_lot_id:cfg.basket.food_lot_id||null,hygiene_lot_id:cfg.basket.hygiene_lot_id||null
      });
      state.manualSale.basketConfig=null;$('#manualBasketConfig').innerHTML='';paintManualSaleCart();toast('Cesta adicionada');
    }catch(e){toast(errorMessage(e.message));if(btn){btn.disabled=false;btn.textContent='Adicionar cesta'}}
  }
  async function openManualSale(){
    state.manualSale={customer:null,customerResults:[],cart:[],baskets:[],basketConfig:null};
    $('#editorTitle').textContent='Nova venda WhatsApp';
    $('#editorBody').innerHTML='<div class="rule-notice"><strong>Mesmo motor do site</strong><div>Cadastre o pedido recebido no WhatsApp. Ele entra como Novo, sem reservar estoque até a confirmação.</div></div>'+
      '<div class="section-title">Cliente</div><div class="toolbar"><input id="manualCustomerSearch" type="search" placeholder="Buscar nome, telefone ou CPF"><button class="secondary" id="manualCustomerSearchBtn" type="button">Buscar</button></div><div id="manualCustomerResults"></div>'+
      '<div class="form-grid" style="margin-top:12px"><label><span>Nome</span><input id="manualName" required></label><label><span>WhatsApp</span><input id="manualPhone" inputmode="tel" required></label><label><span>Rua</span><input id="manualStreet" required></label><label><span>Número</span><input id="manualNumber" required></label><label><span>Bairro</span><input id="manualDistrict"></label><label><span>Complemento</span><input id="manualComplement"></label><label><span>Cidade</span><input id="manualCity" value="Cuiabá" required></label><label><span>UF</span><input id="manualState" value="MT" maxlength="2" required></label><label class="span-2"><span>Pagamento na entrega</span><select id="manualPayment"><option>PIX</option><option>Dinheiro</option><option>Cartão de crédito</option><option>Cartão alimentação/refeição</option></select></label></div>'+
      '<div class="section-title">Produtos e cestas</div><div class="toolbar"><input id="manualItemSearch" type="search" placeholder="Buscar produto, EAN ou cesta"><button class="secondary" id="manualItemSearchBtn" type="button">Buscar</button></div><div id="manualItemResults"></div><div id="manualBasketConfig" style="margin-top:10px"></div>'+
      '<div class="section-title">Pedido</div><div id="manualSaleCart"></div><div class="order-summary" style="margin-top:12px"><div class="summary-box"><small>Total estimado</small><strong id="manualSaleTotal">'+money(0)+'</strong></div><div class="summary-box"><small>Mínimo</small><strong>R$ 75,00</strong></div><div class="summary-box"><small>Status</small><strong id="manualSaleMinimum">Adicione itens</strong></div></div>';
    $('#editorActions').innerHTML='<button class="secondary" id="manualSaleCancel" type="button">Cancelar</button><button class="primary" id="manualSaleCreate" type="button">Criar pedido</button>';
    $('#manualSaleCancel').onclick=()=>$('#editor').close();
    $('#manualSaleCreate').onclick=createManualSale;
    $('#manualCustomerSearchBtn').onclick=searchManualCustomers;$('#manualCustomerSearch').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchManualCustomers()}};
    $('#manualItemSearchBtn').onclick=searchManualItems;$('#manualItemSearch').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchManualItems()}};
    paintManualSaleCart();$('#editor').showModal();
    try{const home=await storefrontApi('home');if(state.manualSale)state.manualSale.baskets=home.baskets||[]}catch{}
  }
  async function createManualSale(){
    if(!state.manualSale)return;
    const name=manualSaleFormValue('#manualName'),phone=manualSaleFormValue('#manualPhone'),street=manualSaleFormValue('#manualStreet'),number=manualSaleFormValue('#manualNumber'),city=manualSaleFormValue('#manualCity'),uf=manualSaleFormValue('#manualState').toUpperCase(),payment=manualSaleFormValue('#manualPayment');
    if(!name||!phone||!street||!number||!city||uf.length!==2){toast('Preencha nome, WhatsApp e endereço completo');return}
    if(!state.manualSale.cart.length){toast('Adicione pelo menos um item');return}
    if(manualSaleTotalCents()<7500){toast('O pedido mínimo é R$ 75,00');return}
    const items=state.manualSale.cart.map(x=>({type:x.type,id:x.id,qty:x.qty,...(x.type==='basket'?{
      components:x.components,lot_id:x.lot_id||null,split_mode:x.split_mode===true,
      food_lot_id:x.food_lot_id||null,hygiene_lot_id:x.hygiene_lot_id||null
    }: {})}));
    const customer=state.manualSale.customer;
    const customer_snapshot={id:customer?.id||null,display_name:name,phone,address:{street,number,district:manualSaleFormValue('#manualDistrict'),complement:manualSaleFormValue('#manualComplement'),city,state:uf}};
    const btn=$('#manualSaleCreate');if(btn){btn.disabled=true;btn.textContent='Criando…'}
    try{
      const data=await api('manual_order_create',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,payment_method:payment,items,customer_snapshot,delivery:{},operator:currentOperator()||'Operação'})});
      $('#editor').close();state.manualSale=null;state.orderFilter='new';await renderOrders();await openOrder(data.order_id);toast('Pedido WhatsApp criado · aguardando confirmação');
    }catch(e){toast(errorMessage(e.message));if(btn){btn.disabled=false;btn.textContent='Criar pedido'}}
  }

  const ORDER_SEPARATORS=[{key:'jose',label:'José'},{key:'claudio',label:'Cláudio'},{key:'jovenil',label:'Jovenil'},{key:'kelly',label:'Kelly'}];


  function separatorLabel(key){return ORDER_SEPARATORS.find(x=>x.key===String(key||'').toLowerCase())?.label||''}


  function orderSeparationSummary(o){return o?.separation_summary||{}}


  function orderV3SearchMatch(o,q){const n=normalize(q||'');if(!n)return true;return normalize([o.order_number,o.customer_name,o.whatsapp_phone_e164,o.delivery_address_snapshot?.street,o.delivery_address_snapshot?.district].filter(Boolean).join(' ')) .includes(n)}
  function orderCustomerDataPendingReasons(o){
    const labels=['Nome pendente','Telefone pendente','Endereço incompleto'];
    const a=o?.delivery_address_snapshot||{},name=String(a.customer_name||a.recipient_name||o?.customer_name||'').trim(),phone=String(o?.whatsapp_phone_e164||o?.phone_e164||a.phone||'').replace(/\D/g,'');
    const reasons=[];
    if(!name)reasons.push(labels[0]);
    if(!phone)reasons.push(labels[1]);
    if(![a.street,a.number,a.district||a.neighborhood,a.city,a.state].every(v=>String(v||'').trim()))reasons.push(labels[2]);
    return [...new Set(reasons)];
  }
  function orderCustomerDataPending(o){return orderCustomerDataPendingReasons(o).length>0}
  function orderSeparationCompletedV4(o){const s=String(o?.status||''),summary=orderSeparationSummary(o),meta=summary?.completion_metadata||{};if(summary?.completed_at||summary?.phase==='completed'||meta?.operational_completion===true)return true;if(summary?.phase==='needs_attention'&&meta?.stock_applied===true)return true;if(['out_for_delivery','delivered'].includes(s))return true;const f=state.fiscalByOrder[o?.id]||(state.currentOrder?.order?.id===o?.id?state.currentOrderFiscal:null);return s==='ready'&&f?.readiness?.separation_completed===true}
  function orderV3Milestones(o){const s=String(o?.status||'');return {confirmed:['confirmed','processing','ready','out_for_delivery','delivered'].includes(s),separated:orderSeparationCompletedV4(o),dispatched:['out_for_delivery','delivered'].includes(s),delivered:s==='delivered',cancelled:s==='cancelled'}}
  function orderFiscalTagV4(o){
    const f=state.fiscalByOrder[o?.id]||null;
    if(o?.status==='ready'){
      if(!f)return '<span class="order-v3-tag neutral">NF-e…</span>';
      if(f.error)return '<span class="order-v3-tag warn">NF-e INDISPONÍVEL</span>';
      if(f.authorized===true||f.stage==='authorized')return '<span class="order-v3-tag ok">NF-e AUTORIZADA</span>';
      if(f.stage==='processing')return '<span class="order-v3-tag warn">NF-e EM PROCESSAMENTO</span>';
      if(f.stage==='rejected')return '<span class="order-v3-tag danger">NF-e REJEITADA</span>';
      if(f.stage==='blocked')return '<span class="order-v3-tag warn">NF-e BLOQUEADA</span>';
      return '<span class="order-v3-tag warn">NF-e PENDENTE</span>';
    }
    if(o?.status==='out_for_delivery')return '<span class="order-v3-tag ok">NF-e AUTORIZADA</span><span class="order-v3-tag">SAIU PARA ENTREGA</span>';
    return '';
  }
  function orderV3Tags(o){const m=orderV3Milestones(o),tags=[],f=state.fiscalByOrder[o?.id]||(state.currentOrder?.order?.id===o?.id?state.currentOrderFiscal:null);if(m.confirmed)tags.push('<span class="order-v3-tag">CONFIRMADO</span>');if(m.separated)tags.push('<span class="order-v3-tag">SEPARADO</span>');else if(o?.status==='ready'&&f?.readiness?.separation_completed===false)tags.push('<span class="order-v3-tag warn">SEPARAÇÃO PENDENTE</span>');const fiscalTag=orderFiscalTagV4(o);if(fiscalTag)tags.push(fiscalTag);if(m.delivered)tags.push('<span class="order-v3-tag ok">ENTREGUE</span>');if(m.cancelled)tags.push('<span class="order-v3-tag cancelled">CANCELADO</span>');if(!tags.length)tags.push('<span class="order-v3-tag neutral">RECEBIDO</span>');if(orderCustomerDataPending(o))tags.push('<span class="order-v3-tag neutral" title="'+esc(orderCustomerDataPendingReasons(o).join(' · '))+'">AGUARDANDO DADOS DO CLIENTE</span>');return tags.join('')}
  function orderCardOperationalTags(o,m=orderV3Milestones(o)){const tags=[],sep=orderSeparationSummary(o);if(m.confirmed&&!m.separated&&!m.delivered&&!m.cancelled)tags.push('<span class="order-v3-tag ok">MONTAR PARA ENTREGAR HOJE</span>');if(m.separated&&sep?.phase==='needs_attention')tags.push('<span class="order-v3-tag warn">INTEGRAÇÃO PENDENTE</span>');const fiscalTag=orderFiscalTagV4(o);if(fiscalTag)tags.push(fiscalTag);if(orderCustomerDataPending(o))tags.push('<span class="order-v3-tag neutral" title="'+esc(orderCustomerDataPendingReasons(o).join(' · '))+'">DADOS DO CLIENTE PENDENTES</span>');return tags.join('')}
  function orderCardPhone(o){return formatPhone(o?.whatsapp_phone_e164||o?.delivery_address_snapshot?.phone||'')||'Telefone não informado'}
  function orderSeparationUrlFor(id){const url=new URL('/vitrine/admin/',location.origin);url.searchParams.set('separacao',String(id||''));return url.toString()}
  async function copyOrderSeparationLink(id,btn){const url=orderSeparationUrlFor(id);try{await navigator.clipboard.writeText(url)}catch{const input=document.createElement('textarea');input.value=url;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();document.execCommand('copy');input.remove()}toast('Link da vitrine de separação copiado');if(btn){btn.textContent='LINK COPIADO';setTimeout(()=>{if(document.contains(btn))btn.textContent='COPIAR LINK SEPARAÇÃO'},1800)}}
  function orderRow(o){
    const m=orderV3Milestones(o),f=state.fiscalByOrder[o.id]||null,sep=orderSeparationSummary(o),assignment=sep.assignment||{},counts=sep.counts||{},assigned=Boolean(assignment.separator_key),separator=assignment.separator_label||separatorLabel(assignment.separator_key),separatedCount=Number(counts.separated||0),missingCount=Number(counts.missing||0),checked=separatedCount+missingCount,totalItems=Number(counts.total||0),pendingCount=Math.max(0,Number(counts.pending??(totalItems-checked))||0),missingValue=Number(sep.missing_subtotal||counts.missing_subtotal||0),progressPct=totalItems>0?Math.max(0,Math.min(100,Math.round((checked/totalItems)*100))):0;
    let stage='received',stageLabel='RECEBIDO';
    if(m.cancelled){stage='cancelled';stageLabel='CANCELADO'}
    else if(m.delivered){stage='done';stageLabel='ENTREGUE'}
    else if(o.status==='out_for_delivery'){stage='delivery';stageLabel='SAIU PARA ENTREGA'}
    else if(m.separated){stage='separated';stageLabel='PEDIDO JÁ SEPARADO'}
    else if(assigned&&m.confirmed){stage='separating';stageLabel='EM SEPARAÇÃO · '+separator.toUpperCase()}
    else if(m.confirmed){stage='waiting';stageLabel='AGUARDANDO SEPARAÇÃO'}
    const cardClass=['waiting','separating','separated','delivery','done'].includes(stage)?' '+stage:'';
    let progress='';
    if(m.confirmed&&totalItems>0&&!m.delivered&&!m.cancelled){
      const progressTitle=m.separated?'Separação concluída':assigned?'Separação em andamento':'Itens para separar';
      progress='<div class="order-v3-progress"><div class="order-v3-progress-head"><span>'+esc(progressTitle)+'</span><strong>'+checked+' de '+totalItems+' itens</strong></div><div class="order-v3-progress-bar" aria-label="Progresso da separação" aria-valuemin="0" aria-valuemax="'+totalItems+'" aria-valuenow="'+checked+'"><i style="width:'+progressPct+'%"></i></div><div class="order-v3-progress-foot"><span class="ok">'+separatedCount+' separado'+(separatedCount===1?'':'s')+'</span><span>'+pendingCount+' pendente'+(pendingCount===1?'':'s')+'</span>'+(missingCount?'<span class="missing">'+missingCount+' faltou'+(missingCount===1?'':'aram')+(missingValue>0?' · − '+esc(separationMoney(missingValue)):'')+'</span>':'')+(assigned&&assignment.assigned_at&&!m.separated?'<span>Iniciado '+esc(dateTime(assignment.assigned_at))+'</span>':'')+'</div></div>';
    }
    let controls='';
    if(orderCustomerDataPending(o)){
      controls='<button class="order-v3-control" type="button" disabled title="'+esc(orderCustomerDataPendingReasons(o).join(' · '))+'">AGUARDANDO DADOS DO CLIENTE</button>';
    }else if(!m.confirmed&&!m.cancelled){
      controls='<button class="order-v3-control" type="button" data-v3-confirm="'+esc(o.id)+'">CONFIRMAR PEDIDO</button>';
    }else if(o.status==='ready'&&!m.cancelled){
      if(f?.authorized===true||f?.stage==='authorized')controls='<button class="order-v3-control" type="button" data-v3-dispatch="'+esc(o.id)+'">SAIU PARA ENTREGA</button>';
      else if(f)controls='<button class="order-v3-control" type="button" data-open-order="'+esc(o.id)+'">'+(f.stage==='blocked'||f.stage==='rejected'?'REVISAR NF-e':'ACOMPANHAR NF-e')+'</button>';
      else controls='<button class="order-v3-control" type="button" disabled>NF-e automática…</button>';
    }else if(o.status==='out_for_delivery'&&!m.delivered&&!m.cancelled){
      controls='<button class="order-v3-control" type="button" data-v3-deliver="'+esc(o.id)+'">ENTREGUE</button><button class="order-v3-control" type="button" data-v3-delivery-fail="'+esc(o.id)+'">NÃO ENTREGUE</button>';
    }
    const separationLabel=m.separated?'VER SEPARAÇÃO':assigned?'CONTINUAR SEPARAÇÃO':'INICIAR SEPARAÇÃO';
    const primaryAction=m.confirmed&&!m.delivered&&!m.cancelled?'<button class="order-v3-action main '+(m.separated?'secondary-action':'primary')+'" type="button" data-v3-separation="'+esc(o.id)+'">'+separationLabel+'</button>':'';
    const supportTags=orderCardOperationalTags(o,m);
    return '<article class="order-v3-card'+cardClass+'"><div class="order-v3-topline"><span class="order-v3-stage '+esc(stage)+'">'+esc(stageLabel)+'</span><strong class="order-v3-money">'+money(o.total_cents||0)+'</strong></div><div class="order-v3-identity"><strong>#'+esc(orderDisplayCode(o))+' · '+esc(o.customer_name||'Sem cliente')+'</strong><small><span class="order-v3-phone">Tel. '+esc(orderCardPhone(o))+'</span><span>'+esc(dateTime(o.created_at))+'</span></small></div>'+(!m.confirmed&&!m.cancelled?'<div class="order-v3-do-not-build">NÃO MONTAR ESSE PEDIDO</div>':'')+progress+(supportTags?'<div class="order-v3-tags">'+supportTags+'</div>':'')+(controls?'<div class="order-v3-controls">'+controls+'</div>':'')+'<div class="order-v3-actions">'+primaryAction+'<button class="order-v3-action secondary-action" type="button" data-order-chat="'+esc(o.id)+'">💬 VER CONVERSA</button><button class="order-v3-action '+(primaryAction?'secondary-action':'primary')+'" type="button" data-open-order="'+esc(o.id)+'">ABRIR PEDIDO</button></div></article>';
  }
  const ORDER_STATUS_TABS=[
    {key:'new',label:'Novo'},
    {key:'separate',label:'Separar agora'},
    {key:'ready',label:'Pronto para entrega'},
    {key:'delivered',label:'Entregue'}
  ];
  function orderStatusTabKey(o){
    const status=String(o?.status||'');
    if(status==='cancelled')return 'cancelled';
    if(status==='delivered')return 'delivered';
    if(['ready','out_for_delivery'].includes(status))return 'ready';
    if(['confirmed','processing'].includes(status))return 'separate';
    return 'new';
  }
  function orderStatusTabMatch(o,key=state.orderStatusTab||'new',searching=Boolean(String(state.orderQuery||'').trim())){
    return searching||(['new','separate','ready','delivered'].includes(key)&&orderStatusTabKey(o)===key);
  }
  function orderStatusTabCounts(){
    const counts=Object.fromEntries(ORDER_STATUS_TABS.map(x=>[x.key,0]));
    state.orders.forEach(o=>{const key=orderStatusTabKey(o);if(Object.prototype.hasOwnProperty.call(counts,key))counts[key]++});
    return counts;
  }
  function orderStatusTabsHtml(extraClass=''){
    const counts={...orderStatusTabCounts(),...(state.orderCounts||{})},active=state.orderStatusTab||'new';
    return '<div class="orders-status-tabs '+extraClass+'" role="tablist" aria-label="Filtrar pedidos por status">'+ORDER_STATUS_TABS.map(x=>'<button type="button" class="orders-status-tab'+(active===x.key?' active':'')+'" data-order-status-tab="'+x.key+'" role="tab" aria-selected="'+(active===x.key?'true':'false')+'">'+esc(x.label)+' <span class="count">'+Number(counts[x.key]||0)+'</span></button>').join('')+'</div>';
  }
  async function manualQueueRpc(action,orderId=null){
    const token=await adminStepUp();
    const res=await fetch(BASKET_AUTO_RPC+'manual_pick_queue_action_v1',{
      method:'POST',headers:{'Content-Type':'application/json','apikey':FINANCE_PUBLIC_KEY,'Authorization':'Bearer '+token},
      body:JSON.stringify({p_action:action,p_order_id:orderId}),cache:'no-store'
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!Array.isArray(data.order_ids))throw new Error(data.message||data.error||'manual_queue_unavailable');
    return data;
  }
  function bindOrderStatusTabs(){document.querySelectorAll('[data-order-status-tab]').forEach(b=>b.onclick=()=>{const next=b.dataset.orderStatusTab||'new';if(next===state.orderStatusTab)return;state.orderStatusTab=next;loadOrders(true)})}
  async function renderOrders(){const content=$('#content');document.body.classList.add('orders-tab-active');content.innerHTML='<div class="page-head"><div><h1>Pedidos</h1><p>Acompanhe os pedidos do início à entrega.</p></div></div><div id="orderStatusTabsTop">'+orderStatusTabsHtml('orders-status-desktop')+'</div><div class="toolbar"><input id="orderSearch" type="search" placeholder="Buscar pedido, cliente, telefone ou endereço…" value="'+esc(state.orderQuery||'')+'"></div><div id="orderRows" class="orders-v3-list"><div class="loading">Carregando pedidos…</div></div><div id="orderStatusTabsMobile">'+orderStatusTabsHtml('orders-status-mobile')+'</div>';bindOrderStatusTabs();$('#orderSearch').oninput=e=>{state.orderQuery=e.target.value;clearTimeout(state.orderSearchTimer);state.orderSearchTimer=setTimeout(()=>loadOrders(true),280)};await loadOrders(true)}
  async function loadOrders(reset=true){
    const tab=state.orderStatusTab||'new',search=String(state.orderQuery||'').trim(),offset=reset?0:Number(state.orderOffset||0);
    const requestId=reset?++state.orderRequestSequence:state.orderRequestSequence;
    if(reset){state.orders=[];state.orderOffset=0;state.orderHasMore=false;const host=$('#orderRows');if(host)host.innerHTML='<div class="loading">Carregando pedidos…</div>'}
    try{
      const data=await api('orders',{tab,offset,limit:5,...(search?{q:search}:{})});
      if(requestId!==state.orderRequestSequence||tab!==(state.orderStatusTab||'new')||search!==String(state.orderQuery||'').trim())return;
      const page=Array.isArray(data.orders)?data.orders:[];
      state.orders=reset?page:[...state.orders,...page];
      state.orderOffset=offset+page.length;state.orderHasMore=data.has_more===true;state.orderCounts=data.counts||state.orderCounts||{};
      paintOrderRows();
      const fiscalRows=state.orders.filter(o=>o.status==='ready'&&!state.fiscalByOrder[o.id]).sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0)).slice(0,5);
      if(fiscalRows.length){await loadFiscalForOrders(fiscalRows);if(requestId===state.orderRequestSequence)paintOrderRows()}
    }catch(e){if(requestId===state.orderRequestSequence){const host=$('#orderRows');if(host)host.innerHTML='<div class="empty">Não consegui carregar os pedidos. <button class="text-btn" id="retryOrders" type="button">Tentar novamente</button></div>';$('#retryOrders')?.addEventListener('click',()=>loadOrders(true))}}
  }
  let orderSeparationBoardRefreshInFlight=false;
  async function refreshOrderSeparationBoard(force=false){
    if(state.tab!=='orders'||document.hidden||!state.orders.length||orderSeparationBoardRefreshInFlight)return;
    if(!force&&document.querySelector('.orders-bottom-sheet-backdrop'))return;
    orderSeparationBoardRefreshInFlight=true;
    try{
      const data=await api('order_separation_board'),map=new Map((data.board||[]).map(x=>[String(x.order_id),x]));
      let statusChanged=false,summaryChanged=false;
      state.orders=state.orders.map(o=>{
        const row=map.get(String(o.id));if(!row)return o;
        const nextSummary=row.separation_summary||null,nextStatus=row.status||o.status;
        if(nextStatus!==o.status)statusChanged=true;
        if(JSON.stringify(nextSummary)!==JSON.stringify(o.separation_summary||null))summaryChanged=true;
        return {...o,status:nextStatus,separation_summary:nextSummary};
      });
      if(statusChanged)await loadOrders(true);
      else if(summaryChanged)paintOrderRows();
    }catch{}
    finally{orderSeparationBoardRefreshInFlight=false}
  }
  if(!window.__orderSeparationBoardTimer)window.__orderSeparationBoardTimer=setInterval(refreshOrderSeparationBoard,15000);
  if(!window.__orderSeparationBoardVisibilityBound){window.__orderSeparationBoardVisibilityBound=true;document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.tab==='orders')refreshOrderSeparationBoard()})}
  // O painel preserva a página e reusa integralmente o Atendimento existente.
  let orderChatOpener=null,orderChatClosingTimer=null,orderChatPreviousOverflow='';
  function closeOrderChatSheet(){
    const sheet=$('#orderChatSheet'),overlay=$('#orderChatOverlay');
    if(!sheet||sheet.hidden)return;
    sheet.classList.remove('open');overlay.classList.remove('open');
    document.documentElement.style.overflow=orderChatPreviousOverflow;
    clearTimeout(orderChatClosingTimer);
    orderChatClosingTimer=setTimeout(()=>{if(sheet.classList.contains('open'))return;sheet.hidden=true;overlay.hidden=true;$('#orderChatFrame').removeAttribute('src');},240);
    if(orderChatOpener?.isConnected)orderChatOpener.focus({preventScroll:true});
    orderChatOpener=null;
  }
  function openOrderChatSheet(orderId,trigger){
    const order=state.orders.find(x=>String(x.id)===String(orderId));
    if(!order){toast('Pedido não localizado');return}
    const phone=String(order.whatsapp_phone_e164||order.delivery_address_snapshot?.phone||'').replace(/\D/g,'');
    if(![10,11,12,13].includes(phone.length)){toast('Este pedido não possui telefone válido para localizar a conversa');return}
    const params=new URLSearchParams({embedded:'order',phone,order:orderDisplayCode(order)});
    if(order.customer_id)params.set('customer_id',String(order.customer_id));
    const sheet=$('#orderChatSheet'),overlay=$('#orderChatOverlay'),frame=$('#orderChatFrame');
    clearTimeout(orderChatClosingTimer);
    orderChatOpener=trigger||null;
    $('#orderChatTitle').textContent='#'+orderDisplayCode(order)+' · '+(order.customer_name||'Cliente');
    $('#orderChatSubtitle').textContent='Conversa pelo WhatsApp · '+(orderCardPhone(order)||'');
    sheet.hidden=false;overlay.hidden=false;
    orderChatPreviousOverflow=document.documentElement.style.overflow;
    document.documentElement.style.overflow='hidden';
    // O iframe só é carregado após o clique, evitando consultas extras na fila de pedidos.
    frame.src='/vitrine/admin/atendimento/?'+params.toString();
    requestAnimationFrame(()=>{sheet.classList.add('open');overlay.classList.add('open');$('#orderChatClose').focus({preventScroll:true})});
  }
  document.addEventListener('marketing:open-order',async event=>{
    const orderId=String(event.detail?.order_id||'');if(!orderId)return;
    try{await setTab('orders');await openOrder(orderId)}catch(error){toast('Não foi possível abrir o pedido')}
  });
  document.addEventListener('marketing:open-conversation',async event=>{
    const orderId=String(event.detail?.order_id||'');if(!orderId)return;
    try{await setTab('orders');openOrderChatSheet(orderId,event.detail?.trigger||null)}catch(error){toast('Não foi possível abrir a conversa')}
  });
  $('#orderChatClose').onclick=closeOrderChatSheet;
  $('#orderChatOverlay').onclick=closeOrderChatSheet;
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#orderChatSheet').hidden){event.preventDefault();closeOrderChatSheet()}});
  function paintOrderRows(){
    const host=$('#orderRows');if(!host)return;
    const searching=Boolean(String(state.orderQuery||'').trim());
    const rows=state.orders.filter(o=>orderV3SearchMatch(o,state.orderQuery)&&orderStatusTabMatch(o,state.orderStatusTab,searching)).sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0));
    host.innerHTML=(rows.length?rows.map(orderRow).join(''):'<div class="empty">'+(searching?'Nenhum pedido encontrado na busca.':'Nenhum pedido nesta etapa.')+'</div>')+(state.orderHasMore?'<div class="more"><button class="secondary" id="loadMoreOrders" type="button">Carregar mais pedidos</button></div>':'');
    const more=$('#loadMoreOrders');if(more)more.onclick=async()=>{more.disabled=true;more.textContent='Carregando…';await loadOrders(false)};
    const top=$('#orderStatusTabsTop'),mobile=$('#orderStatusTabsMobile');
    if(top)top.innerHTML=orderStatusTabsHtml('orders-status-desktop');
    if(mobile)mobile.innerHTML=orderStatusTabsHtml('orders-status-mobile');
    bindOrderStatusTabs();
    host.querySelectorAll('[data-open-order]').forEach(b=>b.onclick=()=>openOrder(b.dataset.openOrder));
    host.querySelectorAll('[data-order-chat]').forEach(b=>b.onclick=()=>openOrderChatSheet(b.dataset.orderChat,b));
    host.querySelectorAll('[data-copy-separation]').forEach(b=>b.onclick=()=>copyOrderSeparationLink(b.dataset.copySeparation,b));
    host.querySelectorAll('[data-v3-confirm]').forEach(b=>b.onclick=()=>quickConfirmOrder(b.dataset.v3Confirm,b));
    host.querySelectorAll('[data-v3-separate],[data-v3-separation]').forEach(b=>b.onclick=()=>openOrderSeparationSheet(b.dataset.v3Separate||b.dataset.v3Separation));
    host.querySelectorAll('[data-v3-dispatch]').forEach(b=>b.onclick=()=>startOrderDispatchV4(b.dataset.v3Dispatch,b));
    host.querySelectorAll('[data-v3-deliver]').forEach(b=>b.onclick=()=>openOrderDeliveryConfirm(b.dataset.v3Deliver));
    host.querySelectorAll('[data-v3-delivery-fail]').forEach(b=>b.onclick=()=>returnOrderToExpedition(b.dataset.v3DeliveryFail,false));
  }
  async function startOrderDispatchV4(id,btn){
    const current=state.orders.find(o=>String(o.id)===String(id));
    if(!current||current.status!=='ready'){toast('Este pedido não está pronto para saída');return}
    const f=state.fiscalByOrder[id]||{};if(f.authorized!==true&&f.stage!=='authorized'){toast('A NF-e precisa estar autorizada antes da saída');return}
    if(!confirm('Confirmar que o pedido #'+orderDisplayCode(current)+' SAIU PARA ENTREGA?'))return;
    if(btn){btn.disabled=true;btn.textContent='REGISTRANDO SAÍDA…'}
    try{await api('order_dispatch_start_v4',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,operator:currentOperator()||'Expedição',idempotency_key:'dispatch-v4:'+id})});toast('Saída para entrega registrada');delete state.fiscalByOrder[id];await loadOrders();if(state.currentOrder?.order?.id===id)await openOrder(id)}catch(e){toast(errorMessage(e.message));if(btn){btn.disabled=false;btn.textContent='SAIU PARA ENTREGA'}}
  }
  async function quickConfirmOrder(id,btn){const current=state.orders.find(o=>String(o.id)===String(id));if(current&&orderCustomerDataPending(current)){toast('Complete os dados essenciais do cliente antes de confirmar');return}if(btn){btn.disabled=true;btn.textContent='CONFIRMANDO…'}try{await api('order_update',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,status:'confirmed',operator:currentOperator()||'Operação'})});toast('Pedido confirmado');await loadOrders()}catch(e){toast(errorMessage(e.message))}finally{if(btn&&document.contains(btn)){btn.disabled=false;btn.textContent='CONFIRMADO'}}}
  function closeOrderSeparationSheet(){document.querySelector('.orders-bottom-sheet-backdrop')?.remove()}
  function separationMoney(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
  async function openOrderSeparationSheet(id){const order=state.orders.find(o=>String(o.id)===String(id));if(order&&orderCustomerDataPending(order)){toast('Complete os dados essenciais do cliente antes da separação');return}if(order&&!orderV3Milestones(order).confirmed){toast('Confirme o pedido antes de iniciar a separação');return}const originalPublicCode=orderDisplayCode(order);closeOrderSeparationSheet();const back=document.createElement('div');back.className='orders-bottom-sheet-backdrop';back.innerHTML='<section class="orders-bottom-sheet" role="dialog" aria-modal="true"><header class="orders-sheet-head"><div><h2>Separação do pedido'+(originalPublicCode==='—'?'':' #'+esc(originalPublicCode))+'</h2><p>Marque cada produto como SEPARADO ou FALTOU.</p></div><button class="orders-sheet-close" type="button" aria-label="Fechar">×</button></header><div class="orders-sheet-body"><div class="loading">Carregando produtos…</div></div><footer class="orders-sheet-foot" hidden></footer></section>';document.body.appendChild(back);back.querySelector('.orders-sheet-close').onclick=closeOrderSeparationSheet;back.onclick=e=>{if(e.target===back){closeOrderSeparationSheet();return}const button=e.target.closest?.('[data-separation-state]');if(!button||button.disabled||back.dataset.separationBusy==='1'||!back.contains(button))return;e.preventDefault();setOrderSeparationItem(id,button.dataset.orderItem,button.dataset.separationState,back.dataset.orderUpdatedAt||'',back.dataset.separatorKey||'',back,button)};await loadOrderSeparationSheet(id,back)}
  async function assignOrderSeparator(orderId,key,current,back,btn){
    const next=ORDER_SEPARATORS.find(x=>x.key===key);if(!next)return;
    if(current?.separator_key===key||back?.dataset.separationBusy==='1')return;
    if(current?.separator_key&&!confirm('Este pedido está com '+(current.separator_label||separatorLabel(current.separator_key))+'.\n\nTrocar a separação para '+next.label+'?'))return;
    back.dataset.separationBusy='1';
    back.querySelectorAll('[data-separator-key]').forEach(button=>button.disabled=true);
    if(btn){btn.disabled=true;btn.textContent='SALVANDO…'}
    try{
      await api('order_separation_assign',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:orderId,separator_key:key})});
      toast('Separação atribuída a '+next.label);
      await loadOrderSeparationSheet(orderId,back);
      await refreshOrderSeparationBoard(true);
    }catch(e){toast(e.message==='invalid_separator'?'Responsável inválido. Atualize a página e tente novamente.':errorMessage(e.message));await loadOrderSeparationSheet(orderId,back)}
    finally{delete back.dataset.separationBusy}
  }
  async function loadOrderSeparationSheet(id,back=document.querySelector('.orders-bottom-sheet-backdrop')){
    if(!back)return;const body=back.querySelector('.orders-sheet-body'),foot=back.querySelector('.orders-sheet-foot');
    const savedScroll=back.dataset.separationOrderId===String(id)?Number(body.scrollTop||0):0;
    back.dataset.separationOrderId=String(id);
    try{
      const response=await api('order_separation_get',{id}),data=response.separation||response,items=Array.isArray(data.items)?data.items:[],componentBasketKeys=new Set(items.filter(x=>['basket_component','basket_mold_component'].includes(String(x.kind||''))).map(x=>String(x.basket_id||x.basket_name||'')).filter(Boolean)),visibleItems=items.filter(x=>!(['basket','basket_mold'].includes(String(x.kind||''))&&componentBasketKeys.has(String(x.basket_id||x.basket_name||x.name||'')))),completed=Boolean(data.completion?.completed_at),assignment=data.assignment&&data.assignment.separator_key?data.assignment:null,assigned=Boolean(assignment?.separator_key),pending=Number(data.counts?.pending||0),separated=Number(data.counts?.separated||0),missing=Number(data.counts?.missing||0),liveMissing=Number(data.missing_subtotal??data.completion?.missing_subtotal??visibleItems.filter(x=>String(x.state)==='missing').reduce((sum,x)=>sum+Number(x.line_total||0),0)),originalTotal=Number(data.original_total??data.completion?.original_total??data.total??0),finalTotal=Number(data.final_total??data.completion?.final_total??Math.max(0,originalTotal-liveMissing));back.dataset.orderUpdatedAt=String(data.order_updated_at||'');back.dataset.separatorKey=String(assignment?.separator_key||'');
      const picker='<section class="orders-separator-panel '+(completed?'completed':assigned?'assigned':'')+'"><div class="orders-separator-panel-head"><div><strong>'+(completed?'✓ Separação concluída por '+esc(assignment?.separator_label||separatorLabel(data.completion?.separator_key)||'separador'):assigned?'EM SEPARAÇÃO · '+esc(String(assignment.separator_label||separatorLabel(assignment.separator_key)).toUpperCase()):'Quem vai separar este pedido?')+'</strong><small>'+(completed?'Responsável registrado no histórico.':assigned?'Outro funcionário só deve trocar o responsável se realmente for assumir este pedido.':'Escolha o responsável antes de marcar os produtos.')+'</small></div></div>'+(!completed?'<div class="orders-separator-picker">'+ORDER_SEPARATORS.map(x=>'<button type="button" data-separator-key="'+x.key+'" class="'+(assignment?.separator_key===x.key?'active':'')+'">'+esc(x.label)+'</button>').join('')+'</div>':'')+'</section>';
      body.innerHTML=picker+'<div class="orders-separation-grid">'+visibleItems.map(x=>{
        const st=String(x.state||'pending'),klass=st==='separated'?' separated':st==='missing'?' missing':'',stateTag=st==='separated'?'<span class="orders-separation-state-tag separated">✓ SEPARADO</span>':st==='missing'?'<span class="orders-separation-state-tag missing">× FALTOU</span>':'';
        return '<article class="orders-separation-item'+klass+'"><div class="orders-separation-photo-wrap">'+(x.image_url?'<img src="'+esc(x.image_url)+'" alt="'+esc(x.name||'Produto')+'">':'<div class="orders-separation-placeholder"></div>')+stateTag+'</div><div class="orders-separation-name">'+esc(x.name||'Produto')+'</div><div class="orders-separation-info"><div class="orders-separation-qty"><span>QTD.</span><strong>'+esc(fmtQty(x.quantity))+'</strong></div><div class="orders-separation-price">'+esc(separationMoney(x.line_total))+'</div></div><div class="orders-separation-buttons"><button type="button" data-separation-state="separated" data-order-item="'+esc(x.order_item_id)+'" class="'+(st==='separated'?'active':'')+'" '+(completed||!assigned?'disabled':'')+'>SEPARADO</button><button type="button" data-separation-state="missing" data-order-item="'+esc(x.order_item_id)+'" class="'+(st==='missing'?'active':'')+'" '+(completed||!assigned?'disabled':'')+'>FALTOU</button></div></article>';
      }).join('')+'</div>'+(completed?'<div class="rule-notice" style="margin-top:10px"><strong>Separação concluída</strong><div>Cliente atualizado. A NF-e segue automaticamente para o fluxo fiscal; a expedição só será liberada após autorização.</div></div>':'');
      body.querySelectorAll('[data-separator-key]').forEach(button=>button.onclick=()=>assignOrderSeparator(id,button.dataset.separatorKey,assignment,back,button));
      body.scrollTop=savedScroll;
      foot.hidden=false;
      foot.innerHTML='<div class="orders-sheet-summary"><span>Pendentes: <strong>'+pending+'</strong></span><span>Separados: <strong>'+separated+'</strong></span><span>Faltou: <strong>'+missing+'</strong></span></div><div class="orders-sheet-financial"><span>Total original<strong>'+separationMoney(originalTotal)+'</strong></span><span class="discount">Abatimento por falta<strong>− '+separationMoney(liveMissing)+'</strong></span><span>Total atual<strong>'+separationMoney(finalTotal)+'</strong></span></div><button class="orders-sheet-complete" type="button" '+(pending||completed||!assigned?'disabled':'')+'>'+(completed?'SEPARAÇÃO CONCLUÍDA':!assigned?'ESCOLHA O SEPARADOR':'CONCLUIR SEPARAÇÃO')+'</button>';
      const complete=foot.querySelector('.orders-sheet-complete');if(!completed&&assigned)complete.onclick=()=>completeOrderSeparation(id,data.order_updated_at,assignment,back,complete);
    }catch(e){body.innerHTML='<div class="empty">Não consegui carregar a separação. '+esc(errorMessage(e.message))+'</div>';foot.hidden=true}
  }
  async function setOrderSeparationItem(orderId,itemId,separationState,expected,separatorKey,back,btn){
    if(!separatorKey){toast('Escolha quem está separando este pedido');return}
    if(!btn||btn.dataset.saving==='1'||back.dataset.separationBusy==='1')return;
    back.dataset.separationBusy='1';
    const actionLabel=separationState==='missing'?'FALTOU':'SEPARADO',buttons=[...back.querySelectorAll('[data-separation-state]')];
    btn.dataset.saving='1';btn.classList.add('saving');btn.classList.remove('saved','failed');btn.textContent='SALVANDO…';buttons.forEach(x=>x.disabled=true);
    const save=async(version,key)=>api('order_separation_item_set',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:orderId,order_item_id:itemId,state:separationState,expected_order_updated_at:version,separator_key:key,operator:separatorLabel(key)||'Separação'})});
    try{
      let result;
      try{result=await save(expected,separatorKey)}
      catch(e){
        if(!['stale_order_version','order_version_conflict'].includes(String(e.message||'')))throw e;
        const latestResponse=await api('order_separation_get',{id:orderId}),latest=latestResponse.separation||latestResponse,currentKey=latest.assignment?.separator_key||'';
        if(!currentKey||currentKey!==separatorKey)throw new Error('separator_assignment_changed');
        back.dataset.orderUpdatedAt=String(latest.order_updated_at||'');back.dataset.separatorKey=String(currentKey);
        result=await save(latest.order_updated_at,currentKey);
      }
      btn.classList.remove('saving');btn.classList.add('saved');btn.textContent='✓ SALVO';
      const nextVersion=result?.order_updated_at||result?.item?.order_updated_at||'';if(nextVersion)back.dataset.orderUpdatedAt=String(nextVersion);
      if(result?.warning==='bling_approval_pending')toast('✓ '+actionLabel+' salvo · Bling pendente, continue a separação');
      else toast('✓ '+actionLabel+' salvo');
      await refreshOrderSeparationBoard(true);
      await new Promise(resolve=>setTimeout(resolve,260));
      await loadOrderSeparationSheet(orderId,back);
    }catch(e){
      btn.classList.remove('saving');btn.classList.add('failed');btn.textContent='NÃO SALVO';
      const code=String(e.message||'');
      toast(code==='separator_assignment_changed'?'O responsável pela separação mudou. A marcação NÃO foi salva.':code==='bling_approval_required_before_separation'?'A marcação NÃO foi salva porque o Bling ainda não liberou o pedido.':('NÃO SALVO · '+errorMessage(code)));
      await new Promise(resolve=>setTimeout(resolve,700));
      await loadOrderSeparationSheet(orderId,back);
    }finally{
      if(btn)delete btn.dataset.saving;
      delete back.dataset.separationBusy;
    }
  }
  async function resolveOriginalOrderCodeForPackaging(orderId){
    let current=state.orders.find(o=>String(o.id)===String(orderId));
    let code=orderDisplayCode(current);
    if(code&&code!=='—')return code;
    try{
      const data=await api('order',{id:orderId});
      current=data?.order||null;
      code=orderDisplayCode(current);
      if(code&&code!=='—')return code;
    }catch{}
    return '';
  }
  async function showSeparationPackagingNotice(orderId,back){
    document.querySelector('.orders-packaging-backdrop')?.remove();
    const display=await resolveOriginalOrderCodeForPackaging(orderId);
    const pickerMode=document.documentElement.classList.contains('montar-picker-only');
    if(!display&&!pickerMode){
      toast('Separação concluída, mas não encontrei o número original do pedido. Abra o pedido antes de etiquetar a embalagem.');
      if(back?.isConnected)back.remove();else closeOrderSeparationSheet();
      await loadOrders();
      return;
    }
    const overlay=document.createElement('div');overlay.className='orders-packaging-backdrop';
    overlay.innerHTML='<section class="orders-packaging-sheet" role="dialog" aria-modal="true" aria-labelledby="packagingNoticeTitle"><div class="orders-packaging-kicker">Separação concluída</div><strong class="orders-packaging-number">#'+esc(display||'NÚMERO NÃO DISPONÍVEL')+'</strong><h2 class="orders-packaging-message" id="packagingNoticeTitle">ANOTE O NÚMERO DO PEDIDO NA EMBALAGEM</h2><button class="orders-packaging-ok" type="button">OK</button></section>';
    document.body.appendChild(overlay);
    overlay.querySelector('.orders-packaging-ok').onclick=async()=>{
      overlay.querySelector('.orders-packaging-ok').disabled=true;
      overlay.remove();
      if(back?.isConnected)back.remove();else closeOrderSeparationSheet();
      if(document.documentElement.classList.contains('montar-picker-only')){
        clearTimeout(overlay.__pickerReturnTimer);
        location.replace('/montar/?concluido='+encodeURIComponent(orderId));
        return;
      }
      await loadOrders();
      await refreshOrderSeparationBoard(true);
    };
    overlay.querySelector('.orders-packaging-ok').focus();
    if(document.documentElement.classList.contains('montar-picker-only')){
      const summary=document.createElement('p');
      summary.className='orders-packaging-auto-return';
      summary.textContent='A vitrine voltará à lista automaticamente em 12 segundos. Toque em OK para voltar agora.';
      overlay.querySelector('.orders-packaging-message').after(summary);
      overlay.__pickerReturnTimer=setTimeout(()=>{
        if(overlay.isConnected)location.replace('/montar/?concluido='+encodeURIComponent(orderId));
      },12000);
    }
  }
  async function completeOrderSeparation(id,expected,assignment,back,btn){
    if(!assignment?.separator_key){toast('Escolha quem está separando este pedido');return}
    if(btn.disabled)return;
    if(!confirm('Concluir a separação deste pedido como '+(assignment.separator_label||separatorLabel(assignment.separator_key))+'?\n\nA separação só será considerada concluída após a confirmação do servidor.'))return;
    btn.disabled=true;btn.textContent='CONCLUINDO…';
    let persisted=false;
    try{
      const result=await api('order_separation_complete',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:id,expected_order_updated_at:expected,separator_key:assignment.separator_key,operator:assignment.separator_label||separatorLabel(assignment.separator_key)||'Separação'})});
      if(result?.status!=='ready')throw new Error('separation_completion_unconfirmed');
      persisted=true;
      btn.textContent='✓ PEDIDO JÁ SEPARADO';
      // Post-save refresh must never suppress the completion receipt.
      refreshOrderSeparationBoard().catch(()=>{});
      await showSeparationPackagingNotice(id,back);
      if(!document.documentElement.classList.contains('montar-picker-only')){
        setTimeout(async()=>{try{const o=state.orders.find(x=>String(x.id)===String(id));if(o?.status==='ready'){await loadFiscalForOrders([o]);paintOrderRows()}}catch{}},5000);
      }
    }catch(e){
      if(persisted){
        toast('Separação salva, mas não foi possível abrir o aviso de embalagem.');
        if(document.documentElement.classList.contains('montar-picker-only'))location.replace('/montar/?concluido='+encodeURIComponent(id));
        return;
      }
      const reason=e.message==='separator_required'?'escolha o separador responsável':errorMessage(e.message);
      await loadOrderSeparationSheet(id,back);
      // The global toast is behind the full-screen vitrine: always show errors
      // inside the sticky footer, next to the completion action.
      const foot=back?.querySelector('.orders-sheet-foot');
      if(foot){
        const alert=document.createElement('div');
        alert.className='orders-sheet-completion-error';
        alert.setAttribute('role','alert');
        alert.textContent='NÃO FOI CONCLUÍDO. '+reason+'. Confira e tente novamente.';
        foot.prepend(alert);
      }else toast('A separação NÃO foi concluída · '+reason);
    }
  }
  function deliveryMethodV3(value){const s=normalize(value||'');if(s.includes('pix'))return 'pix';if(s.includes('dinheiro')||s==='cash')return 'cash';if(s.includes('credito')||s.includes('crédito')||s.includes('credit'))return 'credit_card';if(s.includes('refeicao')||s.includes('refeição')||s.includes('meal'))return 'meal_card';if(s.includes('alimentacao')||s.includes('alimentação')||s.includes('food'))return 'food_card';return 'other'}
  function deliveryMethodOptionsV3(current){const rows=[['pix','PIX'],['cash','Dinheiro'],['credit_card','Cartão de crédito'],['food_card','Cartão alimentação'],['meal_card','Cartão refeição'],['other','Outro']];return rows.map(([v,l])=>'<option value="'+v+'" '+(v===current?'selected':'')+'>'+l+'</option>').join('')}
  async function openOrderDeliveryConfirm(id){let order=state.orders.find(o=>String(o.id)===String(id));if(!order){await loadOrders();order=state.orders.find(o=>String(o.id)===String(id))}if(order&&orderCustomerDataPending(order)){toast('Complete os dados essenciais do cliente antes da entrega');return}if(!order||order.status!=='out_for_delivery'||orderV3Milestones(order).delivered){toast('O pedido precisa ter SAÍDO PARA ENTREGA antes da confirmação');return}const planned=order.payment_method_snapshot?.label||order.payment_method_snapshot?.method||'A confirmar',method=deliveryMethodV3(order.payment_method_snapshot?.method||planned);const dlg=document.createElement('dialog');dlg.className='delivery-v3-dialog';dlg.innerHTML='<div class="delivery-v3-body"><h2>Confirmar entrega</h2><div class="muted">Pedido #'+esc(orderDisplayCode(order))+'</div><div class="delivery-v3-grid"><label><span>Forma prevista</span><input value="'+esc(planned)+'" readonly></label><label><span>Forma recebida</span><select id="deliveryV3Method">'+deliveryMethodOptionsV3(method)+'</select></label><label><span>Valor recebido</span><input value="'+esc(money(order.total_cents||0))+'" readonly></label></div></div><div class="delivery-v3-actions"><button class="delivery-v3-cancel" type="button">Cancelar</button><button class="delivery-v3-confirm" type="button">CONFIRMAR ENTREGA</button></div>';document.body.appendChild(dlg);const close=()=>{dlg.close();dlg.remove()};dlg.querySelector('.delivery-v3-cancel').onclick=close;dlg.querySelector('.delivery-v3-confirm').onclick=async()=>{const btn=dlg.querySelector('.delivery-v3-confirm');btn.disabled=true;btn.textContent='CONFIRMANDO…';try{await api('order_delivery_complete_v3',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,method:dlg.querySelector('#deliveryV3Method').value,amount_cents:Number(order.total_cents||0),operator:currentOperator()||'Entrega',idempotency_key:'delivery-v3:'+id})});toast('Entrega e recebimento confirmados');close();await loadOrders();if(state.currentOrder?.order?.id===id)await openOrder(id)}catch(e){toast(errorMessage(e.message));btn.disabled=false;btn.textContent='CONFIRMAR ENTREGA'}};dlg.showModal()}
  async function sendOrderCustomerVitrineV3(id,btn){const access=String(sessionStorage.getItem('da_finance_access_token_v1')||'').trim();if(!access){toast('Sua sessão do Admin expirou');return}if(btn){btn.disabled=true;btn.textContent='ENVIANDO…'}try{const response=await fetch('https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/admin-order-vitrine-send-v1',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+access},body:JSON.stringify({order_id:id,request_id:(crypto.randomUUID?.()||String(Date.now())).replace(/[^A-Za-z0-9-]/g,'').slice(0,80)})}),data=await response.json().catch(()=>({}));if(!response.ok||data?.ok===false)throw new Error(data?.error||'vitrine_send_failed');toast('Vitrine enviada ao cliente pelo WhatsApp '+(String(data.channel_phone_e164||'').replace(/\D/g,'').endsWith('1018')?'1018':'0975'))}catch(e){toast(e.message==='conversation_not_found'||e.message==='channel_unavailable'?'Não encontrei com segurança a conversa 0975/1018 deste pedido.':errorMessage(e.message))}finally{if(btn&&document.contains(btn)){btn.disabled=false;btn.textContent='VITRINE CLIENTE'}}}
  async function reopenOrderV3(id){if(!confirm('Reabrir este pedido para edição? A reserva será liberada.'))return;try{await api('order_reopen_v3',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,operator:currentOperator()||'Operação'})});toast('Pedido reaberto para edição');await loadOrders();await openOrder(id)}catch(e){toast(errorMessage(e.message))}}

  function publicOrderUrlFor(o){const short=String(o?.public_order_url||'').trim();if(/^https:\/\/donaantonia\.com\.br\/p\/\?k=[a-f0-9]{16}$/i.test(short))return short;const id=String(o?.id||'').trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)?'https://donaantonia.com.br/pedido/?o='+encodeURIComponent(id):''}
  function orderPublicVitrineHtml(o){
    const url=publicOrderUrlFor(o);
    return '<div class="section-title">Vitrine do pedido</div><div class="rule-notice">'+
      '<strong>Fotos e quantidades do pedido salvo</strong><div class="sub">A mesma página criada pelo checkout. Disponível mesmo com estoque zerado ou negativo.</div>'+
      '<div class="order-public-link"><label><span>Link da vitrine do pedido</span><input id="orderPublicLink" type="text" readonly value="'+esc(url)+'" placeholder="Gere a vitrine para obter o link"></label><button class="primary" id="copyOrderPublicLink" type="button" '+(url?'':'disabled')+'>Copiar link</button></div>'+
      '<div class="order-public-actions"><button class="secondary" id="openOrderVitrine" type="button" '+(url?'':'disabled')+'>Abrir vitrine</button><button class="secondary" id="printOrderVitrine" type="button" '+(url?'':'disabled')+'>Imprimir vitrine</button><button class="secondary" id="generateOrderVitrine" type="button" '+(o?.id?'':'disabled')+'>Gerar vitrine</button></div></div>';
  }
  function bindCurrentOrderVitrine(){
    if($('#copyOrderPublicLink'))$('#copyOrderPublicLink').onclick=copyCurrentOrderPublicLink;
    if($('#openOrderVitrine'))$('#openOrderVitrine').onclick=openCurrentOrderVitrine;
    if($('#printOrderVitrine'))$('#printOrderVitrine').onclick=printCurrentOrderVitrine;
    if($('#generateOrderVitrine'))$('#generateOrderVitrine').onclick=generateCurrentOrderVitrine;
  }
  async function generateCurrentOrderVitrine(){
    const id=state.currentOrder?.order?.id,btn=$('#generateOrderVitrine');if(!id||btn?.disabled)return;
    if(btn){btn.disabled=true;btn.textContent='Gerando…'}
    try{
      const data=await api('order',{id});
      if(state.currentOrder?.order?.id!==id)return;
      if(data.order?.id!==id||!publicOrderUrlFor(data.order))throw new Error('link_unavailable');
      Object.assign(state.currentOrder.order,{public_order_url:data.order.public_order_url,public_order_code:data.order.public_order_code});
      const panel=$('#orderPublicVitrinePanel');if(panel){panel.innerHTML=orderPublicVitrineHtml(state.currentOrder.order);bindCurrentOrderVitrine()}
      toast('Vitrine do pedido disponível');
    }catch{if(state.currentOrder?.order?.id===id)toast('Não consegui gerar a vitrine agora. Tente novamente.')}
    finally{if(btn){btn.disabled=false;btn.textContent='Gerar vitrine'}}
  }
  async function copyCurrentOrderPublicLink(){
    const url=publicOrderUrlFor(state.currentOrder?.order);if(!url)return;
    try{await navigator.clipboard.writeText(url);toast('Link da vitrine copiado')}
    catch{
      const input=$('#orderPublicLink');input?.focus();input?.select();
      let copied=false;try{copied=document.execCommand('copy')}catch{}
      toast(copied?'Link da vitrine copiado':'O link está selecionado. Copie pelo teclado ou mantenha pressionado para copiar.');
    }
  }
  function openCurrentOrderVitrine(){
    const url=publicOrderUrlFor(state.currentOrder?.order);if(url)window.open(url,'_blank','noopener,noreferrer');
  }
  function printCurrentOrderVitrine(){
    const url=publicOrderUrlFor(state.currentOrder?.order);if(!url)return;
    const printUrl=new URL(url);printUrl.searchParams.set('print','1');
    window.open(printUrl.toString(),'_blank','noopener,noreferrer');
  }
  async function openOrder(id){
    $('#editorTitle').textContent='Pedido';$('#editorBody').innerHTML='<div class="loading">Carregando pedido…</div>';$('#editorActions').innerHTML='<button class="secondary" id="cancelEditor">Fechar</button>';$('#cancelEditor').onclick=()=>$('#editor').close();if(!$('#editor').open)$('#editor').showModal();
    try{const data=await api('order',{id});state.currentOrder=data;state.currentOrderFiscal=null;try{if(['confirmed','processing','ready','out_for_delivery','delivered'].includes(data.order?.status)){const sep=await api('order_separation_get',{id});data.separation=sep.separation||sep}}catch{}if(['ready','out_for_delivery','delivered'].includes(data.order?.status))await loadCurrentOrderFiscal(false);paintOrderDetail()}catch(e){$('#editorBody').innerHTML='<div class="empty">Não consegui abrir este pedido.</div>'}
  }
  function orderV3SeparationMap(){return new Map((state.currentOrder?.separation?.items||[]).map(x=>[String(x.order_item_id),String(x.state||'pending')]))}
  function orderV3DetailItemHtml(item,states){const st=states.get(String(item.id))||'',missing=st==='missing';const components=Array.isArray(item.components)?item.components:[];const componentHtml=components.length?'<div style="margin-top:7px">'+components.map(c=>{const cs=states.get(String(c.id))||'',cm=cs==='missing';return '<div class="muted" style="padding:3px 0">• '+esc(fmtQty(c.quantity))+' × '+esc(c.name_snapshot||'Produto')+(cm?'<span class="order-v3-missing">FALTOU</span>':'')+'</div>'}).join('')+'</div>':'';return '<div class="order-v3-item'+(missing?' missing':'')+'">'+(item.image_url?'<img src="'+esc(item.image_url)+'" alt="">':'<div class="order-v3-item-ph"></div>')+'<div><strong>'+esc(item.name_snapshot||'Produto')+'</strong>'+(missing?'<span class="order-v3-missing">FALTOU</span>':'')+'<small>Quantidade: '+esc(fmtQty(item.quantity||1))+'</small>'+componentHtml+'</div><strong>'+money(item.total_cents||Math.round(Number(item.line_total||0)*100))+'</strong></div>'}
  function orderV3PaymentOptions(current){const cur=deliveryMethodV3(current),rows=[['pix','PIX'],['cash','Dinheiro'],['credit_card','Cartão de crédito'],['food_card','Cartão alimentação'],['meal_card','Cartão refeição']];return rows.map(([v,l])=>'<option value="'+v+'" '+(v===cur?'selected':'')+'>'+l+'</option>').join('')}
  async function saveOrderV3(){const o=state.currentOrder?.order;if(!o||o.status==='delivered'||o.status==='cancelled')return;const btn=$('#saveOrder');if(btn){btn.disabled=true;btn.textContent='SALVANDO…'}try{await api('order_update',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:o.id,payment_method:$('#orderPayment')?.value||'',delivery_address:{customer_name:$('#orderDeliveryName')?.value||'',phone:$('#orderDeliveryPhone')?.value||'',postal_code:$('#orderDeliveryPostalCode')?.value||'',street:$('#orderDeliveryStreet')?.value||'',number:$('#orderDeliveryNumber')?.value||'',district:$('#orderDeliveryDistrict')?.value||'',complement:$('#orderDeliveryComplement')?.value||'',city:$('#orderDeliveryCity')?.value||'',state:$('#orderDeliveryState')?.value||'',raw_text:$('#orderDeliveryRawText')?.value||''},operator:currentOperator()||'Operação'})});toast('Dados do pedido atualizados');await openOrder(o.id);await loadOrders()}catch(e){toast(errorMessage(e.message));if(btn){btn.disabled=false;btn.textContent='Salvar dados'}}}
  function paintOrderDetail(){
    const d=state.currentOrder,o=d.order,c=d.customer||{},delivery=o.delivery_address_snapshot||c.address||{},milestones=orderV3Milestones(o),states=orderV3SeparationMap(),sep=d.separation||{},completion=sep.completion||{},original=Number(sep.original_total??completion.original_total??o.total_cents/100??0),missing=Number(sep.missing_subtotal??completion.missing_subtotal??0),finalTotal=Number(sep.final_total??completion.final_total??o.total_cents/100??0),sepStarted=Boolean(completion?.prepared_at||completion?.completed_at)||(sep.items||[]).some(x=>String(x.state||'pending')!=='pending'),locked=milestones.confirmed,editable=!milestones.delivered&&!milestones.cancelled,customerPending=orderCustomerDataPending(o),customerPendingReasons=orderCustomerDataPendingReasons(o);
    const fiscal=['ready','out_for_delivery','delivered'].includes(o.status)?'<div class="order-v3-section"><h3>Fiscal / NF-e</h3><div id="orderFiscalStatus">'+orderFiscalHtml(state.currentOrderFiscal,o)+'</div>'+fiscalCanaryActionHtml(state.currentOrderFiscal,o)+'<div class="print-actions">'+((state.currentOrderFiscal?.danfe_available||state.currentOrderFiscal?.authorized===true||state.currentOrderFiscal?.dispatch_gate?.authorized===true||state.currentOrderFiscal?.bling_invoice_id)?'<button class="secondary" id="printDanfe" type="button">Imprimir DANFE</button>':'')+'</div></div>':'';
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
  $('#editor').addEventListener('cancel',e=>{if($('#editor').classList.contains('product-editor-dialog'))e.preventDefault()});
  $('#editor').addEventListener('click',e=>{if(e.target===$('#editor')&&!$('#editor').classList.contains('product-editor-dialog'))$('#editor').close()});

  window.DonaAntoniaAdminBridge={
    api,
    openProductEditor:async productId=>{
      const id=String(productId||'');
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)){
        toast('Produto inválido');
        return;
      }
      setTab('products');
      await openProductEditor({id});
    },
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
      if(!uuid.test(directOrderId)){setTab('attendance');toast('Link de pedido inválido');return}
      state.orderStatusTab='new';
      await setTab('orders');
      await openOrder(directOrderId);
      history.replaceState({},'',location.pathname+location.hash);
      return;
    }
    if(!uuid.test(sharedSeparationId)){
      const isValidTab=tab=>Array.from(document.querySelectorAll('#adminNav [data-tab]')).some(item=>item.dataset.tab===tab);
      let restored='';
      try{
        const hashTab=decodeURIComponent(location.hash.replace(/^#/,''));
        const sessionTab=sessionStorage.getItem('da_admin_current_tab_v1')||'';
        const queryTab=params.get('tab')||'';
        restored=isValidTab(queryTab)?queryTab:isValidTab(sessionTab)?sessionTab:isValidTab(hashTab)?hashTab:'';
      }catch{}
      setTab(restored||'attendance');
      return;
    }
    await setTab('orders');
    await openOrderSeparationSheet(sharedSeparationId);
    history.replaceState({},'',location.pathname+location.hash);
  }
  start();
})();
