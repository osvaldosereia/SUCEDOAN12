import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/id="confirmReadyOrders"/);
assert.match(html,/function confirmableNewOrders\(\)/);
assert.match(html,/o\.status==='created'&&orderProblemReasons\(o\)\.length===0/);
assert.match(html,/function paintConfirmableOrdersButton\(\)/);
assert.match(html,/async function confirmAllReadyOrders\(\)/);
assert.match(html,/A confirmação reserva o estoque para estes pedidos/);
assert.match(html,/NÃO dá baixa física e NÃO envia pedido ao Bling/);
assert.match(html,/status:'confirmed'/);
assert.match(html,/failed\.push\('#'\+shortOrder\(o\.order_number\)\)/);
assert.match(html,/paintConfirmableOrdersButton\(\)/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · confirmação em lote apenas de pedidos aptos');
