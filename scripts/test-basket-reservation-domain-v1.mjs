import fs from 'node:fs';
import assert from 'node:assert/strict';

const sqlPath='supabase/sql/20261005_basket_component_reservations_v1.sql';
const migrationPath='supabase/migrations/20261005031000_basket_component_reservations_v1.sql';

assert.equal(fs.existsSync(sqlPath),true,'component reservation SQL must exist');
assert.equal(fs.existsSync(migrationPath),true,'component reservation migration must exist');

const sql=fs.readFileSync(sqlPath,'utf8');
const migration=fs.readFileSync(migrationPath,'utf8');

for(const source of [sql,migration]){
  assert.match(source,/alter table public\.basket_stock_lots[\s\S]*add column if not exists assembly_status/i,'lots must expose assembly_status');
  assert.match(source,/assembly_status[\s\S]*legacy[\s\S]*assembling[\s\S]*mounted/i,'assembly status must support legacy, assembling and mounted');
  assert.match(source,/create table if not exists public\.basket_lot_component_reservations/i,'explicit component reservation table must exist');
  assert.match(source,/quantity_reserved[\s\S]*check\s*\(quantity_reserved\s*>\s*0\)/i,'reserved quantity must stay positive');
  assert.match(source,/status[\s\S]*active[\s\S]*converted[\s\S]*released/i,'reservation lifecycle must be explicit');
  assert.match(source,/unique\s*\(lot_id,\s*product_id\)/i,'one reservation row per lot/product is required');
  assert.match(source,/enable row level security/i,'reservation table must have RLS enabled');
  assert.match(source,/revoke all on public\.basket_lot_component_reservations from public,anon,authenticated/i,'reservation table must not be public');
  assert.match(source,/grant all on public\.basket_lot_component_reservations to service_role/i,'service role must manage reservations');

  assert.match(source,/update public\.basket_stock_lots[\s\S]*assembly_status='mounted'[\s\S]*status in \('ready','depleted'\)/i,'existing ready/depleted lots must backfill as mounted');
  assert.match(source,/update public\.basket_stock_lots[\s\S]*assembly_status='legacy'[\s\S]*status='draft'/i,'existing draft lots must remain legacy/unreserved');

  const lockedStart=source.indexOf('create or replace view public.basket_locked_component_stock_v1');
  const looseStart=source.indexOf('create or replace view public.ops2_loose_sellable_stock_v1',lockedStart);
  assert.ok(lockedStart>=0&&looseStart>lockedStart,'locked stock and loose stock views must be redefined');
  const locked=source.slice(lockedStart,looseStart);
  assert.match(locked,/explicit_reservations/i,'locked stock must include explicit assembling reservations');
  assert.match(locked,/r\.status='active'/i,'only active reservations lock explicit stock');
  assert.match(locked,/assembly_status='assembling'/i,'explicit reservations must represent assembling lots');
  assert.match(locked,/l\.status in \('ready','depleted'\)/i,'legacy/mounted available lots must remain locked');
  assert.match(locked,/not exists[\s\S]*basket_lot_component_reservations/i,'ready lot fallback must avoid double-counting an active explicit reservation');
  assert.match(locked,/active_allocations/i,'active order allocations must remain in locked stock');
  assert.match(locked,/a\.status='allocated'/i,'only active allocations count');
  assert.doesNotMatch(locked,/l\.status='draft'[\s\S]*quantity_available/i,'legacy drafts must not become locked merely for being drafts');

  const loose=source.slice(looseStart,source.indexOf('create or replace view public.basket_lot_public_availability_v1',looseStart));
  assert.match(loose,/effective_sellable_stock[\s\S]*basket_locked_quantity[\s\S]*loose_sellable_stock/i,'loose stock must remain physical/effective minus basket locked');

  const availability=source.slice(source.indexOf('create or replace view public.basket_lot_public_availability_v1'));
  assert.match(availability,/assembly_status='assembling'[\s\S]*assembling/i,'assembling lots must get a non-public availability reason');
  assert.match(availability,/assembly_status[\s\S]*in \('legacy','mounted'\)/i,'only mounted or backward-compatible legacy ready lots may become public');
  assert.match(availability,/sale_enabled/i,'assembly state must not bypass sale_enabled');
}

console.log('basket reservation domain v1: PASS');
