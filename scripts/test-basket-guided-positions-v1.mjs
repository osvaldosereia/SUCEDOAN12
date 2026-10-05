import fs from 'node:fs';
import assert from 'node:assert/strict';

const sqlPath='supabase/sql/20261005_basket_guided_positions_v1.sql';
const migrationPath='supabase/migrations/20261005030000_basket_guided_positions_v1.sql';

assert.equal(fs.existsSync(sqlPath),true,'guided positions SQL must exist');
assert.equal(fs.existsSync(migrationPath),true,'guided positions migration must exist');

const sql=fs.readFileSync(sqlPath,'utf8');
const migration=fs.readFileSync(migrationPath,'utf8');

for(const field of ['position_label','family_key','search_query']){
  assert.match(sql,new RegExp(`basket_kit_template_items[\\s\\S]*add column if not exists ${field}`,'i'),`guided positions must add ${field}`);
  assert.match(migration,new RegExp(`basket_kit_template_items[\\s\\S]*add column if not exists ${field}`,'i'),`migration must add ${field}`);
}

assert.match(sql,/basket_lot_substitution_products/i,'backfill must reuse explicit product families');
assert.match(sql,/basket_lot_substitution_rules/i,'guided positions must reuse configured family labels');
assert.match(sql,/create or replace function public\.basket_commercial_model_editor_v1/i,'model editor RPC must exist');
assert.match(sql,/create or replace function public\.save_basket_commercial_model_composition_v1/i,'atomic model composition save RPC must exist');

const editorStart=sql.indexOf('create or replace function public.basket_commercial_model_editor_v1');
const saveStart=sql.indexOf('create or replace function public.save_basket_commercial_model_composition_v1');
assert.ok(editorStart>=0&&saveStart>editorStart,'editor must be declared before save RPC');
const editor=sql.slice(editorStart,saveStart);
const save=sql.slice(saveStart);

for(const table of ['basket_templates','basket_kit_templates','basket_kit_template_items']){
  assert.match(editor,new RegExp(`public\\.${table}`,'i'),`editor must read ${table}`);
}
assert.match(editor,/position_label/i,'editor must return position labels');
assert.match(editor,/family_key/i,'editor must return family keys');
assert.match(editor,/search_query/i,'editor must return search fallback');
assert.match(editor,/order by[\s\S]*sort_order/i,'editor positions must be ordered');

for(const field of ['removable','quantity_editable','min_quantity','max_quantity','remove_unit_delta','add_unit_delta']){
  assert.match(save,new RegExp(field,'i'),`save must preserve ${field}`);
}
assert.match(save,/duplicate_product_confirmation_required/i,'duplicate products must require explicit confirmation');
assert.match(save,/position_product_not_in_family/i,'a configured family must only accept authorized products');
assert.match(save,/basket_lot_substitution_products/i,'save must validate explicit family membership');
assert.match(save,/jsonb_array_length/i,'save must validate bounded positions array');

assert.doesNotMatch(save,/basket_stock_lots/i,'saving the model must not create or mutate lots');
assert.doesNotMatch(save,/ops2_loose_sellable_stock/i,'saving the model must not reserve or inspect sellable stock');
assert.doesNotMatch(save,/basket_lot_component_reservations/i,'saving the model must not touch reservations');

assert.match(sql,/revoke all on function public\.basket_commercial_model_editor_v1\(uuid\)[\s\S]*from public,anon,authenticated/i,'editor RPC must not be public');
assert.match(sql,/grant execute on function public\.basket_commercial_model_editor_v1\(uuid\)[\s\S]*to service_role/i,'editor RPC must be service-role only');
assert.match(sql,/revoke all on function public\.save_basket_commercial_model_composition_v1\(uuid,jsonb,text\)[\s\S]*from public,anon,authenticated/i,'save RPC must not be public');
assert.match(sql,/grant execute on function public\.save_basket_commercial_model_composition_v1\(uuid,jsonb,text\)[\s\S]*to service_role/i,'save RPC must be service-role only');

assert.match(migration,/basket_commercial_model_editor_v1/i,'migration must install editor RPC');
assert.match(migration,/save_basket_commercial_model_composition_v1/i,'migration must install save RPC');

console.log('basket guided positions v1: PASS');
