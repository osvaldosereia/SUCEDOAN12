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
  const fiscalReadRevisions=new Map();
  const fiscalReads=Object.freeze({
    begin(id){const key=String(id),revision=(fiscalReadRevisions.get(key)||0)+1;fiscalReadRevisions.set(key,revision);return revision},
    isCurrent(id,revision){return fiscalReadRevisions.get(String(id))===revision},
    invalidate(id){const key=String(id),revision=(fiscalReadRevisions.get(key)||0)+1;fiscalReadRevisions.set(key,revision);return revision}
  });
  const {load:loadFiscalForOrders}=window.DonaAntoniaAdminFiscalLoader.create({api,getCache:()=>state.fiscalByOrder,reads:fiscalReads});
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
    const response=await fetch(CUSTOMER_AP