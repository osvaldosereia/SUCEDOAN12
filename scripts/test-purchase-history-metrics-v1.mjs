import fs from 'node:fs';
import assert from 'node:assert/strict';

const metrics=fs.readFileSync('supabase/migrations/20260918033000_purchase_history_metrics_v1.sql','utf8');
const segmentFix=fs.readFileSync('supabase/migrations/20260918031500_fix_commercial_segment_product_only_v1.sql','utf8');
const customerEdge=fs.readFileSync('supabase/functions/shopping-chat-customer-v1/index.ts','utf8');
const repeatUi=fs.readFileSync('comprar/repeat-purchase-v1.js','utf8');
const productsUi=fs.readFileSync('comprar/products.js','utf8');
const adminCore=fs.readFileSync('supabase/functions/admin-core-v1/index.ts','utf8');
const adminUi=fs.readFileSync('admin/app.js','utf8');

for(const field of [
  'history_coverage_pct',
  'bling_recovered_customers',
  'repeat_session_conversion_pct',
  'repeat_average_ticket',
  'repeat_average_checkout_minutes',
  'repeat_preview_unavailable_items',
  'frequent_to_order_conversion_pct',
  'personalized_offer_add_rate_pct',
  'personalized_offer_add_to_order_pct',
  'average_checkout_minutes',
  'median_checkout_minutes'
]){
  assert.match(metrics,new RegExp(field));
}
assert.match(metrics,/purchase_history_metrics_daily_v1/);
assert.match(metrics,/source='bling_import'/);
assert.match(metrics,/repeated_from_order_id/);
assert.match(metrics,/customer_behavior_events/);
assert.match(metrics,/frequent_purchases_open/);
assert.match(metrics,/personalized_offer_add/);
assert.doesNotMatch(metrics,/make\.com|hook\.make/i);

assert.match(segmentFix,/o\.source is distinct from 'bling_import'/);
assert.match(segmentFix,/attributable_nonbasket_orders>0/);
assert.match(segmentFix,/revoke all on public\.customer_commercial_segments_v1/);

assert.match(customerEdge,/repeat_purchase_open/);
assert.match(customerEdge,/unavailable_count/);
assert.match(repeatUi,/repeat_purchase_open/);
assert.match(productsUi,/personalized_offers_view/);
assert.match(productsUi,/personalized_offer_add/);
assert.match(productsUi,/confirmed>beforeConfirmed/);

assert.match(adminCore,/get_purchase_history_product_metrics_v1/);
assert.match(adminCore,/history_metrics/);
assert.match(adminUi,/Clientes e recompra/);
assert.match(adminUi,/Recuperados pelo Bling/);
assert.match(adminUi,/Tempo médio até pedido/);

console.log('PASS: métricas de histórico e personalização V1');
