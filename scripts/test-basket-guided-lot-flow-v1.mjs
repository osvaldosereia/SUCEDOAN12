import fs from 'node:fs';
import assert from 'node:assert/strict';

const sqlPath='supabase/sql/20261005_basket_guided_lot_flow_v1.sql';
const migrationPath='supabase/migrations/20261005032000_basket_guided_lot_flow_v1.sql';
assert.equal(fs.existsSync(sqlPath),true,'guided lot flow SQL must exist');
assert.equal(fs.existsSync(migrationPath),true,'guided lot flow migration must exist');
const sql=fs.readFileSync(sqlPath,'utf8');
const migration=fs.readFileSync(migrationPath,'utf8');

for(const source of [sql,migration]){
  assert.match(source,/create or replace function public\.preview_basket_commercial_lot_v1/i,'lot preview RPC must exist');
  assert.match(source,/create or replace function public\.create_basket_commercial_lot_reserved_v1/i,'atomic reserved lot creator must exist');

  const previewStart=source.indexOf('create or replace function public.preview_basket_commercial_lot_v1');
  const createStart=source.indexOf('create or replace function public.create_basket_commercial_lot_reserved_v1');
  assert.ok(previewStart>=0&&createStart>previewStart,'preview must be declared before creator');
  const preview=source.slice(previewStart,createStart);
  const create=source.slice(createStart);

  assert.match(preview,/jsonb_array_elements/i,'preview must read explicit position items');
  assert.match(preview,/group by[\s\S]*product_id/i,'preview must consolidate repeated SKUs by product');
  assert.match(preview,/ops2_loose_sellable_stock_v1/i,'preview must use loose sellable stock');
  for(const field of ['required','available','balance_after','component_sum','cost_sum','hidden_adjustment']){
    assert.match(preview,new RegExp(field,'i'),`preview must return ${field}`);
  }
  assert.doesNotMatch(preview,/insert into public\.basket_stock_lots/i,'preview must not create a lot');
  assert.doesNotMatch(preview,/insert into public\.basket_lot_component_reservations/i,'preview must not reserve stock');
  assert.doesNotMatch(preview,/update public\.basket_stock_lots/i,'preview must not mutate lot state');

  assert.match(create,/pg_advisory_xact_lock/i,'creator must serialize reservations per product');
  assert.match(create,/order by[\s\S]*product_id/i,'product locks must use deterministic order');
  assert.match(create,/ops2_loose_sellable_stock_v1/i,'creator must revalidate loose stock after acquiring locks');
  assert.match(create,/insufficient_loose_stock/i,'creator must fail atomically when any component is short');
  assert.match(create,/insert into public\.basket_stock_lots/i,'creator must persist a real lot');
  assert.match(create,/['"]draft['"]/i,'new reserved lot must start as draft');
  assert.match(create,/assembly_status[\s\S]*['"]assembling['"]/i,'new reserved lot must start as assembling');
  assert.match(create,/quantity_available[\s\S]*0/i,'assembling lot must not be sellable inventory yet');
  assert.match(create,/sale_enabled[\s\S]*false/i,'creating a lot must not publish it');
  assert.match(create,/insert into public\.basket_stock_lot_items/i,'creator must snapshot selected composition');
  assert.match(create,/insert into public\.basket_lot_component_reservations/i,'creator must persist explicit reservations');
  assert.match(create,/sum\([\s\S]*quantity_per_basket/i,'reservations must consolidate repeated product needs');
  assert.match(create,/component_sum_snapshot/i,'creator must snapshot component sale sum');
  assert.match(create,/hidden_adjustment_snapshot/i,'creator must preserve hidden adjustment');
  assert.match(create,/cost_sum_snapshot/i,'creator must snapshot component cost');
  assert.match(create,/next_basket_kit_short_code_v1/i,'creator must keep the 2 letters + 1 number lot code rule');

  assert.match(source,/revoke all on function public\.preview_basket_commercial_lot_v1\(uuid,integer,jsonb\)[\s\S]*from public,anon,authenticated/i,'preview RPC must be service-role only');
  assert.match(source,/grant execute on function public\.preview_basket_commercial_lot_v1\(uuid,integer,jsonb\)[\s\S]*to service_role/i,'preview RPC must be granted to service role');
  assert.match(source,/revoke all on function public\.create_basket_commercial_lot_reserved_v1/i,'creator RPC must not be public');
  assert.match(source,/grant execute on function public\.create_basket_commercial_lot_reserved_v1/i,'creator RPC must be service-role only');
}

console.log('basket guided lot flow v1: PASS');
