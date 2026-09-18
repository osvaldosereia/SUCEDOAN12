import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration=fs.readFileSync('supabase/migrations/20260918024500_customer_commercial_segments_v1.sql','utf8');
const admin=fs.readFileSync('supabase/functions/admin-core-v1/index.ts','utf8');
const customerEdge=fs.readFileSync('supabase/functions/shopping-chat-customer-v1/index.ts','utf8');
const adminUi=fs.readFileSync('admin/app.js','utf8');
const personalized=fs.readFileSync('comprar/personalized-start-v1.js','utf8');

for(const segment of [
  'primeiro_comprador','recorrente','mensal','inativo','alto_valor',
  'comprador_cesta','produtos_avulsos','cesta_favorita','proximo_recompra'
]){
  assert.match(migration,new RegExp(segment));
}

assert.match(migration,/order_count=1/);
assert.match(migration,/order_count>=2/);
assert.match(migration,/percentile_cont\(0\.80\)/);
assert.match(migration,/average_repurchase_interval_days between 20 and 40/);
assert.match(migration,/days_since_last_order>=b\.inactive_after_days/);
assert.match(migration,/favorite_basket_purchase_count/);
assert.match(migration,/reasons/);
assert.doesNotMatch(migration,/insert\s+into\s+public\.customer_commercial_segments/i);

assert.match(admin,/get_customer_commercial_segments_v1/);
assert.match(admin,/customer_commercial_segments_v1/);
assert.match(admin,/allowedSegments/);
assert.match(customerEdge,/get_customer_commercial_segments_v1/);

assert.match(adminUi,/Perfil comercial calculado/);
assert.match(adminUi,/customerSegmentLabel/);
assert.match(adminUi,/name="segment"/);
assert.match(adminUi,/Próximo da recompra/);

assert.match(personalized,/frequent\?\.segments\?\.segments/);
assert.match(personalized,/proximo_recompra/);
assert.match(personalized,/primeiro_comprador/);
assert.match(personalized,/recorrente/);

console.log('PASS: segmentação comercial derivada V1');
