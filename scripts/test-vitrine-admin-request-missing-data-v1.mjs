import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/function orderMissingDataRequest\(o\)/);
assert.match(html,/const needName=problems\.includes\('Cliente não identificado'\)/);
assert.match(html,/const needAddress=problems\.includes\('Endereço incompleto'\)/);
assert.match(html,/label='Pedir dados'/);
assert.match(html,/label='Pedir nome'/);
assert.match(html,/label='Pedir endereço'/);
assert.match(html,/seu nome completo e seu endereço completo/);
assert.match(html,/pode me informar seu nome completo/);
assert.match(html,/dataRequest\.href/);
assert.match(html,/dataRequest\.label/);
assert.match(html,/function orderAddressRequestHref\(o\)/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · WhatsApp pede somente nome/endereço faltantes');
