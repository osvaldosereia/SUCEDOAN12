import fs from 'node:fs';
import assert from 'node:assert/strict';

const SQL_PATH='supabase/sql/20261006_basket_mold_domain_v1.sql';
assert.equal(fs.existsSync(SQL_PATH),true,'basket mold domain migration must exist');
const sql=fs.readFileSync(SQL_PATH,'utf8');

// Core domain tables.
assert.match(sql,/create table if not exists public\.basket_molds\s*\(/i);
assert.match(sql,/create table if not exists public\.basket_mold_positions\s*\(/i);
assert.match(sql,/create table if not exists public\.basket_mold_position_options\s*\(/i);

// A mold extends the existing commercial basket instead of replacing it.
assert.match(sql,/basket_id\s+uuid\s+not null\s+unique\s+references\s+public\.basket_templates\s*\(id\)/i);
assert.match(sql,/public_composition_count\s+smallint\s+not null[^,]*check\s*\(public_composition_count\s+between\s+1\s+and\s+4\)/i);
assert.match(sql,/hidden_adjustment\s+numeric(?:\(\d+\s*,\s*\d+\))?\s+not null/i);

// Positions and their allowed product variations.
assert.match(sql,/mold_id\s+uuid\s+not null\s+references\s+public\.basket_molds\s*\(id\)/i);
assert.match(sql,/quantity\s+numeric(?:\(\d+\s*,\s*\d+\))?\s+not null\s+check\s*\(quantity\s*>\s*0/i);
assert.match(sql,/product_id\s+uuid\s+not null\s+references\s+public\.products\s*\(id\)/i);
assert.match(sql,/unique\s*\(position_id\s*,\s*product_id\)/i);

// New public-schema tables are protected; no client role can call/read them directly.
for(const table of ['basket_molds','basket_mold_positions','basket_mold_position_options']){
  assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`,'i'));
  assert.match(sql,new RegExp(`revoke all on table public\\.${table} from public,\\s*anon,\\s*authenticated`,'i'));
  assert.match(sql,new RegExp(`grant (?:select,\\s*insert,\\s*update,\\s*delete|all) on table public\\.${table} to service_role`,'i'));
}

// Administrative read/write interfaces for the next UI round.
assert.match(sql,/create or replace function public\.basket_mold_editor_v1\s*\(p_basket_id uuid\)/i);
assert.match(sql,/create or replace function public\.save_basket_mold_v1\s*\(/i);
assert.match(sql,/p_public_composition_count\s+integer/i);
assert.match(sql,/p_positions\s+jsonb/i);
assert.match(sql,/basket_mold_public_composition_count_invalid/i);
assert.match(sql,/basket_mold_position_options_required/i);
assert.match(sql,/basket_mold_duplicate_option/i);
assert.match(sql,/revoke all on function public\.basket_mold_editor_v1\(uuid\) from public,\s*anon,\s*authenticated/i);
assert.match(sql,/grant execute on function public\.basket_mold_editor_v1\(uuid\) to service_role/i);
assert.match(sql,/revoke all on function public\.save_basket_mold_v1\([^;]+from public,\s*anon,\s*authenticated/is);
assert.match(sql,/grant execute on function public\.save_basket_mold_v1\([^;]+to service_role/is);

// Round 1 is configuration only: it must not mutate physical stock or orders.
for(const forbidden of ['basket_stock_lots','basket_stock_reservations','basket_stock_allocations','orders','order_items']){
  const dml=new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+public\\.${forbidden}\\b`,'i');
  assert.equal(dml.test(sql),false,`round 1 must not mutate ${forbidden}`);
}

console.log('basket mold domain v1: PASS');
