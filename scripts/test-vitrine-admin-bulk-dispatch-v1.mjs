import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/expeditionSelected:\[\]/);
assert.match(html,/data-dispatch-select/);
assert.match(html,/function selectedDispatchOrders\(readyRows=null\)/);
assert.match(html,/function toggleAllReady\(rows,checked\)/);
assert.match(html,/async function bulkDispatchSelected\(\)/);
assert.match(html,/status:'out_for_delivery'/);
assert.match(html,/Total da saída:/);
assert.match(html,/Marcar saída/);
assert.match(html,/Selecione ao menos um pedido pronto/);
assert.match(html,/pedido\(s\) saíram para entrega/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · saída em lote segura');
