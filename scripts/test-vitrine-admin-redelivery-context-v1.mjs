import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/const attempts=Array\.isArray\(o\.payment_method_snapshot\?\.delivery_attempts\)/);
assert.match(html,/const lastFailure=o\.payment_method_snapshot\?\.last_delivery_failure/);
assert.match(html,/Reentrega · /);
assert.match(html,/tentativa'\+\(attempts\.length===1\?'':'s'\)/);
assert.match(html,/lastFailure\.reason\|\|'Motivo não informado'/);
assert.match(html,/\+redelivery\+'<\/div>'/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · expedição mostra contexto de reentrega');
