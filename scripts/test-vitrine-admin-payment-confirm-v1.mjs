import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/Confirmar recebimento/);
assert.match(html,/fiscalBtn\.textContent='Confirmar '\+money\(o\.total_cents\)\+' recebido · '\+method/);
assert.match(html,/Confirmar recebimento de '\+amount\+' via '\+payment/);
assert.match(html,/registra o pagamento do pedido/);
assert.match(html,/state\.fiscalByOrder\[o\.id\]=state\.currentOrderFiscal/);
assert.match(html,/if\(state\.tab==='closure'\)renderClosure\(\)/);
assert.match(html,/Recebimento confirmado · fiscal pronto/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · confirmação explícita de recebimento');
