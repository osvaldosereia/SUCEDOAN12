import test from 'node:test';
import assert from 'node:assert/strict';

import { createBasketFlow } from '../../src/baskets/basketFlow.ts';
import { createBasketFixtureRepository } from '../../src/baskets/basketFixtureRepository.ts';
import type { Basket } from '../../src/baskets/types.ts';

const baskets: Basket[] = [
  {
    id:'TEST-BASKET-A',
    name:'Cesta A',
    description:'Teste',
    priceCents:10000,
    active:true,
    badge:null,
    items:[{id:'I1',name:'Arroz',quantity:1,unit:'5 kg'}],
  },
];

test('basket flow opens a basket then confirms exactly one selection', async () => {
  const flow = createBasketFlow(createBasketFixtureRepository(baskets));

  assert.equal(await flow.open('TEST-BASKET-A'), true);
  assert.equal(flow.getSnapshot().openedBasket?.id, 'TEST-BASKET-A');

  assert.equal(flow.confirmOpened(), true);
  assert.equal(flow.getSnapshot().selection?.basketId, 'TEST-BASKET-A');
  assert.equal(flow.confirmOpened(), false);
});

test('basket selection carries basket total but no per-item price data', async () => {
  const flow = createBasketFlow(createBasketFixtureRepository(baskets));
  await flow.open('TEST-BASKET-A');
  flow.confirmOpened();

  const selection = flow.getSnapshot().selection;
  assert.equal(selection?.priceCents, 10000);
  assert.deepEqual(selection?.items, [
    { id:'I1', name:'Arroz', quantity:1, unit:'5 kg' },
  ]);
});

test('basket flow exposes post-selection choices without auto-opening offers', async () => {
  const flow = createBasketFlow(createBasketFixtureRepository(baskets));
  await flow.open('TEST-BASKET-A');
  flow.confirmOpened();

  assert.deepEqual(
    flow.getPostSelectionReplies().map((reply) => reply.label),
    ['Ver ofertas', 'Comprar outros produtos', 'Revisar cesta'],
  );
  assert.equal(flow.getSnapshot().nextRoute, null);
});
