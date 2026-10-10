import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/sql/20261005_store_basket_reservation_v1.sql','utf8');
const ui=fs.readFileSync('vitrine/admin/store-baskets-builder.js','utf8');

const reserve=sql.slice(sql.indexOf('create or replace function public.reserve_store_basket_recipe_v1'),sql.indexOf('create or replace function public.mount_store_basket_reservation_v1'));
const mount=sql.slice(sql.indexOf('create or replace function public.mount_store_basket_reservation_v1'),sql.indexOf('create or replace function public.cancel_store_basket_reservation_v1'));
const cancel=sql.slice(sql.indexOf('create or replace function public.cancel_store_basket_reservation_v1'),sql.indexOf('revoke all on function public.store_basket_builds_v1'));

// Reservation must be explicit and must not make baskets sellable before physical mounting.
assert.match(reserve,/insert into public\.basket_lot_component_reservations/i);
assert.match(reserve,/['"]active['"]/i);
assert.match(reserve,/quantity_available[^;]*0/i,'reserved lot must not expose sellable basket quantity');
assert.match(reserve,/sale_enabled[^;]*false/i,'reserved lot must stay unsellable');

// Mount converts, rather than duplicates, the reservation and only then exposes basket stock.
assert.match(mount,/status\s*=\s*['"]converted['"]/i);
assert.match(mount,/where[\s\S]*status\s*=\s*['"]active['"]/i,'mount must only convert active reservations');
assert.match(mount,/quantity_available\s*=\s*quantity_built/i);
assert.match(mount,/sale_enabled\s*=\s*true/i);
assert.match(mount,/status\s*=\s*['"]ready['"]/i);
assert.match(mount,/assembly_status\s*=\s*['"]mounted['"]/i);

// Cancel releases only a pre-mount reservation and never creates sellable stock.
assert.match(cancel,/status=['"]draft['"][\s\S]*assembly_status=['"]assembling['"]/i);
assert.match(cancel,/status\s*=\s*['"]released['"]/i);
assert.match(cancel,/where[\s\S]*status\s*=\s*['"]active['"]/i,'cancel must only release active reservations');
assert.match(cancel,/status\s*=\s*['"]cancelled['"]/i);
assert.match(cancel,/quantity_available\s*=\s*0/i);

// Operational UI must lock actions while a mutation is in flight and refresh build history afterwards.
assert.match(ui,/state\.busy\s*=\s*true/i,'UI must enter busy state before physical mutation');
assert.match(ui,/state\.busy\s*=\s*false/i,'UI must leave busy state after physical mutation');
assert.match(ui,/await\s+loadBuilds\(/i,'UI must refresh physical build history after mutation');
assert.match(ui,/data-store-cancel/i,'UI must expose reservation cancellation');
assert.match(ui,/data-store-mount/i,'UI must expose mount action');

console.log('store baskets operational safety v1: PASS');
