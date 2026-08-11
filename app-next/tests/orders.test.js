import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBundleMessageContext, buildFirebaseOrder, buildOrderPayload, buildWhatsAppMessage,
  canDispatchOrderToMake, enqueueOrder, firebaseOrderWasProcessed, isComplementOrderEntry,
  validateCheckoutData
} from '../src/integrations.js';

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
  assert.equal(firebase.estoque.status, 'pendente');
  assert.equal(firebase.controle.preview_modular, true);
});

test('pedido normal pode iniciar Make junto com Firebase sem liberar complementar', () => {
  assert.equal(canDispatchOrderToMake({ firebaseStatus: 'pending', makeStatus: 'pending' }), false);
  assert.equal(canDispatchOrderToMake({
    firebaseStatus: 'pending', makeStatus: 'pending', makePayload: { pedido: { tipo: 'pedido_normal' } }
  }, { allowNormalBeforeFirebase: true }), true);
  const complement = {
    firebaseStatus: 'pending', makeStatus: 'pending', makePayload: { pedido: { tipo: 'pedido_complementar' } }
  };
  assert.equal(isComplementOrderEntry(complement), true);
  assert.equal(canDispatchOrderToMake(complement, { allowNormalBeforeFirebase: true }), false);
  assert.equal(canDispatchOrderToMake({ ...complement, firebaseStatus: 'sent' }), true);
  assert.equal(canDispatchOrderToMake({ firebaseStatus: 'sent', makeStatus: 'sent' }), false);
  assert.equal(canDispatchOrderToMake({ firebaseStatus: 'sent', makeStatus: 'sending' }), false);
});

test('fila só considera o Make concluído após confirmação final no Firebase', () => {
  assert.equal(firebaseOrderWasProcessed({
    bling: { id_pedido_venda: '123' },
    controle: { processado_make: false }
  }), false);
  assert.equal(firebaseOrderWasProcessed({
    bling: { id_pedido_venda: '123' },
    controle: { processado_make: true }
  }), true);
  assert.equal(firebaseOrderWasProcessed({
    controle: { processado_make: true }
  }), false);
});

test('fila acusa falha quando o navegador não consegue persistir o pedido', () => {
  const payload = buildOrderPayload(sampleState(), form, { timestamp: 1760000000000, random: 9 });
  assert.throws(() => enqueueOrder(payload), /não permitiu salvar a fila local/i);
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


test('mensagem separa cesta alterada, extras e retirados', () => {
  const state = sampleState();
  const second = { ...state.products[0], id: 'fb2', firebaseKey: 'fb2', codigo: 'SKU2', name: 'Feijão Teste' };
  state.products.push(second);
  state.productMap.set('fb2', second);
  state.cart = { fb1: 1, fb2: 1 };
  state.cartOrder = ['fb1', 'fb2'];
  state.basketCustomizations = {
    'basket:c1': { label: 'CESTA', name: 'Cesta Teste', originalItems: { fb1: 2 }, selectedItems: { fb1: 1 }, changed: true, fee: 0 }
  };
  const payload = buildOrderPayload(state, form, { timestamp: 1760000000000, random: 8 });
  const validation = validateCheckoutData(form, state);
  const context = buildBundleMessageContext(state, payload.pedido.itens);
  assert.equal(context.changed.length, 1);
  assert.equal(context.extras.length, 1);
  assert.deepEqual(context.removed, ['1x Arroz Teste']);
  const message = buildWhatsAppMessage(payload, validation.pricing, state);
  assert.match(message, /CESTA TESTE - ALTERADA/);
  assert.match(message, /PRODUTOS ADICIONADOS FORA DA CESTA/);
  assert.match(message, /1x Arroz Teste/);
});
