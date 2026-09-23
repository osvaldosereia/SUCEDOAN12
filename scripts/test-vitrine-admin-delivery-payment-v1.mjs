import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const start=html.indexOf('async function confirmDeliveryFromExpedition');
const end=html.indexOf('function selectedDispatchOrders',start);
const section=html.slice(start,end);

assert.match(section,/Pagamento não informado/);
assert.match(section,/O pagamento de /);
assert.match(section,/deixar pagamento pendente no Fechamento/);
assert.match(section,/order_fiscal_confirm_payment/);
assert.match(section,/payment_method:payment/);
assert.match(section,/Entrega e recebimento confirmados/);
assert.match(section,/Entrega confirmada · pagamento pendente no Fechamento/);

const deliveryWrite=section.indexOf("status:'delivered'");
const paymentWrite=section.indexOf("order_fiscal_confirm_payment");
assert.ok(deliveryWrite>=0&&paymentWrite>deliveryWrite,'pagamento só pode ser confirmado após a entrega');

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · entrega pode confirmar recebimento no mesmo fluxo');
