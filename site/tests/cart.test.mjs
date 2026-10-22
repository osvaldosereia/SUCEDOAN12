import test from 'node:test';
import assert from 'node:assert/strict';
import { orderLines, cartTotalCents, orderPayload, canAdjustBasketComponent, basketWouldBeEmpty } from '../src/cart.js';
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
  assert.deepEqual(quote.payload, { basket_id: 'basket-1', composition_number: 2, lightweight: true, items: [{ position_id: 'position-1', product_id: 'product-2', quantity: 3 }] });
});

test('mold basket checkout keeps the composition and adjusted component quantities', async () => {
  const { orderPayload } = await import('../src/cart.js');
  const payload = orderPayload([{
    type: 'basket', id: 'basket-1', mold_mode: true, composition_number: 2,
    qty: 1, components: [{ position_id: 'position-1', product_id: 'product-2', quantity: 5 }]
  }]);
  assert.deepEqual(payload.items[0], {
    type: 'basket_mold', id: 'basket-1', qty: 1, composition_number: 2,
    split_mode: false, lot_id: null, components: [{ position_id: 'position-1', product_id: 'product-2', quantity: 5 }]
  });
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

test('zero component quantity stays zero in quote and checkout payload', async () => {
  const { basketQuoteRequest, orderPayload, orderLines } = await import('../src/cart.js');
  const component = { position_id: 'position-1', product_id: 'product-2', quantity: 0, base_quantity: 4 };
  const basket = { type: 'basket', id: 'basket-1', mold_mode: true, qty: 1, components: [component] };
  assert.equal(basketQuoteRequest(basket, [component]).payload.items[0].quantity, 0);
  assert.equal(orderPayload([basket]).items[0].components[0].quantity, 0);
  assert.equal(orderLines([basket])[1].quantity, 0);
});

test('checkout component rows retain the basket and component index for quantity edits', () => {
  const row = orderLines([{ type: 'basket', id: 'basket-1', qty: 1, components: [
    { product_id: 'product-2', quantity: 2 }
  ] }])[1];
  assert.equal(row.basket_id, 'basket-1');
  assert.equal(row.component_index, 0);
});

test('basket quantity controls respect minimums, removability, editability, and stock', () => {
  const basket = { type: 'basket', qty: 1 };
  assert.equal(canAdjustBasketComponent(basket, { quantity: 1, min_quantity: 0, max_quantity: 3, removable: true }, -1), true);
  assert.equal(canAdjustBasketComponent(basket, { quantity: 1, min_quantity: 1, max_quantity: 3, removable: true }, -1), false);
  assert.equal(canAdjustBasketComponent(basket, { quantity: 1, base_quantity: 1, removable: false }, -1), false);
  assert.equal(canAdjustBasketComponent(basket, { quantity: 1, quantity_editable: false, removable: false }, 1), false);
  assert.equal(canAdjustBasketComponent(basket, { quantity: 3, max_quantity: 3 }, 1), false);
});

test('mold quantities can reach zero but cannot empty the whole basket', () => {
  const basket = { type: 'basket', mold_mode: true, qty: 1 };
  const components = [{ quantity: 1 }, { quantity: 2 }];
  assert.equal(canAdjustBasketComponent(basket, components[0], -1), true);
  assert.equal(basketWouldBeEmpty(components, 0, 0), false);
  assert.equal(basketWouldBeEmpty([{ quantity: 1 }], 0, 0), true);
});
