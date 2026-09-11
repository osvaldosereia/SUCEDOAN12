import {api} from './api.js';
import {state,restore,setBasket,setBasketQuantity,addExtra,setExtraQuantity,clearCart,cartCount,hasCart,estimatedTotal,orderPayload} from './state.js';
import {renderBasketList,renderBasketDetail} from './baskets.js';
import {renderSections,renderProducts} from './products.js';
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
let browse={mode:'',section:'',query:'',page:1,products:[],hasMore:false};

function toast(message,kind=''){
  const host=$('toastRegion');
  const node=document.createElement('div');node.className=`toast ${kind}`.trim();node.textContent=message;host.appendChild(node);setTimeout(()=>node.remove(),3500);
}
function loading(label='Carregando…'){app.innerHTML=`<div class="page-loading"><span class="spinner"></span><p>${label}</p></div>`}
function updateCartBadge(){const n=cartCount();$('cartCount').textContent=n>99?'99+':String(n);$('cartCount').classList.toggle('hidden',n===0)}
function openCart(){cartBody.innerHTML=renderCart();cartDrawer.classList.add('open');backdrop.classList.remove('hidden');document.body.classList.add('drawer-open')}
function closeCart(){cartDrawer.classList.remove('open');backdrop.classList.add('hidden');document.body.classList.remove('drawer-open')}

function renderHome(){
  currentBasketView=null;
  app.innerHTML=`<section class="hero"><div><span class="eyebrow">Dona Antônia</span><h1>Sua compra simples e rápida</h1><p>Escolha uma cesta básica ou adicione produtos avulsos. Você só informa o telefone ao finalizar.</p><div class="hero-buttons"><button class="button primary" type="button" data-scroll-baskets>Ver cestas</button><button class="button secondary" type="button" data-browse-products>Comprar outros produtos</button></div></div><div class="hero-mark">DA</div></section>${renderBasketList(baskets)}<section class="how"><article><b>1</b><div><strong>Escolha</strong><span>Selecione uma cesta ou produtos.</span></div></article><article><b>2</b><div><strong>Confira</strong><span>Altere quantidades quando permitido.</span></div></article><article><b>3</b><div><strong>Finalize</strong><span>Informe só seu telefone e envie no WhatsApp.</span></div></article></section>`;
}

async function loadHome(){
  loading('Carregando cestas…');
  try{const data=await api('list_baskets');baskets=data.baskets||[];renderHome()}catch(e){app.innerHTML=`<div class="fatal"><h2>Não foi possível abrir a vitrine</h2><p>${e.message}</p><button class="button primary" data-retry-home> tentar novamente </button></div>`}
}

async function openBasket(id){
  loading('Abrindo cesta…');
  try{
    const data=await api('get_basket',{id});
    setBasket(data);currentBasketView=data.basket;
    app.innerHTML=renderBasketDetail(currentBasketView,state.basketItems);updateCartBadge();window.scrollTo({top:0,behavior:'smooth'});
  }catch(e){toast(e.message,'error');renderHome()}
}
function refreshBasketView(){if(currentBasketView)app.innerHTML=renderBasketDetail(currentBasketView,state.basketItems)}

async function browseProducts(){
  closeCart();loading('Carregando seções…');
  try{if(!sections.length){const data=await api('list_sections');sections=data.sections||[]}app.innerHTML=renderSections(sections);window.scrollTo({top:0,behavior:'smooth'})}catch(e){app.innerHTML=`<div class="fatal"><h2>Não foi possível carregar os produtos</h2><p>${e.message}</p><button class="button primary" data-home>Voltar</button></div>`}
}

async function loadProducts({section='',query='',page=1,append=false}={}){
  if(!append)loading('Buscando produtos…');
  try{
    const data=await api('list_products',{section,q:query,page,limit:20});
    for(const p of data.products||[])productCache.set(p.id,p);
    browse={mode:section?'section':'search',section,query,page,products:append?[...browse.products,...(data.products||[])]:data.products||[],hasMore:data.has_more===true};
    const title=section||'Resultados da busca';
    app.innerHTML=renderProducts({title,products:browse.products,hasMore:browse.hasMore,mode:browse.mode,query});
    syncVisibleProductQty();if(!append)window.scrollTo({top:0,behavior:'smooth'});
  }catch(e){toast(e.message,'error');if(!append)browseProducts()}
}

function syncVisibleProductQty(){
  document.querySelectorAll('[data-product-card]').forEach(card=>{
    const id=card.dataset.productCard,qty=Number(state.extras[id]?.quantity||0);
    const add=card.querySelector('[data-add-extra]'),wrap=card.querySelector('[data-extra-qty-wrap]'),label=card.querySelector('[data-extra-qty]');
    if(label)label.textContent=String(qty);if(add)add.classList.toggle('hidden',qty>0);if(wrap)wrap.classList.toggle('hidden',qty===0);
  });
}

function goCheckout(){
  closeCart();if(!hasCart()){toast('Sua compra está vazia.','error');return}
  const total=estimatedTotal();
  const summary=total==null?'O valor final da cesta personalizada será confirmado agora pelo servidor.':`Total estimado: ${Number(total).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}. O servidor confirma o valor antes de salvar.`;
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
  if(target.matches('[data-scroll-baskets]')){document.querySelector('.basket-grid')?.scrollIntoView({behavior:'smooth',block:'start'});return}
  if(target.matches('[data-browse-products]')){await browseProducts();return}
  if(target.matches('[data-section]')){await loadProducts({section:target.dataset.section,page:1});return}
  if(target.matches('[data-load-more]')){target.disabled=true;target.textContent='Carregando…';await loadProducts({section:browse.section,query:browse.query,page:browse.page+1,append:true});return}
  if(target.matches('[data-open-cart]')){openCart();return}
  if(target.matches('[data-checkout]')){goCheckout();return}
  if(target.matches('[data-clear-cart]')){if(confirm('Limpar toda a compra?')){clearCart();updateCartBadge();openCart()}return}
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
  if(t.matches('[data-close-cart]')){closeCart();return}
  if(t.matches('[data-cart-extra-minus]')){setExtraQuantity(t.dataset.cartExtraMinus,Number(state.extras[t.dataset.cartExtraMinus]?.quantity||0)-1);updateCartBadge();openCart();return}
  if(t.matches('[data-cart-extra-plus]')){setExtraQuantity(t.dataset.cartExtraPlus,Number(state.extras[t.dataset.cartExtraPlus]?.quantity||0)+1);updateCartBadge();openCart();return}
  if(t.id==='headerProducts'){browseProducts();return}
  if(t.id==='headerHome'){renderHome();return}
});

backdrop.addEventListener('click',closeCart);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCart()});
document.addEventListener('submit',async e=>{
  if(e.target.id==='productSearchForm'){e.preventDefault();const q=String($('productSearchInput')?.value||'').trim();if(q.length<2){toast('Digite pelo menos 2 letras.','error');return}await loadProducts({query:q,page:1});return}
  if(e.target.id==='checkoutForm'){e.preventDefault();await submitOrder(e.target)}
});

async function boot(){
  restore();updateCartBadge();
  await loadHome();
}

boot();
