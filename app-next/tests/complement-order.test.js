import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFirebaseOrder } from '../src/integrations.js';
import {
  buildComplementPayload, buildComplementWhatsAppMessage
} from '../../complemente/order-integration.js';

function pricing() {
  return {
    subtotal: 20,
    discount: 2,
    total: 18,
    items: [{
      qty: 2,
      unit: 9,
      baseUnit: 10,
      discountCode: 'BELEZA10',
      product: {
        id: 'firebase-1', firebaseKey: 'firebase-1', codigo: 'SKU-1',
        name: 'Produto Teste', price: 10, gtin: '7890000000001',
        img: 'produto.webp', stock: 5, categoria: 'BELEZA'
      }
    }]
  };
}

const customer = {
  nome: 'Cliente Existente',
  numeroDocumento: '12345678901',
  celular: '65999999999',
  email: 'cliente@example.com',
  endereco: { geral: { endereco: 'Rua A', numero: '10', bairro: 'Centro', municipio: 'Cuiabá', uf: 'MT', cep: '78000000' } }
};

test('monta pedido complementar independente usando somente CPF informado', () => {
  const payload = buildComplementPayload({
    pricing: pricing(), cpf: '123.456.789-01', customer,
    campaignReference: 'campanha.token', sourceUrl: 'https://donaantonia.com.br/complemente/',
    timestamp: 1760000000000, random: 7
  });
  assert.equal(payload.pedido.id, 'COMP-1760000000000007');
  assert.equal(payload.pedido.origem, 'complemente');
  assert.equal(payload.pedido.tipo, 'pedido_complementar');
  assert.equal(payload.pedido.cliente.cpf, '12345678901');
  assert.equal(payload.pedido.cliente.pagamentoCodigo, 'PIX');
  assert.equal(payload.pedido.itens[0].firebaseKey, 'firebase-1');
  assert.equal(payload.pedido.total, 18);
});

test('registro Firebase identifica complemento e estoque pendente', () => {
  const payload = buildComplementPayload({ pricing: pricing(), cpf: '12345678901', customer, timestamp: 1760000000000, random: 8 });
  const firebase = buildFirebaseOrder(payload);
  assert.equal(firebase.origem, 'complemente');
  assert.equal(firebase.tipo, 'pedido_complementar');
  assert.equal(firebase.estoque.status, 'pendente');
  assert.equal(firebase.controle.pedido_original_site, false);
  assert.equal(firebase.controle.pedido_complementar, true);
});

test('mensagem do complemento usa o identificador COMP', () => {
  const payload = buildComplementPayload({ pricing: pricing(), cpf: '12345678901', customer, timestamp: 1760000000000, random: 9 });
  const message = buildComplementWhatsAppMessage(payload);
  assert.match(message, /PEDIDO COMPLEMENTAR #COMP-/);
  assert.match(message, /2x Produto Teste/);
  assert.match(message, /R\$\s*18,00/);
});

test('recusa CPF sem cadastro localizado', () => {
  assert.throws(
    () => buildComplementPayload({ pricing: pricing(), cpf: '12345678901', customer: null }),
    /CPF não encontrado/
  );
});
