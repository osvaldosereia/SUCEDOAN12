import assert from 'node:assert/strict';
import { createEventBus, createInitialState, createStore } from '../src/core.js';
import { CartService, calculateCartPricing, cartUnitPricing, productDisplayPricing } from '../src/commerce.js';
import { buildOrderPayload, validateCheckoutData } from '../src/integrations.js';

const now = new Date('2026-07-27T12:00:00-04:00');
const product = { id: 'p1', firebaseKey: 'p1', codigo: 'P1', name: 'Produto teste', price: 100, oldPrice: 100, stock: 10, situacao: 'A', validade: '2026-08-10' };
const coupon20 = { codigo: 'C20', ativo: true, tipo: 'percentual', desconto: 20, categorias: [], marcas: [], palavras_chave: [] };
const coupon5 = { codigo: 'C5', ativo: true, tipo: 'percentual', desconto: 5, categorias: [], marcas: [], palavras_chave: [] };

const couponWins = cartUnitPricing(product, 3, coupon20, { eligible: true }, now);
assert.equal(couponWins.couponDiscount, 20);
assert.equal(couponWins.expiryBulkDiscount, 0);
assert.equal(couponWins.effective, 76);

const expiryWins = cartUnitPricing(product, 3, coupon5, { eligible: true }, now);
assert.equal(expiryWins.couponDiscount, 0);
assert.equal(expiryWins.expiryBulkDiscount, 10);
assert.equal(expiryWins.effective, 85.5);

const state = createInitialState();
state.products = [product];
state.productMap = new Map([[product.id, product]]);
state.cart = { p1: 3 };
state.cartOrder = ['p1'];
state.coupons = [coupon20];
state.activeCouponCode = 'C20';
const pricing = calculateCartPricing(state, { now });
assert.equal(productDisplayPricing(state, product, pricing).effective, pricing.linePrices.get('p1').effective);

const form = { deliveryDate: '2026-07-20', name: 'Cliente Teste', cpf: '12345678901', phone: '65999999999', email: 'teste@example.com', cep: '78000000', city: 'Cuiabá', district: 'Centro', street: 'Rua Teste', number: '1', payment: 'PIX' };
assert.equal(validateCheckoutData(form, state, { allowedDeliveryDates: ['2026-07-28'] }).valid, false);
form.deliveryDate = '2026-07-28';
assert.equal(validateCheckoutData(form, state, { allowedDeliveryDates: ['2026-07-28'] }).errors.some(error => error.field === 'deliveryDate'), false);

const first = buildOrderPayload(state, form, { timestamp: 1785182400000, random: 1 }).pedido;
const second = buildOrderPayload(state, form, { timestamp: 1785182400000, random: 2 }).pedido;
assert.equal(first.numero, first.id);
assert.notEqual(first.numero, second.numero);

const store = createStore(createInitialState());
store.mutate(current => {
  current.productMap = new Map([[product.id, { ...product, stock: 1 }]]);
  current.cart = { p1: 3, ausente: 2 };
  current.cartOrder = ['p1', 'ausente'];
});
const cart = new CartService(store, createEventBus());
const reconciliation = cart.reconcileCatalog();
assert.equal(store.getState().cart.p1, 1);
assert.equal(store.getState().cart.ausente, undefined);
assert.equal(reconciliation.changed, true);

console.log('Consistência validada: carrinho, descontos, preços, entrega e número do pedido.');
