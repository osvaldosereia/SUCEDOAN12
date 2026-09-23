import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');

assert.match(fn,/function blingSeparationBlockingReasons\(preview:any\)/);
assert.match(fn,/new Set\(\["first_separation_required","stock_not_consumed"\]\)/);
assert.match(fn,/async function validateBlingBeforeStockMutation\(orderId:string\)/);
assert.match(fn,/error:"bling_preflight_blocked"/);
assert.match(fn,/error:"bling_preflight_unavailable"/);

const start=fn.indexOf('async function consumeOrderStock');
const end=fn.indexOf('async function blingHubControl',start);
const section=fn.slice(start,end);

const gate=section.indexOf('await validateBlingBeforeStockMutation(id)');
const consumeV2=section.indexOf('consume_storefront_order_stock_v2');
const reserveV2=section.indexOf('reserve_storefront_order_stock_v2');
const orderUpdate=section.indexOf('.update({payment_method_snapshot:nextPayment');

assert.ok(gate>=0,'gate backend deve existir');
assert.ok(consumeV2>gate,'consume de estoque só pode ocorrer após gate');
assert.ok(reserveV2>gate,'reserva de estoque só pode ocorrer após gate');
assert.ok(orderUpdate>gate,'mutação do pedido só pode ocorrer após gate');
assert.match(section,/if\(blingPreflight\)return blingPreflight/);

console.log('OK · backend bloqueia estoque antes de prévia Bling');
