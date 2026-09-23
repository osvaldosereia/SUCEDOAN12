import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8');
const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');

for(const id of ['orderDeliveryName','orderDeliveryPhone','orderDeliveryPostalCode','orderDeliveryStreet','orderDeliveryNumber','orderDeliveryDistrict','orderDeliveryComplement','orderDeliveryCity','orderDeliveryState','orderDeliveryRawText']){
  assert.match(html,new RegExp('id="'+id+'"'));
}
assert.match(html,/Estas alterações valem para este pedido/);
assert.match(html,/payload\.delivery_address=/);
assert.match(html,/function applySelectedCustomerToDelivery\(\)/);
assert.match(html,/orderCustomer'\)\.onchange=applySelectedCustomerToDelivery/);
assert.match(html,/Dados de entrega preenchidos pelo cliente selecionado/);
assert.match(html,/const a=snapshot\|\|c\?\.address\|\|\{\}/);
assert.match(html,/a=o\.delivery_address_snapshot\|\|c\.address\|\|\{\}/);
assert.match(fn,/if\(payload\?\.delivery_address !== undefined\)/);
assert.match(fn,/Object\.prototype\.hasOwnProperty\.call\(patch,"delivery_address_snapshot"\)/);
assert.match(fn,/source_customer_id/);
assert.match(fn,/country_code:previous\.country_code\|\|"BR"/);

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
for(const source of scripts)new Function(source);

console.log('OK · edição de entrega por pedido');
