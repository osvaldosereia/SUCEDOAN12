import fs from 'node:fs';
import assert from 'node:assert/strict';

const sqlPath='supabase/sql/20261005_basket_guided_lot_flow_v1.sql';
const migrationPath='supabase/migrations/20261005032000_basket_guided_lot_flow_v1.sql';
const lifecyclePath='supabase/sql/20261005_basket_guided_lot_lifecycle_v1.sql';
const lifecycleMigrationPath='supabase/migrations/20261005033000_basket_guided_lot_lifecycle_v1.sql';
assert.equal(fs.existsSync(sqlPath),true,'guided lot flow SQL must exist');
assert.equal(fs.existsSync(migrationPath),true,'guided lot flow migration must exist');
assert.equal(fs.existsSync(lifecyclePath),true,'guided lot lifecycle SQL must exist');
assert.equal(fs.existsSync(lifecycleMigrationPath),true,'guided lot lifecycle migration must exist');
const sql=fs.readFileSync(sqlPath,'utf8');
const migration=fs.readFileSync(migrationPath,'utf8');
const lifecycle=fs.readFileSync(lifecyclePath,'utf8');
const lifecycleMigration=fs.readFileSync(lifecycleMigrationPath,'utf8');

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

for(const source of [lifecycle,lifecycleMigration]){
  assert.match(source,/create or replace function public\.update_basket_reserved_lot_v1/i,'reserved lot update RPC must exist');
  assert.match(source,/create or replace function public\.mark_basket_reserved_lot_mounted_v1/i,'mount RPC must exist');
  assert.match(source,/create or replace function public\.cancel_basket_reserved_lot_v1/i,'cancel RPC must exist');
  assert.match(source,/create or replace function public\.reopen_basket_kit_lot_for_edit_v1/i,'existing reopen RPC must be made reservation-aware');

  const updateStart=source.indexOf('create or replace function public.update_basket_reserved_lot_v1');
  const mountStart=source.indexOf('create or replace function public.mark_basket_reserved_lot_mounted_v1');
  const cancelStart=source.indexOf('create or replace function public.cancel_basket_reserved_lot_v1');
  const reopenStart=source.indexOf('create or replace function public.reopen_basket_kit_lot_for_edit_v1');
  assert.ok(updateStart>=0&&mountStart>updateStart&&cancelStart>mountStart&&reopenStart>cancelStart,'lifecycle RPC order must stay explicit');
  const update=source.slice(updateStart,mountStart);
  const mount=source.slice(mountStart,cancelStart);
  const cancel=source.slice(cancelStart,reopenStart);
  const reopen=source.slice(reopenStart);

  assert.match(update,/assembly_status[\s\S]*assembling/i,'only assembling lots may use reservation delta editor');
  assert.match(update,/lot_sale_must_be_disabled/i,'editing a reserved lot must require sale disabled');
  assert.match(update,/lot_has_order_history/i,'editing must block order history');
  assert.match(update,/lot_is_dependency/i,'editing must block dependent lots');
  assert.match(update,/pg_advisory_xact_lock/i,'editing must lock affected products');
  assert.match(update,/order by[\s\S]*product_id/i,'edit locks must be deterministic');
  assert.match(update,/loose_sellable_stock[\s\S]*old_reserved/i,'availability for an edit must add back this lot old reservation');
  assert.match(update,/insufficient_loose_stock/i,'edit must reject an uncovered increase');
  assert.match(update,/on conflict\s*\(lot_id,product_id\)[\s\S]*do update/i,'reservation delta must reactivate/update previous product rows safely');
  assert.match(update,/status='released'/i,'products removed from the lot must release their reservation');
  assert.match(update,/delete from public\.basket_stock_lot_items/i,'editing replaces the lot snapshot atomically');
  assert.match(update,/apply_basket_kit_lot_commercial_v3/i,'editing must recompute canonical financial snapshots');

  assert.match(mount,/status='draft'[\s\S]*assembly_status='assembling'/i,'mount must start from reserved draft');
  assert.match(mount,/linked_lot_unavailable/i,'mount must validate linked dependency');
  assert.match(mount,/status='converted'/i,'mount must convert active reservation rows instead of duplicating them');
  assert.match(mount,/status='ready'/i,'mount must make the lot operationally ready');
  assert.match(mount,/assembly_status='mounted'/i,'mount must record physical assembly');
  assert.match(mount,/quantity_available=quantity_built/i,'mount must expose the built quantity internally');
  assert.match(mount,/sale_enabled=false/i,'mount must not publish automatically');

  assert.match(cancel,/lot_has_order_history/i,'cancel must block lots with order history');
  assert.match(cancel,/lot_is_dependency/i,'cancel must block dependencies');
  assert.match(cancel,/status='released'/i,'cancel must release active reservations');
  assert.match(cancel,/status='cancelled'/i,'cancel must make the lot cancelled');
  assert.match(cancel,/sale_enabled=false/i,'cancel must disable sale');
  assert.match(cancel,/quantity_available=0/i,'cancel must remove available units');

  assert.match(reopen,/guided_reserved_lot_v1/i,'reopen must distinguish guided reserved lots from legacy lots');
  assert.match(reopen,/basket_lot_component_reservations/i,'reopening a guided mounted lot must recreate active reservations');
  assert.match(reopen,/assembly_status='assembling'/i,'guided reopen must return to assembling state');
  assert.match(reopen,/quantity_available=0/i,'guided reopen must remove ready units while preserving component lock via reservation');
  assert.match(reopen,/lot_has_order_history/i,'reopen must preserve historical guard');
  assert.match(reopen,/lot_is_dependency/i,'reopen must preserve dependency guard');

  for(const fn of ['update_basket_reserved_lot_v1','mark_basket_reserved_lot_mounted_v1','cancel_basket_reserved_lot_v1']){
    assert.match(source,new RegExp(`revoke all on function public\\.${fn}`,'i'),`${fn} must not be public`);
    assert.match(source,new RegExp(`grant execute on function public\\.${fn}`,'i'),`${fn} must be service-role only`);
  }
}

console.log('basket guided lot flow v1: PASS');
