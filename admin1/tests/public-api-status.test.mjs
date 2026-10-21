import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAdminProductStatus } from '../src/public-api.js';

const productId = '82265bb7-2a43-4a36-8a44-d37b79e0b90a';

test('envia apenas a mudança explícita do status do produto', async () => {
  let request;
  const result = await requestAdminProductStatus({ id: productId, active: false }, async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ ok: true, product: { id: productId, is_active: false } }) };
  });

  assert.equal(result.product.is_active, false);
  assert.match(request.url, /admin1-product-status-v1$/);
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), { product_id: productId, is_active: false });
});

test('não envia requisição para identificador ou status inválidos', async () => {
  let calls = 0;
  const fetchStub = async () => { calls += 1; throw new Error('não deveria chamar fetch'); };
  await assert.rejects(() => requestAdminProductStatus({ id: 'x', active: true }, fetchStub), /Dados inválidos/);
  await assert.rejects(() => requestAdminProductStatus({ id: productId, active: 'true' }, fetchStub), /Dados inválidos/);
  assert.equal(calls, 0);
});

test('transforma a regra de estoque zero do servidor em mensagem operacional', async () => {
  await assert.rejects(() => requestAdminProductStatus({ id: productId, active: true }, async () => ({
    ok: false, status: 409, json: async () => ({ ok: false, error: 'product_out_of_stock' })
  })), /Produto sem estoque/);
});
