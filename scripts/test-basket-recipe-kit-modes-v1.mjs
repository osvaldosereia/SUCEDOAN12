import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath='supabase/migrations/20261005174500_basket_recipe_kit_modes_v1.sql';
const sqlPath='supabase/sql/20261005_basket_recipe_kit_modes_v1.sql';
assert.ok(fs.existsSync(migrationPath),`missing ${migrationPath}`);
assert.ok(fs.existsSync(sqlPath),`missing ${sqlPath}`);

const migration=fs.readFileSync(migrationPath,'utf8');
const sql=fs.readFileSync(sqlPath,'utf8');
assert.equal(sql.trim(),migration.trim(),'SQL mirror must match migration');

assert.match(migration,/add column if not exists component_mode text not null default 'additive'/i,'link table must store contribution mode');
assert.match(migration,/component_mode in \('mirror','additive'\)/i,'mode must be constrained to mirror/additive');
assert.match(migration,/legacy\.id\s*=\s*r\.kit_id/i,'existing legacy-linked recipe must be detected by kit UUID');
assert.match(migration,/legacy\.basket_id\s*=\s*r\.basket_id/i,'existing mirror detection must bind to the same basket');
assert.match(migration,/set\s+component_mode\s*=\s*'mirror'/i,'existing mirrored links must be backfilled');
assert.match(migration,/'component_mode',r\.component_mode/i,'read RPC must expose component mode');
assert.match(migration,/v_component_mode\s*:=\s*case/i,'save RPC must compute component mode server-side');
assert.match(migration,/legacy\.id\s*=\s*v_kit_id/i,'save RPC must compare selected kit with legacy template');
assert.match(migration,/legacy\.basket_id\s*=\s*p_basket_id/i,'save RPC must scope mirror detection to current basket');
assert.doesNotMatch(migration,/v_item\s*->>\s*'component_mode'/i,'client payload must not control component mode');
assert.doesNotMatch(migration,/basket_stock_lots|basket_lot_component_reservations|ops2_loose_sellable_stock_v1/i,'mode migration must not touch physical stock or lots');
assert.match(migration,/revoke all on function public\.basket_recipe_kits_v1\(uuid\) from public,anon,authenticated/i,'read RPC must stay server-only');
assert.match(migration,/grant execute on function public\.basket_recipe_kits_v1\(uuid\) to service_role/i,'service role must keep read execute');
assert.match(migration,/revoke all on function public\.save_basket_recipe_kits_v1\(uuid,jsonb,text\) from public,anon,authenticated/i,'save RPC must stay server-only');
assert.match(migration,/grant execute on function public\.save_basket_recipe_kits_v1\(uuid,jsonb,text\) to service_role/i,'service role must keep save execute');

console.log('basket recipe kit contribution modes contract OK');
