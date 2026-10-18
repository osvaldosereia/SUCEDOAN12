import fs from 'node:fs';
import assert from 'node:assert/strict';
const sql=fs.readFileSync('supabase/sql/admin_order_stock_transition_atomic_v1_DRAFT.sql','utf8');
for(const x of [
  /security invoker/i,/for update/i,/stale_order_status/,
  /reserve_vitrine_order_stock_v1/,/release_vitrine_order_stock_v1/,
  /raise exception 'stock_transition_failed/,
  /update public\.orders/,/revoke all .* from public, anon, authenticated/i,
  /grant execute .* to service_role/i
]) assert.match(sql,x);
assert.ok(sql.indexOf('for update')<sql.indexOf('reserve_vitrine_order_stock_v1'));
assert.ok(sql.indexOf('raise exception')<sql.indexOf('update public.orders'));
assert.match(sql,/v_source <> 'vitrine'/);
assert.match(sql,/deferred_to_existing_status_trigger/);
assert.ok(sql.indexOf('v_source <>') < sql.indexOf('release_vitrine_order_stock_v1'));

console.log('Atomic order stock SQL draft static contract: PASS (not a DB integration test)');
