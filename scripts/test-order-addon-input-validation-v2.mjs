import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(
  'supabase/migrations/20261008032100_order_addon_input_validation_v2.sql',
  'utf8'
);
const cases = [
  ['canonical RPC is guarded', /pg_get_functiondef\('public\.ops3_add_items_to_existing_order_v1\(text,text,jsonb\)'::regprocedure\)/],
  ['null product id is rejected', /if v_product_id is null then\s+return jsonb_build_object\('ok',false,'error','invalid_product_id'\)/],
  ['null quantity is rejected', /if v_qty is null or v_qty<=0/],
  ['drift causes failure', /raise exception 'addon_input_guard_v2: unexpected function definition'/],
  ['existing quantity upper bound preserved', /v_qty>30 or trunc\(v_qty\)<>v_qty/],
];
for (const [name, re] of cases) {
  assert.match(sql, re, name);
  console.log('PASS:', name);
}
assert.doesNotMatch(sql, /insert into public\.orders/i);
assert.doesNotMatch(sql, /update public\.vitrine_stock_reservations/i);
assert.doesNotMatch(sql, /\b(drop|truncate)\s+table\b/i);
console.log('PASS: no direct order, stock or destructive table changes');
