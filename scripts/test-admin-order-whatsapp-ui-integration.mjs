import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin = fs.readFileSync('vitrine/admin/index.html', 'utf8');
const adminApi = fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts', 'utf8');
const orderTransport = fs.readFileSync('supabase/functions/admin-orders-v1/index.ts', 'utf8');

for (const copy of [
  'WhatsApp e cadastro',
  'Abrir pedido no WhatsApp da empresa',
  'Abrir WhatsApp do cliente',
  'Gerar link de cadastro',
  'Abrir WhatsApp do cliente com link de cadastro',
  'Copiar link de cadastro'
]) {
  assert.ok(admin.includes(copy), `admin UI missing: ${copy}`);
}

for (const fn of [
  'function orderWhatsappRegistrationHtml',
  'function renderCurrentOrderWhatsappStatus',
  'async function refreshCurrentOrderWhatsappRegistration',
  'async function sendCurrentOrderWhatsapp',
  'async function issueCurrentOrderRegistrationLink',
  'function currentOrderCompanyWhatsappMessage',
  'function openCurrentOrderCompanyWhatsapp',
  'function openCurrentOrderCustomerWhatsapp',
  'function openCurrentOrderRegistrationWhatsapp',
  'async function copyCurrentOrderRegistrationLink'
]) {
  assert.ok(admin.includes(fn), `admin UI missing handler: ${fn}`);
}

assert.ok(admin.includes('const COMPANY_WHATSAPP_E164="5565998150975"'), 'company WhatsApp target must be the operational 0975 number');
assert.ok(admin.includes("window.open('https://wa.me/'+COMPANY_WHATSAPP_E164+'?text='"), 'company action must use a direct WhatsApp deep link');
assert.ok(admin.includes("$('#sendOrderWhatsApp').onclick=openCurrentOrderCompanyWhatsapp"), 'company WhatsApp button must open the direct readable handoff');
assert.ok(!admin.includes("$('#sendOrderWhatsApp').onclick=sendCurrentOrderWhatsapp"), 'company WhatsApp button must not use the PapoAI template cross-send');
assert.ok(admin.includes("lines.push('📦 PRODUTOS')"), 'company WhatsApp text must contain a products section');
assert.ok(admin.includes("lines.push('• '+qty+'x '+name)"), 'company WhatsApp text must put every product on its own bullet line');
assert.ok(admin.includes("api('order_registration_link_issue'"), 'registration button must use existing order_registration_link_issue action');
assert.ok(admin.includes("api('order_registration_link_status'"), 'UI must refresh registration/send status');
assert.ok(admin.includes("orderWhatsappRegistrationHtml(o)+"), 'order editor must render WhatsApp/registration panel');
assert.ok(admin.includes("$('#issueOrderRegistrationLink').onclick=issueCurrentOrderRegistrationLink"), 'registration button must be bound');
assert.ok(admin.includes("activeLink=link?.state==='active'"), 'active registration link must block accidental replacement');
assert.ok(admin.includes('Envio do pedido aguardando configuração PapoAI'), 'provider-not-ready state must be visible');
assert.ok(!admin.includes("finally{if(document.contains(btn)){btn.disabled=false;btn.textContent='Enviar pedido para WhatsApp da empresa'}await refreshCurrentOrderWhatsappRegistration()}"), 'legacy PapoAI company-send lifecycle must not be reintroduced');
assert.ok(!admin.includes("finally{if(document.contains(btn)){btn.disabled=false;btn.textContent='Gerar link de cadastro'}}"), 'issue handler must not blindly re-enable an active registration link');
assert.ok(!admin.includes('/cadastro/?order_id='), 'public registration link must not expose order_id');

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
assert.ok(adminApi.includes('if(r.method===\"GET\"&&a===\"order_registration_link_status\")'), 'status action must be routed');
assert.ok(adminApi.includes('if(r.method===\"POST\"&&a===\"order_whatsapp_send\")'), 'send action must be routed');
assert.ok(adminApi.includes('if(r.method===\"POST\"&&a===\"order_registration_link_issue\")'), 'registration action must be routed');

assert.ok(orderTransport.includes('async function orderDetails'), 'order transport must load the complete persisted checkout order');
assert.ok(orderTransport.includes('.from("orders")'), 'order transport must load the order row');
assert.ok(orderTransport.includes('.from("order_items")'), 'order transport must load persisted order items');
assert.ok(orderTransport.includes('const productLines=lines.map(line=>`• ${line}`);'), 'visual products must carry a bullet marker');
assert.ok(orderTransport.includes('productLines.join("\\n")'), 'visual products must be one item per line');
assert.ok(orderTransport.includes('basketLines.join("\\n")'), 'multiple baskets must also remain one basket per line');
assert.ok(orderTransport.includes('const itemsText=lines.join(" • ")'), 'template-safe item text must remain single-line');
assert.ok(orderTransport.includes('const itemsTextLineSeparator=lines.join("\\u2028")'), 'experimental template text must use Unicode line separator instead of LF');
assert.ok(orderTransport.includes('items_text_line_separator:details.itemsTextLineSeparator'), 'provider payload must expose Unicode line-separated item text without changing items_text');
assert.ok(orderTransport.includes('const productSlots=Object.fromEntries(Array.from({length:60}'), 'transport must expose up to 60 individual product slots');
assert.ok(orderTransport.includes('`product_${String(index+1).padStart(2,"0")}`'), 'individual product slots must be named product_01...product_60');
assert.ok(orderTransport.includes('product_count:details.itemCount'), 'provider payload must expose product_count for template routing');
assert.ok(orderTransport.includes('...details.productSlots'), 'provider payload must expose individual product fields at top level');
for (const field of [
  'order_date',
  'order_number_short',
  'customer_status',
  'customer_name',
  'customer_phone_formatted',
  'address_label',
  'district_label',
  'city_label',
  'delivery_label',
  'basket_text',
  'products_text',
  'total_formatted',
  'payment_label'
]) {
  assert.ok(orderTransport.includes(`${field}:`), `provider payload must expose ${field}`);
}
assert.ok(orderTransport.includes('items_text:details.itemsText'), 'legacy template items_text must stay Meta-safe');
assert.ok(orderTransport.includes('order_items_not_ready'), 'checkout must retry instead of sending an incomplete order');
assert.ok(orderTransport.includes('scope==="checkout_auto"?"retry":"failed"'), 'checkout must retry when order items are not ready');

console.log('admin order WhatsApp UI + gateway + full storefront order contract: ok');
