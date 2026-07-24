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
