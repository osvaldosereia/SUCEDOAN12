import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/function expeditionFiscalState\(o\)/);
assert.match(html,/function fiscalAuthorizedForDispatch\(o\)/);
assert.match(html,/const dispatchableReady=ready\.filter\(fiscalAuthorizedForDispatch\)/);
assert.match(html,/const fiscalPendingReady=ready\.filter\(o=>!fiscalAuthorizedForDispatch\(o\)\)/);
assert.match(html,/Selecionar os fiscalmente liberados desta lista/);
assert.match(html,/com fiscal pendente/);
assert.match(html,/data-expedition-fiscal/);
assert.match(html,/Resolver fiscal/);
assert.match(html,/toggleAllReady\(dispatchableReady/);
assert.match(html,/await loadFiscalForOrders\(readyRows\)/);
assert.match(html,/state\.fiscalByOrder\[id\]=state\.currentOrderFiscal/);
assert.match(html,/o=>o\.status==='ready'&&fiscalAuthorizedForDispatch\(o\)&&state\.expeditionSelected\.includes\(o\.id\)/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · expedição só seleciona pedidos fiscalmente autorizados');
