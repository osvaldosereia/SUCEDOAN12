import fs from 'node:fs';
import assert from 'node:assert/strict';

const sqlPath='supabase/sql/20261006_store_basket_ops_overview_v1.sql';
const migrationPath='supabase/migrations/20261006043000_store_basket_ops_overview_v1.sql';
assert.ok(fs.existsSync(sqlPath),'retained ops overview SQL must exist');
assert.ok(fs.existsSync(migrationPath),'ops overview migration must exist');
const sql=fs.readFileSync(sqlPath,'utf8');
const migration=fs.readFileSync(migrationPath,'utf8');
assert.equal(migration.trim(),sql.trim(),'migration and retained SQL must stay identical');

assert.match(sql,/create or replace function public\.store_basket_ops_overview_v1\(\)/i,'overview RPC required');
assert.match(sql,/security definer/i,'overview RPC must remain protected');
assert.match(sql,/basket_lot_public_availability_v1/i,'overview must use canonical public lot availability');
assert.match(sql,/basket_stock_lots/i,'overview must classify physical lot origin/state');
assert.match(sql,/store_basket_reserved_v1/i,'overview must identify the new reservation flow');
assert.match(sql,/ops2_loose_sellable_stock_v1/i,'buildable quantity must use canonical loose stock');
assert.match(sql,/store_basket_recipe_kits/i,'buildable quantity must use saved basket recipe');
assert.match(sql,/assembly_kit_items/i,'buildable quantity must expand kit components');
assert.match(sql,/floor\s*\(/i,'buildable quantity must floor component capacity');
assert.match(sql,/min\s*\(/i,'buildable quantity must be limited by the scarcest component');
for(const field of ['public_available','assembling_units','max_buildable_now','sellable_lots','existing_available_units','new_flow_available_units','existing_sellable_lots','new_flow_sellable_lots','assembling_lots']){
  assert.match(sql,new RegExp(field,'i'),`overview must expose ${field}`);
}
assert.match(sql,/revoke all on function public\.store_basket_ops_overview_v1\(\) from public,anon,authenticated/i,'overview RPC must not be callable directly by client roles');
assert.match(sql,/grant execute on function public\.store_basket_ops_overview_v1\(\) to service_role/i,'overview RPC must be service_role only');

const edge=fs.readFileSync('supabase/functions/admin-store-baskets-v1/index.ts','utf8');
assert.match(edge,/store_basket_ops_overview_v1/,'admin list must load operational overview');
assert.match(edge,/operations/,'admin list must attach operational metrics to each basket');

const ui=fs.readFileSync('vitrine/admin/store-baskets-builder.js','utf8');
for(const phrase of ['Disponível no site','Em montagem','Pode montar agora','Lotes disponíveis','Estoque existente','Novo fluxo']){
  assert.match(ui,new RegExp(phrase,'i'),`UI must show ${phrase}`);
}
assert.match(ui,/data-store-ops-overview/,'UI must expose operational overview hook');
assert.match(ui,/data-store-basket-stock/,'basket list must expose stock summary hook');

console.log('store baskets ops overview v1: PASS');
