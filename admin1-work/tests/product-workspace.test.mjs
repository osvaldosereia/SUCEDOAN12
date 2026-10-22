import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCT_WORKSPACE_KEY, mergeWorkspaceProducts, readProductWorkspace, saveProductWorkspaceProduct } from '../src/product-workspace.js';

function makeStorage(initial = '[]') {
  const values = new Map([[PRODUCT_WORKSPACE_KEY, initial]]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}

test('salva e edita produto no workspace local sem acionar o catálogo online', () => {
  const storage = makeStorage();
  const first = saveProductWorkspaceProduct({ name: 'Arroz', sku: 'AR-1', category: 'Mercearia', price: '8,90', stock: '4' }, storage, {
    now: new Date('2026-10-21T12:00:00.000Z')
  });
  const updated = saveProductWorkspaceProduct({ ...first.product, name: 'Arroz tipo 1', price: '9,10' }, storage);

  assert.equal(updated.products.length, 1);
  assert.equal(updated.product.name, 'Arroz tipo 1');
  assert.equal(readProductWorkspace(storage)[0].sale_price_cents, 910);
  assert.equal(storage.values.has('products'), false);
});

test('bloqueia SKU e GTIN duplicados no catálogo e no workspace', () => {
  const storage = makeStorage();
  saveProductWorkspaceProduct({ name: 'Leite', sku: 'LE-1', category: 'Mercearia', price: '5,00', stock: 2 }, storage);
  assert.throws(() => saveProductWorkspaceProduct({ name: 'Leite outro', sku: 'LE-1', category: 'Mercearia', price: '5,00', stock: 1 }, storage), /SKU/);
  assert.throws(() => saveProductWorkspaceProduct({ name: 'Café', sku: 'CF-1', category: 'Mercearia', gtin: '7894900011517', price: '10,00', stock: 1 }, storage, {
    catalogProducts: [{ id: 'remote', sku: 'CF-OLD', gtin: '7894900011517' }]
  }), /GTIN/);
});

test('sobrepõe produto online por id sem modificar a lista original e inclui novos locais', () => {
  const online = [{ id: '1', name: 'Produto online', active: true }, { id: '2', name: 'Outro online', active: true }];
  const local = [{ id: '1', name: 'Ajuste local', active: false }, { id: '3', name: 'Produto local' }];
  const merged = mergeWorkspaceProducts(online, local);
  assert.deepEqual(merged.map(item => item.id), ['1', '2', '3']);
  assert.equal(merged[0].name, 'Ajuste local');
  assert.equal(merged[0].workspace_source, 'local');
  assert.equal(merged[1].workspace_source, 'catalog');
  assert.equal(online[0].name, 'Produto online');
});

test('permite desativar localmente um produto incompleto sem exigir correção cadastral', () => {
  const storage = makeStorage();
  const { product } = saveProductWorkspaceProduct({ id: 'incomplete', name: '', sku: '', category: '', price: '', stock: 2, active: false }, storage, { statusOnly: true });
  assert.equal(product.active, false);
  assert.equal(readProductWorkspace(storage)[0].id, 'incomplete');
});

