import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCartPricing, couponIsValid, kitIsVisible } from '../src/commerce.js';

function stateWith(product, coupon = null, qty = 1) {
  return {
    products: [product],
    productMap: new Map([[product.id, product]]),
    productExactMap: new Map(),
    productCodeMap: new Map(),
    virtualFees: {},
    cart: { [product.id]: qty },
    cartOrder: [product.id],
    coupons: coupon ? [coupon] : [],
    activeCouponCode: coupon?.codigo || '',
    customerLookupStatus: 'new',
    basketCustomizations: {}
  };
}

test('calcula cupom e atacado na ordem esperada', () => {
  const product = { id: 'p1', name: 'Produto', price: 100, oldPrice: 100, stock: 20, situacao: '', validade: '' };
  const coupon = { codigo: 'TESTE10', ativo: true, tipo: 'percentual', desconto: 10 };
  const pricing = calculateCartPricing(stateWith(product, coupon, 3), { now: new Date('2026-07-24T12:00:00') });
  assert.equal(pricing.subtotalBefore, 300);
  assert.equal(pricing.couponDiscount, 30);
  assert.equal(pricing.wholesaleDiscount, 13.5);
  assert.equal(pricing.total, 256.5);
});

test('aplica desconto adicional de validade para três unidades', () => {
  const product = { id: 'p1', name: 'Produto', price: 100, oldPrice: 100, stock: 20, situacao: '', validade: '01/08/2026' };
  const pricing = calculateCartPricing(stateWith(product, null, 3), { now: new Date('2026-07-24T12:00:00') });
  assert.equal(pricing.expiryBulkDiscount, 30);
  assert.equal(pricing.wholesaleDiscount, 13.5);
  assert.equal(pricing.total, 256.5);
});

test('rejeita cupom vencido', () => {
  assert.equal(couponIsValid({ ativo: true, validade: '01/01/2025' }, new Date('2026-07-24')), false);
});

test('kit sem produtos resolvidos não fica visível', () => {
  const state = { products: [], productMap: new Map(), productCodeMap: new Map(), productExactMap: new Map() };
  const kit = { id: 'k1', ativo: true, preco: 10, produtos: ['1x X'], dataInicio: '', dataFim: '' };
  assert.equal(kitIsVisible(state, kit), false);
});

test('detecta cesta alterada mesmo quando o valor total não muda', async () => {
  const { CartService } = await import('../src/commerce.js');
  const products = [
    { id: 'a', codigo: 'A', name: 'A', price: 10, oldPrice: 10, stock: 10, situacao: '' },
    { id: 'b', codigo: 'B', name: 'B', price: 10, oldPrice: 10, stock: 10, situacao: '' }
  ];
  const state = {
    products, productMap: new Map(products.map(p => [p.id, p])), productCodeMap: new Map(products.map(p => [p.id.toLowerCase(), p])),
    productExactMap: new Map(products.map(p => [p.id.toLowerCase(), p])), virtualFees: {}, cart: {}, cartOrder: [],
    basketCustomizations: {}, basketDrafts: {}, favorites: new Set(), coupons: [], activeCouponCode: ''
  };
  const store = { getState: () => state, mutate(fn) { fn(state); } };
  const cart = new CartService(store, { emit() {} });
  const result = cart.addBasket({ id: 'c1', nome: 'Cesta', preco: 20, produtos: ['1x A', '1x B'] }, { a: 2, b: 0 });
  assert.equal(result.ok, true);
  assert.equal(state.basketCustomizations['basket:c1'].changed, true);
});
