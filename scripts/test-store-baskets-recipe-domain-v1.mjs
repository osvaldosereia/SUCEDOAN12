import fs from 'node:fs';
import assert from 'node:assert/strict';

const sqlPath='supabase/sql/20261005_store_baskets_recipe_v1.sql';
const migrationPath='supabase/migrations/20261005173000_store_baskets_recipe_v1.sql';
for(const path of [sqlPath,migrationPath])assert.ok(fs.existsSync(path),`missing ${path}`);

for(const path of [sqlPath,migrationPath]){
  const sql=fs.readFileSync(path,'utf8');
  assert.match(sql,/create or replace function public\.store_basket_recipe_catalog_v1\s*\(/i,'catalog RPC required');
  assert.match(sql,/create or replace function public\.store_basket_recipe_editor_v1\s*\(\s*p_basket_id uuid/i,'editor RPC required');
  assert.match(sql,/create or replace function public\.save_store_basket_recipe_v1\s*\(/i,'save RPC required');
  assert.match(sql,/create or replace function public\.preview_store_basket_recipe_v1\s*\(/i,'preview RPC required');
  assert.match(sql,/public\.basket_templates/i,'external baskets must remain basket_templates');
  assert.match(sql,/public\.store_basket_recipe_kits/i,'external basket composition must use recipe links');
  assert.match(sql,/public\.assembly_kits/i,'external basket must use internal kits');
  assert.match(sql,/public\.assembly_kit_items/i,'preview must expand internal kit items');
  assert.match(sql,/group by\s+[^;]*product_id/is,'preview must consolidate repeated products across kits');
  assert.match(sql,/ops2_loose_sellable_stock_v1/i,'preview must use canonical loose stock');
  assert.match(sql,/hidden_adjustment/i,'save/editor must expose hidden adjustment');
  assert.match(sql,/cestas-so-alimento/i,'food-only recipe must infer food basket category');
  assert.match(sql,/cestas-completas/i,'combined recipe must infer complete basket category');
  assert.match(sql,/kits-limpeza-e-higiene/i,'cleaning/hygiene-only recipe must infer kit category');
  assert.doesNotMatch(sql,/insert\s+into\s+public\.basket_stock_lots/i,'saving a recipe must not create physical lots');
  assert.doesNotMatch(sql,/insert\s+into\s+public\.basket_lot_component_reservations/i,'saving a recipe must not reserve stock');
  assert.match(sql,/revoke all on function public\.store_basket_recipe_catalog_v1\(\) from public,anon,authenticated/i,'catalog RPC must not be public');
  assert.match(sql,/grant execute on function public\.store_basket_recipe_catalog_v1\(\) to service_role/i,'catalog RPC must be service-role only');
  assert.match(sql,/revoke all on function public\.store_basket_recipe_editor_v1\(uuid\) from public,anon,authenticated/i,'editor RPC must not be public');
  assert.match(sql,/grant execute on function public\.store_basket_recipe_editor_v1\(uuid\) to service_role/i,'editor RPC must be service-role only');
}

assert.equal(fs.readFileSync(sqlPath,'utf8'),fs.readFileSync(migrationPath,'utf8'),'canonical SQL and migration must be identical');
console.log('store basket recipe domain v1: PASS');
