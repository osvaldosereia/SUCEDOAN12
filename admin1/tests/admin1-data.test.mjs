import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdmin1Data, mapLegacyProduct, normalizeEanSequence } from '../src/admin1-data.js';

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

test('consulta e grava somente no projeto próprio do Admin1', async () => {
  const calls = [];
  const api = createAdmin1Data(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/rpc/admin1_save_product_v1')) return json([{ id: 'p1', name: 'Arroz', sku: 'A1', category: 'Mercearia', stock_quantity: 0, price_cents: 0 }]);
    return json([]);
  });
  await api.listProducts();
  await api.saveProduct({ name: 'Arroz', sku: 'A1', category: 'Mercearia', price: '0', stock: '0' });
  assert.ok(calls.every(call => call.url.startsWith('https://xaoeldjuxzsdsblimzxo.supabase.co/')));
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[1].options.method, 'POST');
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.p_product.stock_quantity, 0);
  assert.equal(body.p_product.is_active, false);
});

test('consulta o catálogo antigo exclusivamente por GET e apenas pela função proxy', async () => {
  const calls = [];
  const api = createAdmin1Data(async (url, options) => {
    calls.push({ url: String(url), options });
    return json({ ok: true, products: [{ id: 'old-1', gtin: '7891234567895', name: 'Arroz' }] });
  });
  const result = await api.findLegacyByEans(['7891234567895']);
  assert.equal(result[0].name, 'Arroz');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
  assert.match(calls[0].url, /admin1-legacy-catalog-read-v1\?/);
  assert.match(calls[0].url, /gtin=7891234567895/);
});

test('carrega leituras EAN pela função somente leitura e resolve os produtos no catálogo Admin1', async () => {
  const calls = [];
  const api = createAdmin1Data(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/functions/v1/admin1-legacy-catalog-read-v1')) {
      return json({ ok: true, products: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'], total: 2 });
    }
    return json([
      { id: 'admin-1', source_project: 'ssbesxgaijknwsjbsbcz', source_product_id: '11111111-1111-4111-8111-111111111111', name: 'Arroz', sku: 'A1', is_active: false, stock_quantity: 4 },
      { id: 'admin-2', source_project: 'ssbesxgaijknwsjbsbcz', source_product_id: '22222222-2222-4222-8222-222222222222', name: 'Feijão', sku: 'F1', is_active: false, stock_quantity: 2 }
    ]);
  });
  const result = await api.listEanReaderProducts();
  assert.equal(result.products.length, 2);
  assert.equal(result.products[0].ean_reader_match, true);
  assert.equal(result.products[0].source_product_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(result.reader_total, 2);
  assert.equal(result.missing_admin1_total, 0);
  assert.ok(calls.every(call => call.options.method === 'GET'));
  assert.ok(calls[0].url.includes('action=reader_products'));
  assert.ok(calls[1].url.startsWith('https://xaoeldjuxzsdsblimzxo.supabase.co/rest/v1/admin1_products?'));
});

test('normaliza sequência escaneada removendo separadores e duplicatas', () => {
  assert.deepEqual(normalizeEanSequence('7891234567895\n7891234567895; 7890000000000'), ['7891234567895', '7890000000000']);
});

test('mapeia produto antigo inativo, sem estoque, mantendo a origem para idempotência', () => {
  const product = mapLegacyProduct({ id: 'old-123', gtin: '7891234567895', sku: 'X1', name: 'Arroz', price: 12.34, ncm: '10063021', image_url: 'https://img.example/p.webp' }, 'Mercearia');
  assert.equal(product.sku, 'X1');
  assert.equal(product.price_cents, 1234);
  assert.equal(product.stock_quantity, 0);
  assert.equal(product.is_active, false);
  assert.equal(product.source_product_id, 'old-123');
  assert.equal(product.category, 'Mercearia');
});

