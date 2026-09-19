import test from 'node:test';
import assert from 'node:assert/strict';

import { isSafeAppUrl } from '../../src/platform/urlPolicy.ts';

test('relative internal app links remain safe', () => {
  assert.equal(isSafeAppUrl('/app/ofertas'), true);
});

test('absolute app links require HTTPS', () => {
  assert.equal(isSafeAppUrl('https://hml.example/app/ofertas'), true);
  assert.equal(isSafeAppUrl('http://hml.example/app/ofertas'), false);
  assert.equal(isSafeAppUrl('javascript:alert(1)'), false);
  assert.equal(isSafeAppUrl('data:text/plain,test'), false);
});

test('credentials and sensitive query material fail closed', () => {
  assert.equal(isSafeAppUrl('https://user:pass@hml.example/app/ofertas'), false);
  assert.equal(isSafeAppUrl('/app/ofertas?session=secret'), false);
  assert.equal(isSafeAppUrl('/app/ofertas?cpf=00000000000'), false);
});
