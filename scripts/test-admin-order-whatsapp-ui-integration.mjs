import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin = fs.readFileSync('vitrine/admin/index.html', 'utf8');

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
assert.ok(!admin.includes('/cadastro/?order_id='), 'public registration link must not expose order_id');

console.log('admin order WhatsApp UI integration contract: ok');
