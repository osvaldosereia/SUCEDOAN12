import {
  MAX_PRODUCT_BATCH,
  attendanceProductSelection,
  attendanceProductFailedSelection,
  isAttendanceProductSelected,
  toggleAttendanceProductSelection,
  clearAttendanceProductSelection,
  sendAttendanceProductBatch,
  retryFailedAttendanceProducts
} from './attendance-product-send.js?v=product-media-v1';

const OFFERS_API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/storefront-v2?action=offers';
const CACHE_MS=30000;
let cachedOffers=[];
let cachedAt=0;
let loadingPromise=null;
let sending=false;
let observerQueued=false;

const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const offersTab=()=>document.querySelector('.context-tabs [data-context-tab="offers"]');
const contextBody=()=>document.querySelector('#contextBody');
const selectedConversationId=()=>document.querySelector('.queue-card.selected')?.dataset?.conversationId||'';
const serviceWindowOpen=()=>document.querySelector('#serviceWindow')?.classList.contains('open')===true;
const isOffersActive=()=>offersTab()?.classList.contains('active')===true;

export function formatAttendanceOfferSendError(code){
  switch(String(code||'').trim()){
    case 'meta_canary_destination_blocked': return 'Não foi possível enviar a imagem: este canal ainda não está liberado para imagens nesta conversa.';
    case 'meta_media_canary_not_enabled':
    case 'meta_canary_not_enabled': return 'O envio de imagem está temporariamente indisponível neste canal.';
    case 'human_send_not_homologated': return 'Este canal ainda não está liberado para envio de mídia pelo atendimento.';
    case 'service_window_closed': return 'Janela de 24h encerrada. Produtos não podem ser enviados nesta conversa.';
    case 'rate_limited': return 'Muitos envios em sequência. Aguarde um momento e tente novamente.';
    case 'meta_transport_not_configured': return 'O canal Meta não está configurado para enviar imagens.';
    case 'meta_send_uncertain': return 'A Meta não confirmou o envio. Atualize a conversa antes de tentar novamente.';
    default: return 'Não foi possível enviar as ofertas agora. Tente novamente.';
  }
}

function normalizeOffer(item){
  const id=String(item?.id||item?.product_id||'').trim();
  if(!id)return null;
  return {
    id,
    name:item?.name||'Produto',
    gtin:item?.gtin||null,
    image_url:item?.image_url||null,
    sale_price:Number(item?.regular_price_cents??item?.price_cents??0)/100,
    sellable_stock:Math.max(0,Number(item?.stock_quantity||0)),
    offer:{active:true,price:Number(item.price_cents||0)/100}
  };
}

async function fetchOffers({force=false}={}){
  if(!force&&cachedAt&&Date.now()-cachedAt<CACHE_MS)return cachedOffers;
  if(loadingPromise)return await loadingPromise;
  loadingPromise=(async()=>{
    const response=await fetch(OFFERS_API,{method:'GET',cache:'no-store',credentials:'omit'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data?.ok===false)throw new Error(data?.error||`offers_${response.status}`);
    cachedOffers=(Array.isArray(data.offers)?data.offers:[]).map(normalizeOffer).filter(Boolean);
    cachedAt=Date.now();
    return cachedOffers;
  })();
  try{return await loadingPromise}finally{loadingPromise=null}
}

function syncCards(list){
  for(const card of list.querySelectorAll('.product-card[data-product-id]')){
    const active=isAttendanceProductSelected(card.dataset.productId);
    card.classList.toggle('selected',active);
    const button=card.querySelector('.product-select-btn');
    if(button){button.classList.toggle('active',active);button.textContent=active?'Selecionado':'Selecionar'}
  }
}

function syncBatchBar(root,message=''){
  const list=root.querySelector('.products-list'),bar=root.querySelector('.product-batch-bar');
  if(!list||!bar)return;
  const selected=attendanceProductSelection(),failed=attendanceProductFailedSelection(),count=selected.length;
  const status=bar.querySelector('[data-product-batch-status]'),clear=bar.querySelector('[data-product-batch-clear]'),send=bar.querySelector('[data-product-batch-send]');
  const windowOpen=serviceWindowOpen(),conversationId=selectedConversationId();
  if(status){
    if(message)status.textContent=message;
    else if(!conversationId)status.textContent='Selecione uma conversa para enviar.';
    else if(!windowOpen&&count)status.textContent='Janela de 24h encerrada. Produtos não podem ser enviados.';
    else status.textContent=count?`${count} de ${MAX_PRODUCT_BATCH} selecionado${count===1?'':'s'}`:`Selecione até ${MAX_PRODUCT_BATCH} produtos.`;
  }
  if(clear)clear.disabled=sending||count===0;
  if(send){
    const retry=failed.length>0&&failed.length===count;
    bar.dataset.retry=retry?'true':'false';
    send.textContent=retry?`Tentar novamente ${failed.length}`:`Enviar ${count} produto${count===1?'':'s'}`;
    send.disabled=sending||count===0||!windowOpen||!conversationId;
  }
  syncCards(list);
}

function productCard(product,root){
  const card=document.createElement('article');
  card.className='product-card';
  card.dataset.productId=product.id;
  if(isAttendanceProductSelected(product.id))card.classList.add('selected');
  const line=document.createElement('div');line.className='product-line';
  if(product.image_url){const img=document.createElement('img');img.className='product-thumb';img.src=product.image_url;img.alt=product.name||'Produto';img.loading='lazy';line.append(img)}
  const meta=document.createElement('div');
  const name=document.createElement('strong');name.textContent=product.name||'Produto';
  const price=document.createElement('div');price.className='product-price';price.textContent=`${money(product.offer?.price)} · estoque ${Number(product.sellable_stock||0)}`;
  meta.append(name,price);line.append(meta);card.append(line);
  const actions=document.createElement('div');actions.className='product-card-actions';
  const select=document.createElement('button');select.type='button';select.className='product-select-btn';select.textContent=isAttendanceProductSelected(product.id)?'Selecionado':'Selecionar';
  select.classList.toggle('active',isAttendanceProductSelected(product.id));
  select.onclick=()=>{
    const result=toggleAttendanceProductSelection(product);
    if(result.ok!==true){syncBatchBar(root,`Limite de ${MAX_PRODUCT_BATCH} produtos por envio.`);return}
    syncBatchBar(root);
  };
  actions.append(select);card.append(actions);
  return card;
}

async function sendSelected(root,retry=false){
  if(sending)return;
  const conversationId=selectedConversationId(),windowOpen=serviceWindowOpen();
  if(!conversationId){syncBatchBar(root,'Selecione uma conversa antes de enviar.');return}
  if(!windowOpen){syncBatchBar(root,'Janela de 24h encerrada. Produtos não podem ser enviados.');return}
  const products=retry?attendanceProductFailedSelection():attendanceProductSelection();
  if(!products.length){syncBatchBar(root);return}
  sending=true;syncBatchBar(root,`Preparando ${products.length} produto${products.length===1?'':'s'}…`);
  try{
    const runner=retry?retryFailedAttendanceProducts:sendAttendanceProductBatch;
    const options={conversationId,serviceWindowOpen:windowOpen,onProgress:info=>{if(selectedConversationId()!==conversationId)return;if(info.phase==='sending')syncBatchBar(root,`Enviando ${info.current} de ${info.total}…`)}};
    if(!retry)options.products=products;
    const result=await runner(options);
    if(selectedConversationId()!==conversationId)return;
    const sent=result.sent?.length||0,failed=result.failed?.length||0;
    const stoppedMessage=result.stopped_by?formatAttendanceOfferSendError(result.stopped_by):'';
    syncBatchBar(root,stoppedMessage||(failed?`${sent} enviado${sent===1?'':'s'} · ${failed} falhou`:`${sent} produto${sent===1?' enviado':'s enviados'}`));
    if(sent){setTimeout(()=>document.querySelector('.queue-card.selected')?.click(),150)}
  }catch(error){
    if(selectedConversationId()===conversationId)syncBatchBar(root,formatAttendanceOfferSendError(error?.code||error?.message));
  }finally{
    sending=false;
    if(root.isConnected)syncBatchBar(root);
  }
}

async function renderOffers({force=false}={}){
  const box=contextBody();if(!box||!isOffersActive())return;
  box.replaceChildren();
  const root=document.createElement('div');root.dataset.offersRoot='true';
  if(!selectedConversationId()){
    root.innerHTML='<div class="context-empty">Selecione uma conversa para ver e enviar ofertas.</div>';
    box.append(root);return;
  }
  const bar=document.createElement('div');bar.className='product-batch-bar';
  const status=document.createElement('span');status.dataset.productBatchStatus='';
  const actions=document.createElement('div');actions.className='product-batch-actions';
  const clear=document.createElement('button');clear.type='button';clear.dataset.productBatchClear='';clear.textContent='Limpar';clear.onclick=()=>{clearAttendanceProductSelection();syncBatchBar(root)};
  const send=document.createElement('button');send.type='button';send.dataset.productBatchSend='';send.className='primary';send.textContent='Enviar 0 produtos';send.onclick=()=>sendSelected(root,bar.dataset.retry==='true').catch(()=>{});
  actions.append(clear,send);bar.append(status,actions);
  const list=document.createElement('div');list.className='products-list';list.innerHTML='<div class="context-empty">Carregando ofertas…</div>';
  root.append(bar,list);box.append(root);syncBatchBar(root);
  try{
    const products=await fetchOffers({force});
    if(!root.isConnected||!isOffersActive())return;
    list.replaceChildren();
    for(const product of products)list.append(productCard(product,root));
    if(!products.length)list.innerHTML='<div class="context-empty">Nenhum produto em oferta no momento.</div>';
    syncBatchBar(root);
  }catch{
    if(root.isConnected)list.innerHTML='<div class="context-empty">Não foi possível carregar as ofertas.</div>';
  }
}

function queueObserverRender(){
  if(observerQueued||!isOffersActive())return;
  observerQueued=true;
  queueMicrotask(()=>{
    observerQueued=false;
    const box=contextBody();
    if(isOffersActive()&&box&&!box.querySelector('[data-offers-root]'))renderOffers().catch(()=>{});
  });
}

const tab=offersTab(),box=contextBody();
if(tab&&box){
  tab.addEventListener('click',()=>renderOffers({force:true}).catch(()=>{}));
  new MutationObserver(queueObserverRender).observe(box,{childList:true,subtree:false});
  document.addEventListener('attendance:conversation-refreshed',()=>{if(isOffersActive()){const root=box.querySelector('[data-offers-root]');if(root)syncBatchBar(root)}});
}
