import test from 'node:test';
import assert from 'node:assert/strict';

import { createMemorySecureSession } from '../../src/customer/secureSession.ts';
import { createPrivacyCenter } from '../../src/privacy/privacyCenter.ts';

test('revoke_device clears the local secure session even without privacy backend', async () => {
  const secureSession = createMemorySecureSession();
  await secureSession.set('TEST-SESSION-revoke-0001');
  const center = createPrivacyCenter({ secureSession });

  assert.deepEqual(await center.request('revoke_device'), {
    submitted: false,
    reason: 'backend_unavailable',
  });
  assert.equal(await secureSession.get(), null);
});

test('other privacy requests never clear the local secure session', async () => {
  const secureSession = createMemorySecureSession();
  await secureSession.set('TEST-SESSION-keep-0001');
  const center = createPrivacyCenter({ secureSession });

  await center.request('access');
  assert.equal(await secureSession.get(), 'TEST-SESSION-keep-0001');
});
