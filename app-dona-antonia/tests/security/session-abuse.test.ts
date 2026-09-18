import test from 'node:test';
import assert from 'node:assert/strict';

import { createPairingFixture } from '../../src/customer/pairing.ts';
import { parseAppLink } from '../../src/platform/appLinks.ts';
import { createHomologationPushClient } from '../../src/notifications/pushClient.ts';
import { validateHomologationMedia } from '../../src/platform/media.ts';
import { createMemorySecureSession } from '../../src/customer/secureSession.ts';
import { createPrivacyCenter } from '../../src/privacy/privacyCenter.ts';

test('pairing brute force locks human-code confirmation after bounded attempts', () => {
  const fixture = createPairingFixture({ now: () => 1000, maxConfirmAttempts: 2 });
  const challenge = fixture.challenge;

  assert.equal(fixture.confirmHumanCode('AAAAAA'), false);
  assert.equal(fixture.confirmHumanCode('BBBBBB'), false);
  assert.equal(fixture.confirmHumanCode(challenge.humanCode), false);
});

test('pairing wrong device secret never yields a session and replay stays blocked', () => {
  const fixture = createPairingFixture({ now: () => 1000 });
  const challenge = fixture.challenge;
  assert.equal(fixture.confirmHumanCode(challenge.humanCode), true);
  assert.equal(
    fixture.pollPairing(challenge.challengeId, 'wrong-secret').state,
    'invalid_secret',
  );

  const first = fixture.pollPairing(challenge.challengeId, challenge.deviceSecret);
  assert.equal(first.state, 'confirmed');
  assert.equal(
    fixture.pollPairing(challenge.challengeId, challenge.deviceSecret).state,
    'consumed',
  );
});

test('deep links fail closed for malformed encoding and PII query keys', () => {
  assert.equal(parseAppLink('/app/cestas/%E0%A4%A'), null);
  assert.equal(parseAppLink('/app/ofertas?cpf=00000000000'), null);
  assert.equal(parseAppLink('/app/pedido/opaque_token_1234567890?session=secret'), null);
});

test('push foundation refuses non-test device tokens before any external effect', () => {
  const push = createHomologationPushClient();
  assert.throws(() => push.registerPushToken('looks-like-a-real-fcm-token', 'android'), /TEST-PUSH/);
  assert.equal(push.getSnapshot().registration, null);
  assert.equal(push.getSnapshot().externalRequestCount, 0);
});

test('media foundation rejects oversized or non-test uploads before any external effect', () => {
  assert.throws(() => validateHomologationMedia({
    id: 'REAL-MEDIA-1',
    kind: 'photo',
    source: 'photo_picker',
    mimeType: 'image/jpeg',
    sizeBytes: 500_000,
    durationSeconds: null,
  }), /TEST-MEDIA/);

  assert.throws(() => validateHomologationMedia({
    id: 'TEST-MEDIA-photo-abuse',
    kind: 'photo',
    source: 'photo_picker',
    mimeType: 'image/jpeg',
    sizeBytes: 11 * 1024 * 1024,
    durationSeconds: null,
  }), /size limit/);
});

test('device revocation clears local session even when backend is unavailable', async () => {
  const session = createMemorySecureSession();
  await session.set('TEST-SESSION-security-0001');
  const privacy = createPrivacyCenter({ secureSession: session });

  const result = await privacy.request('revoke_device');
  assert.deepEqual(result, { submitted: false, reason: 'backend_unavailable' });
  assert.equal(await session.get(), null);
});
