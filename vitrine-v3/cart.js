import {state,estimatedTotal} from './state.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

function cartPhoto(p={}){return `<div class="cart-row-photo">${p.image_url?`<img src="${esc(p.image_url)}" alt="" loading="lazy" decoding="async">`:'<span aria-hidden="true">□</span>'}</div>`}

function basketRow(item){
  const p=item.product||{};const qty=Number(item.quantity||0);const stock=Math.max(0,Number(p.stock||0));const base=Math.max(0,Number(item.base_quantity??qty));const min=Math.max(0,Number(item.min_quantity||0));const max=item.max_quantity==null?Math.max(min,stock):Math.max(min,Number(item.max_quantity));
  const canReduce=item.removable===true?qty>min:item.quantity_editable===true&&qty>min;
  const canIncrease=item.quantity_editable===true?(stock>0&&qty<max):(item.removable===true&&qty<Math.min(base,max));
  const showControl=item.removable===true||item.quantity_editable===true;
  const control=showControl?`<div class="qty-control"><button type="button" data-cart-basket-minus="${esc(item.product_id)}" aria-label="Diminuir ${esc(p.name||'produto')}" ${canReduce?'':'disabled'}>−</button><b>${esc(qty)}</b><button type="button" data-cart-basket-plus="${esc(item.product_id)}" aria-label="Aumentar ${esc(p.name||'produto')}" ${canIncrease?'':'disabled'}>+</button></div>`:`<span class="fixed-qty fixed-qty-labelled"><b>${esc(qty)}x</b><small>Quantidade fixa</small></span>`;
  return `<article class="cart-row basket-cart-row">${cartPhoto(p)}<div class="cart-row-copy"><strong>${esc(p.name||'Produto')}</strong>${[p.brand,p.packaging].filter(Boolean).length?`<p>${esc([p.brand,p.packaging].filter(Boolean).join(' · '))}</p>`:''}</div>${control}</article>`;
}

function extraRow(item){
  const p=item.product||{};const qty=Number(item.quantity||0);const stock=Math.max(0,Number(p.stock||0));
  return `<article class="cart-row">${cartPhoto(p)}<div class="cart-row-copy"><strong>${esc(p.name||'Produto')}</strong><p>${money(p.price)} cada</p></div><div class="qty-control"><button type="button" data-cart-extra-minus="${esc(p.id)}" aria-label="Diminuir ${esc(p.name||'produto')}">−</button><b>${esc(qty)}</b><button type="button" data-cart-extra-plus="${esc(p.id)}" aria-label="Aumentar ${esc(p.name||'produto')}" ${qty>=stock?'disabled':''}>+</button></div></article>`;
}

export function renderCart(){
  const extras=Object.values(state.extras).filter(item=>Number(item.quantity||0)>0);
  if(!state.basket&&!extras.length)return '<div class="cart-empty"><p>Seu pedido está vazio.</p><button class="primary-button" type="button" data-close-cart>Escolher produtos</button></div>';
  const basketItems=state.basketItems.filter(item=>Number(item.quantity||0)>0);
  const basket=state.basket?`<section class="cart-group"><h3>${esc(state.basket.name)}</h3><p>Produtos da cesta</p>${basketItems.map(basketRow).join('')}</section>`:'';
  const rows=extras.map(extraRow).join('');
  const total=estimatedTotal();
  return `${basket}${rows?`<section class="cart-group"><h3>Produtos adicionados</h3>${rows}</section>`:''}<div class="cart-total"><span>Total estimado</span><strong>${money(total)}</strong></div><button class="primary-button full" type="button" data-checkout>Finalizar pedido</button><button class="secondary-button full cart-clear-button" type="button" data-clear-cart>Limpar pedido</button>`;
}
