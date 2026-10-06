import fs from 'node:fs';
import assert from 'node:assert/strict';

const SQL_PATH='supabase/sql/20261006_basket_mold_public_compositions_v2.sql';
assert.equal(fs.existsSync(SQL_PATH),true,'R4 stock-balancing SQL must exist');
const sql=fs.readFileSync(SQL_PATH,'utf8');

assert.match(sql,/create or replace function public\.basket_mold_public_compositions_v2\s*\(p_basket_id uuid\)/i);
assert.match(sql,/effective_sellable_stock/i,'must start from canonical sellable stock');
assert.match(sql,/vitrine_stock_reservations/i,'must subtract active order reservations');
assert.match(sql,/basket_lot_component_reservations/i,'must subtract active basket-lot reservations');
assert.match(sql,/p\.is_active\s*=\s*true/i,'inactive products must be excluded');
assert.match(sql,/available_stock\s*\/\s*nullif\([^)]*quantity/i,'selection must calculate coverage by units consumed per basket');
assert.match(sql,/coverage_baskets/i,'coverage must be returned for auditability');
assert.match(sql,/selection_score/i,'deterministic balancing score must be returned for auditability');
assert.match(sql,/order by[^;]*coverage_baskets\s+desc/is,'higher coverage must be favored');
assert.doesNotMatch(sql,/\brandom\s*\(/i,'pure randomness is forbidden');
assert.match(sql,/composition_number/i);
assert.match(sql,/option_rank/i);
assert.match(sql,/available_stock/i);
assert.match(sql,/quantity/i);

// Public generation remains read-only: displaying a composition cannot reserve stock.
for(const forbidden of ['vitrine_stock_reservations','basket_lot_component_reservations','basket_stock_reservations','orders','order_items']){
  const dml=new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+public\\.${forbidden}\\b`,'i');
  assert.equal(dml.test(sql),false,`R4 generator must not mutate ${forbidden}`);
}

console.log('basket mold stock balance v1: PASS');
