import fs from 'node:fs';
import assert from 'node:assert/strict';

const vitrine=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(hub,/async function blingHubReconcileCustomerReadonly\(sb:any,customerIdRaw:any\)/);
assert.match(hub,/customer_reconcile_single_readonly/);
assert.match(hub,/external_write:false/);
assert.match(hub,/subaction==="reconcile_customer_readonly"/);
assert.doesNotMatch(hub.slice(hub.indexOf('async function blingHubReconcileCustomerReadonly'),hub.indexOf('async function blingHubReconcileCustomersReadonly')),/method:"POST"|method:"PUT"/);

assert.match(vitrine,/async function reconcileBlingOrderDependenciesReadonly\(orderId:string\)/);
assert.match(vitrine,/reconcile_customer_readonly/);
assert.match(vitrine,/reconcile_products_readonly/);
assert.match(vitrine,/bling_reconcile_order_dependencies_readonly/);
assert.match(vitrine,/external_write:false/);

assert.match(html,/Tentar resolver vínculos/);
assert.match(html,/Vincular cliente/);
assert.match(html,/async function resolveCurrentOrderBlingDependencies\(\)/);
assert.match(html,/bling_reconcile_order_dependencies_readonly/);
assert.match(html,/function focusOrderCustomerForBling\(\)/);
assert.match(html,/Vínculos conferidos · pedido apto para separar/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · reconciliação focada do pedido sem escrita externa');
