import fs from 'node:fs';
import assert from 'node:assert/strict';

// Mantém a suíte principal do checkout acionada neste PR de retorno ao WhatsApp.
const capture=fs.readFileSync('checkout-resilience.js','utf8');
const backendGuard=fs.readFileSync('supabase/migrations/20261002143000_require_storefront_checkout_basics.sql','utf8');
for(const page of ['index.html','vitrine/index.html']){
  const html=fs.readFileSync(page,'utf8');
  assert.match(html,/checkout-resilience\.js/,`${page}: resilience layer must remain loaded`);
}

assert.match(capture,/function liveCheckoutPhone\(/,'finalization must read the live WhatsApp fields');
assert.match(capture,/function checkoutRegistrationDraft\(/,'finalization must capture the live registration fields');
assert.match(capture,/function validateCheckoutBasics\(/,'checkout must validate required customer/delivery/payment data');
assert.match(capture,/function showCheckoutValidation\(/,'checkout must visibly explain what is missing or invalid');
assert.match(capture,/scrollIntoView/,'checkout must take the customer to the field that needs attention');
assert.match(capture,/aria-invalid/,'invalid fields must be exposed visibly and accessibly');
assert.match(capture,/(Informações pessoais|2\. Seus dados|Seus dados)/,'checkout must visibly separate personal information');
assert.match(capture,/(Dados da entrega|3\. Endereço da entrega|Endereço)/,'checkout must visibly separate delivery information');
assert.match(capture,/Data de entrega/,'checkout must visibly separate delivery date');
assert.match(capture,/(Forma de pagamento|Pagamento na entrega)/,'checkout must visibly separate payment');
assert.match(capture,/body\.whatsapp_phone=phone\.full/,'live phone must be injected in submit_order');
assert.match(capture,/body\.checkout_registration=draft/,'capture layer must send registration for validation within the canonical submit');
for(const field of ['checkoutName','checkoutDocument','checkoutStreet','checkoutNumber','checkoutNeighborhood','checkoutCity']){
  assert.ok(capture.includes(field),`required capture layer missing ${field}`);
}
for(const optionalField of ['checkoutPostal','checkoutComplement','checkoutReference']){
  assert.ok(capture.includes(optionalField),`optional capture layer missing ${optionalField}`);
}
assert.match(capture,/registrationDraftComplete/,'new/incomplete customers must have a complete registration before order');
assert.match(capture,/existingRegistrationComplete/,'complete existing customers must not be forced to retype hidden CPF data');
assert.match(capture,/invalid_document/,'CPF\/CNPJ validation error must have a specific customer-facing path');
assert.match(capture,/unsupported_city/,'unsupported city must have a specific customer-facing path');

assert.match(backendGuard,/required_checkout_data/,'database must reject orders without operational checkout data');
assert.match(backendGuard,/registration_incomplete/,'database must reject storefront orders without a linked registered customer');
assert.match(backendGuard,/payment_method/,'database must require payment before storefront order creation');
assert.match(backendGuard,/delivery_date/,'database must require delivery date before storefront order creation');
assert.match(backendGuard,/phone_e164/,'database must require WhatsApp before storefront order creation');

console.log('checkout required basic data contract: OK');
