import {catalog} from './catalog-api.js';
import {state,restore,setBasket,setBasketQuantity,addExtra,setExtraQuantity,clearCart,cartCount,hasCart,estimatedTotal,orderPayload} from './state.js';
import {renderCategoryChips,renderProductResults} from './products.js';
import {renderBasketCards,renderBasketDetail} from './baskets.js';
import {renderCart} from './cart.js';
import {normalizePhone,renderCheckout,renderSuccess} from './checkout.js';
import {createOrder} from './order-api.js';

const $=id=>document.getElementById(id);
const app=$('app'),cartDrawer=$('cartDrawer'),cartBody=$('cartBody'),backdrop=$('drawerBackdrop');
let home={baskets:[],categories:[],featured:[]};
let current={mode:'featured',category:'',query:'',page:1,products:[],hasMore:false};
let prefetched=null,prefetchObserver=null,searchController=null,searchTimer=null;
const productCache=new Map();

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(message,kind=''){const host=$('toastRegion');const node=document.createElement('div');node.className=`toast ${kind}`.trim();node.textContent=message;host.appendChild(node);setTimeout(()=>node.remove(),kind==='error'?5000:2600)}
function loading(label='Carregando…'){app.innerHTML=`<div class="page-loading"><span></span><p>${esc(label)}</p></div>`}
function updateOrderButtons(){const count=cartCount();$('cartCount').textContent=count>99?'99+':String(count);$('cartCount').classList.toggle('hidden',count===0);$('mobileOrderBar').classList.toggle('hidden',count===0);$('mobileOrderCount').textContent=String(count)}
function openCart(){cartBody.innerHTML=renderCart();cartDrawer.classList.add('open');cartDrawer.setAttribute('aria-hidden','false');backdrop.classList.remove('hidden');document.body.classList.add('drawer-open')}
function closeCart(){cartDrawer.classList.remove('open');cartDrawer.setAttribute('aria-hidden','true');backdrop.classList.add('hidden');document.body.classList.remove('drawer-open')}
function stopPrefetch(){prefetchObserver?.disconnect();prefetchObserver=null;prefetched=null}
function rememberProducts(rows=[]){for(const p of rows)productCache.set(p.id,p)}

function browseMarkup(){
  const featured=current.mode==='featured'&&home.featured.length?renderProductResults({title:'Destaques',products:home.featured,hasMore:false,mode:'featured'}):'';
  return `<section class="catalog-tools"><h2>Produtos</h2>${renderCategoryChips(home.categories,current.category)}</section><div id="browseArea">${featured}</div>`;
}
function renderHome(){
  stopPrefetch();current={mode:'featured',category:'',query:'',page:1,products:[],hasMore:false};rememberProducts(home.featured);
  app.innerHTML=`<section class="search-block"><label for="productSearchInput">Buscar produto</label><div class="search-box"><span aria-hidden="true">⌕</span><input id="productSearchInput" type="search" autocomplete="off" placeholder="Ex.: arroz, detergente, shampoo"></div></section><section class="home-section"><div class="section-heading"><h1>Cestas básicas</h1><p>Escolha uma cesta para ver os produtos.</p></div>${renderBasketCards(home.baskets)}</section>${browseMarkup()}`;
  syncVisibleProductQty();
}

async function loadHome(){
  loading('Abrindo vitrine…');
  try{const data=await catalog('home');home={baskets:data.baskets||[],categories:data.categories||[],featured:data.featured||[]};renderHome()}catch(e){app.innerHTML=`<div class="fatal"><h1>Não foi possível abrir a vitrine</h1><p>${esc(e.message)}</p><button class="primary-button" type="button" data-retry-home>Tentar novamente</button></div>`}
}

function browseArea(){return $('browseArea')}
function renderCurrentProducts(){
  const host=browseArea();if(!host)return;
  const title=current.mode==='search'?'Resultados da busca':current.category||'Produtos';
  host.innerHTML=renderProductResults({title,products:current.products,hasMore:current.hasMore,mode:current.mode,query:current.query});
  rememberProducts(current.products);syncVisibleProductQty();setupPrefetch();
}

async function loadCategory(name,page=1,append=false){
  stopPrefetch();current.mode='category';current.category=name;current.query='';
  const host=browseArea();if(host&&!append)host.innerHTML='<div class="inline-loading">Carregando produtos…</div>';
  document.querySelectorAll('[data-category]').forEach(btn=>btn.classList.toggle('active',btn.dataset.category===name));
  try{
    const data=await catalog('category',{name,page,limit:12});
    current.page=page;current.products=append?[...current.products,...(data.products||[])]:data.products||[];current.hasMore=data.has_more===true;renderCurrentProducts();
    if(!append)setTimeout(()=>browseArea()?.scrollIntoView({behavior:'smooth',block:'start'}),20);
  }catch(e){if(host)host.innerHTML=`<div class="empty-state">${esc(e.message)} <button class="text-button" type="button" data-retry-category="${esc(name)}">Tentar novamente</button></div>`}
}

async function loadSearch(query,page=1,append=false){
  stopPrefetch();searchController?.abort();searchController=new AbortController();
  current.mode='search';current.category='';current.query=query;
  document.querySelectorAll('[data-category]').forEach(btn=>btn.classList.remove('active'));
  const host=browseArea();if(host&&!append)host.innerHTML='<div class="inline-loading">Buscando…</div>';
  try{
    const data=await catalog('search',{q:query,page,limit:12},{signal:searchController.signal,background:false});
    current.page=page;current.products=append?[...current.products,...(data.products||[])]:data.products||[];current.hasMore=data.has_more===true;renderCurrentProducts();
  }catch(e){if(e?.name==='AbortError')return;if(host)host.innerHTML=`<div class="empty-state">${esc(e.message)}</div>`}
}

function scheduleSearch(value){
  clearTimeout(searchTimer);const query=String(value||'').trim();
  if(query.length<2){searchController?.abort();current={mode:'featured',category:'',query:'',page:1,products:[],hasMore:false};const host=browseArea();if(host)host.innerHTML=home.featured.length?renderProductResults({title:'Destaques',products:home.featured,hasMore:false,mode:'featured'}):'';syncVisibleProductQty();return}
  searchTimer=setTimeout(()=>loadSearch(query,1,false),250);
}

function prefetchParams(){if(!current.hasMore)return null;if(current.mode==='category')return {resource:'category',params:{name:current.category,page:current.page+1,limit:12}};if(current.mode==='search')return {resource:'search',params:{q:current.query,page:current.page+1,limit:12}};return null}
function setupPrefetch(){
  prefetchObserver?.disconnect();prefetchObserver=null;prefetched=null;const target=document.querySelector('[data-prefetch]'),next=prefetchParams();if(!target||!next)return;
  if(!('IntersectionObserver' in window))return;
  prefetchObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting)continue;prefetchObserver?.disconnect();catalog(next.resource,next.params).then(data=>{prefetched={key:JSON.stringify(next),data}}).catch(()=>{})}},{rootMargin:'500px 0px'});prefetchObserver.observe(target);
}
async function showMore(){
  const next=prefetchParams();if(!next)return;const key=JSON.stringify(next);let data=prefetched?.key===key?prefetched.data:null;
  if(!data)data=await catalog(next.resource,next.params);
  current.page+=1;current.products=[...current.products,...(data.products||[])];current.hasMore=data.has_more===true;renderCurrentProducts();
}

async function openBasket(id){
  stopPrefetch();loading('Abrindo cesta…');
  try{const data=await catalog('basket',{id});setBasket(data);app.innerHTML=renderBasketDetail(data.basket,state.basketItems);updateOrderButtons();window.scrollTo({top:0,behavior:'smooth'})}catch(e){toast(e.message,'error');renderHome()}
}
function refreshBasket(){if(state.basket)app.innerHTML=renderBasketDetail(state.basket,state.basketItems)}
function syncVisibleProductQty(){document.querySelectorAll('[data-product-card]').forEach(card=>{const qty=Number(state.extras[card.dataset.productCard]?.quantity||0),add=card.querySelector('[data-add-extra]'),wrap=card.querySelector('[data-extra-qty-wrap]'),label=card.querySelector('[data-extra-qty]');if(label)label.textContent=String(qty);add?.classList.toggle('hidden',qty>0);wrap?.classList.toggle('hidden',qty===0)})}

function goCheckout(){closeCart();if(!hasCart()){toast('Seu pedido está vazio.','error');return}const total=estimatedTotal();const summary=total==null?'O valor final será confirmado antes de salvar.':`Total estimado: ${Number(total).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}.`;app.innerHTML=renderCheckout(summary);window.scrollTo({top:0});setTimeout(()=>$('checkoutPhone')?.focus(),40)}
async function submitOrder(form){const button=$('checkoutSubmit');try{const contact=normalizePhone(new FormData(form).get('phone'));if(!contact){toast('Confira o telefone com DDD.','error');return}button.disabled=true;button.textContent='Salvando…';const data=await createOrder(orderPayload(contact));clearCart();updateOrderButtons();app.innerHTML=renderSuccess(data.order);window.scrollTo({top:0})}catch(e){toast(e.message,'error');if(button){button.disabled=false;button.textContent='Enviar pedido'}}}

app.addEventListener('click',async e=>{
  const target=e.target.closest('button,a');if(!target)return;
  if(target.matches('[data-open-basket]')){await openBasket(target.dataset.openBasket);return}
  if(target.matches('[data-category]')){await loadCategory(target.dataset.category,1,false);return}
  if(target.matches('[data-more]')){target.disabled=true;target.textContent='Carregando…';try{await showMore()}catch(err){toast(err.message,'error')}return}
  if(target.matches('[data-retry-category]')){await loadCategory(target.dataset.retryCategory,1,false);return}
  if(target.matches('[data-retry-home]')){await loadHome();return}
  if(target.matches('[data-home]')){closeCart();renderHome();window.scrollTo({top:0,behavior:'smooth'});return}
  if(target.matches('[data-open-cart]')){openCart();return}
  if(target.matches('[data-new-order]')){clearCart();updateOrderButtons();renderHome();return}
  if(target.matches('[data-add-extra]')){const product=productCache.get(target.dataset.addExtra);if(product){addExtra(product,1);syncVisibleProductQty();updateOrderButtons();toast('Adicionado.','success')}return}
  const card=target.closest('[data-product-card]');if(card&&(target.matches('[data-extra-minus]')||target.matches('[data-extra-plus]'))){const product=productCache.get(card.dataset.productCard);if(product){addExtra(product,target.matches('[data-extra-plus]')?1:-1);syncVisibleProductQty();updateOrderButtons()}return}
  const basketRow=target.closest('[data-basket-product]');if(basketRow&&(target.matches('[data-basket-minus]')||target.matches('[data-basket-plus]'))){const item=state.basketItems.find(i=>i.product_id===basketRow.dataset.basketProduct);if(item){setBasketQuantity(item.product_id,Number(item.quantity)+(target.matches('[data-basket-plus]')?1:-1));refreshBasket();updateOrderButtons()}return}
});

app.addEventListener('input',e=>{if(e.target.id==='productSearchInput')scheduleSearch(e.target.value)});
document.addEventListener('submit',e=>{if(e.target.id==='checkoutForm'){e.preventDefault();submitOrder(e.target)}});
document.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;if(t.id==='cartButton'||t.id==='mobileOrderButton'){openCart();return}if(t.id==='closeCart'){closeCart();return}if(cartDrawer.contains(t)){if(t.matches('[data-close-cart]')){closeCart();return}if(t.matches('[data-checkout]')){goCheckout();return}if(t.matches('[data-clear-cart]')){if(confirm('Limpar todo o pedido?')){clearCart();updateOrderButtons();openCart()}return}if(t.matches('[data-cart-extra-minus]')){setExtraQuantity(t.dataset.cartExtraMinus,Number(state.extras[t.dataset.cartExtraMinus]?.quantity||0)-1);updateOrderButtons();openCart();return}if(t.matches('[data-cart-extra-plus]')){setExtraQuantity(t.dataset.cartExtraPlus,Number(state.extras[t.dataset.cartExtraPlus]?.quantity||0)+1);updateOrderButtons();openCart();return}}});
backdrop.addEventListener('click',closeCart);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCart()});

async function boot(){restore();updateOrderButtons();await loadHome()}
boot();
