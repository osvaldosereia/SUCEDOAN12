import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const migrations=fs.readdirSync('supabase/migrations')
  .filter(name=>name.includes('order_addon_atomic_v1')&&name.endsWith('.sql'))
  .sort();
assert.equal(migrations.length,1,'exactly one atomic order add-on migration must exist');
const sql=fs.readFileSync(path.join('supabase/migrations',migrations[0]),'utf8');

assert.match(sql,/ops3_add_items_to_existing_order_v1\s*\(\s*p_token_hash text,\s*p_request_key text,\s*p_items jsonb/i,
  'mutation API must resolve order from session token and never accept order_id');
assert.doesNotMatch(sql,/ops3_add_items_to_existing_order_v1\s*\([^)]*p_order_id/i,
  'browser-facing mutation contract must not accept order_id');
assert.doesNotMatch(sql,/ops3_add_items_to_existing_order_v1\s*\([^)]*p_price|p_unit_price|p_total/i,
  'browser must never provide price or total');

assert.match(sql,/from private\.order_addon_sessions_v1[\s\S]*for update/i,'session must be locked');
assert.match(sql,/from public\.orders[\s\S]*for update/i,'order must be locked');
assert.match(sql,/status[^\n]*storefront_received/i,'mutation must fail closed outside storefront_received');
assert.match(sql,/confirmed_at/i,'confirmed orders must be blocked');
assert.match(sql,/bling_order_id|bling_synced_at|sent_to_bling/i,'Bling-started orders must be blocked');
assert.match(sql,/order_separation_items_v1/i,'separation must be guarded');
assert.match(sql,/operation_count[\s\S]*max_operations/i,'session operation limit must be enforced');

assert.match(sql,/jsonb_array_elements\(p_items\)/i,'server must parse item requests');
assert.match(sql,/product_id/i,'request must identify products only');
assert.match(sql,/quantity/i,'request must carry quantity only');
assert.match(sql,/trunc\(/i,'quantities must be integral');
assert.match(sql,/max_distinct_products_per_operation/i,'runtime distinct-product cap required');

assert.match(sql,/from public\.products[\s\S]*for update/i,'canonical product row must be locked before pricing');
assert.match(sql,/is_offer[\s\S]*offer_price[\s\S]*price/i,'canonical offer/base price selection required');
assert.match(sql,/history_kind/i,'standalone line detection must respect item kind');
assert.match(sql,/basket_id/i,'basket components must not be merged into standalone additions');
assert.match(sql,/unit_price[\s\S]*v_unit/i,'existing line may merge only under canonical price compatibility');
assert.match(sql,/insert into public\.order_items/i,'new standalone line insertion required');
assert.match(sql,/update public\.order_items/i,'same-price standalone line can be incremented');

assert.match(sql,/reserve_vitrine_order_stock_v1/i,'canonical reservation engine must be reused');
assert.match(sql,/stock_reservation_failed|insufficient_stock/i,'stock failure must abort the mutation');
assert.match(sql,/update public\.orders[\s\S]*total[\s\S]*subtotal[\s\S]*fiscal_subtotal/i,'financial totals must be incremented atomically');
assert.match(sql,/ops2_refresh_order_public_snapshot_v1/i,'public order view must refresh after mutation');
assert.doesNotMatch(sql,/set[\s\S]*order_number\s*=/i,'public order number must never change');
assert.doesNotMatch(sql,/insert into public\.orders/i,'mutation must never create a second order');

assert.match(sql,/private\.order_addon_operations_v1/i,'operation ledger required');
assert.match(sql,/request_key/i,'idempotency key required');
assert.match(sql,/extensions\.digest/i,'normalized payload fingerprint must be server-generated');
assert.match(sql,/idempotent_replay/i,'retries must return prior applied result');
assert.match(sql,/idempotency_key_reused/i,'same key with different payload must be rejected');
assert.match(sql,/operation_count\s*=\s*operation_count\s*\+\s*1/i,'successful mutation must advance session counter');

assert.match(sql,/ops_record_event_v1/i,'same-order mutation must be auditable');
assert.doesNotMatch(sql,/build_bling_order_draft|bling_hub|sync_order/i,'R3 must not push or edit Bling directly');

assert.match(sql,/revoke execute[\s\S]*ops3_add_items_to_existing_order_v1[\s\S]*from anon/i,'mutation must be revoked from anon');
assert.match(sql,/revoke execute[\s\S]*ops3_add_items_to_existing_order_v1[\s\S]*from authenticated/i,'mutation must be revoked from authenticated');
assert.match(sql,/grant execute[\s\S]*ops3_add_items_to_existing_order_v1[\s\S]*to service_role/i,'mutation must be service-role only');

console.log('PASS: atomic same-order add-on mutation contract preserves identity, stock, pricing and idempotency');
