import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createOperationalHealthCounters } from '../../src/platform/operationalHealth.ts';

test('operational counters start at zero and increment closed failure kinds', () => {
  const health = createOperationalHealthCounters();
  assert.deepEqual(health.getSnapshot(), {
    pairingFailureCount: 0,
    deepLinkRejectedCount: 0,
    pushRegistrationFailureCount: 0,
  });

  health.increment('pairing_failure');
  health.increment('deep_link_rejected');
  health.increment('deep_link_rejected');
  health.increment('push_registration_failure');

  assert.deepEqual(health.getSnapshot(), {
    pairingFailureCount: 1,
    deepLinkRejectedCount: 2,
    pushRegistrationFailureCount: 1,
  });
});

test('operational health snapshot is defensive and resettable', () => {
  const health = createOperationalHealthCounters();
  health.increment('pairing_failure');
  const snapshot = health.getSnapshot();
  snapshot.pairingFailureCount = 999;
  assert.equal(health.getSnapshot().pairingFailureCount, 1);

  health.reset();
  assert.equal(health.getSnapshot().pairingFailureCount, 0);
});

test('operational health code stores no free text, identifiers or network sink', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, '../../src/platform/operationalHealth.ts'), 'utf8');
  assert.doesNotMatch(source, /phone|cpf|address|token|session|message|text/i);
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});
