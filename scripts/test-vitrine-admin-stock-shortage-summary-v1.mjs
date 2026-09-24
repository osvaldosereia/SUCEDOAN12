import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(fn,/async function listOrderStockShortages\(\)/);
assert.match(fn,/\.in\("status",\["created","confirmed","processing"\]\)/);
assert.match(fn,/p\.stock_consumed!==true/);
assert.match(fn,/const protectedLegacy=/);
assert.match(fn,/if\(own\)continue/);
assert.match(fn,/const free=Math\.max\(0,Math\.round\(\(physical-reserved\)\*1000\)\/1000\)/);
assert.match(fn,/const shortage=Math\.max\(0,Math\.round\(\(pending\.quantity-free\)\*1000\)\/1000\)/);
assert.match(fn,/action==="order_stock_shortages"/);

assert.match(html,/Faltas dos pedidos/);
assert.match(html,/function loadOrderStockShortages\(\)/);
assert.match(html,/function paintOrderStockShortages\(\)/);
assert.match(html,/function selectShortageForBalance\(productId\)/);
assert.match(html,/Reservas já protegidas foram descontadas/);
assert.match(html,/data-count-shortage/);
assert.match(html,/loadOrderStockShortages\(\);/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · Balanço prioriza faltas reais dos pedidos');
