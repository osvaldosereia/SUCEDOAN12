import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const modulePath='vitrine/admin/orders/customer-readiness.js';
const context={window:{}};
vm.runInNewContext(fs.readFileSync(modulePath,'utf8'),context,{filename:modulePath});
const factory=context.window.DonaAntoniaAdminCustomerReadiness;
assert.ok(factory,'customer readiness module is registered');
const normalize=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const {orderCustomerDataPendingReasons,isOrderCustomerDataPending}=factory.create(normalize);
assert.deepEqual(JSON.parse(JSON.stringify(orderCustomerDataPendingReasons(null))),[
  'Cliente não identificado','Telefone pendente','Endereço incompleto'
]);
assert.deepEqual(JSON.parse(JSON.stringify(orderCustomerDataPendingReasons({
  customer_id:'customer-1',whatsapp_phone_e164:'+55 65 99999-0000',
  delivery_address_snapshot:{street:'Rua A',number:'10',city:'Cuiabá',state:'MT'}
}))),[]);
assert.deepEqual(JSON.parse(JSON.stringify(orderCustomerDataPendingReasons({
  customer_id:'customer-1',whatsapp_phone_e164:'65999990000',
  delivery_address_snapshot:{street:'Rua A',number:'10',city:'Cuiabá',state:'MT'},
  registration_missing_fields:['CPF pendente','documento ausente']
}))),['CPF/CNPJ pendente']);
assert.equal(isOrderCustomerDataPending({customer_id:'c',whatsapp_phone_e164:'65',delivery_address_snapshot:{street:'Rua A',number:'1',city:'Cuiabá',state:'MT'}}),false);
assert.ok(Object.isFrozen(factory));
console.log('Admin customer readiness model contract: PASS');
