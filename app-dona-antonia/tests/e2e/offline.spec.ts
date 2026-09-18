import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getNetworkState,
  canConfirmOrder,
} from '../../src/platform/networkState.ts';
import { createRecoveryController } from '../../src/app/recovery.ts';
import { createCheckoutFlow } from '../../src/checkout/checkoutFlow.ts';
import { createCheckoutFixtureGateway } from '../../src/checkout/checkoutFixtureGateway.ts';

test('network state maps browser online signal safely', () => {
  assert.equal(getNetworkState({ onLine: true }), 'online');
  assert.equal(getNetworkState({ onLine: false }), 'offline');
  assert.equal(getNetworkState(undefined), 'unknown');
});

test('order confirmation is allowed only while online', () => {
  assert.equal(canConfirmOrder('online'), true);
  assert.equal(canConfirmOrder('offline'), false);
  assert.equal(canConfirmOrder('unknown'), false);
});

test('recovery retries only an explicitly remembered safe action', async () => {
  let online = false;
  let calls = 0;
  const recovery = createRecoveryController({
    getNetworkState: () => online ? 'online' : 'offline',
  });

  recovery.rememberSafeAction({
    kind: 'catalog_refresh',
    run: async () => { calls += 1; },
  });

  assert.deepEqual(await recovery.retryLastSafeAction(), {
    retried: false,
    reason: 'offline',
  });
  assert.equal(calls, 0);

  online = true;
  assert.deepEqual(await recovery.retryLastSafeAction(), {
    retried: true,
    reason: 'success',
  });
  assert.equal(calls, 1);

  assert.deepEqual(await recovery.retryLastSafeAction(), {
    retried: false,
    reason: 'no_action',
  });
});

test('recovery API has no order-confirmation action kind', () => {
  const recovery = createRecoveryController({
    getNetworkState: () => 'online',
  });

  assert.throws(
    () => recovery.rememberSafeAction({
      kind: 'order_confirmation' as never,
      run: async () => undefined,
    }),
    /unsafe recovery action/,
  );
});

test('checkout confirmation stays idempotent after simulated reconnect', async () => {
  const gateway = createCheckoutFixtureGateway({
    idFactory: () => 'TEST-ORDER-OFFLINE-1',
  });
  const flow = createCheckoutFlow(gateway);

  flow.start({
    lines: [{
      id:'product:TEST-PROD-001',
      kind:'product',
      refId:'TEST-PROD-001',
      name:'Arroz',
      quantity:1,
      unitPriceCents:3290,
      promoUnitPriceCents:2990,
    }],
  });
  flow.setCustomer({ name:'Cliente Teste', phone:'65999990000' });
  flow.setAddress({
    street:'Rua Teste', number:'1', neighborhood:'Centro',
    city:'Cuiabá', state:'MT', reference:'',
  });
  flow.setPayment('pix');

  assert.equal(canConfirmOrder('offline'), false);
  assert.equal(gateway.getConfirmationCount(), 0);

  assert.equal(canConfirmOrder('online'), true);
  await flow.confirm();
  await flow.confirm();

  assert.equal(gateway.getConfirmationCount(), 1);
});

test('HML client classifies network errors without retrying automatically', async () => {
  const { createHmlApiClient } = await import('../../src/platform/apiClient.ts');
  let calls = 0;
  const client = createHmlApiClient({
    enabled: true,
    baseUrl: 'https://hml.invalid',
    publishableKey: 'TEST-PUBLISHABLE',
    jwt: 'TEST-JWT',
    clientId: 'TEST-CLIENT-OFFLINE',
    fetchImpl: async () => {
      calls += 1;
      throw new TypeError('network down');
    },
  });

  const result = await client.bootstrap();

  assert.deepEqual(result, {
    ok: false,
    reason: 'network_error',
  });
  assert.equal(calls, 1);
});
