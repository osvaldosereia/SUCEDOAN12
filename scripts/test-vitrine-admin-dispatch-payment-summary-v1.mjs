import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/function dispatchPaymentSummary\(rows\)/);
assert.match(html,/function dispatchPaymentSummaryText\(rows\)/);
assert.match(html,/A receber:/);
assert.match(html,/manifest-payments/);
assert.match(html,/selectedTotal/);
assert.match(html,/selected\.length\+' selecionado\(s\) · '\+money\(selectedTotal\)/);
assert.match(html,/paymentSummary=dispatchPaymentSummaryText\(selected\)/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · expedição resume valores por forma de pagamento');
