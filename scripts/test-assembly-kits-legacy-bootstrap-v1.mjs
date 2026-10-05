import fs from 'node:fs';
import assert from 'node:assert/strict';

const migrationPath='supabase/migrations/20261005171500_assembly_kits_legacy_bootstrap_v1.sql';
const sqlPath='supabase/sql/20261005_assembly_kits_legacy_bootstrap_v1.sql';

assert.ok(fs.existsSync(migrationPath),`missing ${migrationPath}`);
assert.ok(fs.existsSync(sqlPath),`missing ${sqlPath}`);

const migration=fs.readFileSync(migrationPath,'utf8');
const sql=fs.readFileSync(sqlPath,'utf8');
assert.equal(sql.trim(),migration.trim(),'SQL mirror must match migration');

assert.match(migration,/insert into public\.assembly_kits/i,'must create assembly kits from legacy recipes');
assert.match(migration,/from public\.basket_kit_templates\s+k/i,'must source legacy basket kit templates');
assert.match(migration,/k\.is_active\s*=\s*true/i,'must migrate only active legacy templates');
assert.match(migration,/exists\s*\(\s*select 1\s+from public\.basket_kit_template_items/i,'must skip empty legacy recipes');
assert.match(migration,/when k\.kind\s*=\s*'food'\s+then\s+'food'/i,'food kits must map to food');
assert.match(migration,/when k\.kind\s+in\s*\(\s*'hygiene'\s*,\s*'cleaning'\s*\)\s+then\s+'cleaning_hygiene'/i,'hygiene/cleaning kits must map to cleaning_hygiene');
assert.match(migration,/insert into public\.assembly_kit_items/i,'must copy legacy recipe items');
assert.match(migration,/from public\.basket_kit_template_items\s+i/i,'must source legacy recipe items');
assert.match(migration,/on conflict\s*\(id\)\s*do nothing/i,'bootstrap must be idempotent by legacy UUID');
assert.match(migration,/insert into public\.store_basket_recipe_kits/i,'must link imported recipes to commercial basket models');
assert.match(migration,/legacy\.basket_id\s+is not null/i,'only linked commercial models should receive recipe links');
assert.match(migration,/legacy_basket_kit_template_id/i,'must preserve legacy lineage in metadata');
assert.doesNotMatch(migration,/basket_stock_lots|basket_lot_component_reservations/i,'recipe bootstrap must not create or alter physical stock reservations');

console.log('assembly kits legacy bootstrap contract OK');
