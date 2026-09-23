import fs from 'node:fs';
import assert from 'node:assert/strict';

const vitrine=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(vitrine,/operation:"sync_order_status"/);
assert.match(vitrine,/order_cancelled_in_vitrine/);
assert.match(vitrine,/bling_status_attention_queued:blingStatusAttentionQueued/);
assert.match(vitrine,/order_link_status/);

assert.match(hub,/job\.operation==="sync_order_status"/);
assert.match(hub,/order_status_updates_disabled/);
assert.match(hub,/order_status_mapping_not_approved/);
assert.match(hub,/status_updates_enabled!==true/);
assert.match(hub,/required_resource/);
assert.match(hub,/external_write:false/);

assert.match(html,/Como o pedido já está vinculado ao Bling/);
assert.match(html,/Bling será conferido/);
assert.match(html,/Status do pedido no Bling precisa de revisão manual/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · cancelamento vinculado gera revisão de status');
