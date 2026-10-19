import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/admin-runtime.js','utf8');
const backend=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
function section(source,begin,end){
  const start=source.indexOf(begin);
  assert.ok(start>=0,'missing '+begin);
  const stop=source.indexOf(end,start+begin.length);
  assert.ok(stop>start,'missing end for '+begin);
  return source.slice(start,stop);
}
const manual=section(admin,'  async function createManualSale(){','\n  const ORDER_SEPARATORS=');
const customer=section(admin,'  async function saveCustomer(','\n\n  function manualSaleTotalCents');
const editOrder=section(admin,'  async function saveOrderV3(){','\n  function paintOrderDetail');
const customerForm=section(admin,'  function openCustomerEditor(','\n  async function deleteCustomer(');
const backendUpdate=section(backend,'async function updateOrderCanonical(','\nasync function ');
const backendManual=section(backend,'async function createManualWhatsappOrder(','\nasync function ');
for(const key of ['display_name','phone','cpf','email','birthday_day','birthday_month','postal_code','street','number','district','complement','city','state','raw_text']){
  assert.ok(customer.includes("f.get('"+key+"')"),'customer save field missing: '+key);
}
for(const key of ['display_name','phone','cpf','email','postal_code','street','number','city','state']){
  assert.ok(customerForm.includes('name=\\"'+key+'\\"')||customerForm.includes('name="'+key+'"'),'customer editor field missing: '+key);
}
for(const key of ['orderPayment','orderDeliveryName','orderDeliveryPhone','orderDeliveryPostalCode','orderDeliveryStreet','orderDeliveryNumber','orderDeliveryDistrict','orderDeliveryComplement','orderDeliveryCity','orderDeliveryState','orderDeliveryRawText']){
  assert.ok(editOrder.includes("'#"+key+"'"),'order edit field missing: '+key);
}
assert.match(editOrder,/api\('order_update'/);
assert.match(editOrder,/method:'POST'/);
assert.match(manual,/customer_snapshot/);
assert.match(manual,/payment_method:payment/);
assert.match(manual,/delivery:\{\}/);
assert.match(backendManual,/p_customer_snapshot:snapshot/);
assert.match(backendManual,/p_payment_method:payment/);
assert.match(backendUpdate,/patch\.payment_method=tx\(p\.payment_method,80\)/);
assert.match(backendUpdate,/patch\.delivery_address=/);
assert.match(backendUpdate,/customer_required/);
assert.match(backendUpdate,/delivery_street_required/);
assert.match(backendUpdate,/delivery_number_required/);
assert.match(backendUpdate,/delivery_city_required/);
assert.match(backendUpdate,/delivery_state_required/);
assert.match(backendUpdate,/payment_method_required/);
assert.match(backendUpdate,/order_operational_data_incomplete/);
assert.match(backendUpdate,/transitionAllowed\(cur,next\)/);
assert.match(backendUpdate,/admin_order_stock_transition_atomic_v1/);
assert.match(backendUpdate,/p_patch:atomicPatch/);
console.log('Admin customer, address and payment contracts: PASS');
