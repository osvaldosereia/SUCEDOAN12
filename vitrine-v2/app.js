import {api} from './api.js';
import {state,restore,setBasket,setBasketQuantity,addExtra,setExtraQuantity,clearCart,cartCount,hasCart,estimatedTotal,orderPayload} from './state.js';
import {renderBasketList,renderBasketDetail} from './baskets.js';
import {renderSections,renderProducts,renderMultiSectionResults,renderSectionContent} from './products.js';
import {renderCart} from './cart.js';
import {normalizePhone,renderCheckout,renderSuccess} from './checkout.js';

const $=id=>document.getElementById(id);
const app=$('app');
const cartDrawer=$('cartDrawer');
const cartBody=$('cartBody');
const backdrop=$('drawerBackdrop');
let baskets=[];
let sections=[];
let currentBasketView=null;
const productCache=new Map();
let browse={mode:'search',query:'',page:1,products:[],hasMore:false};
let selectedSections=[];
const sectionBrowse=new Map();
let sectionObserver=null;

function toast(message,kind=''){
  const host=$('toastRegion');
  const node=document.createElement('div');node.className=`toast ${kind}`.trim();node.textContent=message;host.appendChild(node);setTimeout(()=>node.remove(),3200);
}
function loading(label='Carregando…'){app.innerHTML=`<div class="page-loading"><span class="spinner"></span><p>${label}</p></div>`}
function updateCartBadge(){const n=cartCount();$('cartCount').textContent=n>99?'99+':String(n);$('cartCount').classList.toggle('hidden',n===0)}
function openCart(){cartBody.innerHTML=renderCart();cartDrawer.classList.add('open');cartDrawer.setAttribute('aria-hidden','false');backdrop.classList.remove('hidden');document.body.classList.add('drawer-open')}
function closeCart(){cartDrawer.classList.remove('open');cartDrawer.setAttribute('aria-hidden','true');backdrop.classList.add('hidden');document.body.classList.remove('drawer-open')}
function stopSectionObserver(){if(sectionObserver){sectionObserver.disconnect();sectionObserver=null}}

function renderHome(){
  stopSectionObserver();currentBasketView=null;
  app.innerHTML=`<section class="home-bar"><div><h1>Cestas básicas</h1><p>Escolha uma cesta. Se precisar, adicione outros produtos depois.</p></div><button class="button secondary" type="button" data-browse-products>Adicionar outros produtos</button></section>${renderBasketList(baskets)}`;
}

async function loadHome(){
  loading('Carregando cestas…');
  try{const data=await api('list_baskets');baskets=data.baskets||[];renderHome()}catch(e){app.innerHTML=`<div class="fatal"><h2>Não foi possível carregar as cestas</h2><p>${e.message}</p><button class="button primary" data-retry-home type="button">Tentar novamente</button></div>`}
}

async function openBasket(id){
  stopSectionObserver();loading('Abrindo cesta…');
  try{
    const data=await api('get_basket',{id});
    setBasket(data);currentBasketView=data.basket;
    app.innerHTML=renderBasketDetail(currentBasketView,state.basketItems);updateCartBadge();window.scrollTo({top:0,behavior:'smooth'});
  }catch(e){toast(e.message,'error');renderHome()}
}
function refreshBasketView(){if(currentBasketView)app.innerHTML=renderBasketDetail(currentBasketView,state.basketItems)}

async function browseProducts(){
  stopSectionObserver();closeCart();loading('Carregando seções…');
  try{
    if(!sections.length){const data=await api('list_sections');sections=data.sections||[]}
    app.innerHTML=renderSections(sections,selectedSections);window.scrollTo({top:0,behavior:'smooth'});
  }catch(e){app.innerHTML=`<div class="fatal"><h2>Não foi possível carregar os produtos</h2><p>${e.message}</p><button class="button primary" data-home type="button">Voltar</button></div>`}
}

async function loadSearchProducts({query='',page=1,append=false}={}){
  stopSectionObserver();if(!append)loading('Buscando produtos…');
  try{
    const data=await api('list_products',{section:'',q:query,page,limit:20});
    for(const p of data.products||[])productCache.set(p.id,p);
    browse={mode:'search',query,page,products:append?[...browse.products,...(data.products||[])]:data.products||[],hasMore:data.has_more===true};
    app.innerHTML=renderProducts({title:'Resultados da busca',products:browse.products,hasMore:browse.hasMore,query});
    syncVisibleProductQty();if(!append)window.scrollTo({top:0,behavior:'smooth'});
  }catch(e){toast(e.message,'error');if(!append)browseProducts()}
}

function getSectionNode(name){
  return [...document.querySelectorAll('[data-section-result]')].find(node=>node.dataset.sectionResult===name)||null;
}

async function loadSectionPage(name,page=1,append=false){
  const entry=sectionBrowse.get(name);if(!entry||entry.loading)return;
  const node=getSectionNode(name);if(!node)return;
  entry.loading=true;
  const content=node.querySelector('[data-section-content]');
  if(!append&&content)content.innerHTML='<div class="inline-loading">Carregando produtos…</div>';
  try{
    const data=await api('list_products',{section:name,q:'',page,limit:12});
    for(const p of data.products||[])productCache.set(p.id,p);
    entry.page=page;entry.products=append?[...entry.products,...(data.products||[])]:data.products||[];entry.hasMore=data.has_more===true;entry.loaded=true;entry.loading=false;
    if(content)content.innerHTML=renderSectionContent({name,products:entry.products,hasMore:entry.hasMore});
    syncVisibleProductQty();
  }catch(e){
    entry.loading=false;if(content)content.innerHTML=`<div class="empty-inline">Não foi possível carregar esta seção. <button type="button" class="text-button" data-retry-section="${String(name).replace(/"/g,'&quot;')}">Tentar novamente</button></div>`;
  }
}

function setupSectionObserver(){
  stopSectionObserver();
  const names=selectedSections.slice(1);
  if(!names.length)return;
  if(!('IntersectionObserver' in window)){names.forEach(name=>loadSectionPage(name,1,false));return}
  sectionObserver=new IntersectionObserver(entries=>{
    for(const item of entries){
      if(!item.isIntersecting)continue;
      const name=item.target.dataset.sectionResult;
      const entry=sectionBrowse.get(name);
      if(entry&&!entry.loaded&&!entry.loading)loadSectionPage(name,1,false);
      sectionObserver?.unobserve(item.target);
    }
  },{rootMargin:'500px 0px'});
  names.forEach(name=>{const node=getSectionNode(name);if(node)sectionObserver.observe(node)});
}

async function showSelectedSections(names=[]){
  selectedSections=[...new Set(names.filter(Boolean))];
  if(!selectedSections.length){toast('Marque pelo menos uma seção.','error');return}
  sectionBrowse.clear();selectedSections.forEach(name=>sectionBrowse.set(name,{page:0,products:[],hasMore:false,loaded:false,loading:false}));
  app.innerHTML=renderMultiSectionResults(selectedSections);window.scrollTo({top:0,behavior:'smooth'});
  await loadSectionPage(selectedSections[0],1,false);setupSectionObserver();
}

function syncVisibleProductQty(){
  document.querySelectorAll('[data-product-card]').forEach(card=>{
    const id=card.dataset.productCard,qty=Number(state.extras[id]?.quantity||0);
    const add=card.querySelector('[data-add-extra]'),wrap=card.querySelector('[data-extra-qty-wrap]'),label=card.querySelector('[data-extra-qty]');
    if(label)label.textContent=String(qty);if(add)add.classList.toggle('hidden',qty>0);if(wrap)wrap.classList.toggle('hidden',qty===0);
  });
}

function goCheckout(){
  stopSectionObserver();closeCart();if(!hasCart()){toast('Seu pedido está vazio.','error');return}
  const total=estimatedTotal();
  const summary=total==null?'O valor final será confirmado antes de enviar no WhatsApp.':`Total estimado: ${Number(total).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}.`;
  app.innerHTML=renderCheckout(summary);window.scrollTo({top:0,behavior:'smooth'});setTimeout(()=>$('checkoutPhone')?.focus(),50);
}

async function submitOrder(form){
  const button=$('checkoutSubmit');
  try{
    const phone=normalizePhone(new FormData(form).get('phone'));
    button.disabled=true;button.textContent='Salvando pedido…';
    const data=await api('create_order',orderPayload(phone));
    const order=data.order;clearCart();updateCartBadge();app.innerHTML=renderSuccess(order);window.scrollTo({top:0,behavior:'smooth'});
  }catch(e){toast(e.message,'error');if(button){button.disabled=false;button.textContent='Salvar pedido'}}
}

app.addEventListener('click',async e=>{
  const target=e.target.closest('button,a');if(!target)return;
  if(target.matches('[data-open-basket]')){await openBasket(target.dataset.openBasket);return}
  if(target.matches('[data-home]')){closeCart();renderHome();window.scrollTo({top:0,behavior:'smooth'});return}
  if(target.matches('[data-retry-home]')){await loadHome();return}
  if(target.matches('[data-browse-products]')){await browseProducts();return}
  if(target.matches('[data-load-section-more]')){const name=target.dataset.loadSectionMore,entry=sectionBrowse.get(name);if(entry){target.disabled=true;target.textContent='Carregando…';await loadSectionPage(name,entry.page+1,true)}return}
  if(target.matches('[data-retry-section]')){const name=target.dataset.retrySection;await loadSectionPage(name,1,false);return}
  if(target.matches('[data-load-more]')){target.disabled=true;target.textContent='Carregando…';await loadSearchProducts({query:browse.query,page:browse.page+1,append:true});return}
  if(target.matches('[data-open-cart]')){openCart();return}
  if(target.matches('[data-new-order]')){clearCart();updateCartBadge();renderHome();return}
  const basketRow=target.closest('[data-basket-product]');
  if(basketRow&&(target.matches('[data-basket-minus]')||target.matches('[data-basket-plus]'))){
    const item=state.basketItems.find(i=>i.product_id===basketRow.dataset.basketProduct);if(!item)return;
    setBasketQuantity(item.product_id,Number(item.quantity)+(target.matches('[data-basket-plus]')?1:-1));refreshBasketView();updateCartBadge();return;
  }
  if(target.matches('[data-add-extra]')){const p=productCache.get(target.dataset.addExtra);if(p){addExtra(p,1);syncVisibleProductQty();updateCartBadge();toast('Produto adicionado.','success')}return}
  const card=target.closest('[data-product-card]');
  if(card&&(target.matches('[data-extra-minus]')||target.matches('[data-extra-plus]'))){const p=productCache.get(card.dataset.productCard);if(p){addExtra(p,target.matches('[data-extra-plus]')?1:-1);syncVisibleProductQty();updateCartBadge()}return}
});

document.addEventListener('click',e=>{
  const t=e.target.closest('button');if(!t)return;
  if(t.id==='cartButton'){openCart();return}
  if(t.id==='closeCart'){closeCart();return}
  if(cartDrawer.contains(t)){
    if(t.matches('[data-close-cart]')){closeCart();if(t.matches('[data-home]')){renderHome();window.scrollTo({top:0,behavior:'smooth'})}return}
    if(t.matches('[data-checkout]')){goCheckout();return}
    if(t.matches('[data-clear-cart]')){if(confirm('Limpar todo o pedido?')){clearCart();updateCartBadge();openCart()}return}
    if(t.matches('[data-cart-extra-minus]')){setExtraQuantity(t.dataset.cartExtraMinus,Number(state.extras[t.dataset.cartExtraMinus]?.quantity||0)-1);updateCartBadge();openCart();return}
    if(t.matches('[data-cart-extra-plus]')){setExtraQuantity(t.dataset.cartExtraPlus,Number(state.extras[t.dataset.cartExtraPlus]?.quantity||0)+1);updateCartBadge();openCart();return}
  }
  if(t.id==='headerProducts'){browseProducts();return}
  if(t.id==='headerHome'){closeCart();renderHome();window.scrollTo({top:0,behavior:'smooth'});return}
});

backdrop.addEventListener('click',closeCart);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCart()});
document.addEventListener('submit',async e=>{
  if(e.target.id==='productSearchForm'){
    e.preventDefault();const q=String($('productSearchInput')?.value||'').trim();if(q.length<2){toast('Digite pelo menos 2 letras.','error');return}await loadSearchProducts({query:q,page:1});return;
  }
  if(e.target.id==='sectionSelectionForm'){
    e.preventDefault();const values=[...e.target.querySelectorAll('[data-section-check]:checked')].map(input=>input.value);await showSelectedSections(values);return;
  }
  if(e.target.id==='checkoutForm'){e.preventDefault();await submitOrder(e.target)}
});

async function boot(){restore();updateCartBadge();await loadHome()}
boot();
