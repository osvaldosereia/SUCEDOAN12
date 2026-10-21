import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAdminCatalog, normalizeAdminProduct } from '../src/public-api.js';

test('consulta o catálogo administrativo por GET no endpoint somente leitura', async () => {
  let call;
  const result = await requestAdminCatalog('products', { limit: 36, offset: 0, status: 'all', stock: 'all' }, async (url, options) => {
    call = { url, options };
    return { ok: true, json: async () => ({ ok: true, products: [], next_offset: null, total: 0 }) };
  });
  assert.equal(call.options.method, 'GET');
  assert.match(call.url, /admin1-products-read-v1/);
  assert.equal(result.total, 0);
});

test('bloqueia ações de gravação antes de fazer qualquer chamada de rede', async () => {
  let called = false;
  await assert.rejects(
    requestAdminCatalog('product_save', {}, async () => { called = true; }),
    /somente leitura/i
  );
  assert.equal(called, false);
});

test('normaliza produto inativo preservando campos para conferência administrativa', () => {
  const product = normalizeAdminProduct({ id: 'p1', name: 'Produto', sku: 'P1', gtin: 'SEM GTIN', ncm: '10063021', category: 'Mercearia', subcategory: 'Arroz', price: '12.34', stock: 0, is_active: false, unit: 'UN' });
  assert.equal(product.active, false);
  assert.equal(product.stock_quantity, 0);
  assert.equal(product.sale_price_cents, 1234);
  assert.equal(product.ncm, '10063021');
  assert.equal(product.subcategory, 'Arroz');
  assert.equal(product.unit, 'UN');
});

