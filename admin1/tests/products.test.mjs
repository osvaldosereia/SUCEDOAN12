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


test('filtra produtos inativos e sem estoque para revisão do catálogo completo', () => {
  const products = [
    { id: 'a', name: 'Ativo', active: true, stock_quantity: 4 },
    { id: 'b', name: 'Inativo', active: false, stock_quantity: 0 }
  ];
  assert.deepEqual(filterProducts(products, { status: 'inactive' }).map(item => item.id), ['b']);
  assert.deepEqual(filterProducts(products, { stock: 'out' }).map(item => item.id), ['b']);
});

test('o filtro Todos mantém produtos de qualquer situação de estoque', () => {
  const products = [{ id: '1', stock_quantity: 0 }, { id: '2', stock_quantity: 12 }];
  assert.deepEqual(filterProducts(products, { stock: 'all' }).map(item => item.id), ['1', '2']);
});

test('distingue estoque vendável sem confirmação de estoque zerado', () => {
  assert.equal(getProductStockState(0, 5, false).key, 'unknown');
  assert.equal(getProductStockState(0, 5, true).key, 'out');
});

test('não inclui estoque desconhecido nos filtros de disponível ou sem estoque', () => {
  const products = [
    { id: 'available', stock_quantity: 8 },
    { id: 'out', stock_quantity: 0 },
    { id: 'unknown', stock_quantity: 0, stock_known: false }
  ];
  assert.deepEqual(filterProducts(products, { stock: 'available' }).map(product => product.id), ['available']);
  assert.deepEqual(filterProducts(products, { stock: 'out' }).map(product => product.id), ['out']);
});
