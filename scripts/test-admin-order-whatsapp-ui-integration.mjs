import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const adminApi=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const orderTransport=fs.readFileSync('supabase/functions/admin-orders-v1/index.ts','utf8');
const vitrineGateway=fs.readFileSync('supabase/functions/admin-order-vitrine-send-v1/index.ts','utf8');

// Pedidos V3 has one customer handoff: send the public order vitrine from inside the opened order.
assert.ok(admin.includes('async function sendOrderCustomerVitrineV3'),'opened order must expose the canonical customer vitrine handoff');
assert.ok(admin.includes('admin-order-vitrine-send-v1'),'customer vitrine must use the authenticated server gateway');
assert.ok(admin.includes('VITRINE CLIENTE'),'customer vitrine action must remain in the opened order');

// Removed UI must really be gone rather than hidden/dead behind the new screen.
for(const legacy of [
  'WhatsApp e cadastro',
  'Enviar pedido:',
  'Gerar link de cadastro',
  'Abrir WhatsApp do cliente com link de cadastro',
  'function orderWhatsappRegistrationHtml',
  'function renderCurrentOrderWhatsappStatus',
  'async function refreshCurrentOrderWhatsappRegistration',
  'async function sendCurrentOrderWhatsapp',
  'async function issueCurrentOrderRegistrationLink',
  'function openCurrentOrderCompanyWhatsapp',
  'function openCurrentOrderCustomerWhatsapp',
  'function openCurrentOrderRegistrationWhatsapp',
  'async function copyCurrentOrderRegistrationLink'
]) assert.ok(!admin.includes(legacy),`legacy/dead order WhatsApp UI must be removed: ${legacy}`);

// The gateway must resolve only the two official channels and reuse the canonical Attendance transport.
assert.ok(vitrineGateway.includes('5565998150975'),'gateway must explicitly allow official 0975');
assert.ok(vitrineGateway.includes('5565984491018'),'gateway must explicitly allow official 1018');
assert.ok(vitrineGateway.includes('conversation_id'),'gateway must prefer the canonical conversation');
assert.ok(vitrineGateway.includes('whatsapp_account_id'),'gateway must preserve the canonical channel');
assert.ok(vitrineGateway.includes('admin-whatsapp-ops-v1'),'gateway must reuse Attendance outbound transport');
assert.ok(vitrineGateway.includes('action=send_text'),'gateway must send through the canonical text action');
assert.ok(!vitrineGateway.includes('META_WHATSAPP_ACCESS_TOKEN'),'gateway must not duplicate Meta credentials');

// Checkout/order confirmation transport remains protected; Pedidos V3 does not rewrite it.
for(const fn of [
  'async function orderWhatsappGatewayReadiness',
  'async function dispatchOrderWhatsapp',
  'async function orderWhatsappSend'
]) assert.ok(adminApi.includes(fn),`admin backend missing preserved transport handler: ${fn}`);
assert.ok(adminApi.includes('/functions/v1/admin-orders-v1'),'admin backend must reuse admin-orders-v1 checkout transport');
assert.ok(adminApi.includes('ops2_enqueue_admin_order_whatsapp_v1'),'checkout order send must remain idempotently queued');
assert.ok(adminApi.includes('order_whatsapp_provider_not_configured'),'checkout transport must fail closed when provider is unavailable');

assert.ok(orderTransport.includes('async function orderDetails'),'order transport must load persisted order details');
assert.ok(orderTransport.includes('.from("orders")'),'order transport must load the order row');
assert.ok(orderTransport.includes('.from("order_items")'),'order transport must load persisted items');
assert.ok(orderTransport.includes('productLines.join("\\n")'),'provider products must remain one per line');
assert.ok(orderTransport.includes('basketLines.join("\\n")'),'basket lines must remain one per line');
assert.ok(orderTransport.includes('phone_e164:item.phone_e164'),'provider must target the queued customer phone');
assert.ok(orderTransport.includes('recipient_kind:item.recipient_kind'),'provider must preserve recipient kind');
assert.ok(orderTransport.includes('function providerFailureIsTransient'),'provider failures must remain classified');
assert.ok(orderTransport.includes('scope==="checkout_auto"?2:1'),'automatic checkout sends keep immediate retry');
assert.ok(orderTransport.includes('order_items_not_ready'),'checkout must not send an incomplete order');

console.log('orders v3 customer vitrine + preserved checkout WhatsApp transport contract: ok');
