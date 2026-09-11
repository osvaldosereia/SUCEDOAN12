import {state,estimatedTotal,basketChanged,extraSubtotal,hasCart} from './state.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export function renderCart(){
  if(!hasCart())return '<div class="cart-empty"><h3>Seu pedido está vazio</h3><p>Escolha uma cesta ou adicione produtos.</p><button class="button primary" type="button" data-close-cart data-home>Ver cestas</button></div>';
  const extras=Object.values(state.extras);
  const total=estimatedTotal();
  return `<div class="cart-content">${state.basket?`<section class="cart-group"><div class="cart-group-head"><h3>${esc(state.basket.name)}</h3><strong>${money(state.basket.base_price)}</strong></div>${state.basketItems.filter(i=>Number(i.quantity)>0).map(i=>`<div class="cart-line"><span>${esc(i.quantity)}x ${esc(i.product?.name||'Produto')}</span></div>`).join('')}${basketChanged()?'<small class="cart-note">A cesta foi personalizada. O valor final será confirmado ao finalizar.</small>':''}</section>`:''}${extras.length?`<section class="cart-group"><div class="cart-group-head"><h3>Outros produtos</h3><strong>${money(extraSubtotal())}</strong></div>${extras.map(i=>`<div class="cart-line extra"><div><strong>${esc(i.product.name)}</strong><small>${money(i.product.price)} cada</small></div><div class="qty-control"><button type="button" data-cart-extra-minus="${esc(i.product.id)}">−</button><b>${esc(i.quantity)}</b><button type="button" data-cart-extra-plus="${esc(i.product.id)}">+</button></div></div>`).join('')}</section>`:''}<div class="cart-total"><span>${total==null?'Total':'Total estimado'}</span><strong>${total==null?'Confirmado ao finalizar':money(total)}</strong></div><button class="button primary wide" type="button" data-checkout>Finalizar pedido</button><button class="button ghost wide" type="button" data-clear-cart>Limpar pedido</button></div>`;
}
