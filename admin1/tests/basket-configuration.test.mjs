import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdmin1Data } from '../src/admin1-data.js';

const response = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('carrega tamanhos da configuração de cestas em ordem pelo Admin1', async () => {
  const calls = [];
  const api = createAdmin1Data(async (url, options) => { calls.push({ url: String(url), options }); return response([{ id: 'size-1', name: 'Econômica', sort_order: 0, is_active: true }]); });
  const sizes = await api.listBasketSizes();
  assert.equal(sizes[0].active, true);
  assert.equal(sizes[0].sort_order, 0);
  assert.match(calls[0].url, /admin1_basket_sizes/);
  assert.equal(calls[0].options.method, 'GET');
  assert.ok(calls[0].url.startsWith('https://xaoeldjuxzsdsblimzxo.supabase.co/rest/v1/'));
});

test('salva tipo, produtos em ordem e quantidades por tamanho atomicamente no Admin1', async () => {
  const calls = [];
  const api = createAdmin1Data(async (url, options) => { calls.push({ url: String(url), options }); return response([{ id: 'type-1', name: 'Arroz', is_active: true }]); });
  await api.saveBasketType({
    name: 'Arroz', active: true,
    products: [{ product_id: 'product-b' }, { product_id: 'product-a' }],
    quantities: { 'size-small': 1, 'size-large': 2.5 }
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /rpc\/admin1_save_basket_product_type_v1/);
  const payload = JSON.parse(calls[0].options.body).p_type;
  assert.deepEqual(payload.products, [{ product_id: 'product-b', sort_order: 0 }, { product_id: 'product-a', sort_order: 1 }]);
  assert.deepEqual(payload.quantities, [{ size_id: 'size-small', quantity: 1 }, { size_id: 'size-large', quantity: 2.5 }]);
  assert.equal(payload.is_active, true);
});

test('normaliza produtos vinculados e quantidades de um tipo', async () => {
  const api = createAdmin1Data(async () => response([{ id: 'type-1', name: 'Arroz', is_active: true,
    admin1_basket_type_products: [{ product_id: 'p-2', sort_order: 1, product: { id: 'p-2', name: 'Arroz integral' } }, { product_id: 'p-1', sort_order: 0, product: { id: 'p-1', name: 'Arroz branco' } }],
    admin1_basket_type_quantities: [{ size_id: 's-1', quantity: '2.5' }]
  }]));
  const types = await api.listBasketTypes();
  assert.deepEqual(types[0].products.map(link => link.product.name), ['Arroz branco', 'Arroz integral']);
  assert.equal(types[0].quantities['s-1'], 2.5);
});


test('normaliza o valor oculto da cesta em centavos ao carregar cada tamanho', async () => {
  const api = createAdmin1Data(async () => response([{ id: 'size-1', name: 'Econômica', sort_order: 0, is_active: true, hidden_value_cents: 1299 }]));
  const sizes = await api.listBasketSizes();
  assert.equal(sizes[0].hidden_value_cents, 1299);
});

test('salva o valor oculto digitado em reais como centavos sem alterar o restante do tamanho', async () => {
  const calls = [];
  const api = createAdmin1Data(async (url, options) => { calls.push({ url: String(url), options }); return response([{ id: 'size-1', name: 'Econômica', hidden_value_cents: 1299 }]); });
  await api.saveBasketSize({ id: 'size-1', name: 'Econômica', hidden_value: '12,99', sort_order: 0, active: true });
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.hidden_value_cents, 1299);
  assert.equal(payload.name, 'Econômica');
  assert.equal(payload.is_active, true);
});

test('recusa valores ocultos negativos ou inválidos antes da gravação', async () => {
  let calls = 0;
  const api = createAdmin1Data(async () => { calls += 1; return response([]); });
  await assert.rejects(api.saveBasketSize({ name: 'Econômica', hidden_value: '-1' }), /igual ou maior que zero/);
  await assert.rejects(api.saveBasketSize({ name: 'Econômica', hidden_value: 'abc' }), /igual ou maior que zero/);
  assert.equal(calls, 0);
});
