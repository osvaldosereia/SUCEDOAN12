import fs from 'node:fs';
import assert from 'node:assert/strict';

const sqlPath='supabase/sql/20261006_store_basket_component_edit_v1.sql';
const migrationPath='supabase/migrations/20261006030000_store_basket_component_edit_v1.sql';
assert.ok(fs.existsSync(sqlPath),`missing ${sqlPath}`);
assert.ok(fs.existsSync(migrationPath),`missing ${migrationPath}`);
const sql=fs.readFileSync(sqlPath,'utf8');
const migration=fs.readFileSync(migrationPath,'utf8');
assert.equal(sql,migration,'retained SQL and migration must stay identical');

assert.match(sql,/create or replace function public\.edit_store_basket_component_v1\s*\(/i,'component edit RPC required');
assert.match(sql,/p_action text/i,'RPC must use explicit action');
assert.match(sql,/set_quantity|replace|remove/i,'RPC must support quantity, replace and remove');
assert.match(sql,/store_basket_recipe_kits/i,'RPC must validate basket-kit link');
assert.match(sql,/join public\.basket_templates/i,'shared-use detection must consider commercial baskets');
assert.match(sql,/count\s*\(\s*distinct[^)]*basket_id/i,'RPC must count distinct baskets using the kit');
assert.match(sql,/count\s*\(\s*distinct\s+r\.basket_id\s*\)[\s\S]*filter\s*\(\s*where\s+b\.is_active\s*(?:=\s*true)?\s*\)/i,'RPC must audit active use while cloning on any basket link');
assert.match(sql,/if\s+v_usage_count\s*>\s*1/i,'clone decision must use all basket links, not only active baskets');
assert.match(sql,/insert into public\.assembly_kits/i,'shared kit must be clonable');
assert.match(sql,/source_kit_id/i,'clone must preserve source lineage');
assert.match(sql,/insert into public\.assembly_kit_items/i,'clone must copy kit items');
assert.match(sql,/update public\.store_basket_recipe_kits[\s\S]*kit_id\s*=\s*v_target_kit_id/i,'basket must be relinked to exclusive clone atomically');
assert.match(sql,/update public\.assembly_kit_items[\s\S]*quantity/i,'quantity edit required');
assert.match(sql,/delete from public\.assembly_kit_items/i,'remove/replace must be able to remove old item');
assert.match(sql,/store_basket_component_last_item/i,'must not leave a linked kit empty');
assert.match(sql,/revoke all on function public\.edit_store_basket_component_v1[\s\S]*from public,anon,authenticated/i,'component edit must not be client-executable');
assert.match(sql,/grant execute on function public\.edit_store_basket_component_v1[\s\S]*to service_role/i,'component edit must be service-role only');
assert.doesNotMatch(sql,/update public\.basket_stock_lots|delete from public\.basket_stock_lot_items|update public\.basket_stock_lot_items/i,'recipe edit must never rewrite mounted lot snapshots');

const api=fs.readFileSync('supabase/functions/admin-store-baskets-v1/index.ts','utf8');
assert.match(api,/['"]component_edit['"]/,'admin API must expose component_edit action');
assert.match(api,/edit_store_basket_component_v1/,'admin API must call canonical component edit RPC');
assert.match(api,/MUTATIONS[^\n]*component_edit|component_edit[^\n]*MUTATIONS/s,'component edit must be treated as mutation');

const ui=fs.readFileSync('vitrine/admin/store-baskets-builder.js','utf8');
assert.match(ui,/data-store-product-qty-edit/,'product card must expose quantity edit');
assert.match(ui,/data-store-product-replace/,'product card must expose substitution');
assert.match(ui,/data-store-product-remove/,'product card must expose removal');
assert.match(ui,/data-store-edit-kit/,'linked kit must expose direct edit action');
assert.match(ui,/function componentEditorHtml\(/,'component editor overlay required');
assert.match(ui,/action:['"]component_edit['"]|storeCall\(['"]component_edit['"]/,'UI must use component_edit action');
assert.match(ui,/basket_only|cópia exclusiva|copia exclusiva/i,'UI must preserve basket-only safety semantics');
assert.match(ui,/products[^\n]*\?action=products|action=products/i,'replacement search must use product catalog');

console.log('store baskets component edit v1: PASS');
