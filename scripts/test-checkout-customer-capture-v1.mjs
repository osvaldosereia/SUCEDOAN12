import fs from 'node:fs';
import assert from 'node:assert/strict';

const capture=fs.readFileSync('checkout-resilience.js','utf8');
for(const page of ['index.html','vitrine/index.html']){
  const html=fs.readFileSync(page,'utf8');
  assert.match(html,/checkout-resilience\.js/,`${page}: resilience layer must remain loaded`);
}
assert.match(capture,/function liveCheckoutPhone\(/,'finalization must read the live WhatsApp fields');
assert.match(capture,/function checkoutRegistrationDraft\(/,'finalization must capture the live registration fields');
assert.match(capture,/persistRegistrationBeforeOrder\(/,'complete registration must be persisted automatically before the order');
assert.match(capture,/body\.whatsapp_phone=phone\.full/,'live phone must be injected in submit_order');
assert.match(capture,/url\.searchParams\.set\('action','customer_register'\)/,'capture layer must reuse canonical customer_register');
for(const field of ['checkoutName','checkoutDocument','checkoutStreet','checkoutNumber','checkoutNeighborhood','checkoutCity','checkoutPostal','checkoutComplement','checkoutReference']){
  assert.ok(capture.includes(field),`capture layer missing ${field}`);
}
assert.match(capture,/registrationDraftComplete/,'partial optional fields must not block checkout');
console.log('checkout customer capture contract: OK');
