import fs from 'node:fs';
import assert from 'node:assert/strict';

const vitrine=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(vitrine,/fiscal_dispatch_preview/);
assert.match(vitrine,/action==="order_fiscal_dispatch_preview"/);
assert.match(vitrine,/blingHubControl\("fiscal_dispatch_preview"/);
assert.doesNotMatch(vitrine,/blingHubControl\("fiscal_dispatch_canary"/,'Vitrine/Admin não deve expor o executor fiscal');

assert.match(html,/currentOrderFiscalPreview:null/);
assert.match(html,/function fiscalDispatchPreviewHtml\(p\)/);
assert.match(html,/async function previewCurrentOrderFiscalDispatch\(\)/);
assert.match(html,/order_fiscal_dispatch_preview/);
assert.match(html,/Verificar fiscal de saída/);
assert.match(html,/Nenhuma NF-e encontrada para este pedido/);
assert.match(html,/esta consulta não gera nota/);
assert.match(html,/NF-e localizada e autorizada/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
assert.ok(scripts.length,'Admin deve conter JavaScript');
for(const source of scripts)new Function(source);

console.log('OK · prévia fiscal read-only disponível sem expor executor canário');
