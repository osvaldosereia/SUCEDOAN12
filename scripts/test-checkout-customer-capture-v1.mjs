import fs from 'node:fs';
import assert from 'node:assert/strict';

const capture=fs.readFileSync('checkout-resilience.js','utf8');
const storefront=fs.readFileSync('index.html','utf8');
const backend=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
const guard=fs.readFileSync('supabase/migrations/20261023170000_allow_pending_registration_storefront_orders.sql','utf8');
const cadastro=fs.readFileSync('cadastro/index.html','utf8');

assert.match(capture,/function liveCheckoutPhone\(/,'order follow-up must read the live WhatsApp');
assert.match(capture,/function validateCheckoutBasics\(/,'checkout must keep operational validation');
assert.doesNotMatch(capture,/body\.checkout_registration|checkoutDocumentRequired|registrationDraftComplete/,'registration must not be injected into order submission');
assert.match(storefront,/Finalize sem preencher o cadastro/,'checkout must explain registration can be completed later');
assert.match(storefront,/confirmamos tudo pelo WhatsApp depois do pedido/i,'checkout must explain the manual follow-up channel');
assert.doesNotMatch(storefront,/id=\\"?checkout(Document|Street|Number|Neighborhood|City|Name)\\?"?/,'checkout must not show registration fields as an order prerequisite');
assert.match(cadastro,/customer_register/,'the separate registration page must remain available');
assert.match(cadastro,/Nome completo/,'customers may still complete their registration separately');

assert.match(guard,/phone_e164/i,'database must keep the WhatsApp contact required');
assert.match(guard,/payment_method/i,'database must keep payment choice required');
assert.match(guard,/delivery_date/i,'database must keep delivery date required');
assert.doesNotMatch(guard,/registration_incomplete|cpf_cnpj|customer_addresses|street|neighborhood/i,'database must not require customer registration or address to create the order');
const submit=backend.match(/async function submit\(req:Request,p:any\)\{[\s\S]*?\n\}/)?.[0]||'';
assert.ok(submit,'storefront order submission handler must exist');
assert.doesNotMatch(submit,/p\?\.checkout_registration|registration_incomplete|registerCustomer\(req/,'order submission must not synchronously create a customer registration');
assert.match(submit,/customerStatus=customer\?\.registration_complete===true\?"registered":"pending_registration"/,'incomplete registrations must be marked for WhatsApp follow-up');

console.log('checkout registration is optional and order follow-up is preserved: OK');
