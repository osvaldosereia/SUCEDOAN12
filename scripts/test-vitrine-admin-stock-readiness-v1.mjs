import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(fn,/async function orderStockReadinessMap\(orderIdsRaw:any\[\]\)/);
assert.match(fn,/order_stock_reservations/);
assert.match(fn,/const reservedOther=/);
assert.match(fn,/available\+0\.0001<requested/);
assert.match(fn,/stock_readiness:openStockMap\.get\(r\.id\)\?\?null/);
assert.match(fn,/stock_readiness:stockReadiness/);
assert.match(fn,/if\(requestedStatus==="confirmed"&&currentOrder\.status==="created"\)/);
assert.match(fn,/error:"insufficient_stock"/);

assert.match(html,/Estoque insuficiente/);
assert.match(html,/stock:'Estoque insuficiente'/);
assert.match(html,/\['stock','Estoque'\]/);
assert.match(html,/\['stock','Revisar estoque'\]/);
assert.match(html,/function orderStockAlertHtml\(readiness\)/);
assert.match(html,/id="orderStockAlert"/);
assert.match(html,/Abrir Balanço/);
assert.match(html,/Estoque disponível insuficiente para confirmar este pedido/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · estoque insuficiente bloqueia confirmação e aparece na operação');
