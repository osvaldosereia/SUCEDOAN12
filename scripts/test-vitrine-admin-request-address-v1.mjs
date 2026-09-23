import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/function whatsappMessageHref\(value,message\)/);
assert.match(html,/function orderAddressRequestHref\(o\)/);
assert.match(html,/orderProblemReasons\(o\)\.includes\('Endereço incompleto'\)/);
assert.match(html,/pode me enviar seu endereço completo/);
assert.match(html,/envie sua localização pelo WhatsApp/);
assert.match(html,/Pedir endereço/);
assert.match(html,/target="_blank" rel="noopener"/);
assert.match(html,/const addressRequest=orderAddressRequestHref\(o\)/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · pedido de endereço via WhatsApp é ação humana');
