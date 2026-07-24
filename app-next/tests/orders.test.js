import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFirebaseOrder, buildOrderPayload, buildWhatsAppMessage, validateCheckoutData } from '../src/integrations.js';

function sampleState() {
  const product = {
    id: 'fb1', firebaseKey: 'fb1', codigo: 'SKU1', name: 'Arroz Teste', price: 50, oldPrice: 50,
    stock: 10, situacao: '', gtin: '7890000000001', ean: '7890000000001', img: 'x.webp',
    categoria: 'Mercearia', subcategoria: 'Arroz', marca: 'Teste', embalagem: '5kg'
  };
  return {
    products: [product], productMap: new Map([[product.id, product]]), virtualFees: {},
    cart: { fb1: 2 }, cartOrder: ['fb1'], coupons: [], activeCouponCode: '',
    customerLookupStatus: 'new', basketCustomizations: {}, catalogLoadedAt: 1,
    catalogSource: 'test', catalogVersion: 'v1'
  };
}

const form = {
  name: 'Cliente Teste', cpf: '12345678901', phone: '65999999999', email: 'teste@example.com',
  cep: '78000000', city: 'Cuiabá', district: 'Centro', street: 'Rua A', block: '', number: '10',
  reference: 'Portão branco', payment: 'PIX', deliveryDate: '2026-07-25'
};

test('valida checkout completo', () => {
  const result = validateCheckoutData(form, sampleState());
  assert.equal(result.valid, true);
});

test('monta payload compatível com Make e Firebase', () => {
  const payload = buildOrderPayload(sampleState(), form, { timestamp: 1760000000000, random: 7 });
  assert.equal(payload.pedido.id, '1760000000000007');
  assert.equal(payload.pedido.itens[0].firebaseKey, 'fb1');
  assert.equal(payload.pedido.total, 100);
  const firebase = buildFirebaseOrder(payload);
  assert.equal(firebase.numero_pedido, payload.pedido.numero);
  assert.equal(firebase.itens[0].status_separacao, 'pendente');
  assert.equal(firebase.controle.preview_modular, true);
});

test('mensagem do WhatsApp contém número, itens e total', () => {
  const state = sampleState();
  const payload = buildOrderPayload(state, form, { timestamp: 1760000000000, random: 7 });
  const validation = validateCheckoutData(form, state);
  const message = buildWhatsAppMessage(payload, validation.pricing);
  assert.match(message, /PEDIDO #/);
  assert.match(message, /2x Arroz Teste/);
  assert.match(message, /R\$\s*100,00/);
});
