import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/orderCustomerSuggestion:null/);
assert.match(html,/function phoneDigits\(v\)/);
assert.match(html,/c\?\.status!=='inactive'&&phoneDigits\(c\.phone\)===target/);
assert.match(html,/if\(matches\.length===1\)/);
assert.match(html,/Cadastro com o mesmo telefone encontrado/);
assert.match(html,/id="useSuggestedCustomer"/);
assert.match(html,/state\.orderCustomerSuggestion=null/);
assert.match(html,/applySelectedCustomerToDelivery\(\)/);
assert.doesNotMatch(html,/customer_snapshot=matches\[0\]/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · sugestão segura de cliente por telefone');
