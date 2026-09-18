import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createOrderFixtureRepository,
  isOrderStatus,
} from '../../src/orders/orderFixtureRepository.ts';

test('order fixture starts confirmed and follows valid demo transitions', async () => {
  const repo = createOrderFixtureRepository({ now: () => 1000 });
  const created = await repo.create({
    id:'TEST-ORDER-0001',
    totalCents:21990,
  });

  assert.equal(created.status, 'confirmed');

  assert.equal((await repo.advance(created.id))?.status, 'separating');
  assert.equal((await repo.advance(created.id))?.status, 'ready');
  assert.equal((await repo.advance(created.id))?.status, 'on_route');
  assert.equal((await repo.advance(created.id))?.status, 'delivered');
  assert.equal((await repo.advance(created.id))?.status, 'delivered');
});

test('cancel is allowed before route and terminal afterwards', async () => {
  const repo = createOrderFixtureRepository();
  const created = await repo.create({ id:'TEST-ORDER-0002', totalCents:1000 });
  const cancelled = await repo.cancel(created.id);

  assert.equal(cancelled?.status, 'cancelled');
  assert.equal((await repo.advance(created.id))?.status, 'cancelled');
});

test('unknown order ids and unknown statuses are rejected', async () => {
  const repo = createOrderFixtureRepository();

  assert.equal(await repo.getById('TEST-MISSING'), null);
  assert.equal(isOrderStatus('confirmed'), true);
  assert.equal(isOrderStatus('mystery'), false);
});

test('repository keeps status history as defensive copies', async () => {
  const repo = createOrderFixtureRepository({ now: () => 2000 });
  const created = await repo.create({ id:'TEST-ORDER-0003', totalCents:5000 });
  const advanced = await repo.advance(created.id);

  assert.deepEqual(
    advanced?.history.map((entry) => entry.status),
    ['confirmed', 'separating'],
  );

  advanced!.history[0]!.status = 'cancelled';
  const again = await repo.getById(created.id);
  assert.equal(again?.history[0]?.status, 'confirmed');
});
