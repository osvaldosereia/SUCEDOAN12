import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/data-tab="closure"[^>]*>Fechamento</);
assert.match(html,/function renderClosure\(\)/);
assert.match(html,/function loadFiscalForOrders\(rows\)/);
assert.match(html,/order_fiscal_status/);
assert.match(html,/Pagamento pendente/);
assert.match(html,/Fiscal pronto/);
assert.match(html,/Precisa de revisão/);
assert.match(html,/Precisa finalizar/);
assert.match(html,/Concluídos recentes/);
assert.match(html,/Promise\.all\(\[worker\(\),worker\(\),worker\(\)\]\)/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · fechamento pós-entrega');
