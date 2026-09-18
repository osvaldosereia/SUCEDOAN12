import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBasketFixtureRepository } from '../../src/baskets/basketFixtureRepository.ts';
import type { Basket } from '../../src/baskets/types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const baskets = JSON.parse(
  readFileSync(resolve(HERE, '../fixtures/baskets.json'), 'utf8'),
) as Basket[];

test('basket fixtures are synthetic, active and contain compositions', () => {
  assert.ok(baskets.length >= 4);
  assert.ok(baskets.every((basket) => basket.id.startsWith('TEST-BASKET-')));
  assert.ok(baskets.every((basket) => basket.active));
  assert.ok(baskets.every((basket) => basket.items.length > 0));
});

test('basket repository lists active baskets and gets one by id', async () => {
  const repository = createBasketFixtureRepository(baskets);
  const list = await repository.list();
  const selected = await repository.getById('TEST-BASKET-FAMILIA');

  assert.equal(list.length, 4);
  assert.equal(selected?.name, 'Cesta Família');
  assert.equal(selected?.items.length, 9);
});

test('basket repository returns defensive copies', async () => {
  const repository = createBasketFixtureRepository(baskets);
  const first = await repository.getById('TEST-BASKET-ESSENCIAL');
  assert.ok(first);

  first!.items[0]!.name = 'ALTERADO';

  const again = await repository.getById('TEST-BASKET-ESSENCIAL');
  assert.equal(again?.items[0]?.name, 'Arroz Tipo 1');
});
