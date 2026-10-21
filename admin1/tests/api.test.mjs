import test from 'node:test';
import assert from 'node:assert/strict';
import { adminApi } from '../src/api.js';

test('adapta os detalhes públicos para o modelo usado pela interface', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      json: async () => ({
        ok: true,
        product: {
          id: 'p1', name: 'Arroz', price: '12.34', stock: 4, is_active: true,
          description_long: 'Tipo 1', brand: 'Dona Antônia'
        }
      })
    };
  };
  try {
    const result = await adminApi('product_detail', { id: 'p1' });
    assert.equal(result.product.id, 'p1');
    assert.equal(result.product.sale_price_cents, 1234);
    assert.equal(result.product.description, 'Tipo 1');
    assert.equal(result.product.brand, 'Dona Antônia');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, 'GET');
    assert.match(calls[0].url, /admin1-products-read-v1/);
    assert.match(calls[0].url, /action=product/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a camada da interface não aceita uma ação de gravação', async () => {
  await assert.rejects(adminApi('product_save', { id: 'p1' }), /não disponível/);
});

