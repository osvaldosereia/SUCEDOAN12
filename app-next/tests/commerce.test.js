import test from 'node:test';
import assert from 'node:assert/strict';
import { basketIsVisible, basketStockCapacity, calculateCartPricing, couponIsValid, kitIsVisible } from '../src/commerce.js';

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

function kitState(stock) {
  const product = { id: 'P1', codigo: 'P1', name: 'Produto do kit', price: 10, oldPrice: 10, stock, situacao: '' };
  return {
    products: [product],
    productMap: new Map([[product.id, product]]),
    productExactMap: new Map([[product.id.toLowerCase(), product]]),
    productCodeMap: new Map([[product.id.toLowerCase(), product]])
  };
}

function stockControlledKit() {
  return {
    id: 'k-estoque',
    ativo: true,
    preco: 8,
    precoOriginal: 10,
    produtos: [{ codigo: 'P1', qtd: 1 }],
    dataInicio: '',
    dataFim: ''
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

test('kit fica visível enquanto todos os itens possuem estoque', () => {
  assert.equal(kitIsVisible(kitState(2), stockControlledKit(), new Date('2026-07-27T12:00:00-04:00')), true);
});

test('kit sai do ar quando um dos itens chega a estoque zero', () => {
  assert.equal(kitIsVisible(kitState(0), stockControlledKit(), new Date('2026-07-27T12:00:00-04:00')), false);
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


test('mantém o ajuste oculto para cada unidade da mesma cesta', async () => {
  const { CartService } = await import('../src/commerce.js');
  const products = [
    { id: 'a', codigo: 'A', name: 'Produto A', price: 10, oldPrice: 10, stock: 20, situacao: '', embalagem: '1un' },
    { id: 'b', codigo: 'B', name: 'Produto B', price: 10, oldPrice: 10, stock: 20, situacao: '', embalagem: '1un' }
  ];
  const state = {
    products,
    productMap: new Map(products.map(product => [product.id, product])),
    productCodeMap: new Map(products.map(product => [product.codigo.toLowerCase(), product])),
    productExactMap: new Map(products.map(product => [product.codigo.toLowerCase(), product])),
    virtualFees: {}, cart: {}, cartOrder: [], basketCustomizations: {}, basketDrafts: {},
    favorites: new Set(), coupons: [], activeCouponCode: '', customerLookupStatus: 'new'
  };
  const store = { getState: () => state, mutate(mutator) { mutator(state); } };
  const cart = new CartService(store, { emit() {} });
  const basket = { id: 'c1', nome: 'Cesta', preco: 25, produtos: ['1x A', '1x B'] };

  assert.equal(cart.addBasket(basket).ok, true);
  assert.equal(cart.addBasket(basket).ok, true);
  assert.equal(state.cart['fee_basket:c1'], 2);

  const pricing = calculateCartPricing(state);
  assert.equal(pricing.productsSubtotalBefore, 40);
  assert.equal(pricing.basketAdjustment, 10);
  assert.equal(pricing.total, 50);
});

test('respeita status e limite manual da cesta', async () => {
  const { CartService } = await import('../src/commerce.js');
  const product = { id: 'a', codigo: 'A', name: 'Produto A', price: 10, oldPrice: 10, stock: 20, situacao: '' };
  const state = {
    products: [product], productMap: new Map([[product.id, product]]),
    productCodeMap: new Map([['a', product]]), productExactMap: new Map([['a', product]]),
    virtualFees: {}, cart: {}, cartOrder: [], basketCustomizations: {}, basketDrafts: {},
    favorites: new Set(), coupons: [], activeCouponCode: '', customerLookupStatus: 'new'
  };
  const basket = { id: 'limitada', nome: 'Cesta limitada', preco: 12, produtos: [{ codigo: 'A', qtd: 1 }], ativo: true, limiteIlimitado: false, limiteCestas: 1 };
  assert.equal(basketStockCapacity(state, basket), 1);
  assert.equal(basketIsVisible(state, basket), true);
  assert.equal(basketIsVisible(state, { ...basket, ativo: false }), false);

  const cart = new CartService({ getState: () => state, mutate(fn) { fn(state); } }, { emit() {} });
  assert.equal(cart.addBasket(basket).ok, true);
  assert.equal(cart.addBasket(basket).ok, false);
  assert.equal(state.basketCustomizations['basket:limitada'].units, 1);
});
