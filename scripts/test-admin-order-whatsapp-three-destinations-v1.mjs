import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/index.html','utf8');
const panelStart=admin.indexOf('function orderWhatsappRegistrationHtml');
const panelEnd=admin.indexOf('function customerWhatsappAcceptedIsStale',panelStart);
assert.ok(panelStart>=0&&panelEnd>panelStart,'WhatsApp panel must exist');
const panel=admin.slice(panelStart,panelEnd);

for(const copy of ['Enviar pedido:','Cliente','65 99815-0975','65 99688-4599']){
  assert.ok(panel.includes(copy),`missing order send control: ${copy}`);
}
assert.ok(panel.includes('id="openOrderCustomerWhatsApp"'),'customer send button must remain available');
assert.ok(panel.includes('id="sendOrderWhatsApp"'),'0975 send button must exist');
assert.ok(panel.includes('id="sendOrderWhatsApp4599"'),'4599 send button must exist');
assert.equal(panel.includes('65 98449-1018'),false,'1018 must not be added to this three-button group');
assert.equal(panel.includes('>Abrir pedido no WhatsApp da empresa</button>'),false,'old company button label must be removed');
assert.equal(panel.includes('>Abrir WhatsApp do cliente</button>'),false,'old customer order button label must be removed');

assert.ok(admin.includes('const COMPANY_WHATSAPP_E164="5565998150975"'),'0975 target must remain exact');
assert.ok(admin.includes('const ORDER_WHATSAPP_4599_E164="5565996884599"'),'4599 target must be exact');
assert.ok(admin.includes('function openCurrentOrder4599Whatsapp'),'4599 handler must exist');
assert.ok(admin.includes('openNativeWhatsapp(ORDER_WHATSAPP_4599_E164,currentOrderCompanyWhatsappMessage())'),'4599 must open native WhatsApp with order message');
assert.ok(admin.includes("$('#sendOrderWhatsApp4599').onclick=openCurrentOrder4599Whatsapp"),'4599 button must be bound');

const companyStart=admin.indexOf('function currentOrderCompanyWhatsappMessage');
const companyEnd=admin.indexOf('function openNativeWhatsapp',companyStart);
const customerStart=admin.indexOf('function currentOrderCustomerWhatsappMessage');
const customerEnd=admin.indexOf('function openCurrentOrderCustomerWhatsapp',customerStart);
const company=admin.slice(companyStart,companyEnd);
const customer=admin.slice(customerStart,customerEnd);
for(const [name,block] of [['company',company],['customer',customer]]){
  for(const field of ['Pedido: #','Cliente: ','Endereço: ','Telefone: ']){
    assert.ok(block.includes(field),`${name} message missing ${field}`);
  }
}
assert.ok(company.includes('Conferir pedido completo:'),'fixed-number message must contain the order storefront link');
assert.ok(customer.includes('Confira produtos, fotos, quantidades e entrega:'),'customer message must contain the order storefront link');
assert.ok(admin.includes('function currentOrderWhatsappShareData'),'shared order/customer/address data formatter must exist');
assert.ok(admin.includes("const a=(o.delivery_address_snapshot&&typeof o.delivery_address_snapshot==='object'?o.delivery_address_snapshot"),'message must prioritize the persisted delivery address snapshot');
assert.ok(admin.includes("$('#orderDeliveryStreet')?.value"),'message must use the address currently visible in the editor when present');

console.log('OK · three order WhatsApp destinations + complete order message contract');
