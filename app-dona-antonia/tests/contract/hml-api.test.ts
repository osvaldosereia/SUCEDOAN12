import test from 'node:test';
import assert from 'node:assert/strict';

import { createHmlApiClient } from '../../src/platform/apiClient.ts';

test('HML API client is disabled by default and performs zero requests', async () => {
  let calls = 0;
  const client = createHmlApiClient({
    fetchImpl: async () => {
      calls += 1;
      throw new Error('fetch should not run');
    },
  });

  const result = await client.bootstrap();

  assert.deepEqual(result, {
    ok: false,
    reason: 'client_disabled',
  });
  assert.equal(calls, 0);
});

test('enabled client calls only customer-app-hml function paths', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createHmlApiClient({
    enabled: true,
    baseUrl: 'https://hml.invalid',
    publishableKey: 'TEST-PUBLISHABLE',
    jwt: 'TEST-JWT',
    clientId: 'TEST-CLIENT-LOCAL',
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({
        environment: 'homologation',
        enabled: false,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  await client.bootstrap();

  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/functions\/v1\/customer-app-hml-bootstrap-v1$/);
  assert.equal(
    new Headers(calls[0]!.init?.headers).get('x-hml-client-id'),
    'TEST-CLIENT-LOCAL',
  );
});

test('catalog and checkout reject production-looking identifiers before fetch', async () => {
  let calls = 0;
  const client = createHmlApiClient({
    enabled: true,
    baseUrl: 'https://hml.invalid',
    publishableKey: 'TEST-PUBLISHABLE',
    jwt: 'TEST-JWT',
    clientId: 'TEST-CLIENT-LOCAL',
    fetchImpl: async () => {
      calls += 1;
      return new Response('{}', { status: 200 });
    },
  });

  assert.throws(
    () => client.checkout({
      cart: [{
        id: 'product:REAL-PROD-123',
        kind: 'product',
        refId: 'REAL-PROD-123',
        name: 'Produto',
        quantity: 1,
        unitPriceCents: 1000,
        promoUnitPriceCents: null,
      }],
      payment: 'pix',
      totalCents: 1000,
    }),
    /TEST identifiers/,
  );

  assert.equal(calls, 0);
});

test('checkout payload contains no customer PII fields', async () => {
  let payload: Record<string, unknown> | null = null;
  const client = createHmlApiClient({
    enabled: true,
    baseUrl: 'https://hml.invalid',
    publishableKey: 'TEST-PUBLISHABLE',
    jwt: 'TEST-JWT',
    clientId: 'TEST-CLIENT-LOCAL',
    fetchImpl: async (_input, init) => {
      payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        environment: 'homologation',
        orderId: 'TEST-HML-ORDER-1',
        status: 'confirmed',
      }), { status: 201, headers: { 'content-type': 'application/json' } });
    },
  });

  await client.checkout({
    cart: [{
      kind: 'basket',
      refId: 'TEST-BASKET-FAMILIA',
      name: 'Cesta Família',
      quantity: 1,
      unitPriceCents: 21990,
      promoUnitPriceCents: null,
    }],
    payment: 'cash',
    totalCents: 21990,
  });

  assert.ok(payload);
  assert.deepEqual(Object.keys(payload!).sort(), ['cart', 'payment', 'totalCents']);
  assert.equal('phone' in payload!, false);
  assert.equal('cpf' in payload!, false);
  assert.equal('address' in payload!, false);
  assert.equal('customer' in payload!, false);
});

test('invalid HML client id prevents every request', async () => {
  assert.throws(
    () => createHmlApiClient({
      enabled: true,
      baseUrl: 'https://hml.invalid',
      publishableKey: 'TEST-PUBLISHABLE',
      jwt: 'TEST-JWT',
      clientId: 'CLIENT-REAL',
    }),
    /TEST-CLIENT/,
  );
});
