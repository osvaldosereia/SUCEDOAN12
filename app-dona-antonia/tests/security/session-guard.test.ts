import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateSessionGuard } from '../../src/customer/sessionGuard.ts';

test('session guard accepts only unexpired non-revoked TEST sessions', () => {
  assert.deepEqual(evaluateSessionGuard({
    token:'TEST-SESSION-valid-0001',
    expiresAt:2000,
    revoked:false,
  }, {now:()=>1000}), {
    state:'valid',
    usableToken:'TEST-SESSION-valid-0001',
  });
});

test('session guard fails closed for missing, invalid, expired and revoked sessions', () => {
  assert.equal(evaluateSessionGuard({
    token:null,
    expiresAt:null,
    revoked:false,
  }).state,'missing');

  assert.equal(evaluateSessionGuard({
    token:'REAL-SESSION-1',
    expiresAt:2000,
    revoked:false,
  }, {now:()=>1000}).state,'invalid');

  assert.equal(evaluateSessionGuard({
    token:'TEST-SESSION-expired-0001',
    expiresAt:1000,
    revoked:false,
  }, {now:()=>1000}).state,'expired');

  assert.equal(evaluateSessionGuard({
    token:'TEST-SESSION-revoked-0001',
    expiresAt:9999,
    revoked:true,
  }, {now:()=>1000}).state,'revoked');
});

test('session guard rejects missing or non-finite expiration', () => {
  for (const expiresAt of [null, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(evaluateSessionGuard({
      token:'TEST-SESSION-expiry-0001',
      expiresAt,
      revoked:false,
    }, {now:()=>1000}).state,'expired');
  }
});
