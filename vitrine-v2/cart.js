import {state,estimatedTotal,basketChanged,extraSubtotal,hasCart} from './state.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export function renderCart(){
  if(!hasCart())return '<div class="cart-empty"><span>🛒</span><h3>Sua compra está vazia</h3><p>Escolha uma cesta ou adicione produtos avulsos.</p><button class="button primary" type="button" data-close-cart data-home>Ver cestas</button></div>';
  const extras=Object.values(state.extras);
  const total=estimatedTotal();
  return `<div class="cart-content">${state.basket?`<section class="cart-group"><div class="cart-group-head"><div><span class="eyebrow">Cesta</span><h3>${esc(state.basket.name)}</h3></div><strong>${money(state.basket.base_price)}</strong></div>${state.basketItems.filter(i=>Number(i.quantity)>0).map(i=>`<div class="cart-line"><span>${esc(i.quantity)}x ${esc(i.product?.name||'Produto')}</span></div>`).join('')}${basketChanged()?'<small class="cart-note">A cesta foi personalizada. O valor final será calculado no servidor ao confirmar.</small>':''}</section>`:''}${extras.length?`<section class="cart-group"><div class="cart-group-head"><div><span class="eyebrow">Adicionais</span><h3>Outros produtos</h3></div><strong>${money(extraSubtotal())}</strong></div>${extras.map(i=>`<div class="cart-line extra"><div><strong>${esc(i.product.name)}</strong><small>${money(i.product.price)} cada</small></div><div class="qty-control"><button type="button" data-cart-extra-minus="${esc(i.product.id)}">−</button><b>${esc(i.quantity)}</b><button type="button" data-cart-extra-plus="${esc(i.product.id)}">+</button></div></div>`).join('')}</section>`:''}<div class="cart-total"><span>${total==null?'Total':'Total estimado'}</span><strong>${total==null?'Calculado ao finalizar':money(total)}</strong></div><button class="button primary wide" type="button" data-checkout>Finalizar pedido</button><button class="button ghost wide" type="button" data-clear-cart>Limpar compra</button></div>`;
}
