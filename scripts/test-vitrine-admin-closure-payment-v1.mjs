import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/data-closure-payment/);
assert.match(html,/async function confirmClosurePayment\(id\)/);
assert.match(html,/payment_status==='confirmed'/);
assert.match(html,/Confirmar recebimento de '\+money\(o\.total_cents\)\+' via '\+payment/);
assert.match(html,/order_fiscal_confirm_payment/);
assert.match(html,/fiscal pronto/);
assert.match(html,/dataset\.closurePayment/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · recebimento direto do fechamento');
