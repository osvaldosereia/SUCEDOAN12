import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/function closureBucket\(o\)/);
assert.match(html,/if\(f\.payment_status!=='confirmed'\)return 'payment'/);
assert.match(html,/return 'complete'/);
assert.match(html,/Recebimento pendente/);
assert.match(html,/Fiscal \/ revisão/);
assert.match(html,/Confirmar o que foi recebido/);
assert.match(html,/pagamento confirmado; falta concluir ou revisar o fiscal/);
assert.match(html,/const paymentPending=delivered\.filter/);
assert.match(html,/const fiscalPending=delivered\.filter/);
assert.match(html,/const complete=delivered\.filter/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · fechamento separa recebimento de fiscal');
