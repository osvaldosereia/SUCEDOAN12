import fs from 'node:fs';
import assert from 'node:assert/strict';

const SQL='supabase/sql/20261006_basket_mold_public_compositions_v1.sql';
assert.equal(fs.existsSync(SQL),true,'R3 public-composition migration must exist');
const sql=fs.readFileSync(SQL,'utf8');

assert.match(sql,/create or replace function public\.basket_mold_public_compositions_v1\s*\(p_basket_id uuid\)/i);
assert.match(sql,/public_composition_count/i);
assert.match(sql,/ops2_sellable_stock_v1/i,'must use canonical sellable stock');
assert.match(sql,/vitrine_stock_reservations/i,'must subtract active order reservations');
assert.match(sql,/basket_lot_component_reservations/i,'must subtract active basket-lot component reservations');
assert.match(sql,/effective_sellable_stock/i);
assert.match(sql,/greatest\s*\(\s*0/i);
assert.match(sql,/row_number\s*\(\s*\)\s*over/i,'must rank eligible options deterministically');
assert.match(sql,/mod\s*\(/i,'must rotate choices across public compositions');
assert.match(sql,/generate_series\s*\(\s*1\s*,/i,'must emit configured 1-4 compositions');
assert.match(sql,/is_active\s*=\s*true/i,'inactive products are never eligible');
assert.doesNotMatch(sql,/(insert\s+into|update|delete\s+from)\s+public\.(vitrine_stock_reservations|basket_lot_component_reservations|products)\b/i,'display generator must be read-only');
assert.match(sql,/revoke all on function public\.basket_mold_public_compositions_v1\(uuid\) from public,\s*anon,\s*authenticated/i);
assert.match(sql,/grant execute on function public\.basket_mold_public_compositions_v1\(uuid\) to service_role/i);
console.log('basket mold public compositions v1: PASS');
