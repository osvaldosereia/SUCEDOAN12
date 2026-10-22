import test from 'node:test';
import assert from 'node:assert/strict';
import { orderLines, cartTotalCents, orderPayload } from '../src/cart.js';
import { normalizeWhatsapp } from '../src/customer.js';

test('checkout keeps basket first, hides component prices, and prices loose products', () => {
  const cart = [
    { type: 'product', id: 'p1', name: 'Arroz', qty: 2, price_cents: 1200 },
    { type: 'basket', id: 'b1', name: 'Cesta Mini', qty: 1, price_cents: 9900,
      components: [{ product_id: 'p2', name: 'Feijão', quantity: 1, price_cents: 800 }] }
  ];
  assert.deepEqual(orderLines(cart).map(x => x.type), ['basket', 'component', 'product']);
  assert.equal(cartTotalCents(cart), 12300);
  assert.equal(orderLines(cart)[1].price_cents, undefined);
});

test('WhatsApp normalization adds Brazil country code without changing an existing one', () => {
  assert.equal(normalizeWhatsapp('(65) 99999-1234'), '+5565999991234');
  assert.equal(normalizeWhatsapp('+55 65 99999-1234'), '+5565999991234');
  assert.equal(normalizeWhatsapp('999'), '');
});

test('public submission maps order rows without exposing an online payment flow', () => {
  const payload = orderPayload([
    { type: 'basket', id: 'b1', qty: 1, components: [{ product_id: 'p2', quantity: 2 }] },
    { type: 'product', id: 'p1', qty: 3 }
  ], { phone: '+5565999999999', deliveryDate: '2026-10-23', payment: 'PIX' });
  assert.equal(payload.whatsapp_phone, '+5565999999999');
  assert.equal(payload.delivery_date, '2026-10-23');
  assert.deepEqual(payload.items.map(item => item.type), ['basket', 'product']);
  assert.equal(payload.items[0].components[0].quantity, 2);
  assert.equal('payment_token' in payload, false);
});

test('minimum order status shows remaining amount and turns ready at the threshold', async () => {
  const { minimumOrderStatus } = await import('../src/cart.js');
  assert.deepEqual(minimumOrderStatus(6500, 7500), { meetsMinimum: false, remainingCents: 1000 });
  assert.deepEqual(minimumOrderStatus(7500, 7500), { meetsMinimum: true, remainingCents: 0 });
});

test('mold basket quote uses its current composition and selected position options', async () => {
  const { basketQuoteRequest } = await import('../src/cart.js');
  const quote = basketQuoteRequest({ id: 'basket-1', mold_mode: true, composition_number: 2 }, [
    { position_id: 'position-1', product_id: 'product-2', quantity: 3 }
  ]);
  assert.equal(quote.action, 'basket_mold_quote');
  assert.deepEqual(quote.payload, { basket_id: 'basket-1', composition_number: 2, items: [{ position_id: 'position-1', product_id: 'product-2' }] });
});

test('split basket quote preserves both lot identifiers and component groups', async () => {
  const { basketQuoteRequest } = await import('../src/cart.js');
  const quote = basketQuoteRequest({ id: 'basket-1', split_mode: true, food_lot_id: 'food-1', hygiene_lot_id: 'hygiene-1' }, [
    { product_id: 'product-1', quantity: 2, component_group: 'food' }
  ]);
  assert.equal(quote.action, 'basket_quote');
  assert.equal(quote.payload.food_lot_id, 'food-1');
  assert.equal(quote.payload.items[0].component_group, 'food');
});
