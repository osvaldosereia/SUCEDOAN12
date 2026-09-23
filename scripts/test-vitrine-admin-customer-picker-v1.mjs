import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/id="orderCustomerSearch"/);
assert.match(html,/Buscar cliente por nome, telefone ou CPF/);
assert.match(html,/function scheduleOrderCustomerSearch\(value\)/);
assert.match(html,/function searchOrderCustomers\(q\)/);
assert.match(html,/vitrine_customers_list',\{q,limit:30\}/);
assert.match(html,/Digite pelo menos 2 caracteres/);
assert.match(html,/state\.customers=\[\]/);
assert.doesNotMatch(html,/vitrine_customers_list',\{limit:150\}/);
assert.match(html,/CPF /);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · busca de cliente no pedido');
