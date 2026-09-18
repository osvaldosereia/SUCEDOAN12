import test from 'node:test';
import assert from 'node:assert/strict';

import { createHmlApiClient } from '../../src/platform/apiClient.ts';
import { canRegisterAppServiceWorker } from '../../src/platform/serviceWorker.ts';

test('HML client refuses insecure remote base URLs', () => {
  assert.throws(
    () => createHmlApiClient({
      enabled:true,
      baseUrl:'http://example.invalid',
      publishableKey:'TEST-PUBLISHABLE',
      jwt:'TEST-JWT',
      clientId:'TEST-CLIENT-SECURITY',
    }),
    /HTTPS/,
  );
});

test('service worker cannot register at root or Comprar scope', () => {
  assert.equal(canRegisterAppServiceWorker('/'), false);
  assert.equal(canRegisterAppServiceWorker('/comprar/'), false);
  assert.equal(canRegisterAppServiceWorker('/app-dona-antonia/'), true);
});

test('HML client never accepts non-test client identity', () => {
  assert.throws(
    () => createHmlApiClient({
      enabled:true,
      baseUrl:'https://hml.invalid',
      publishableKey:'TEST-PUBLISHABLE',
      jwt:'TEST-JWT',
      clientId:'CUSTOMER-REAL-123',
    }),
    /TEST-CLIENT/,
  );
});
