import fs from 'node:fs';
import assert from 'node:assert/strict';

const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(hub,/select\("id,bling_contact_id,is_active,cpf_cnpj"\)/);
assert.match(hub,/!contactId&&!blingHubValidCpfCnpj\(cq\.data\.cpf_cnpj\)\)blockers\.push\("customer_document_required"\)/);
assert.match(hub,/else if\(!contactId\)blockers\.push\("customer_missing_bling_contact_id"\)/);

assert.match(html,/customer_document_required:'Informe um CPF válido no cadastro do cliente para vincular ao Bling'/);
assert.match(html,/id="completeCustomerDocument"/);
assert.match(html,/Completar CPF/);
assert.match(html,/async function completeCurrentOrderCustomerDocument\(\)/);
assert.match(html,/openCustomerEditor\(customer,orderId\)/);
assert.match(html,/function openCustomerEditor\(c=null,returnOrderId=''\)/);
assert.match(html,/async function saveCustomer\(id,returnOrderId=''\)/);
assert.match(html,/sincronização com Bling enfileirada/);
assert.match(html,/if\(returnOrderId\)await openOrder\(returnOrderId\)/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · CPF ausente vira ação direta no pedido');
