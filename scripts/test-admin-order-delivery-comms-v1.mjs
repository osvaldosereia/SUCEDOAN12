import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('supabase/functions/admin-order-delivery-comms-v1/index.ts','utf8');
assert.match(source,/if\(o\.status!==\"delivered\"\)/,'follow-up only runs after the order is delivered');
assert.match(source,/Deu tudo certo com o pedido e a entrega\?/,'delivered message asks about order and delivery');
assert.match(source,/responda aqui para nossa equipe ajudar/,'customer can report a problem in the existing conversation');
assert.match(source,/idempotency_key:`order-delivered:\$\{orderId\}`/,'delivery message remains idempotent');
assert.match(source,/admin-whatsapp-weekly-consent-v1/,'existing marketing eligibility request remains intact');
console.log('post-delivery experience follow-up contract: ok');
