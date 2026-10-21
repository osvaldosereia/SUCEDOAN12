import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProducts, getProductStockState, listProductCategories } from '../src/products.js';

const products = [
  { id: '1', name: 'Arroz Branco', sku: 'ARZ-5', brand: 'DA', category: 'Mercearia', stock_quantity: 12 },
  { id: '2', name: 'Feijão Carioca', sku: 'FEI-1', brand: 'DA', category: 'Mercearia', stock_quantity: 2 },
  { id: '3', name: 'Sabonete', sku: 'SAB-1', brand: 'Flor', category: 'Higiene', stock_quantity: 0 }
];

test('filtra produtos por categoria sem alterar a lista de origem', () => {
  const result = filterProducts(products, { category: 'Mercearia' });
  assert.deepEqual(result.map(product => product.id), ['1', '2']);
  assert.equal(products.length, 3);
});

test('busca por nome, marca e SKU sem diferenciar acentos ou caixa', () => {
  assert.deepEqual(filterProducts(products, { query: 'feijao' }).map(product => product.id), ['2']);
  assert.deepEqual(filterProducts(products, { query: 'sab' }).map(product => product.id), ['3']);
});

test('combina busca com categoria e disponibilidade', () => {
  assert.deepEqual(filterProducts(products, { query: 'DA', category: 'Mercearia', stock: 'low' }).map(product => product.id), ['2']);
  assert.deepEqual(filterProducts(products, { stock: 'out' }).map(product => product.id), ['3']);
});

test('classifica o estoque para leitura rápida', () => {
  assert.equal(getProductStockState(12).key, 'available');
  assert.equal(getProductStockState(2).key, 'low');
  assert.equal(getProductStockState(0).key, 'out');
});

test('lista categorias únicas, organizadas para o filtro', () => {
  assert.deepEqual(listProductCategories(products), ['Higiene', 'Mercearia']);
});
