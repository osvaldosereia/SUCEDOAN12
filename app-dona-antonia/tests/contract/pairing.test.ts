import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPairingChallenge,
  createPairingFixture,
} from '../../src/customer/pairing.ts';

test('pairing challenge has 10 minute TTL and >=128-bit device secret', () => {
  const challenge=createPairingChallenge({now:()=>1000});

  assert.match(challenge.challengeId,/^TEST-PAIR-/);
  assert.match(challenge.humanCode,/^[A-Z0-9]{6}$/);
  assert.ok(challenge.deviceSecret.length >= 22);
  assert.equal(challenge.expiresAt,1000 + 10*60*1000);
});

test('correct human code plus wrong device secret never confirms device', () => {
  const fixture=createPairingFixture({now:()=>1000});
  const challenge=fixture.challenge;

  assert.equal(fixture.confirmHumanCode(challenge.humanCode),true);
  assert.deepEqual(
    fixture.pollPairing(challenge.challengeId,'wrong-secret'),
    {state:'invalid_secret'},
  );
});

test('pairing is single-use and blocks replay', () => {
  const fixture=createPairingFixture({now:()=>1000});
  const challenge=fixture.challenge;

  assert.equal(fixture.confirmHumanCode(challenge.humanCode),true);
  assert.deepEqual(
    fixture.pollPairing(challenge.challengeId,challenge.deviceSecret),
    {state:'confirmed',sessionToken:'TEST-SESSION-PAIRING'},
  );
  assert.deepEqual(
    fixture.pollPairing(challenge.challengeId,challenge.deviceSecret),
    {state:'consumed'},
  );
});

test('expired pairing cannot be confirmed or polled', () => {
  let now=1000;
  const fixture=createPairingFixture({now:()=>now});
  const challenge=fixture.challenge;
  now=challenge.expiresAt+1;

  assert.equal(fixture.confirmHumanCode(challenge.humanCode),false);
  assert.deepEqual(
    fixture.pollPairing(challenge.challengeId,challenge.deviceSecret),
    {state:'expired'},
  );
});

test('pairing poll rate limit fails closed', () => {
  const fixture=createPairingFixture({
    now:()=>1000,
    maxPollAttempts:3,
  });
  const challenge=fixture.challenge;

  assert.deepEqual(fixture.pollPairing(challenge.challengeId,'bad-1'),{state:'invalid_secret'});
  assert.deepEqual(fixture.pollPairing(challenge.challengeId,'bad-2'),{state:'invalid_secret'});
  assert.deepEqual(fixture.pollPairing(challenge.challengeId,'bad-3'),{state:'invalid_secret'});
  assert.deepEqual(fixture.pollPairing(challenge.challengeId,'bad-4'),{state:'rate_limited'});
});


test('pairing human code confirmation is rate limited against brute force', () => {
  const fixture=createPairingFixture({
    now:()=>1000,
    maxConfirmAttempts:3,
  });
  const challenge=fixture.challenge;

  assert.equal(fixture.confirmHumanCode('AAAAAA'),false);
  assert.equal(fixture.confirmHumanCode('BBBBBB'),false);
  assert.equal(fixture.confirmHumanCode('CCCCCC'),false);
  assert.equal(fixture.confirmHumanCode(challenge.humanCode),false);
});
