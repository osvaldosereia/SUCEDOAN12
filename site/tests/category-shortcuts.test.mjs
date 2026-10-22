import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_SHORTCUTS } from '../src/category-shortcuts.js';

test('home shortcuts show seven labels while mapping to supported API categories', () => {
  assert.deepEqual(CATEGORY_SHORTCUTS.map(item => item.label), ['Mercearia', 'Limpeza', 'Lavanderia', 'Higiene', 'Beleza', 'Casa', 'Pet']);
  assert.deepEqual(new Set(CATEGORY_SHORTCUTS.map(item => item.key)), new Set(['mercearia', 'limpeza_lavanderia', 'higiene_beleza', 'casa_pet']));
});
