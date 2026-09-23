import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/async function validateBlingBeforeSeparation\(orderId\)/);
assert.match(html,/bling_preview_order_sync/);
assert.match(html,/blingPreflightOperationalBlockers\(preview\)/);
assert.match(html,/Corrija as pendências da integração antes de separar/);
assert.match(html,/Não consegui validar o Bling · separação não iniciada/);

const start=html.indexOf('async function printSeparation');
const end=html.indexOf('function printDelivery',start);
const section=html.slice(start,end);

const persist=section.indexOf('await persistCurrentOrder()');
const validate=section.indexOf('await validateBlingBeforeSeparation(o.id)');
const consume=section.indexOf("api('order_consume_stock'");
const processing=section.indexOf("status:'processing'");

assert.ok(persist>=0,'deve salvar os dados atuais antes da prévia');
assert.ok(validate>persist,'a prévia deve ocorrer após salvar os dados');
assert.ok(consume>validate,'a baixa de estoque deve ocorrer somente depois da prévia');
assert.ok(processing>consume,'o status processing deve vir depois da baixa de estoque');
assert.match(section,/if\(!blingReady\)\{[\s\S]*?return;/);

console.log('OK · gate Bling antes da baixa de estoque');
