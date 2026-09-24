import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(fn,/const protectedLegacy=new Set/);
assert.match(fn,/p\.stock_reserved===true&&p\.stock_released!==true&&p\.stock_model!=="reservation_v2"/);
assert.match(fn,/if\(protectedLegacy\.has\(orderId\)\)/);

const start=fn.indexOf('if(requestedStatus==="confirmed"&&currentOrder.status==="created")');
const end=fn.indexOf('const { data,error }=await db.from("orders")',start);
const section=fn.slice(start,end);

assert.match(section,/const alreadyProtected=candidatePayment\.stock_reserved===true&&candidatePayment\.stock_released!==true/);
assert.match(section,/reserve_storefront_order_stock_v2/);
assert.match(section,/confirmationReservationCreated=true/);
assert.match(section,/stock_model:"reservation_v2"/);
assert.match(section,/stock_reserved_at:new Date\(\)\.toISOString\(\)/);
assert.match(fn,/if\(confirmationReservationCreated\)\{[\s\S]*?release_storefront_order_stock_v2/);
assert.match(fn,/stock_reserved_on_confirm:confirmationReservationCreated/);

assert.match(html,/A confirmação reserva o estoque para estes pedidos/);
assert.match(html,/NÃO dá baixa física/);
assert.match(html,/NÃO envia pedido ao Bling/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · confirmação reserva estoque sem consumir');
