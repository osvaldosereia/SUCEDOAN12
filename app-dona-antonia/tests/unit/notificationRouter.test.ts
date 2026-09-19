import test from 'node:test';
import assert from 'node:assert/strict';

import { createNotificationRouter } from '../../src/notifications/notificationRouter.ts';

const id = 'TEST-NOTIFICATION-abcdefghijklmnop';

test('routes a synthetic notification deterministically', () => {
  const router = createNotificationRouter();
  assert.deepEqual(router.route({ id, kind: 'transactional', link: '/app/ofertas' }), {
    accepted: true,
    duplicate: false,
    route: 'catalog',
  });
});

test('deduplicates a notification id after first accepted routing', () => {
  const router = createNotificationRouter();
  router.route({ id, kind: 'transactional', link: '/app/ofertas' });
  assert.deepEqual(router.route({ id, kind: 'transactional', link: '/app/ofertas' }), {
    accepted: false,
    duplicate: true,
    route: null,
    reason: 'duplicate',
  });
});

test('rejects non synthetic notification ids', () => {
  const router = createNotificationRouter();
  const result = router.route({ id: 'real-device-message-1234567890', kind: 'marketing', link: '/app/ofertas' });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'invalid_id');
});

test('rejects links containing PII or session material without consuming id', () => {
  const router = createNotificationRouter();
  const unsafe = router.route({ id, kind: 'transactional', link: '/app/ofertas?phone=65999990000' });
  assert.equal(unsafe.reason, 'invalid_link');
  const retry = router.route({ id, kind: 'transactional', link: '/app/ofertas' });
  assert.equal(retry.accepted, true);
});

test('absolute notification links require explicit HTTPS allowlist', () => {
  const router = createNotificationRouter({ allowedHosts: ['hml.example'] });
  assert.equal(router.route({ id, kind: 'marketing', link: 'https://hml.example/app/ofertas' }).route, 'catalog');
  router.reset();
  assert.equal(router.route({ id, kind: 'marketing', link: 'https://evil.example/app/ofertas' }).accepted, false);
});
