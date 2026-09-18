import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAppLink } from '../../src/platform/appLinks.ts';

test('deep links route offers baskets and opaque order tokens', () => {
  assert.equal(parseAppLink('/app/ofertas'),'catalog');
  assert.equal(parseAppLink('/app/cestas/cesta-familia'),'basket');
  assert.equal(
    parseAppLink('/app/pedido/opaque_token_1234567890'),
    'order',
  );
});

test('unknown safe app links fall back to home', () => {
  assert.equal(parseAppLink('/app/qualquer-coisa'),'home');
});

test('deep links reject PII and session material', () => {
  for(const url of[
    '/app/pedido/opaque_token_1234567890?phone=65999990000',
    '/app/cestas/x?cpf=00000000000',
    '/app/ofertas?address=Rua%20Teste',
    '/app/pedido/opaque_token_1234567890?session=secret',
  ]){
    assert.equal(parseAppLink(url),null,url);
  }
});

test('order link requires an opaque token, not a short predictable id', () => {
  assert.equal(parseAppLink('/app/pedido/1234'),null);
});

test('deep links fail closed on malformed percent-encoding', () => {
  assert.equal(parseAppLink('/app/cestas/%E0%A4%A'),null);
});


test('absolute deep links require an explicit HTTPS host allowlist', () => {
  assert.equal(parseAppLink('https://evil.example/app/ofertas'),null);
  assert.equal(parseAppLink('http://hml.example/app/ofertas',{allowedHosts:['hml.example']}),null);
  assert.equal(
    parseAppLink('https://hml.example/app/ofertas',{allowedHosts:['hml.example']}),
    'catalog',
  );
});
