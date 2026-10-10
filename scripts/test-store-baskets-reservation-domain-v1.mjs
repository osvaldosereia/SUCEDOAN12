import fs from 'node:fs';
import assert from 'node:assert/strict';

const sqlPath='supabase/sql/20261005_store_basket_reservation_v1.sql';
const migrationPath='supabase/migrations/20261005190000_store_basket_reservation_v1.sql';
assert.equal(fs.existsSync(sqlPath),true,`missing ${sqlPath}`);
assert.equal(fs.existsSync(migrationPath),true,`missing ${migrationPath}`);
const sql=fs.readFileSync(sqlPath,'utf8');
const migration=fs.readFileSync(migrationPath,'utf8');
assert.equal(sql,migration,'migration and retained SQL must stay identical');

for(const fn of [
  'store_basket_builds_v1',
  'reserve_store_basket_recipe_v1',
  'mount_store_basket_reservation_v1',
  'cancel_store_basket_reservation_v1'
]) assert.match(sql,new RegExp(`create or replace function public\\.${fn}`,'i'),`${fn} must exist`);

const reserve=sql.slice(sql.indexOf('create or replace function public.reserve_store_basket_recipe_v1'),sql.indexOf('create or replace function public.mount_store_basket_reservation_v1'));
assert.match(reserve,/store_basket_recipe_kits/i,'reserve must derive composition from store basket recipe');
assert.match(reserve,/assembly_kit_items/i,'reserve must expand internal kits into products');
assert.match(reserve,/ops2_loose_sellable_stock_v1/i,'reserve must recheck canonical loose stock');
assert.match(reserve,/pg_advisory_xact_lock\s*\(\s*hashtextextended/i,'reserve must serialize stock by product');
assert.match(reserve,/for update/i,'reserve must lock product rows during recheck');
assert.match(reserve,/insufficient_loose_stock/i,'reserve must reject insufficient loose stock');
assert.match(reserve,/insert into public\.basket_stock_lots/i,'reserve must create one physical basket lot');
assert.match(reserve,/['"]draft['"][\s\S]*['"]assembling['"]/i,'reserved build must start draft/assembling');
assert.match(reserve,/['"]legacy_full['"]/i,'store baskets must remain compatible with canonical full-basket checkout');
assert.match(reserve,/store_basket_reserved_v1/i,'reserved build must have its own provenance marker');
assert.match(reserve,/insert into public\.basket_stock_lot_items/i,'reserve must snapshot aggregated recipe products');
assert.match(reserve,/insert into public\.basket_lot_component_reservations/i,'reserve must create explicit component reservations');
assert.match(reserve,/['"]active['"]/i,'new component reservations must be active');
assert.doesNotMatch(reserve,/basket_kit_template_items|kit_template_item_id/i,'new store basket reserve must not depend on guided template positions');

// PostgreSQL rejects a %ROWTYPE record as one target in a multi-item INTO list.
// Keep the basket fields scalar because the category slug is selected alongside them.
assert.doesNotMatch(reserve,/select\s+b\s*,\s*c\.slug\s+into\s+v_basket\s*,/i,'rowtype record must not be mixed with scalar targets in one INTO list');
for(const variable of ['v_basket_name text','v_basket_price numeric','v_category_slug text']){
  assert.match(reserve,new RegExp(variable.replace(/\s+/g,'\\s+'),'i'),`reserve must declare scalar ${variable}`);
}
assert.match(reserve,/select\s+b\.name\s*,\s*b\.base_price\s*,\s*c\.slug\s+into\s+v_basket_name\s*,\s*v_basket_price\s*,\s*v_category_slug/i,'basket commercial fields must be selected into scalar targets');

const mount=sql.slice(sql.indexOf('create or replace function public.mount_store_basket_reservation_v1'),sql.indexOf('create or replace function public.cancel_store_basket_reservation_v1'));
assert.match(mount,/store_basket_reserved_v1/i,'mount must only accept store-basket reservations');
assert.match(mount,/lot_reservation_mismatch/i,'mount must verify reserved quantities before conversion');
assert.match(mount,/status\s*=\s*['"]converted['"]/i,'mount must convert explicit reservations before ready stock takes over');
assert.match(mount,/status\s*=\s*['"]ready['"][\s\S]*assembly_status\s*=\s*['"]mounted['"]/i,'mount must convert build into mounted ready stock');
assert.match(mount,/quantity_available\s*=\s*quantity_built/i,'mounted build must expose the physically built quantity');
assert.match(mount,/sale_enabled\s*=\s*true/i,'mounted store basket must become sellable in the simplified flow');

const cancel=sql.slice(sql.indexOf('create or replace function public.cancel_store_basket_reservation_v1'),sql.indexOf('revoke all on function public.store_basket_builds_v1'));
assert.match(cancel,/store_basket_reserved_v1/i,'cancel must only accept store-basket reservations');
assert.match(cancel,/status=['"]draft['"][\s\S]*assembly_status=['"]assembling['"]/i,'cancel must be limited to pre-mount reservations');
assert.match(cancel,/status\s*=\s*['"]released['"]/i,'cancel must release active component reservations');
assert.match(cancel,/status\s*=\s*['"]cancelled['"]/i,'cancel must cancel the physical build record');
assert.match(cancel,/quantity_available\s*=\s*0/i,'cancelled build must have no sellable quantity');

for(const signature of [
  /revoke all on function public\.store_basket_builds_v1\(uuid\) from public,anon,authenticated/i,
  /revoke all on function public\.reserve_store_basket_recipe_v1\(uuid,integer,text,text\) from public,anon,authenticated/i,
  /revoke all on function public\.mount_store_basket_reservation_v1\(uuid,text\) from public,anon,authenticated/i,
  /revoke all on function public\.cancel_store_basket_reservation_v1\(uuid,text,text\) from public,anon,authenticated/i
]) assert.match(sql,signature,'store basket physical RPCs must be service-role only');

console.log('store baskets physical reservation domain v1: PASS');
