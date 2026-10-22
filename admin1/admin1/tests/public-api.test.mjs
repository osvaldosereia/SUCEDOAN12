import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePublicProduct, requestPreview } from '../src/public-api.js';

test('normaliza dados públicos do produto sem expor campos internos', () => {
  const p = normalizePublicProduct({ id: 'p1', name: 'Arroz', image_url: 'https://img.example/arroz.jpg', price_cents: 1234, stock_quantity: 3, is_active: true, category: 'Mercearia' });
  assert.equal(p.sale_price_cents, 1234);
  assert.equal(p.active, true);
  assert.equal(p.stock_quantity, 3);
  assert.equal(p.image_url, 'https://img.example/arroz.jpg');
  assert.equal(p.category, 'Mercearia');
  assert.equal('cost_cents' in p, false);
});

test('consulta o catálogo pelo método GET e bloqueia ações de escrita antes da rede', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, json: async () => ({ ok: true, products: [{ id: 'p1', name: 'Arroz' }], next_offset: null }) };
  };
  const data = await requestPreview('products', { limit: 24, q: 'arroz' }, fetchMock);
  assert.equal(data.products[0].name, 'Arroz');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
  assert.match(calls[0].url, /action=products/);
  await assert.rejects(requestPreview('product_save', {}, fetchMock), /somente leitura/);
  assert.equal(calls.length, 1);
});

test('consulta o detalhe público pelo método GET e envia apenas o identificador do produto', async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, json: async () => ({ ok: true, product: { id: 'p1', name: 'Arroz', description: 'Tipo 1' } }) };
  };
  const data = await requestPreview('product', { product_id: 'p1' }, fetchMock);
  assert.equal(data.product.name, 'Arroz');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
  assert.match(calls[0].url, /action=product/);
  assert.match(calls[0].url, /product_id=p1/);
});

test('bloqueia qualquer chamada que não seja consulta pública de produto', async () => {
  let calls = 0;
  const fetchMock = async () => { calls += 1; return { ok: true, json: async () => ({ ok: true }) }; };
  await assert.rejects(requestPreview('product_save', { id: 'p1' }, fetchMock), /somente leitura/);
  await assert.rejects(requestPreview('product_delete', { id: 'p1' }, fetchMock), /somente leitura/);
  assert.equal(calls, 0);
});


