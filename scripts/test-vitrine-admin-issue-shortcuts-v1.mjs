import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(html,/orderFocusIssue:null/);
assert.match(html,/function orderIssueShortcut\(problems\)/);
assert.match(html,/\['address','Corrigir endereço'\]/);
assert.match(html,/\['customer','Vincular cliente'\]/);
assert.match(html,/\['payment','Corrigir pagamento'\]/);
assert.match(html,/data-order-issue-open/);
assert.match(html,/function openOrderForIssue\(id,issue\)/);
assert.match(html,/function focusRequestedOrderIssue\(\)/);
assert.match(html,/id="orderDeliveryDetails"/);
assert.match(html,/target=\$\('#orderCustomerSearch'\)/);
assert.match(html,/target=\$\('#orderPayment'\)/);
assert.match(html,/target=\$\('#retryHistorySync'\)/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · atalhos levam a pendência ao campo correto');
