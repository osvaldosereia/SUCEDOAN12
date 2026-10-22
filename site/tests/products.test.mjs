import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProductPages, nextPageOffset } from '../src/products.js';

test('product pages append new products once and retain their order', () => {
  const merged = mergeProductPages([{ id: 'a', name: 'Arroz' }, { id: 'b', name: 'Feijão' }], [{ id: 'b', name: 'Feijão atualizado' }, { id: 'c', name: 'Açúcar' }]);
  assert.deepEqual(merged.map(product => product.id), ['a', 'b', 'c']);
  assert.equal(merged[1].name, 'Feijão atualizado');
});

test('pagination stops when the API has no valid next offset', () => {
  assert.equal(nextPageOffset({ next_offset: 24 }), 24);
  assert.equal(nextPageOffset({ next_offset: null }), null);
});
