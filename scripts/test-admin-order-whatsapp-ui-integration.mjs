import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin = fs.readFileSync('vitrine/admin/index.html', 'utf8');
const adminApi = fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts', 'utf8');
const orderTransport = fs.readFileSync('supabase/functions/admin-orders-v1/index.ts', 'utf8');

for (const copy of [
  'WhatsApp e cadastro',
  'Enviar pedido:',
  'Cliente',
  '65 99815-0975',
  '65 99688-4599',
  'Gerar link de cadastro',
  'Abrir WhatsApp do cliente com link de cadastro',
  'Copiar link de cadastro'
]) {
  assert.ok(admin.includes(copy), `admin UI missing: ${copy}`);
}

for (const fn of [
  'function orderWhatsappRegistrationHtml',
  'function renderCurrentOrderWhatsappStatus',
  'function customerWhatsappDeliveryLabel',
  'function customerWhatsappAcceptedIsStale',
  'async function refreshCurrentOrderWhatsappRegistration',
  'async function sendCurrentOrderWhatsapp',
  'async function issueCurrentOrderRegistrationLink',
  'function appendCurrentOrderWhatsappItems',
  'function currentOrderCompanyWhatsappMessage',
  'function openNativeWhatsapp',
  'function openCurrentOrderCompanyWhatsapp',
  'function currentOrderCustomerWhatsappMessage',
  'function openCurrentOrderCustomerWhatsapp',
  'function openCurrentOrderRegistrationWhatsapp',
  'async function copyCurrentOrderRegistrationLink'
]) {
  assert.ok(admin.includes(fn), `admin UI missing handler: ${fn}`);
}

assert.ok(admin.includes('const COMPANY_WHATSAPP_E164="5565998150975"'), 'company WhatsApp target must remain 65 99815-0975');
assert.ok(admin.includes('const ORDER_WHATSAPP_4599_E164="5565996884599"'), 'secondary order WhatsApp target must be 65 99688-4599');
assert.ok(admin.includes("openNativeWhatsapp(ORDER_WHATSAPP_4599_E164,currentOrderCompanyWhatsappMessage())"), '4599 button must use the same complete order message');
assert.ok(admin.includes("const url='whatsapp://send?phone='+encodeURIComponent(phone)+'&text='+encodeURIComponent(message)"), 'admin WhatsApp actions must use the native WhatsApp protocol');
assert.ok(admin.includes("$('#sendOrderWhatsApp').onclick=openCurrentOrderCompanyWhatsapp"), 'company WhatsApp button must stay separate from checkout transport');
assert.ok(!admin.includes("$('#sendOrderWhatsApp').onclick=sendCurrentOrderWhatsapp"), 'company WhatsApp button must not use automatic checkout/PapoAI transport');
assert.ok(admin.includes("openNativeWhatsapp(COMPANY_WHATSAPP_E164,currentOrderCompanyWhatsappMessage())"), 'company button must target only the company number');
assert.ok(admin.includes("phoneDigits(o.phone_e164||o.whatsapp_phone_e164"), 'customer admin action must resolve the canonical order phone first');
assert.ok(admin.includes("openNativeWhatsapp(phone,currentOrderCustomerWhatsappMessage())"), 'customer admin button must target the customer phone');

const companyStart=admin.indexOf('function currentOrderCompanyWhatsappMessage');
const companyEnd=admin.indexOf('function openCurrentOrderCompanyWhatsapp',companyStart);
assert.ok(companyStart>=0&&companyEnd>companyStart,'company formatter block must exist');
const companyBlock=admin.slice(companyStart,companyEnd);
assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(companyBlock),'company order text must not include emoji that can become replacement characters');
assert.ok(!companyBlock.includes("'• '"),'company order text must not depend on Unicode bullet characters');
assert.ok(admin.includes("lines.push('- '+qty+'x '+name)"), 'every top-level item must use a plain ASCII dash');
assert.ok(admin.includes("const components=Array.isArray(item?.components)?item.components:[]"), 'basket item must expose its persisted components');
assert.ok(admin.includes("lines.push('  Itens da cesta:')"), 'basket identification must be followed by its components');
assert.ok(admin.includes("lines.push('  - '+componentQty+'x '+componentName)"), 'basket components must be one per line with their actual quantity');
assert.ok(admin.includes("api('order_registration_link_issue'"), 'registration button must use existing order_registration_link_issue action');
assert.ok(admin.includes("api('order_registration_link_status'"), 'UI must refresh registration/send status');
assert.ok(admin.includes("orderWhatsappRegistrationHtml(o)+"), 'order editor must render WhatsApp/registration panel');
assert.ok(admin.includes("$('#issueOrderRegistrationLink').onclick=issueCurrentOrderRegistrationLink"), 'registration button must be bound');
assert.ok(admin.includes("activeLink=link?.state==='active'"), 'active registration link must block accidental replacement');
assert.ok(admin.includes('Envio do pedido aguardando configuração PapoAI'), 'provider-not-ready state must be visible');
assert.ok(!admin.includes('/cadastro/?order_id='), 'public registration link must not expose order_id');

// HTTP/provider acceptance is not delivery. The Admin must only call a confirmed wamid-backed row sent.
assert.ok(admin.includes('PapoAI aceitou · aguardando confirmação da Meta'), 'accepted must be shown as queued/awaiting Meta, never sent');
assert.ok(admin.includes('Enviado confirmado pelo WhatsApp'), 'sent must be shown as confirmed delivery handoff');
assert.ok(admin.includes('Sem confirmação da Meta há mais de 15 min · revisar no PapoAI'), 'stale accepted must show an operational warning');
assert.ok(admin.includes('15*60*1000'), 'stale accepted threshold must be 15 minutes');
assert.ok(admin.includes('customer.updated_at'), 'accepted age must use the persisted outbox timestamp');
assert.ok(!admin.includes("'Empresa 0975: '+(ops.status==='sent'?'enviada':ops.status)"), 'native company handoff must not be presented as a PapoAI-tracked send');
assert.ok(admin.includes('Empresa: envio manual pelo WhatsApp (não rastreado pelo PapoAI)'), 'company native handoff limitation must be explicit');

for (const action of ['order_whatsapp_send','order_registration_link_issue','order_registration_link_status']) {
  assert.ok(adminApi.includes(`\"${action}\"`), `admin backend missing action: ${action}`);
}
for (const fn of [
  'async function orderWhatsappGatewayReadiness',
  'async function orderWhatsappRegistrationStatus',
  'async function dispatchOrderWhatsapp',
  'async function orderWhatsappSend',
  'async function orderRegistrationLinkIssue'
]) {
  assert.ok(adminApi.includes(fn), `admin backend missing handler: ${fn}`);
}
assert.ok(adminApi.includes('/functions/v1/admin-orders-v1'), 'admin backend must reuse current admin-orders-v1 transport');
assert.ok(adminApi.includes('ops2_enqueue_admin_order_whatsapp_v1'), 'admin backend must enqueue the order idempotently');
assert.ok(adminApi.includes('ops2_issue_order_registration_link_v1'), 'admin backend must issue a token-bound registration link');
assert.ok(adminApi.includes('order_whatsapp_provider_not_configured'), 'admin backend must fail closed if PapoAI provider is not ready');
assert.ok(adminApi.includes('updated_at'), 'admin status backend must expose outbox updated_at for stale accepted detection');

assert.ok(orderTransport.includes('async function orderDetails'), 'order transport must load the complete persisted checkout order');
assert.ok(orderTransport.includes('.from("orders")'), 'order transport must load the order row');
assert.ok(orderTransport.includes('.from("order_items")'), 'order transport must load persisted order items');
assert.ok(orderTransport.includes('const productLines=lines.map(line=>`• ${line}`);'), 'provider visual products may keep their existing template bullet marker');
assert.ok(orderTransport.includes('productLines.join("\\n")'), 'provider products must be one item per line');
assert.ok(orderTransport.includes('basketLines.join("\\n")'), 'multiple baskets must remain one basket per line');
assert.ok(orderTransport.includes('const itemsText=lines.join(" • ")'), 'template-safe item text must remain single-line');
assert.ok(orderTransport.includes('const itemsTextLineSeparator=lines.join("\\u2028")'), 'template text must preserve the existing Unicode line-separator contract');
assert.ok(orderTransport.includes('phone_e164:item.phone_e164'), 'checkout provider payload must target the customer phone from the outbox item');
assert.ok(orderTransport.includes('recipient_kind:item.recipient_kind'), 'checkout recipient kind must remain the queued customer recipient');
assert.ok(orderTransport.includes('function providerFailureIsTransient'), 'transport must classify transient provider failures');
assert.ok(orderTransport.includes('const providerAttempts=scope==="checkout_auto"?2:1'), 'only automatic checkout sends should get the immediate provider retry');
assert.ok(orderTransport.includes('providerAttempt<providerAttempts'), 'transport must actually retry before finishing the outbox row');
assert.ok(orderTransport.includes('scope==="checkout_auto"&&transient'), 'transient checkout exhaustion must remain retryable instead of being permanently failed');
assert.ok(orderTransport.includes('order_items_not_ready'), 'checkout must retry instead of sending an incomplete order');
assert.ok(orderTransport.includes('scope==="checkout_auto"?"retry":"failed"'), 'checkout must preserve its retry behavior when order items are not ready');

for (const field of [
  'order_date','order_number_short','customer_status','customer_name','customer_phone_formatted',
  'address_label','district_label','city_label','delivery_label','basket_text','products_text',
  'total_formatted','payment_label'
]) {
  assert.ok(orderTransport.includes(`${field}:`), `provider payload must expose ${field}`);
}
assert.ok(orderTransport.includes('items_text:details.itemsText'), 'legacy template items_text must stay Meta-safe');

console.log('admin native company/customer handoff + accurate WhatsApp delivery state contract: ok');
