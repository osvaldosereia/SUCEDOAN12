import {catalog} from './catalog-api.js';
import {state,restore,setBasket,setBasketQuantity,addExtra,setExtraQuantity,setExtraProductQuantity,clearCart,cartCount,hasCart,cartCategories,cartProductIds,estimatedTotal,orderPayload} from './state.js';
import {renderCategoryChips,renderProductResults,renderProductDetail,renderOfferCard} from './products.js?v=20260912-1';
import {renderBasketCards,renderBasketPreview,renderBasketDetail} from './baskets.js?v=20260912-1';
import {renderCart} from './cart.js?v=20260912-1';
import {normalizePhone,renderCheckout,renderSuccess} from './checkout.js?v=20260912-1';
import {createOrder} from './order-api.js';

const $=id=>document.getElementById(id);
const app=$('app'),cartDrawer=$('cartDrawer'),cartBody=$('cartBody'),backdrop=$('drawerBackdrop'),productDialog=$('productDialog'),productDialogBody=$('productDialogBody');
let home={baskets:[],categories:[],featured:[]};
let current={mode:'featured',category:'',sub:'',subfilters:[],query:'',page:1,products:[],hasMore:false};
let prefetched=null,prefetchObserver=null,searchController=null,searchTimer=null,modalProduct=null,modalQty=1,previewBasketData=null,offerRequest=0,lastCartFocus=null;
let offerState={products:[],loading:false};
const productCache=new Map();

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function toast(message,kind=''){const host=$('toastRegion');const node=document.createElement('div');node.className=`toast ${kind}`.trim();node.textContent=message;host.appendChild(node);setTimeout(()=>node.remove(),kind==='error'?5000:2600)}
function loading(label='Carregando…'){app.innerHTML=`<div class="page-loading"><span></span><p>${esc(label)}</p></div>`}
function updateOrderButtons(){const count=cartCount();$('cartCount').textContent=count>99?'99+':String(count);$('cartCount').classList.toggle('hidden',count===0);$('mobileOrderButton').classList.toggle('hidden',count===0);$('mobileOrderCount').textContent=String(count);const label=$('mobileOrderButton')?.querySelector('span');if(label)label.textContent=count?`Pedido · ${money(estimatedTotal())}`:'Ver pedido'}
function openCart({preserveFocus=false}={}){if(!preserveFocus)lastCartFocus=document.activeElement;cartBody.innerHTML=renderCart();cartDrawer.classList.add('open');cartDrawer.setAttribute('aria-hidden','false');backdrop.classList.remove('hidden');document.body.classList.add('drawer-open');if(!preserveFocus)requestAnimationFrame(()=>$('closeCart')?.focus())}
function closeCart({restoreFocus=true}={}){cartDrawer.classList.remove('open');cartDrawer.setAttribute('aria-hidden','true');backdrop.classList.add('hidden');document.body.classList.remove('drawer-open');const focusTarget=lastCartFocus;lastCartFocus=null;if(restoreFocus&&focusTarget?.isConnected)requestAnimationFrame(()=>focusTarget.focus())}
function closeProductDialog(){if(productDialog.open)productDialog.close();productDialogBody.innerHTML='';modalProduct=null;modalQty=1}
function stopPrefetch(){prefetchObserver?.disconnect();prefetchObserver=null;prefetched=null}
function rememberProducts(rows=[]){for(const p of rows)productCache.set(p.id,p)}
function resetBrowse(){current={mode:'featured',category:'',sub:'',subfilters:[],query:'',page:1,products:[],hasMore:false};rememberProducts(home.featured)}
function trustMarkup(){return `<div class="trust-strip" aria-label="Informações de compra"><span>Entrega em <strong>Cuiabá e Várzea Grande</strong></span><span><strong>Pagamento na entrega</strong></span></div>`}

function currentResultsMarkup(){
  if(current.mode==='featured')return home.featured.length?renderProductResults({title:'Destaques',products:home.featured,hasMore:false,mode:'featured'}):'';
  if(current.mode==='category'||current.mode==='search')return renderProductResults({title:current.mode==='search'?'Resultados da busca':current.category||'Produtos',products:current.products,hasMore:current.hasMore,mode:current.mode,query:current.query,subfilters:current.subfilters,activeSub:current.sub});
  return '';
}
function browseMarkup(showTitle=true){return `<section class="catalog-tools">${showTitle?'<h2>Produtos</h2>':''}${renderCategoryChips(home.categories,current.category)}</section><div id="browseArea">${currentResultsMarkup()}</div>`}
function marketMarkup(showHeading=true){
  const heading=showHeading?'<div class="market-heading"><div><h2>Comprar outros produtos</h2><p>Busque pelo nome ou escolha uma categoria.</p></div></div>':'';
  return `<section id="marketSection" class="market-section">${heading}<div class="search-block"><label for="productSearchInput">O que você está procurando?</label><div class="search-box"><span aria-hidden="true">⌕</span><input id="productSearchInput" type="search" autocomplete="off" placeholder="Ex.: arroz, leite, detergente"></div></div>${browseMarkup(showHeading)}</section>`;
}
function offerInnerMarkup(){
  if(offerState.loading)return '<div class="offer-loading">Buscando as ofertas de hoje…</div>';
  if(!offerState.products.length)return '';
  return `<div class="offer-heading"><div><span class="eyebrow">Economize</span><h2>Ofertas de Hoje</h2><p>Selecionadas entre as categorias dos produtos que já estão no seu pedido.</p></div><div class="offer-carousel-controls" aria-label="Navegar pelas ofertas"><button class="offer-carousel-arrow" type="button" data-offer-prev aria-label="Ofertas anteriores">‹</button><button class="offer-carousel-arrow" type="button" data-offer-next aria-label="Próximas ofertas">›</button></div></div><div class="offer-carousel" data-offer-carousel aria-label="Ofertas de Hoje">${offerState.products.slice(0,10).map(renderOfferCard).join('')}</div>`;
}
function offerSectionMarkup(){return `<section id="relevantOffers" class="offer-section" aria-live="polite">${offerInnerMarkup()}</section>`}
function updateOfferArrows(){
  const carousel=document.querySelector('[data-offer-carousel]'),prev=document.querySelector('[data-offer-prev]'),next=document.querySelector('[data-offer-next]');
  if(!carousel||!prev||!next)return;
  const max=Math.max(0,carousel.scrollWidth-carousel.clientWidth),noOverflow=max<=4;
  prev.classList.toggle('hidden',noOverflow);next.classList.toggle('hidden',noOverflow);
  prev.disabled=noOverflow||carousel.scrollLeft<=4;next.disabled=noOverflow||carousel.scrollLeft>=max-4;
}
function scrollOffers(direction){
  const carousel=document.querySelector('[data-offer-carousel]');if(!carousel)return;
  const card=carousel.querySelector('.offer-card');const cardWidth=card?.getBoundingClientRect().width||160;const step=Math.max(cardWidth+10,carousel.clientWidth*.82);
  carousel.scrollBy({left:direction*step,behavior:'smooth'});
}

function renderHome(){
  stopPrefetch();previewBasketData=null;offerRequest++;offerState={products:[],loading:false};resetBrowse();
  app.innerHTML=`${trustMarkup()}<section class="home-section baskets-first"><div class="section-heading"><div><h1>Escolha sua cesta básica</h1><p>Veja o que vem em cada cesta e escolha a melhor para você.</p></div></div>${renderBasketCards(home.baskets,state.basket?.id||'')}</section>${marketMarkup()}`;
  syncVisibleProductQty();
}

async function loadHome(){
  loading('Abrindo vitrine…');
  try{const data=await catalog('home');home={baskets:data.baskets||[],categories:data.categories||[],featured:data.featured||[]};renderHome()}catch(e){app.innerHTML=`<div class="fatal"><h1>Não foi possível abrir a vitrine</h1><p>${esc(e.message)}</p><button class="primary-button" type="button" data-retry-home>Tentar novamente</button></div>`}
}

function browseArea(){return $('browseArea')}
function renderCurrentProducts(){
  const host=browseArea();if(!host)return;
  host.innerHTML=currentResultsMarkup();
  rememberProducts(current.products);syncVisibleProductQty();setupPrefetch();
}

async function loadCategory(name,page=1,append=false,sub=''){
  stopPrefetch();current.mode='category';current.category=name;current.sub=sub;current.query='';
  const host=browseArea();if(host&&!append)host.innerHTML='<div class="inline-loading">Carregando produtos…</div>';
  document.querySelectorAll('[data-category]').forEach(btn=>{const active=btn.dataset.category===name;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active))});
  try{
    const data=await catalog('category',{name,sub,page,limit:12});
    current.page=page;current.products=append?[...current.products,...(data.products||[])]:data.products||[];current.hasMore=data.has_more===true;current.subfilters=data.subfilters||current.subfilters||[];renderCurrentProducts();
    if(!append)setTimeout(()=>browseArea()?.scrollIntoView({behavior:'smooth',block:'start'}),20);
  }catch(e){if(host)host.innerHTML=`<div class="empty-state">${esc(e.message)} <button class="text-button" type="button" data-retry-category="${esc(name)}">Tentar novamente</button></div>`}
}

async function loadSearch(query,page=1,append=false){
  stopPrefetch();searchController?.abort();searchController=new AbortController();
  current.mode='search';current.category='';current.sub='';current.subfilters=[];current.query=query;
  document.querySelectorAll('[data-category]').forEach(btn=>{btn.classList.remove('active');btn.setAttribute('aria-pressed','false')});
  const host=browseArea();if(host&&!append)host.innerHTML='<div class="inline-loading">Buscando…</div>';
  try{
    const data=await catalog('search',{q:query,page,limit:12},{signal:searchController.signal,background:false});
    current.page=page;current.products=append?[...current.products,...(data.products||[])]:data.products||[];current.hasMore=data.has_more===true;renderCurrentProducts();
  }catch(e){if(e?.name==='AbortError')return;if(host)host.innerHTML=`<div class="empty-state">${esc(e.message)}</div>`}
}

function scheduleSearch(value){
  clearTimeout(searchTimer);const query=String(value||'').trim();
  if(query.length<2){searchController?.abort();resetBrowse();renderCurrentProducts();return}
  searchTimer=setTimeout(()=>loadSearch(query,1,false),250);
}

function prefetchParams(){if(!current.hasMore)return null;if(current.mode==='category')return {resource:'category',params:{name:current.category,sub:current.sub,page:current.page+1,limit:12}};if(current.mode==='search')return {resource:'search',params:{q:current.query,page:current.page+1,limit:12}};return null}
function setupPrefetch(){
  prefetchObserver?.disconnect();prefetchObserver=null;prefetched=null;const target=document.querySelector('[data-prefetch]'),next=prefetchParams();if(!target||!next)return;
  if(!('IntersectionObserver' in window))return;
  prefetchObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;prefetchObserver?.disconnect();catalog(next.resource,next.params).then(data=>{prefetched={key:JSON.stringify(next),data}}).catch(()=>{})}},{rootMargin:'500px 0px'});prefetchObserver.observe(target);
}
async function showMore(){
  const next=prefetchParams();if(!next)return;const key=JSON.stringify(next);let data=prefetched?.key===key?prefetched.data:null;
  if(!data)data=await catalog(next.resource,next.params);
  current.page+=1;current.products=[...current.products,...(data.products||[])];current.hasMore=data.has_more===true;current.subfilters=data.subfilters||current.subfilters;renderCurrentProducts();
}

async function openProduct(id){
  if(!productDialog.open)productDialog.showModal();productDialogBody.innerHTML='<div class="page-loading"><span></span><p>Carregando produto…</p></div>';
  try{const data=await catalog('product',{id},{background:false});modalProduct=data.product;productCache.set(modalProduct.id,modalProduct);const existing=state.extras[modalProduct.id];modalQty=existing?Number(existing.quantity||0):Math.min(1,Math.max(0,Number(modalProduct.stock||0)));productDialogBody.innerHTML=renderProductDetail(modalProduct,modalQty)}catch(e){productDialogBody.innerHTML=`<div class="empty-state">${esc(e.message)}<br><button class="secondary-button" type="button" data-close-product>Fechar</button></div>`}
}
function refreshProductDialog(){if(modalProduct)productDialogBody.innerHTML=renderProductDetail(modalProduct,modalQty)}

async function openBasket(id){
  stopPrefetch();loading('Abrindo cesta…');
  try{const data=await catalog('basket',{id});previewBasketData=data;app.innerHTML=renderBasketPreview(data.basket,data.items||[],state.basket?.id||'');window.scrollTo({top:0,behavior:'smooth'})}catch(e){toast(e.message,'error');renderHome()}
}
function renderSelectedBasketPage({resetProducts=true}={}){
  if(!state.basket)return renderHome();
  stopPrefetch();previewBasketData=null;if(resetProducts)resetBrowse();offerState={products:[],loading:true};
  app.innerHTML=`${renderBasketDetail(state.basket,state.basketItems)}${offerSectionMarkup()}${marketMarkup(false)}`;
  syncVisibleProductQty();refreshRelevantOffers();
}
function selectPreviewBasket(){
  const data=previewBasketData;if(!data?.basket)return;
  if(state.basket?.id===data.basket.id){renderSelectedBasketPage();window.scrollTo({top:0,behavior:'smooth'});return}
  if(state.basket&&!confirm('Trocar a cesta atual por esta?'))return;
  setBasket(data);updateOrderButtons();renderSelectedBasketPage();window.scrollTo({top:0,behavior:'smooth'});
}
function refreshBasket(){if(state.basket)renderSelectedBasketPage({resetProducts:false})}

async function refreshRelevantOffers(){
  const host=$('relevantOffers');if(!host||!state.basket)return;
  const categories=cartCategories(),exclude=cartProductIds();
  if(!categories.length){offerState={products:[],loading:false};host.innerHTML='';return}
  const request=++offerRequest;offerState.loading=true;host.innerHTML=offerInnerMarkup();
  try{
    const data=await catalog('offers',{categories:JSON.stringify(categories),exclude:JSON.stringify(exclude),limit:10},{background:false});
    if(request!==offerRequest)return;offerState={products:(data.products||[]).slice(0,10),loading:false};rememberProducts(offerState.products);host.innerHTML=offerInnerMarkup();syncVisibleProductQty();requestAnimationFrame(updateOfferArrows);
  }catch{if(request!==offerRequest)return;offerState={products:[],loading:false};host.innerHTML=''}
}
function syncVisibleProductQty(){document.querySelectorAll('[data-product-card]').forEach(card=>{const id=card.dataset.productCard,qty=Number(state.extras[id]?.quantity||0),product=productCache.get(id),stock=Math.max(0,Number(product?.stock||0)),add=card.querySelector('[data-add-extra]'),wrap=card.querySelector('[data-extra-qty-wrap]'),label=card.querySelector('[data-extra-qty]'),minus=card.querySelector('[data-extra-minus]'),plus=card.querySelector('[data-extra-plus]');if(label)label.textContent=String(qty);add?.classList.toggle('hidden',qty>0);wrap?.classList.toggle('hidden',qty===0);if(add)add.disabled=stock<1;if(minus)minus.disabled=qty<=0;if(plus)plus.disabled=qty>=stock})}
function afterCartMutation(){syncVisibleProductQty();updateOrderButtons();refreshRelevantOffers()}

function goCheckout(){closeCart({restoreFocus:false});if(!hasCart()){toast('Seu pedido está vazio.','error');return}app.innerHTML=renderCheckout({basket:state.basket,basketItems:state.basketItems,extras:state.extras,total:estimatedTotal()});window.scrollTo({top:0});setTimeout(()=>$('checkoutPhone')?.focus(),40)}
async function submitOrder(form){const button=$('checkoutSubmit');try{const contact=normalizePhone(new FormData(form).get('phone'));if(!contact){toast('Confira o telefone com DDD.','error');return}button.disabled=true;button.textContent='Salvando…';const data=await createOrder(orderPayload(contact));clearCart();updateOrderButtons();app.innerHTML=renderSuccess(data.order);window.scrollTo({top:0})}catch(e){toast(e.message,'error');if(button){button.disabled=false;button.textContent='Confirmar pedido'}}}

app.addEventListener('click',async e=>{
  const target=e.target.closest('button,a');if(!target)return;
  if(target.matches('[data-offer-prev]')){scrollOffers(-1);return}
  if(target.matches('[data-offer-next]')){scrollOffers(1);return}
  if(target.matches('[data-open-basket]')){await openBasket(target.dataset.openBasket);return}
  if(target.matches('[data-select-basket]')){selectPreviewBasket();return}
  if(target.matches('[data-open-product]')){await openProduct(target.dataset.openProduct);return}
  if(target.matches('[data-category]')){await loadCategory(target.dataset.category,1,false,'');return}
  if(target.matches('[data-subfilter]')){await loadCategory(current.category,1,false,target.dataset.subfilter||'');return}
  if(target.matches('[data-more]')){target.disabled=true;target.textContent='Carregando…';try{await showMore()}catch(err){toast(err.message,'error')}return}
  if(target.matches('[data-retry-category]')){await loadCategory(target.dataset.retryCategory,1,false,current.sub);return}
  if(target.matches('[data-retry-home]')){await loadHome();return}
  if(target.matches('[data-back-shopping]')){if(state.basket)renderSelectedBasketPage({resetProducts:false});else renderHome();window.scrollTo({top:0,behavior:'smooth'});return}
  if(target.matches('[data-home]')){closeCart();closeProductDialog();renderHome();window.scrollTo({top:0,behavior:'smooth'});return}
  if(target.matches('[data-open-cart]')){openCart();return}
  if(target.matches('[data-new-order]')){clearCart();updateOrderButtons();renderHome();return}
  if(target.matches('[data-add-extra]')){const product=productCache.get(target.dataset.addExtra);if(product){addExtra(product,1);afterCartMutation();toast('Produto adicionado ao pedido.','success')}return}
  const card=target.closest('[data-product-card]');if(card&&(target.matches('[data-extra-minus]')||target.matches('[data-extra-plus]'))){const product=productCache.get(card.dataset.productCard);if(product){addExtra(product,target.matches('[data-extra-plus]')?1:-1);afterCartMutation()}return}
  const basketRow=target.closest('[data-basket-product]');if(basketRow&&(target.matches('[data-basket-minus]')||target.matches('[data-basket-plus]'))){const item=state.basketItems.find(i=>i.product_id===basketRow.dataset.basketProduct);if(item){setBasketQuantity(item.product_id,Number(item.quantity)+(target.matches('[data-basket-plus]')?1:-1));updateOrderButtons();refreshBasket()}return}
});
app.addEventListener('scroll',e=>{if(e.target?.matches?.('[data-offer-carousel]'))updateOfferArrows()},true);
window.addEventListener('resize',updateOfferArrows);

app.addEventListener('input',e=>{if(e.target.id==='productSearchInput')scheduleSearch(e.target.value)});
document.addEventListener('submit',e=>{if(e.target.id==='checkoutForm'){e.preventDefault();submitOrder(e.target)}});
document.addEventListener('click',e=>{const t=e.target.closest('button,a');if(!t)return;if(t.matches('[data-home]')&&!app.contains(t)){closeCart();closeProductDialog();renderHome();window.scrollTo({top:0,behavior:'smooth'});return}if(t.id==='cartButton'||t.id==='mobileOrderButton'){openCart();return}if(t.id==='closeCart'){closeCart();return}if(productDialog.contains(t)){if(t.matches('[data-close-product]')){closeProductDialog();return}if(t.matches('[data-modal-extra-minus]')){modalQty=Math.max(0,modalQty-1);refreshProductDialog();return}if(t.matches('[data-modal-extra-plus]')){modalQty=Math.min(Number(modalProduct?.stock||0),modalQty+1);refreshProductDialog();return}if(t.matches('[data-modal-save-product]')&&modalProduct){const savedQty=modalQty;setExtraProductQuantity(modalProduct,savedQty);closeProductDialog();afterCartMutation();toast(savedQty===0?'Produto removido do pedido.':'Produto adicionado ao pedido.','success');return}}if(cartDrawer.contains(t)){if(t.matches('[data-close-cart]')){closeCart();return}if(t.matches('[data-checkout]')){goCheckout();return}if(t.matches('[data-clear-cart]')){if(confirm('Limpar todo o pedido?')){clearCart();updateOrderButtons();openCart({preserveFocus:true});refreshRelevantOffers()}return}if(t.matches('[data-cart-basket-minus]')||t.matches('[data-cart-basket-plus]')){const id=t.dataset.cartBasketMinus||t.dataset.cartBasketPlus;const item=state.basketItems.find(i=>i.product_id===id);if(item){setBasketQuantity(id,Number(item.quantity)+(t.matches('[data-cart-basket-plus]')?1:-1));updateOrderButtons();openCart({preserveFocus:true});refreshRelevantOffers()}return}if(t.matches('[data-cart-extra-minus]')){setExtraQuantity(t.dataset.cartExtraMinus,Number(state.extras[t.dataset.cartExtraMinus]?.quantity||0)-1);updateOrderButtons();openCart({preserveFocus:true});refreshRelevantOffers();return}if(t.matches('[data-cart-extra-plus]')){setExtraQuantity(t.dataset.cartExtraPlus,Number(state.extras[t.dataset.cartExtraPlus]?.quantity||0)+1);updateOrderButtons();openCart({preserveFocus:true});refreshRelevantOffers();return}}});
backdrop.addEventListener('click',closeCart);productDialog.addEventListener('click',e=>{if(e.target===productDialog)closeProductDialog()});productDialog.addEventListener('close',()=>{modalProduct=null;modalQty=1});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&cartDrawer.classList.contains('open'))closeCart()});

async function boot(){restore();updateOrderButtons();await loadHome()}
boot();
