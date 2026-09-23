import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');

assert.match(hub,/order_rollout:runtimeMeta\.data\?\.metadata\?\.order_rollout/);
assert.match(html,/Pedidos · homologação/);
assert.match(html,/Aguardando 1º pedido real/);
assert.match(html,/Canário validado/);
assert.match(html,/Pausado após falha/);
assert.match(html,/Situações do pedido/);
assert.match(html,/Sem permissão/);
assert.match(html,/situações\/modulos/);
assert.match(html,/Cancelamentos ficam sinalizados para conferência manual/);
assert.match(html,/rollout\.state/);
assert.match(html,/statusCatalog\.status_updates_enabled/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · homologação Bling visível');
