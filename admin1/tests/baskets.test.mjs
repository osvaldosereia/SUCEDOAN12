import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdmin1Data } from '../src/admin1-data.js';

const json = data => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('salva cesta e composição somente no banco Admin1 por uma operação atômica', async () => {
  const calls = [];
  const api = createAdmin1Data(async (url, options) => {
    calls.push({ url: String(url), options });
    return json([{ id: 'basket-1', name: 'Cesta Básica', sku: 'CESTA-1', price_cents: 12990, is_active: false }]);
  });

  const result = await api.saveBasket({
    name: 'Cesta Básica', sku: 'CESTA-1', price: '129.90', active: false,
    items: [{ product_id: 'product-1', quantity: 2, product: { name: 'Arroz' } }]
  });

  assert.equal(result.id, 'basket-1');
  assert.equal(result.price, 129.9);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.startsWith('https://xaoeldjuxzsdsblimzxo.supabase.co/rest/v1/rpc/admin1_save_basket_v1'));
  assert.equal(calls[0].options.method, 'POST');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.p_basket.price_cents, 12990);
  assert.deepEqual(body.p_basket.items, [{ product_id: 'product-1', quantity: 2, sort_order: 0 }]);
});

test('consulta a cesta e seus componentes no banco Admin1 somente por GET', async () => {
  const calls = [];
  const api = createAdmin1Data(async (url, options) => {
    calls.push({ url: String(url), options });
    return json([{ id: 'basket-1', name: 'Cesta Básica', sku: 'CESTA-1', price_cents: 12990, is_active: true,
      admin1_basket_items: [{ id: 'item-1', product_id: 'product-1', quantity: '2', sort_order: 0,
        product: { id: 'product-1', name: 'Arroz', sku: 'A1', stock_quantity: '6', is_active: true } }]
    }]);
  });

  const rows = await api.listBaskets();
  assert.equal(rows[0].items[0].product.name, 'Arroz');
  assert.equal(rows[0].items[0].quantity, 2);
  assert.equal(calls[0].options.method, 'GET');
  assert.match(calls[0].url, /admin1_basket_items/);
  assert.match(calls[0].url, /image_url/);
  assert.ok(calls[0].url.startsWith('https://xaoeldjuxzsdsblimzxo.supabase.co/rest/v1/'));
});
