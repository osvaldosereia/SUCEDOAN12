import {catalog} from './catalog-api.js';
import {state,restore,setBasket,setBasketQuantity,addExtra,setExtraQuantity,setExtraProductQuantity,clearCart,cartCount,hasCart,estimatedTotal,orderPayload} from './state.js';
import {renderCategoryChips,renderProductResults,renderProductDetail} from './products.js';
import {renderBasketCards,renderBasketPreview,renderBasketDetail} from './baskets.js?v=20260911-5';
import {renderCart} from './cart.js';
import {normalizePhone,renderCheckout,renderSuccess} from './checkout.js';
import {createOrder} from './order-api.js';

const $=id=>document.getElementById(id);
const app=$('app'),cartDrawer=$('cartDrawer'),cartBody=$('cartBody'),backdrop=$('drawerBackdrop'),productDialog=$('productDialog'),productDialogBody=$('productDialogBody');
let home={baskets:[],categories:[],featured:[]};
let current={mode:'featured',category:'',sub:'',subfilters:[],query:'',page:1,products:[],hasMore:false};
let prefetched=null,prefetchObserver=null,searchController=null,searchTimer=null,modalProduct=null,modalQty=1,previewBasketData=null,marketVisible=false;
const productCache=new Map();

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}
function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function toast(message,kind=''){const host=$('toastRegion');const node=document.createElement('div');node.className=`toast ${kind}`.trim();node.textContent=message;host.appendChild(node);setTimeout(()=>node.remove(),kind==='error'?5000:2600)}
function loading(label='Carregando…'){app.innerHTML=`<div class="page-loading"><span></span><p>${esc(label)}</p></div>`}
function updateOrderButtons(){const count=cartCount();$('cartCount').textContent=count>99?'99+':String(count);$('cartCount').classList.toggle('hidden',count===0);$('mobileOrderButton').classList.toggle('hidden',count===0);$('mobileOrderCount').textContent=String(count);const label=$('mobileOrderButton')?.querySelector('span');if(label)label.textContent=count?`Pedido · ${money(estimatedTotal())}`:'Ver pedido'}
function openCart(){cartBody.innerHTML=renderCart();cartDrawer.classList.add('open');cartDrawer.setAttribute('aria-hidden','false');backdrop.classList.remove('hidden');document.body.classList.add('drawer-open')}
function closeCart(){cartDrawer.classList.remove('open');cartDrawer.setAttribute('aria-hidden','true');backdrop.classList.add('hidden');document.body.classList.remove('drawer-open')}
function closeProductDialog(){if(productDialog.open)productDialog.close();productDialogBody.innerHTML='';modalProduct=null;modalQty=1}
function stopPrefetch(){prefetchObserver?.disconnect();prefetchObserver=null;prefetched=null}
function rememberProducts(rows=[]){for(const p of rows)productCache.set(p.id,p)}

function browseMarkup(){
  const featured=current.mode==='featured'&&home.featured.length?renderProductResults({title:'Destaques',products:home.featured,hasMore:false,mode:'featured'}):'';
  return `<section class="catalog-tools"><h2>Produtos</h2>${renderCategoryChips(home.categories,current.category)}</section><div id="browseArea">${featured}</div>`;
}
function marketMarkup(){
  if(!marketVisible)return `<section class="market-entry"><div><h2>Quer comprar sem cesta?</h2><p>Monte seu pedido escolhendo os produtos que quiser.</p></div><button class="secondary-button" type="button" data-open-market>Montar meu pedido</button></section>`;
  return `<section id="marketSection" class="market-section"><div class="market-heading"><div><h2>Monte seu pedido</h2><p>Busque um produto ou escolha uma categoria.</p></div></div><div class="search-block"><label for="productSearchInput">Buscar produto</label><div class="search-box"><span aria-hidden="true">⌕</span><input id="productSearchInput" type="search" autocomplete="off" placeholder="Ex.: arroz, detergente, shampoo"></div></div>${browseMarkup()}</section>`;
}
function renderHome(){
  stopPrefetch();previewBasketData=null;current={mode:'featured',category:'',sub:'',subfilters:[],query:'',page:1,products:[],hasMore:false};rememberProducts(home.featured);
  app.innerHTML=`<section class="home-section baskets-first"><div class="section-heading"><div><h1>Escolha sua cesta</h1><p>Veja os produtos primeiro. A cesta só entra no pedido quando você escolher.</p></div></div>${renderBasketCards(home.baskets,state.basket?.id||'')}</section>${marketMarkup()}`;
  syncVisibleProductQty();
}

async function loadHome(){
  loading('Abrindo vitrine…');
  try{const data=await catalog('home');home={baskets:data.baskets||[],categories:data.categories||[],featured:data.featured||[]};renderHome()}catch(e){app.innerHTML=`<div class="fatal"><h1>Não foi possível abrir a vitrine</h1><p>${esc(e.message)}</p><button class="primary-button" type="button" data-retry-home>Tentar novamente</button></div>`}
}

function openMarket(){marketVisible=true;renderHome();setTimeout(()=>$('marketSection')?.scrollIntoView({behavior:'smooth',block:'start'}),20)}
function browseArea(){return $('browseArea')}
function renderCurrentProducts(){
  const host=browseArea();if(!host)return;
  const title=current.mode==='search'?'Resultados da busca':current.category||'Produtos';
  host.innerHTML=renderProductResults({title,products:current.products,hasMore:current.hasMore,mode:current.mode,query:current.query,subfilters:current.subfilters,activeSub:current.sub});
  rememberProducts(current.products);syncVisibleProductQty();setupPrefetch();
}

async function loadCategory(name,page=1,append=false,sub=''){
  stopPrefetch();current.mode='category';current.category=name;current.sub=sub;current.query='';
  const host=browseArea();if(host&&!append)host.innerHTML='<div class="inline-loading">Carregando produtos…</div>';
  document.querySelectorAll('[data-category]').forEach(btn=>btn.classList.toggle('active',btn.dataset.category===name));
  try{
    const data=await catalog('category',{name,sub,page,limit:12});
    current.page=page;current.products=append?[...current.products,...(data.products||[])]:data.products||[];current.hasMore=data.has_more===true;current.subfilters=data.subfilters||current.subfilters||[];renderCurrentProducts();
    if(!append)setTimeout(()=>browseArea()?.scrollIntoView({behavior:'smooth',block:'start'}),20);
  }catch(e){if(host)host.innerHTML=`<div class="empty-state">${esc(e.message)} <button class="text-button" type="button" data-retry-category="${esc(name)}">Tentar novamente</button></div>`}
}

async function loadSearch(query,page=1,append=false){
  stopPrefetch();searchController?.abort();searchController=new AbortController();
  current.mode='search';current.category='';current.sub='';current.subfilters=[];current.query=query;
  document.querySelectorAll('[data-category]').forEach(btn=>btn.classList.remove('active'));
  const host=browseArea();if(host&&!append)host.innerHTML='<div class="inline-loading">Buscando…</div>';
  try{
    const data=await catalog('search',{q:query,page,limit:12},{signal:searchController.signal,background:false});
    current.page=page;current.products=append?[...current.products,...(data.products||[])]:data.products||[];current.hasMore=data.has_more===true;renderCurrentProducts();
  }catch(e){if(e?.name==='AbortError')return;if(host)host.innerHTML=`<div class="empty-state">${esc(e.message)}</div>`}
}

function scheduleSearch(value){
  clearTimeout(searchTimer);const query=String(value||'').trim();
  if(query.length<2){searchController?.abort();current={mode:'featured',category:'',sub:'',subfilters:[],query:'',page:1,products:[],hasMore:false};const host=browseArea();if(host)host.innerHTML=home.featured.length?renderProductResults({title:'Destaques',products:home.featured,hasMore:false,mode:'featured'}):'';syncVisibleProductQty();return}
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
  try{const data=await catalog('product',{id},{background:false});modalProduct=data.product;productCache.set(modalProduct.id,modalProduct);modalQty=Math.max(1,Number(state.extras[modalProduct.id]?.quantity||1));productDialogBody.innerHTML=renderProductDetail(modalProduct,modalQty)}catch(e){productDialogBody.innerHTML=`<div class="empty-state">${esc(e.message)}<br><button class="secondary-button" type="button" data-close-product>Fechar</button></div>`}
}
function refreshProductDialog(){if(modalProduct)productDialogBody.innerHTML=renderProductDetail(modalProduct,modalQty)}

async function openBasket(id){
  stopPrefetch();loading('Abrindo cesta…');
  try{const data=await catalog('basket',{id});previewBasketData=data;app.innerHTML=renderBasketPreview(data.basket,data.items||[],state.basket?.id||'');window.scrollTo({top:0,behavior:'smooth'})}catch(e){toast(e.message,'error');renderHome()}
}
function selectPreviewBasket(){
  const data=previewBasketData;if(!data?.basket)return;
  if(state.basket?.id===data.basket.id){previewBasketData=null;app.innerHTML=renderBasketDetail(state.basket,state.basketItems);window.scrollTo({top:0,behavior:'smooth'});return}
  if(state.basket&&!confirm('Trocar a cesta atual por esta?'))return;
  setBasket(data);previewBasketData=null;app.innerHTML=renderBasketDetail(state.basket,state.basketItems);updateOrderButtons();window.scrollTo({top:0,behavior:'smooth'});
}
function refreshBasket(){if(state.basket)app.innerHTML=renderBasketDetail(state.basket,state.basketItems)}
function syncVisibleProductQty(){document.querySelectorAll('[data-product-card]').forEach(card=>{const qty=Number(state.extras[card.dataset.productCard]?.quantity||0),add=card.querySelector('[data-add-extra]'),wrap=card.querySelector('[data-extra-qty-wrap]'),label=card.querySelector('[data-extra-qty]');if(label)label.textContent=String(qty);add?.classList.toggle('hidden',qty>0);wrap?.classList.toggle('hidden',qty===0)})}

function goCheckout(){closeCart();if(!hasCart()){toast('Seu pedido está vazio.','error');return}app.innerHTML=renderCheckout({basket:state.basket,basketItems:state.basketItems,extras:state.extras,total:estimatedTotal()});window.scrollTo({top:0});setTimeout(()=>$('checkoutPhone')?.focus(),40)}
async function submitOrder(form){const button=$('checkoutSubmit');try{const contact=normalizePhone(new FormData(form).get('phone'));if(!contact){toast('Confira o telefone com DDD.','error');return}button.disabled=true;button.textContent='Salvando…';const data=await createOrder(orderPayload(contact));clearCart();updateOrderButtons();app.innerHTML=renderSuccess(data.order);window.scrollTo({top:0})}catch(e){toast(e.message,'error');if(button){button.disabled=false;button.textContent='Enviar pedido'}}}

app.addEventListener('click',async e=>{
  const target=e.target.closest('button,a');if(!target)return;
  if(target.matches('[data-open-basket]')){await openBasket(target.dataset.openBasket);return}
  if(target.matches('[data-select-basket]')){selectPreviewBasket();return}
  if(target.matches('[data-open-product]')){await openProduct(target.dataset.openProduct);return}
  if(target.matches('[data-open-market]')||target.matches('[data-add-products]')){openMarket();return}
  if(target.matches('[data-category]')){await loadCategory(target.dataset.category,1,false,'');return}
  if(target.matches('[data-subfilter]')){await loadCategory(current.category,1,false,target.dataset.subfilter||'');return}
  if(target.matches('[data-more]')){target.disabled=true;target.textContent='Carregando…';try{await showMore()}catch(err){toast(err.message,'error')}return}
  if(target.matches('[data-retry-category]')){await loadCategory(target.dataset.retryCategory,1,false,current.sub);return}
  if(target.matches('[data-retry-home]')){await loadHome();return}
  if(target.matches('[data-home]')){marketVisible=false;closeCart();closeProductDialog();renderHome();window.scrollTo({top:0,behavior:'smooth'});return}
  if(target.matches('[data-open-cart]')){openCart();return}
  if(target.matches('[data-new-order]')){clearCart();updateOrderButtons();marketVisible=false;renderHome();return}
  if(target.matches('[data-add-extra]')){const product=productCache.get(target.dataset.addExtra);if(product){addExtra(product,1);syncVisibleProductQty();updateOrderButtons();toast('Adicionado.','success')}return}
  const card=target.closest('[data-product-card]');if(card&&(target.matches('[data-extra-minus]')||target.matches('[data-extra-plus]'))){const product=productCache.get(card.dataset.productCard);if(product){addExtra(product,target.matches('[data-extra-plus]')?1:-1);syncVisibleProductQty();updateOrderButtons()}return}
  const basketRow=target.closest('[data-basket-product]');if(basketRow&&(target.matches('[data-basket-minus]')||target.matches('[data-basket-plus]'))){const item=state.basketItems.find(i=>i.product_id===basketRow.dataset.basketProduct);if(item){setBasketQuantity(item.product_id,Number(item.quantity)+(target.matches('[data-basket-plus]')?1:-1));refreshBasket();updateOrderButtons()}return}
});

app.addEventListener('input',e=>{if(e.target.id==='productSearchInput')scheduleSearch(e.target.value)});
document.addEventListener('submit',e=>{if(e.target.id==='checkoutForm'){e.preventDefault();submitOrder(e.target)}});
document.addEventListener('click',e=>{const t=e.target.closest('button,a');if(!t)return;if(t.matches('[data-home]')&&!app.contains(t)){marketVisible=false;closeCart();closeProductDialog();renderHome();window.scrollTo({top:0,behavior:'smooth'});return}if(t.id==='cartButton'||t.id==='mobileOrderButton'){openCart();return}if(t.id==='closeCart'){closeCart();return}if(productDialog.contains(t)){if(t.matches('[data-close-product]')){closeProductDialog();return}if(t.matches('[data-modal-extra-minus]')){modalQty=Math.max(1,modalQty-1);refreshProductDialog();return}if(t.matches('[data-modal-extra-plus]')){modalQty=Math.min(Number(modalProduct?.stock||1),modalQty+1);refreshProductDialog();return}if(t.matches('[data-modal-save-product]')&&modalProduct){setExtraProductQuantity(modalProduct,modalQty);closeProductDialog();syncVisibleProductQty();updateOrderButtons();toast('Produto adicionado.','success');return}}if(cartDrawer.contains(t)){if(t.matches('[data-close-cart]')){closeCart();return}if(t.matches('[data-checkout]')){goCheckout();return}if(t.matches('[data-clear-cart]')){if(confirm('Limpar todo o pedido?')){clearCart();updateOrderButtons();openCart()}return}if(t.matches('[data-cart-basket-minus]')||t.matches('[data-cart-basket-plus]')){const id=t.dataset.cartBasketMinus||t.dataset.cartBasketPlus;const item=state.basketItems.find(i=>i.product_id===id);if(item){setBasketQuantity(id,Number(item.quantity)+(t.matches('[data-cart-basket-plus]')?1:-1));updateOrderButtons();openCart()}return}if(t.matches('[data-cart-extra-minus]')){setExtraQuantity(t.dataset.cartExtraMinus,Number(state.extras[t.dataset.cartExtraMinus]?.quantity||0)-1);updateOrderButtons();openCart();return}if(t.matches('[data-cart-extra-plus]')){setExtraQuantity(t.dataset.cartExtraPlus,Number(state.extras[t.dataset.cartExtraPlus]?.quantity||0)+1);updateOrderButtons();openCart();return}}});
backdrop.addEventListener('click',closeCart);productDialog.addEventListener('click',e=>{if(e.target===productDialog)closeProductDialog()});productDialog.addEventListener('close',()=>{modalProduct=null;modalQty=1});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCart()});

async function boot(){restore();updateOrderButtons();await loadHome()}
boot();
