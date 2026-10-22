import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_SHORTCUTS } from '../src/category-shortcuts.js';

test('home shortcuts match the four categories the public API actually filters', () => {
  assert.deepEqual(CATEGORY_SHORTCUTS.map(item => item.label), ['Mercearia', 'Limpeza e lavanderia', 'Higiene e beleza', 'Casa e pet']);
  assert.deepEqual(CATEGORY_SHORTCUTS.map(item => item.key), ['mercearia', 'limpeza_lavanderia', 'higiene_beleza', 'casa_pet']);
  assert.equal(new Set(CATEGORY_SHORTCUTS.map(item => item.key)).size, CATEGORY_SHORTCUTS.length);
});
