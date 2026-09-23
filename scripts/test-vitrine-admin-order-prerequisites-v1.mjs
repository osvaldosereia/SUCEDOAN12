import fs from 'node:fs';
import assert from 'node:assert/strict';

const fn=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const html=fs.readFileSync('vitrine/admin/index.html','utf8');

assert.match(fn,/function orderOperationalDataBlockers\(delivery:any,payment:any\)/);
for(const blocker of ['customer_required','delivery_street_required','delivery_number_required','delivery_city_required','delivery_state_required','payment_method_required']){
  assert.match(fn,new RegExp(blocker));
}
assert.match(fn,/requestedStatus&&\["confirmed","processing","ready","out_for_delivery","delivered"\]\.includes\(requestedStatus\)/);
assert.match(fn,/order_operational_data_incomplete/);
assert.match(fn,/Object\.prototype\.hasOwnProperty\.call\(patch,"delivery_address_snapshot"\)/);
assert.match(html,/Complete cliente, endereço e pagamento antes de avançar/);

console.log('OK · pré-requisitos operacionais protegidos no backend');
