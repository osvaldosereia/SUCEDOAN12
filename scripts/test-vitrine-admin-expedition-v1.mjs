import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/data-tab="expedition"[^>]*>Expedição</);
assert.match(html,/function renderExpedition\(\)/);
assert.match(html,/Aguardando saída/);
assert.match(html,/Em entrega/);
assert.match(html,/Últimos entregues/);
assert.match(html,/function orderProblemReasons\(o\)/);
assert.match(html,/Cliente não identificado/);
assert.match(html,/Endereço incompleto/);
assert.match(html,/Pagamento não informado/);
assert.match(html,/Corrija os dados antes de avançar/);
assert.match(html,/\['delivered','cancelled'\]\.includes\(o\?\.status\)/);
assert.match(html,/if\(filter==='problems'\)return orderIssueMatch\(o,state\.orderIssueFilter\)/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · expedição e pendências operacionais');
