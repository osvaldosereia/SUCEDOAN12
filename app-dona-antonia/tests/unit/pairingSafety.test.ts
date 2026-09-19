import test from 'node:test';
import assert from 'node:assert/strict';

import { createPairingFixture } from '../../src/customer/pairing.ts';

test('pairing consumes challenge after one successful poll and blocks replay', () => {
  const fixture = createPairingFixture({ sessionTokenFactory: () => 'TEST-SESSION-pairing-0001' });
  assert.equal(fixture.confirmHumanCode(fixture.challenge.humanCode), true);

  const first = fixture.pollPairing(fixture.challenge.challengeId, fixture.challenge.deviceSecret);
  assert.deepEqual(first, { state: 'confirmed', sessionToken: 'TEST-SESSION-pairing-0001' });
  assert.deepEqual(
    fixture.pollPairing(fixture.challenge.challengeId, fixture.challenge.deviceSecret),
    { state: 'consumed' },
  );
});

test('pairing human confirmation is single-use', () => {
  const fixture = createPairingFixture();
  assert.equal(fixture.confirmHumanCode(fixture.challenge.humanCode), true);
  assert.equal(fixture.confirmHumanCode(fixture.challenge.humanCode), false);
});

test('pairing rejects a non synthetic session token before consuming challenge', () => {
  const fixture = createPairingFixture({ sessionTokenFactory: () => 'real-session-token' });
  assert.equal(fixture.confirmHumanCode(fixture.challenge.humanCode), true);

  assert.throws(
    () => fixture.pollPairing(fixture.challenge.challengeId, fixture.challenge.deviceSecret),
    /must remain synthetic/,
  );
});

test('pairing rate limits repeated invalid secret polling', () => {
  const fixture = createPairingFixture({ maxPollAttempts: 2 });
  assert.deepEqual(
    fixture.pollPairing(fixture.challenge.challengeId, 'wrong-secret'),
    { state: 'invalid_secret' },
  );
  assert.deepEqual(
    fixture.pollPairing(fixture.challenge.challengeId, 'wrong-secret'),
    { state: 'invalid_secret' },
  );
  assert.deepEqual(
    fixture.pollPairing(fixture.challenge.challengeId, fixture.challenge.deviceSecret),
    { state: 'rate_limited' },
  );
});
