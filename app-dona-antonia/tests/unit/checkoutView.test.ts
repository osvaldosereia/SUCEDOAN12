import test from 'node:test';
import assert from 'node:assert/strict';

import { renderCheckout } from '../../src/checkout/checkoutView.ts';
import type { CheckoutSnapshot } from '../../src/checkout/types.ts';

const base: CheckoutSnapshot = {
  step:'customer',
  cart:{ lines:[] },
  customer:null,
  address:null,
  payment:null,
  result:null,
};

test('checkout customer step is marked homologation and asks only local fields', () => {
  const html = renderCheckout(base);
  assert.match(html, /Homologação/);
  assert.match(html, /data-checkout-customer/);
  assert.match(html, /Nome/);
  assert.match(html, /Telefone/);
});

test('payment step shows allowed local payment methods', () => {
  const html = renderCheckout({ ...base, step:'payment' });
  assert.match(html, /PIX/);
  assert.match(html, /Dinheiro/);
  assert.match(html, /Cartão de crédito/);
  assert.match(html, /Alimentação\/refeição/);
});

test('confirmed step shows TEST id and tracking action', () => {
  const html = renderCheckout({
    ...base,
    step:'confirmed',
    result:{ orderId:'TEST-ORDER-0001', environment:'homologation' },
  });
  assert.match(html, /TEST-ORDER-0001/);
  assert.match(html, /data-route-target="order"/);
  assert.match(html, /Acompanhar pedido/);
});

test('checkout view contains no external form action', () => {
  const html = renderCheckout(base);
  assert.doesNotMatch(html, /action="https?:/i);
});
