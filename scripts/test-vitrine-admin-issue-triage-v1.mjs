import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/orderIssueFilter:'all'/);
assert.match(html,/function orderIssueMatch\(o,key='all'\)/);
assert.match(html,/function orderIssueCount\(key\)/);
assert.match(html,/address:'Endereço incompleto'/);
assert.match(html,/customer:'Cliente não identificado'/);
assert.match(html,/payment:'Pagamento não informado'/);
assert.match(html,/history:'Histórico pendente do cliente'/);
assert.match(html,/function renderTodayIssueBreakdown\(\)/);
assert.match(html,/data-today-issue/);
assert.match(html,/id="orderIssueFilters"/);
assert.match(html,/data-order-issue/);
assert.match(html,/if\(filter==='problems'\)return orderIssueMatch\(o,state\.orderIssueFilter\)/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · triagem por tipo de pendência');
