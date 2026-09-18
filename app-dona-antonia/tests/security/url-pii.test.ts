import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertSafeAppUrl,
  isSafeAppUrl,
} from '../../src/platform/urlPolicy.ts';

test('safe app paths allow opaque non-PII identifiers', () => {
  assert.equal(isSafeAppUrl('/app/pedido/opaque-abc-123'), true);
  assert.equal(isSafeAppUrl('/app/cestas/cesta-familia'), true);
});

test('URLs reject PII and session material in query or hash', () => {
  for (const url of [
    '/app/pedido/abc?phone=65999990000',
    '/app/pedido/abc?cpf=00000000000',
    '/app/pedido/abc?address=Rua%20Teste',
    '/app/pedido/abc?token=secret',
    '/app/pedido/abc?session=secret',
    '/app/pedido/abc#cpf=00000000000',
  ]) {
    assert.equal(isSafeAppUrl(url), false, url);
    assert.throws(() => assertSafeAppUrl(url), /unsafe app URL/i);
  }
});

test('URLs reject embedded credentials and non-http schemes', () => {
  assert.equal(isSafeAppUrl('https://user:pass@example.invalid/app'), false);
  assert.equal(isSafeAppUrl('javascript:alert(1)'), false);
});
