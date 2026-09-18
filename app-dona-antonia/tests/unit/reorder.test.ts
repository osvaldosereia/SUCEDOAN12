import test from 'node:test';
import assert from 'node:assert/strict';

import { createMemorySecureSession } from '../../src/customer/secureSession.ts';
import {
  createCustomerProfileFixtureRepository,
  loadVerifiedCustomerProfile,
} from '../../src/customer/customerProfile.ts';
import {
  createPurchaseHistoryFixtureRepository,
  loadPurchaseHistory,
} from '../../src/orders/purchaseHistory.ts';
import { confirmReorder, prepareReorder } from '../../src/orders/reorder.ts';
import { createCatalogFixtureRepository } from '../../src/catalog/catalogFixtureRepository.ts';
import { createCartStore } from '../../src/cart/cartStore.ts';
import type { Product } from '../../src/catalog/types.ts';

const sessionToken = 'TEST-SESSION-history-0001';
const customerRepository = createCustomerProfileFixtureRepository([
  {
    sessionToken,
    profile: { id: 'TEST-CUSTOMER-0001', firstName: 'Maria Teste' },
  },
]);

const historyRepository = createPurchaseHistoryFixtureRepository([
  {
    id: 'TEST-HISTORY-0001',
    customerId: 'TEST-CUSTOMER-0001',
    createdAt: 1000,
    items: [
      { productId: 'TEST-PROD-001', name: 'Arroz antigo', quantity: 2 },
      { productId: 'TEST-PROD-404', name: 'Produto indisponível', quantity: 1 },
    ],
  },
]);

const products: Product[] = [
  {
    id: 'TEST-PROD-001',
    name: 'Arroz atual',
    section: 'for-you',
    category: 'Mercearia',
    subcategory: 'Arroz',
    unit: '5kg',
    priceCents: 3000,
    promoPriceCents: 2500,
    active: true,
    imageKind: 'placeholder',
  },
];

test('history stays hidden without a verified secure session', async () => {
  const session = createMemorySecureSession();
  assert.equal(await loadVerifiedCustomerProfile(session, customerRepository), null);
  assert.deepEqual(
    await loadPurchaseHistory({ session, customerRepository, historyRepository }),
    [],
  );
});

test('synthetic secure session unlocks only synthetic profile and history', async () => {
  const session = createMemorySecureSession();
  await session.set(sessionToken);

  assert.deepEqual(await loadVerifiedCustomerProfile(session, customerRepository), {
    id: 'TEST-CUSTOMER-0001',
    firstName: 'Maria Teste',
  });
  const history = await loadPurchaseHistory({ session, customerRepository, historyRepository });
  assert.equal(history.length, 1);
  assert.match(history[0]!.id, /^TEST-HISTORY-/);
});

test('reorder recalculates current prices and reports unavailable products', async () => {
  const catalog = createCatalogFixtureRepository(products);
  const [order] = await historyRepository.listByCustomerId('TEST-CUSTOMER-0001');
  const proposal = await prepareReorder(order!, catalog);

  assert.equal(proposal.totalCents, 5000);
  assert.equal(proposal.available[0]!.name, 'Arroz atual');
  assert.equal(proposal.available[0]!.promoUnitPriceCents, 2500);
  assert.deepEqual(proposal.unavailableProductIds, ['TEST-PROD-404']);
});

test('reorder never changes cart before explicit confirmation', async () => {
  const catalog = createCatalogFixtureRepository(products);
  const [order] = await historyRepository.listByCustomerId('TEST-CUSTOMER-0001');
  const proposal = await prepareReorder(order!, catalog);
  const cart = createCartStore();

  assert.equal(confirmReorder(proposal, cart, false), false);
  assert.equal(cart.getSnapshot().lines.length, 0);

  assert.equal(confirmReorder(proposal, cart, true), true);
  assert.equal(cart.getSnapshot().lines.length, 1);
  assert.equal(cart.getSnapshot().lines[0]!.quantity, 2);
});

test('reorder rejects non-test historical order ids', async () => {
  const catalog = createCatalogFixtureRepository(products);
  await assert.rejects(
    prepareReorder({
      id: 'ORDER-REAL-1',
      customerId: 'TEST-CUSTOMER-0001',
      createdAt: 1,
      items: [],
    }, catalog),
    /synthetic history/,
  );
});
