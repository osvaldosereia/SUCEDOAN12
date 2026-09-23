import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/data-confirm-delivery/);
assert.match(html,/Confirmar entrega/);
assert.match(html,/async function confirmDeliveryFromExpedition\(id\)/);
assert.match(html,/o\.status!=='out_for_delivery'/);
assert.match(html,/status:'delivered'/);
assert.match(html,/Entrega confirmada · pagamento pendente no Fechamento/);
assert.match(html,/Entrega e recebimento confirmados/);
assert.match(html,/dataset\.confirmDelivery/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · confirmação rápida de entrega');
