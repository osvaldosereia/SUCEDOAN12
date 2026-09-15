import {existsSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const config=readFileSync('comprar/config.js','utf8');
const html=readFileSync('comprar/index.html','utf8');
const js=readFileSync('comprar/chat-light-v2.js','utf8');
const addon=readFileSync('comprar/chat-checkout-quantity-v1.js','utf8');
const router=readFileSync('comprar/checkout-api-router-v2.js','utf8');
const customerEdge=readFileSync('supabase/functions/shopping-chat-customer-v1/index.ts','utf8');
const checkoutEdgePath='supabase/functions/shopping-chat-checkout-v2/index.ts';
const adminEdge=readFileSync('supabase/functions/shopping-chat-admin-test-v1/index.ts','utf8');
const migrationPath='supabase/migrations/20260914223000_shopping_chat_checkout_payment_methods_v2.sql';

assert.ok(existsSync(checkoutEdgePath),'isolated checkout edge must exist');
assert.ok(existsSync(migrationPath),'payment migration must exist');
const checkoutEdge=readFileSync(checkoutEdgePath,'utf8');
const migration=readFileSync(migrationPath,'utf8');

assert.match(config,/checkoutApi:\s*'[^']*shopping-chat-checkout-v2'/,'config must expose the isolated checkout endpoint');
assert.match(config,/whatsappFallback:'https:\/\/wa\.me\/5565998150975'/,'checkout must use the official 99815-0975 WhatsApp');
assert.doesNotMatch(config,/556584491018/,'old WhatsApp fallback must not remain in Comprar config');
assert.match(customerEdge,/WA_NUMBER='5565998150975'/,'identity proof must use the official WhatsApp');
assert.match(html,/checkout-api-router-v2\.js/,'checkout router must load on the public page');
assert.ok(html.indexOf('checkout-api-router-v2.js')<html.indexOf('chat-checkout-quantity-v1.js'),'router must load before the addon captures fetch');
assert.match(router,/action!==['"]set_payment['"]/,'router must isolate payment writes');
assert.match(router,/action!==['"]confirm_order['"]/,'router must isolate order confirmation');
assert.match(router,/previousFetch\(C\.checkoutApi,init\)/,'router must send checkout writes to the isolated edge');

assert.match(js,/Este endereço continua correto\?/,'saved address must be explicitly confirmed');
assert.match(js,/Quero usar outro endereço/,'customer must be able to choose another address');
assert.match(js,/Forma de pagamento confirmada:/,'selected payment must be visibly confirmed');
assert.match(js,/Revise antes de confirmar/,'checkout must show a final review');
assert.match(js,/Entrega:/,'final review must show delivery address');
assert.match(js,/Pagamento:/,'final review must show payment method');
assert.match(js,/confirm\.disabled=!?\(/,'confirm button must be state-controlled');
assert.match(addon,/Confirmar pelo WhatsApp/,'existing customer identity must still be confirmed through WhatsApp');

const codes=['pix','cash','debit_card','credit_card','food_card','meal_card'];
for(const code of codes){
  assert.ok(js.includes(`'${code}'`),`checkout UI must expose ${code}`);
  assert.ok(checkoutEdge.includes(`'${code}'`),`checkout edge must accept ${code}`);
  assert.ok(adminEdge.includes(`'${code}'`),`admin test edge must accept ${code}`);
  assert.ok(migration.includes(`'${code}'`),`orders constraint must accept ${code}`);
}
for(const label of ['PIX','Dinheiro','Cartão de débito','Cartão de crédito','Vale-alimentação','Vale-refeição'])assert.ok(js.includes(label),`checkout must show ${label}`);

assert.match(checkoutEdge,/room_confirm_order/,'isolated edge must use the canonical order confirmation RPC');
assert.match(checkoutEdge,/payment_method:method/,'isolated edge must persist the chosen payment method');
assert.match(checkoutEdge,/ORIGINS/,'isolated public edge must enforce allowed origins');
assert.match(checkoutEdge,/tokenOk/,'isolated public edge must validate the room token');

console.log('checkout_address_payment_v2_ok');
