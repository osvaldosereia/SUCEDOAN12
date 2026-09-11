import {state,estimatedTotal} from './state.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

function basketRow(item){
  const p=item.product||{};const qty=Number(item.quantity||0);const stock=Math.max(0,Number(p.stock||0));const max=item.max_quantity==null?stock:Number(item.max_quantity);const editable=item.quantity_editable===true;
  const control=editable?`<div class="qty-control"><button type="button" data-cart-basket-minus="${esc(item.product_id)}" ${qty<=Number(item.min_quantity||0)?'disabled':''}>−</button><b>${esc(qty)}</b><button type="button" data-cart-basket-plus="${esc(item.product_id)}" ${qty>=max?'disabled':''}>+</button></div>`:`<b class="fixed-qty">${esc(qty)}x</b>`;
  return `<article class="cart-row basket-cart-row"><div><strong>${esc(p.name||'Produto')}</strong><p>${esc([p.brand,p.packaging].filter(Boolean).join(' · '))}</p></div>${control}</article>`;
}

export function renderCart(){
  const extras=Object.values(state.extras);
  if(!state.basket&&!extras.length)return '<div class="cart-empty"><p>Seu pedido está vazio.</p><button class="primary-button" type="button" data-close-cart>Escolher produtos</button></div>';
  const basket=state.basket?`<section class="cart-group"><h3>${esc(state.basket.name)}</h3><p>Produtos da cesta</p>${state.basketItems.map(basketRow).join('')}</section>`:'';
  const rows=extras.map(i=>`<article class="cart-row"><div><strong>${esc(i.product.name)}</strong><p>${money(i.product.price)} cada</p></div><div class="qty-control"><button type="button" data-cart-extra-minus="${esc(i.product.id)}">−</button><b>${esc(i.quantity)}</b><button type="button" data-cart-extra-plus="${esc(i.product.id)}">+</button></div></article>`).join('');
  const total=estimatedTotal();
  return `${basket}${rows?`<section class="cart-group"><h3>Produtos adicionados</h3>${rows}</section>`:''}<div class="cart-total"><span>Total estimado</span><strong>${money(total)}</strong></div><button class="primary-button full" type="button" data-checkout>Finalizar pedido</button><button class="secondary-button full" type="button" data-clear-cart>Limpar pedido</button>`;
}
