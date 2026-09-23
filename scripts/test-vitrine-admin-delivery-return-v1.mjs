import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');

assert.match(fn,/out_for_delivery:\["ready","delivered","cancelled"\]/);
assert.match(html,/Entrega não concluída/);
assert.match(html,/data-return-expedition/);
assert.match(html,/async function returnOrderToExpedition\(id,fromDetail=false\)/);
assert.match(html,/status:'ready'/);
assert.match(html,/estoque continuará baixado/);
assert.match(html,/Pedido voltou para Aguardando saída · motivo registrado/);
assert.match(html,/delivery_return_reason:reason/);
assert.match(html,/id="returnToExpedition"/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · retorno seguro de entrega');
