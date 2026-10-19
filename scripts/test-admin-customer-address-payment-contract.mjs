import fs from 'node:fs';
import assert from 'node:assert/strict';

const admin=fs.readFileSync('vitrine/admin/admin-runtime.js','utf8');
const manualSource=fs.readFileSync('vitrine/admin/orders/manual-sale.js','utf8');
const customerSource=fs.readFileSync('vitrine/admin/customers/controller.js','utf8');
const backend=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
function section(source,begin,end){
  const start=source.indexOf(begin);
  assert.ok(start>=0,'missing '+begin);
  const stop=source.indexOf(end,start+begin.length);
  assert.ok(stop>start,'missing end for '+begin);
  return source.slice(start,stop);
}
const manual=section(manualSource,'  async function createManualSale(){','\n    return Object.freeze(');
const customer=section(customerSource,'  async function saveCustomer(','\n    return Object.freeze(');
const editOrder=fs.readFileSync('vitrine/admin/orders/detail-controller.js','utf8');
const customerForm=section(customerSource,'  function openCustomerEditor(','\n  async function deleteCustomer(');
const backendUpdate=section(backend,'async function updateOrderCanonical(','\nasync function ');
const backendManual=section(backend,'async function createManualWhatsappOrder(','\nasync function ');
for(const key of ['display_name','phone','cpf','email','birthday_day','birthday_month','postal_code','street','number','district','complement','city','state','raw_text']){
  assert.ok(customer.includes("f.get('"+key+"')"),'customer save field missing: '+key);
}
for(const key of ['display_name','phone','cpf','email','postal_code','street','number','city','state']){
  assert.ok(customerForm.includes('name=\\"'+key+'\\"')||customerForm.includes('name="'+key+'"'),'customer editor field missing: '+key);
}
// Shared delivery reader and canonical save are exercised behaviorally as well.
for(const key of ['Name','Phone','PostalCode','Street','Number','District','Complement','City','State','RawText']){
  assert.ok(editOrder.includes("field('"+key+"')"),'order delivery field missing: '+key);
}
assert.match(editOrder,/payment_method:\$\('#orderPayment'\)/);
assert.match(editOrder,/delivery_address:readDeliveryAddress\(\$\)/);
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
