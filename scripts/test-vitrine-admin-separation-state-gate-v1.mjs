import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

const start=fn.indexOf('async function consumeOrderStock');
const end=fn.indexOf('async function blingHubControl',start);
const section=fn.slice(start,end);

assert.match(section,/!\["confirmed","processing"\]\.includes\(String\(order\.status\|\|""\)\)/);
assert.match(section,/error:"order_not_ready_for_separation"/);
assert.match(section,/required_statuses:\["confirmed","processing"\]/);

const statusGate=section.indexOf('order_not_ready_for_separation');
const blingGate=section.indexOf('validateBlingBeforeStockMutation(id)');
const consume=section.indexOf('consume_storefront_order_stock_v2');
assert.ok(statusGate>=0&&blingGate>statusGate,'status deve ser validado antes do Bling');
assert.ok(consume>blingGate,'estoque deve continuar depois dos dois gates');

assert.match(html,/order_not_ready_for_separation:'Confirme o pedido antes de iniciar a separação\.'/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · backend exige pedido confirmado antes de separar');
