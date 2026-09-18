import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHomologationPushClient } from '../../src/notifications/pushClient.ts';

test('transactional preference starts enabled while marketing starts disabled', () => {
  const client = createHomologationPushClient();
  assert.deepEqual(client.getSnapshot().preferences, {
    transactional: true,
    marketing: false,
  });
});

test('homologation client accepts only synthetic TEST-PUSH tokens', () => {
  const client = createHomologationPushClient();
  assert.throws(
    () => client.registerPushToken('real-looking-device-token', 'android'),
    /TEST-PUSH/,
  );
  assert.equal(client.getSnapshot().registration, null);

  client.registerPushToken('TEST-PUSH-abcdefghijklmnop1234', 'android');
  assert.deepEqual(client.getSnapshot().registration, {
    token: 'TEST-PUSH-abcdefghijklmnop1234',
    platform: 'android',
  });
});

test('transactional and marketing preferences are independent', () => {
  const client = createHomologationPushClient();
  client.setNotificationPreference('transactional', true);
  assert.deepEqual(client.getSnapshot().preferences, {
    transactional: true,
    marketing: false,
  });

  client.setNotificationPreference('marketing', true);
  client.setNotificationPreference('transactional', false);
  assert.deepEqual(client.getSnapshot().preferences, {
    transactional: false,
    marketing: true,
  });
});

test('push registration can be revoked locally without sending anything', () => {
  const client = createHomologationPushClient();
  client.registerPushToken('TEST-PUSH-abcdefghijklmnop1234', 'ios');
  client.clearPushToken();

  const snapshot = client.getSnapshot();
  assert.equal(snapshot.registration, null);
  assert.equal(snapshot.externalRequestCount, 0);
});

test('push foundation contains no network or provider dispatch calls', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, '../../src/notifications/pushClient.ts'), 'utf8');

  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /firebase|fcm|apns|onesignal/i);
  assert.doesNotMatch(source, /console\.(?:log|info|debug)/);
});
