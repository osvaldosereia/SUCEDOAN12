import test from 'node:test';
import assert from 'node:assert/strict';

import { renderCart } from '../../src/cart/cartView.ts';
import type { CartSnapshot } from '../../src/cart/types.ts';

const cart: CartSnapshot = {
  lines: [
    {
      id:'basket:TEST-BASKET-FAMILIA',
      kind:'basket',
      refId:'TEST-BASKET-FAMILIA',
      name:'Cesta Família',
      quantity:1,
      unitPriceCents:21990,
      promoUnitPriceCents:null,
    },
    {
      id:'product:TEST-PROD-001',
      kind:'product',
      refId:'TEST-PROD-001',
      name:'Arroz <Oferta>',
      quantity:2,
      unitPriceCents:3290,
      promoUnitPriceCents:2990,
    },
  ],
};

test('cart view renders basket plus extras with quantity controls', () => {
  const html = renderCart(cart);

  assert.match(html, /Cesta Família/);
  assert.match(html, /Arroz &lt;Oferta&gt;/);
  assert.match(html, /data-cart-decrease="product:TEST-PROD-001"/);
  assert.match(html, /data-cart-increase="product:TEST-PROD-001"/);
  assert.match(html, /data-cart-remove="product:TEST-PROD-001"/);
  assert.match(html, /Limpar pedido/);
  assert.match(html, /R\$ 279,70/);
});

test('cart view does not expose checkout action before round 7', () => {
  const html = renderCart(cart);
  assert.doesNotMatch(html, /Finalizar pedido/i);
  assert.doesNotMatch(html, /Checkout/i);
});

test('empty cart has a clear empty state', () => {
  const html = renderCart({ lines: [] });
  assert.match(html, /Seu pedido está vazio/);
});
