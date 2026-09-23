import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');

assert.match(fn,/requestedStatus==="ready"&&currentOrder\.status==="out_for_delivery"/);
assert.match(fn,/delivery_attempts:\[\.\.\.previousAttempts,attempt\]\.slice\(-20\)/);
assert.match(fn,/last_delivery_failure:attempt/);
assert.match(fn,/result:"not_delivered"/);

assert.match(html,/Por que a entrega não foi concluída\?/);
assert.match(html,/Cliente ausente/);
assert.match(html,/Endereço não encontrado/);
assert.match(html,/Cliente pediu reagendamento/);
assert.match(html,/Problema no pagamento/);
assert.match(html,/delivery_return_reason:reason/);
assert.match(html,/Última entrega não concluída/);
assert.match(html,/motivo registrado/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · tentativa de entrega registra motivo e histórico');
