import fs from 'node:fs';
import assert from 'node:assert/strict';

const vitrine=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(vitrine,/fiscal_dispatch_preview/);
assert.match(vitrine,/action==="order_fiscal_dispatch_preview"/);
assert.match(vitrine,/blingHubControl\("fiscal_dispatch_preview"/);
assert.doesNotMatch(vitrine,/blingHubControl\("fiscal_dispatch_canary"/,'Vitrine/Admin não deve expor o executor fiscal');

assert.match(hub,/if\(order\.status==="ready"\)/);
assert.match(hub,/blingHubVitrineDispatchFiscalPreview\(sb,resolved\.source_order_id\)/);
assert.match(hub,/dispatch_preview:dispatchPreview/);

assert.match(html,/function fiscalDispatchPreviewHtml\(p\)/);
assert.match(html,/fiscalDispatchPreviewHtml\(f\.dispatch_preview\)/);
assert.doesNotMatch(html,/previewCurrentOrderFiscalDispatch/,'Admin não deve depender da rota nova para a prévia');
assert.doesNotMatch(html,/Verificar fiscal de saída/,'Prévia deve carregar junto com o status fiscal já publicado');
assert.match(html,/Nenhuma NF-e encontrada para este pedido/);
assert.match(html,/esta consulta não gera nota/);
assert.match(html,/NF-e localizada e autorizada/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
assert.ok(scripts.length,'Admin deve conter JavaScript');
for(const source of scripts)new Function(source);

console.log('OK · prévia fiscal read-only usa o status fiscal já publicado e não expõe executor canário');
