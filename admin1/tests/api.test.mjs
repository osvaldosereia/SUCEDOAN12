import test from 'node:test';
import assert from 'node:assert/strict';
import { adminApi } from '../src/api.js';

test('consulta os detalhes do catálogo próprio do Admin1', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify([{ id: '82265bb7-2a43-4a36-8a44-d37b79e0b90a', name: 'Arroz', sku: 'A1', price_cents: 1234, stock_quantity: 4, is_active: true, description_long: 'Tipo 1', packaging: '5 kg' }]), { status: 200 });
  };
  try {
    const result = await adminApi('product_detail', { id: '82265bb7-2a43-4a36-8a44-d37b79e0b90a' });
    assert.equal(result.product.id, '82265bb7-2a43-4a36-8a44-d37b79e0b90a');
    assert.equal(result.product.sale_price_cents, 1234);
    assert.equal(result.product.description, 'Tipo 1');
    assert.equal(result.product.packaging, '5 kg');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, 'GET');
    assert.match(calls[0].url, /xaoeldjuxzsdsblimzxo\.supabase\.co\/rest\/v1\/admin1_products/);
    assert.equal(calls[0].options.method, 'GET');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a camada da interface não aceita uma ação de gravação', async () => {
  await assert.rejects(adminApi('product_save', { id: 'p1' }), /não disponível/);
});


