import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCatalogFixtureRepository } from '../../src/catalog/catalogFixtureRepository.ts';
import type { Product } from '../../src/catalog/types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const products = JSON.parse(
  readFileSync(resolve(HERE, '../fixtures/products.json'), 'utf8'),
) as Product[];

test('fixture catalog has at least 24 synthetic active products and no remote images', () => {
  assert.ok(products.length >= 24);
  assert.ok(products.every((product) => product.id.startsWith('TEST-PROD-')));
  assert.ok(products.every((product) => product.active === true));
  assert.ok(products.every((product) => product.imageKind === 'placeholder'));
});

test('catalog search is accent-insensitive and case-insensitive', async () => {
  const repository = createCatalogFixtureRepository(products);
  const result = await repository.search({ query: 'CAFE' });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.name, 'Café Torrado 500g');
});

test('catalog filters offers and commercial sections', async () => {
  const repository = createCatalogFixtureRepository(products);

  const offers = await repository.search({ section: 'offers' });
  const forHome = await repository.search({ section: 'for-home' });

  assert.ok(offers.length > 0);
  assert.ok(offers.every((product) => product.promoPriceCents !== null));
  assert.ok(forHome.length > 0);
  assert.ok(forHome.every((product) => product.section === 'for-home'));
});

test('catalog filters category and subcategory together', async () => {
  const repository = createCatalogFixtureRepository(products);
  const result = await repository.search({
    section: 'for-home',
    category: 'Limpeza',
    subcategory: 'Lavanderia',
  });

  assert.deepEqual(
    result.map((product) => product.name),
    ['Sabão em Pó 1,6kg', 'Amaciante Floral 2L'],
  );
});

test('catalog supports deterministic pagination with offset and limit', async () => {
  const repository = createCatalogFixtureRepository(products);
  const first = await repository.search({ section: 'for-you', offset: 0, limit: 3 });
  const second = await repository.search({ section: 'for-you', offset: 3, limit: 3 });

  assert.equal(first.length, 3);
  assert.equal(second.length, 3);
  assert.notDeepEqual(first.map((p) => p.id), second.map((p) => p.id));
});

test('catalog exposes categories and subcategories for active section', async () => {
  const repository = createCatalogFixtureRepository(products);

  assert.deepEqual(
    await repository.listCategories('for-home'),
    ['Casa', 'Limpeza', 'Pet'],
  );

  assert.deepEqual(
    await repository.listSubcategories({ section: 'for-home', category: 'Limpeza' }),
    ['Casa', 'Cozinha', 'Lavanderia'],
  );
});
