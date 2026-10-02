import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin = fs.readFileSync('vitrine/admin/index.html', 'utf8');
const adminApi = fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts', 'utf8');
const orderTransport = fs.readFileSync('supabase/functions/admin-orders-v1/index.ts', 'utf8');

for (const copy of [
  'WhatsApp e cadastro',
  'Enviar pedido no WhatsApp',
  'Gerar link de cadastro',
  'Abrir WhatsApp com link',
  'Copiar link'
]) {
  assert.ok(admin.includes(copy), `admin UI missing: ${copy}`);
}

for (const fn of [
  'function orderWhatsappRegistrationHtml',
  'function renderCurrentOrderWhatsappStatus',
  'async function refreshCurrentOrderWhatsappRegistration',
  'async function sendCurrentOrderWhatsapp',
  'async function issueCurrentOrderRegistrationLink',
  'function openCurrentOrderRegistrationWhatsapp',
  'async function copyCurrentOrderRegistrationLink'
]) {
  assert.ok(admin.includes(fn), `admin UI missing handler: ${fn}`);
}

assert.ok(admin.includes("api('order_whatsapp_send'"), 'send button must use existing order_whatsapp_send action');
assert.ok(admin.includes("api('order_registration_link_issue'"), 'registration button must use existing order_registration_link_issue action');
assert.ok(admin.includes("api('order_registration_link_status'"), 'UI must refresh registration/send status');
assert.ok(admin.includes("orderWhatsappRegistrationHtml(o)+"), 'order editor must render WhatsApp/registration panel');
assert.ok(admin.includes("$('#sendOrderWhatsApp').onclick=sendCurrentOrderWhatsapp"), 'send button must be bound');
assert.ok(admin.includes("$('#issueOrderRegistrationLink').onclick=issueCurrentOrderRegistrationLink"), 'registration button must be bound');
assert.ok(admin.includes("activeLink=link?.state==='active'"), 'active registration link must block accidental replacement');
assert.ok(admin.includes('Envio do pedido aguardando configuração PapoAI'), 'provider-not-ready state must be visible');
assert.ok(!admin.includes("finally{if(document.contains(btn)){btn.disabled=false;btn.textContent='Enviar pedido no WhatsApp'}await refreshCurrentOrderWhatsappRegistration()}"), 'send handler must stay disabled until readiness refresh decides it is safe');
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

assert.ok(orderTransport.includes('async function orderItemsSummary'), 'order transport must build a complete item summary');
assert.ok(orderTransport.includes('.from("order_items")'), 'order transport must load the persisted order items');
assert.ok(orderTransport.includes('items_count:items.count'), 'provider payload must expose items_count');
assert.ok(orderTransport.includes('items_text:items.text'), 'provider payload must expose items_text');
assert.ok(orderTransport.includes('order_items_not_ready'), 'checkout must fail closed/retry instead of sending an incomplete order');
assert.ok(orderTransport.includes('scope==="checkout_auto"?"retry":"failed"'), 'checkout must retry when order items are not ready');

console.log('admin order WhatsApp UI + gateway + full-order payload contract: ok');
