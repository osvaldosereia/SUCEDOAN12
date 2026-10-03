import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin = fs.readFileSync('vitrine/admin/index.html', 'utf8');

for (const copy of [
  'Enviar pedido:',
  'Cliente',
  '65 99815-0975',
  '65 99688-4599',
  'Abrir WhatsApp do cliente com link de cadastro',
  'Copiar link de cadastro',
  'Nenhuma falta de estoque foi encontrada neste momento'
]) {
  assert.ok(admin.includes(copy), `admin expedition UI missing: ${copy}`);
}

assert.ok(admin.includes('x.required??x.requested??0'), 'stock shortage detail must use backend required quantity');
assert.ok(admin.includes('function openCurrentOrderCustomerWhatsapp'), 'customer WhatsApp action must exist');
assert.ok(admin.includes('function currentOrderCustomerWhatsappMessage'), 'customer WhatsApp summary must exist');
assert.ok(admin.includes("$('#openOrderCustomerWhatsApp')"), 'customer WhatsApp button must be bound');
assert.ok(admin.includes("btn.textContent=idle"), 'company WhatsApp button must restore its idle label');
assert.ok(admin.includes("display:none!important;margin-top:10px"), 'registration-link actions must start hidden');
assert.ok(admin.includes("box.style.setProperty('display','block','important')"), 'registration-link actions must only show after a link exists');
assert.ok(admin.includes("linkActions.style.setProperty('display','none','important')"), 'registration-link actions must hide again after registration completes');

console.log('admin expedition stock + WhatsApp UX contract: ok');
