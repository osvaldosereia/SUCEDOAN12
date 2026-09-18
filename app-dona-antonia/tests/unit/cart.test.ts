import test from 'node:test';
import assert from 'node:assert/strict';

import { createCartStore } from '../../src/cart/cartStore.ts';
import { calculateCartTotal, effectiveUnitPrice } from '../../src/cart/cartMath.ts';
import type { CartLineInput } from '../../src/cart/types.ts';

const product: CartLineInput = {
  kind: 'product',
  refId: 'TEST-PROD-001',
  name: 'Arroz',
  quantity: 1,
  unitPriceCents: 3290,
  promoUnitPriceCents: 2990,
};

const basket: CartLineInput = {
  kind: 'basket',
  refId: 'TEST-BASKET-FAMILIA',
  name: 'Cesta Família',
  quantity: 1,
  unitPriceCents: 21990,
  promoUnitPriceCents: null,
};

test('repeated add merges the same line and increments quantity', () => {
  const cart = createCartStore();
  cart.add(product);
  cart.add(product);

  const snapshot = cart.getSnapshot();
  assert.equal(snapshot.lines.length, 1);
  assert.equal(snapshot.lines[0]?.quantity, 2);
});

test('remove deletes a line completely', () => {
  const cart = createCartStore();
  const line = cart.add(product);

  assert.equal(cart.remove(line.id), true);
  assert.equal(cart.getSnapshot().lines.length, 0);
  assert.equal(cart.remove(line.id), false);
});

test('setQuantity rejects zero and negative values', () => {
  const cart = createCartStore();
  const line = cart.add(product);

  assert.equal(cart.setQuantity(line.id, 0), false);
  assert.equal(cart.setQuantity(line.id, -2), false);
  assert.equal(cart.getSnapshot().lines[0]?.quantity, 1);
});

test('setQuantity accepts positive integer values', () => {
  const cart = createCartStore();
  const line = cart.add(product);

  assert.equal(cart.setQuantity(line.id, 3), true);
  assert.equal(cart.getSnapshot().lines[0]?.quantity, 3);
});

test('effective price prefers a valid promotion', () => {
  assert.equal(effectiveUnitPrice(product), 2990);
  assert.equal(effectiveUnitPrice({ ...product, promoUnitPriceCents: 3390 }), 3290);
  assert.equal(effectiveUnitPrice({ ...product, promoUnitPriceCents: null }), 3290);
});

test('cart total handles basket plus promotional extras deterministically', () => {
  const cart = createCartStore();
  cart.add(basket);
  cart.add(product);
  cart.add(product);

  const summary = calculateCartTotal(cart.getSnapshot());
  assert.deepEqual(summary, {
    itemCount: 3,
    lineCount: 2,
    subtotalCents: 27970,
    savingsCents: 600,
    totalCents: 27970,
  });
});

test('clear removes every line and resets totals', () => {
  const cart = createCartStore();
  cart.add(basket);
  cart.add(product);
  cart.clear();

  assert.deepEqual(cart.getSnapshot().lines, []);
  assert.equal(calculateCartTotal(cart.getSnapshot()).totalCents, 0);
});

test('basket and product with same ref id never merge across kinds', () => {
  const cart = createCartStore();
  cart.add({ ...basket, refId: 'SAME' });
  cart.add({ ...product, refId: 'SAME' });

  assert.equal(cart.getSnapshot().lines.length, 2);
});
