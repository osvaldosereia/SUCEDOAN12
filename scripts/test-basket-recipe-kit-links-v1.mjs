import fs from 'node:fs';
import assert from 'node:assert/strict';

// RED contract: basket models may reuse internal kit recipes without reserving stock.
const migrationPath='supabase/migrations/20261005160000_basket_recipe_kit_links_v1.sql';
const sqlPath='supabase/sql/20261005_basket_recipe_kit_links_v1.sql';
const apiPath='supabase/functions/admin-basket-guided-v1/index.ts';

assert.equal(fs.existsSync(migrationPath),true,`missing ${migrationPath}`);
assert.equal(fs.existsSync(sqlPath),true,`missing ${sqlPath}`);
assert.equal(fs.existsSync(apiPath),true,`missing ${apiPath}`);

for(const path of [migrationPath,sqlPath]){
  const source=fs.readFileSync(path,'utf8');
  assert.match(source,/create table if not exists public\.store_basket_recipe_kits/i,'basket↔kit link table must exist');
  assert.match(source,/basket_id\s+uuid[^\n]*references public\.basket_templates/i,'link must reference basket_templates');
  assert.match(source,/kit_id\s+uuid[^\n]*references public\.assembly_kits/i,'link must reference assembly_kits');
  assert.match(source,/quantity\s+numeric[^\n]*check\s*\(\s*quantity\s*>\s*0/i,'kit quantity must be positive');
  assert.match(source,/unique\s*\(\s*basket_id\s*,\s*kit_id\s*\)/i,'same kit must not be linked twice to one basket');
  assert.match(source,/alter table public\.store_basket_recipe_kits enable row level security/i,'RLS required');
  assert.match(source,/revoke all on public\.store_basket_recipe_kits from public,anon,authenticated/i,'raw client access must be revoked');
  assert.match(source,/grant all on public\.store_basket_recipe_kits to service_role/i,'service role must manage links');

  assert.match(source,/create or replace function public\.basket_recipe_kits_v1\s*\(/i,'read RPC must exist');
  assert.match(source,/create or replace function public\.save_basket_recipe_kits_v1\s*\(/i,'save RPC must exist');
  assert.match(source,/from public\.assembly_kit_items/i,'read RPC must expose linked kit item totals');
  assert.match(source,/join public\.products/i,'read RPC must calculate current kit values from products');
  assert.match(source,/jsonb_array_length\(p_kits\)/i,'save RPC must validate the link list');
  assert.match(source,/assembly_kits[\s\S]{0,220}is_active\s*=\s*true/i,'only active internal kits may be linked');
  assert.match(source,/delete from public\.store_basket_recipe_kits\s+where basket_id\s*=\s*p_basket_id/i,'save must replace the basket link set atomically');
  assert.match(source,/insert into public\.store_basket_recipe_kits/i,'save must persist links');
  assert.doesNotMatch(source,/insert into public\.basket_stock_lots|insert into public\.basket_lot_component_reservations|create_basket_commercial_lot_reserved_v1/i,'linking recipes must not reserve stock');

  assert.match(source,/revoke all on function public\.basket_recipe_kits_v1\(uuid\) from public,anon,authenticated/i,'read RPC must not be public');
  assert.match(source,/grant execute on function public\.basket_recipe_kits_v1\(uuid\) to service_role/i,'read RPC service-role grant required');
  assert.match(source,/revoke all on function public\.save_basket_recipe_kits_v1\(uuid,jsonb,text\) from public,anon,authenticated/i,'save RPC must not be public');
  assert.match(source,/grant execute on function public\.save_basket_recipe_kits_v1\(uuid,jsonb,text\) to service_role/i,'save RPC service-role grant required');
}

const api=fs.readFileSync(apiPath,'utf8');
assert.match(api,/recipe_kits_save/,'guided admin API must expose recipe_kits_save mutation');
assert.match(api,/rpc\("basket_recipe_kits_v1"/,'model editor must load linked recipe kits');
assert.match(api,/rpc\("save_basket_recipe_kits_v1"/,'API must save linked recipe kits through canonical RPC');
assert.match(api,/recipe_kits\s*:/,'model editor response must include recipe_kits');
assert.match(api,/MUTATIONS[\s\S]{0,220}auth\.role==="viewer"/i,'viewer must remain read-only');

console.log('basket recipe kit links v1: PASS');
