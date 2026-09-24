import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260924040000_vitrine_operational_cutover_v1.sql','utf8');
const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(migration,/vitrine_operational_cutover_config/);
assert.match(migration,/live_orders_since timestamptz not null/);
assert.match(migration,/legacy_orders_read_only boolean not null default true/);
assert.match(migration,/values\(1,now\(\),true\)/);

assert.match(fn,/async function operationalCutover\(\)/);
assert.match(fn,/async function orderOperationalAge\(orderIdRaw:any\)/);
assert.match(fn,/async function legacyOrderMutationGuard\(orderIdRaw:any\)/);
assert.match(fn,/legacy_order_read_only/);

const gteCount=(fn.match(/\.gte\("created_at",cutover\.live_orders_since\)/g)||[]).length;
assert.ok(gteCount>=5,'listas operacionais devem respeitar o corte em pelo menos cinco consultas');

assert.match(fn,/pending_count:pendingRows\.length/);
assert.match(fn,/visibleIds\.has\(id\)/);
assert.match(fn,/crossSellShadowPrepareRecent[\s\S]*?\.gte\("created_at",cutover\.live_orders_since\)/);
assert.match(fn,/listOrderStockShortages[\s\S]*?\.gte\("created_at",cutover\.live_orders_since\)/);

assert.match(fn,/mutationOrderId=/);
for(const action of [
  'order_update','order_consume_stock','history_sync_retry',
  'bling_create_order_products','bling_create_order_customer',
  'order_fiscal_dispatch_canary_execute','order_fiscal_confirm_payment',
  'order_component_replace','cross_sell_shadow_prepare'
]){
  assert.ok(fn.includes('"'+action+'"')||fn.includes("'"+action+"'"),'guard deve cobrir '+action);
}

assert.match(html,/legacy_order_read_only:'Este pedido é anterior ao corte operacional e ficou somente leitura\.'/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · pedidos anteriores ao corte ficam fora da operação e somente leitura');
