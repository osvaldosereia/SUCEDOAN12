import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath='supabase/migrations/20261005144500_assembly_kits_v1.sql';
const sqlPath='supabase/sql/20261005_assembly_kits_v1.sql';

assert.ok(fs.existsSync(migrationPath),`missing ${migrationPath}`);
assert.ok(fs.existsSync(sqlPath),`missing ${sqlPath}`);

for(const path of [migrationPath,sqlPath]){
  const source=fs.readFileSync(path,'utf8');
  assert.match(source,/create table if not exists public\.assembly_kits/i,'assembly_kits table must exist');
  assert.match(source,/create table if not exists public\.assembly_kit_items/i,'assembly_kit_items table must exist');
  assert.match(source,/create table if not exists public\.assembly_search_chips/i,'assembly_search_chips table must exist');
  assert.match(source,/check\s*\(\s*type\s+in\s*\(\s*'food'\s*,\s*'cleaning_hygiene'\s*,\s*'other'\s*\)\s*\)/i,'kit type must be constrained');
  assert.match(source,/unique\s*\(\s*kit_id\s*,\s*product_id\s*\)/i,'kit items must be unique by product');
  assert.match(source,/quantity[^\n]*check\s*\(\s*quantity\s*>\s*0\s*\)/i,'kit item quantity must be positive');
  assert.match(source,/alter table public\.assembly_kits enable row level security/i,'assembly_kits RLS required');
  assert.match(source,/alter table public\.assembly_kit_items enable row level security/i,'assembly_kit_items RLS required');
  assert.match(source,/alter table public\.assembly_search_chips enable row level security/i,'assembly_search_chips RLS required');
  assert.match(source,/revoke all on public\.assembly_kits from public,anon,authenticated/i,'assembly_kits must not be client writable');
  assert.match(source,/grant all on public\.assembly_kits to service_role/i,'service_role must own kit writes');
  assert.match(source,/create or replace function public\.save_assembly_kit_v1\s*\(/i,'save_assembly_kit_v1 RPC must exist');
  assert.match(source,/create or replace function public\.archive_assembly_kit_v1\s*\(/i,'archive_assembly_kit_v1 RPC must exist');
  assert.match(source,/revoke all on function public\.save_assembly_kit_v1[\s\S]*from public,anon,authenticated/i,'save RPC must be service-role only');
  assert.match(source,/grant execute on function public\.save_assembly_kit_v1[\s\S]*to service_role/i,'save RPC service role grant required');

  const saveStart=source.search(/create or replace function public\.save_assembly_kit_v1/i);
  const archiveStart=source.search(/create or replace function public\.archive_assembly_kit_v1/i);
  assert.ok(saveStart>=0&&archiveStart>saveStart,'save RPC must be declared before archive RPC');
  const saveSource=source.slice(saveStart,archiveStart);
  assert.match(saveSource,/group by\s+product_id/i,'duplicate products must be aggregated before storage');
  assert.doesNotMatch(saveSource,/basket_stock_lots|basket_lot_component_reservations|basket_locked_component_stock_v1/i,'saving a recipe must not reserve or mutate basket stock');
}

console.log('assembly kits domain v1: PASS');
