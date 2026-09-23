import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');

assert.match(fn,/requestedStatus==="cancelled"&&currentOrder\.status!=="cancelled"/);
assert.match(fn,/cancellationReason=text\(payload\?\.cancellation_reason,120\)\|\|"Não informado"/);
assert.match(fn,/source:"vitrine_admin"/);
assert.match(fn,/note:cancellationNote\|\|null/);

assert.match(html,/Motivo do cancelamento:/);
assert.match(html,/Cliente desistiu/);
assert.match(html,/Produto indisponível/);
assert.match(html,/Pedido duplicado/);
assert.match(html,/Problema de pagamento/);
assert.match(html,/persistCurrentOrder\('cancelled',\{cancellation_reason:reason,cancellation_note:note\}\)/);
assert.match(html,/const cancellation=o\.payment_method_snapshot\?\.cancellation\|\|null/);
assert.match(html,/Pedido cancelado · /);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · cancelamento registra motivo, nota e horário');
