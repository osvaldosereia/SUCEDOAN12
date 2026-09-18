import test from 'node:test';
import assert from 'node:assert/strict';

import { createCatalogController } from '../../src/catalog/catalogController.ts';
import { createCatalogFixtureRepository } from '../../src/catalog/catalogFixtureRepository.ts';
import type { Product } from '../../src/catalog/types.ts';

const products: Product[] = [
  { id:'A', name:'Arroz Teste', section:'for-you', category:'Mercearia', subcategory:'Arroz', unit:'1 un', priceCents:1000, promoPriceCents:900, active:true, imageKind:'placeholder' },
  { id:'B', name:'Sabão Teste', section:'for-home', category:'Limpeza', subcategory:'Lavanderia', unit:'1 un', priceCents:1200, promoPriceCents:null, active:true, imageKind:'placeholder' },
];

test('catalog controller initializes and changes section while clearing dependent filters', async () => {
  const controller = createCatalogController(createCatalogFixtureRepository(products));
  await controller.initialize();
  await controller.setCategory('Mercearia');
  await controller.setSection('for-home');

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.section, 'for-home');
  assert.equal(snapshot.selectedCategory, null);
  assert.equal(snapshot.selectedSubcategory, null);
  assert.deepEqual(snapshot.products.map((p) => p.id), ['B']);
});

test('catalog controller applies search and can open/close product detail', async () => {
  const controller = createCatalogController(createCatalogFixtureRepository(products));
  await controller.initialize();
  await controller.setQuery('arroz');

  assert.deepEqual(controller.getSnapshot().products.map((p) => p.id), ['A']);

  assert.equal(await controller.openProduct('A'), true);
  assert.equal(controller.getSnapshot().selectedProduct?.id, 'A');

  controller.closeProduct();
  assert.equal(controller.getSnapshot().selectedProduct, null);
});
