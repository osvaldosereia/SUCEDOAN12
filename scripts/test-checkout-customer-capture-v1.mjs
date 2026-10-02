import fs from 'node:fs';
import assert from 'node:assert/strict';

const capture=fs.readFileSync('checkout-resilience.js','utf8');
const storefront=fs.readFileSync('supabase/functions/storefront-v2/index.ts','utf8');
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
assert.match(capture,/Informações pessoais/,'checkout must visibly separate personal information');
assert.match(capture,/Dados da entrega/,'checkout must visibly separate delivery information');
assert.match(capture,/Data da entrega/,'checkout must visibly separate delivery date');
assert.match(capture,/Forma de pagamento/,'checkout must visibly separate payment');
assert.match(capture,/body\.whatsapp_phone=phone\.full/,'live phone must be injected in submit_order');
assert.match(capture,/url\.searchParams\.set\('action','customer_register'\)/,'capture layer must reuse canonical customer_register');
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

assert.match(storefront,/required_checkout_data/,'backend must reject orders without the operational checkout data');
assert.match(storefront,/registration_incomplete/,'backend must reject orders whose customer registration is incomplete');
assert.match(storefront,/payment_method/,'backend must validate payment before creating the order');
assert.match(storefront,/delivery_date/,'backend must validate delivery date before creating the order');

console.log('checkout required basic data contract: OK');
