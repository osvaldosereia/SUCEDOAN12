import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { indexProducts, loadCatalog, normalizeProduct, normalizeProducts, searchProducts } from '../src/catalog.js';
import { isAvailable } from '../src/commerce.js';

test('normaliza produto mantendo identificadores e preço', () => {
  const product = normalizeProduct({ nome: 'ARROZ TESTE 5KG', codigo: '0012', ean: '7891234567890', preco: '25,90', estoque: 8, categoria: 'MERCEARIA' }, 'firebase-key', 0);
  assert.equal(product.id, 'firebase-key');
  assert.equal(product.codigo, '0012');
  assert.equal(product.price, 25.9);
  assert.equal(product.stock, 8);
  assert.equal(product.ean, '7891234567890');
  assert.match(product.name, /Arroz Teste/);
});

test('indexa produtos por id, código e EAN', () => {
  const products = normalizeProducts({ abc: { nome: 'Café Teste', codigo: 'C001', ean: '7890000000001', preco: 10, estoque: 3 } });
  const indexes = indexProducts(products);
  assert.equal(indexes.productMap.get('abc').name, 'Café Teste');
  assert.equal(indexes.productExactMap.get('c001').id, 'abc');
  assert.equal(indexes.productCodeMap.get('7890000000001').id, 'abc');
});

test('busca por nome, marca e código', () => {
  const products = normalizeProducts([
    { nome: 'Café Torrado Tradicional', marca: 'Marca Boa', codigo: 'CAF10', preco: 10, estoque: 5 },
    { nome: 'Arroz Tipo 1', marca: 'Marca A', codigo: 'ARR20', preco: 20, estoque: 5 }
  ]);
  assert.equal(searchProducts(products, 'cafe tradicional', isAvailable)[0].codigo, 'CAF10');
  assert.equal(searchProducts(products, 'Marca A', isAvailable)[0].codigo, 'ARR20');
  assert.equal(searchProducts(products, 'ARR20', isAvailable)[0].codigo, 'ARR20');
});

test('catálogo público não possui endpoint nem armazenamento de banners', () => {
  assert.equal(Object.prototype.hasOwnProperty.call(CONFIG.ENDPOINTS, 'BANNERS'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(CONFIG.STORAGE, 'BANNERS'), false);
});

test('loadCatalog não recria o campo removido de banners', async () => {
  const originalFetch = globalThis.fetch;
  const resources = {
    '../catalog-version.json': { version: 'teste-sem-banners' },
    '../site/produtos-home.json': {},
    '../site/produtos-cesta-basica.json': [],
    '../site/kits.json': [],
    '../site/cuponsativos.json': []
  };
  globalThis.localStorage = {
    values: new Map(),
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; },
    setItem(key, value) { this.values.set(key, String(value)); },
    removeItem(key) { this.values.delete(key); }
  };
  globalThis.fetch = async input => {
    const raw = String(input);
    const key = Object.keys(resources).find(candidate => raw.startsWith(candidate));
    if (!key) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => structuredClone(resources[key]) };
  };
  try {
    const catalog = await loadCatalog();
    assert.equal(Object.prototype.hasOwnProperty.call(catalog, 'banners'), false);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.localStorage;
  }
});