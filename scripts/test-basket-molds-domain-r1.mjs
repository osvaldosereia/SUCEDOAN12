import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql=fs.readFileSync('supabase/sql/20261006_basket_molds_domain_v1.sql','utf8');

assert.match(sql,/create table if not exists public\.basket_molds/i,'basket_molds table required');
assert.match(sql,/public_composition_count\s+smallint[\s\S]*check\s*\(\s*public_composition_count\s+between\s+1\s+and\s+4\s*\)/i,'mold must support 1..4 public compositions');
assert.match(sql,/hidden_value\s+numeric/i,'fixed hidden value belongs to mold domain');
assert.match(sql,/create table if not exists public\.basket_mold_positions/i,'positions table required');
assert.match(sql,/quantity\s+numeric[\s\S]*check\s*\(\s*quantity\s*>\s*0\s*\)/i,'position quantity must be positive');
assert.match(sql,/create table if not exists public\.basket_mold_position_options/i,'position options table required');
assert.match(sql,/product_id\s+uuid[\s\S]*references\s+public\.products\s*\(\s*id\s*\)/i,'options must point to canonical products');
assert.match(sql,/unique\s*\(\s*position_id\s*,\s*product_id\s*\)/i,'same product cannot be duplicated in one position');
assert.match(sql,/enable row level security/i,'new public tables must enable RLS');
assert.match(sql,/revoke all on table public\.basket_molds from public, anon, authenticated/i,'molds must not be exposed to public roles');
assert.match(sql,/grant select, insert, update, delete on table public\.basket_molds to service_role/i,'service role must have explicit access');
assert.match(sql,/create or replace function public\.basket_mold_domain_v1/i,'service-only read model required');
assert.match(sql,/revoke all on function public\.basket_mold_domain_v1\(uuid\) from public, anon, authenticated/i,'domain reader must not be public');
assert.match(sql,/grant execute on function public\.basket_mold_domain_v1\(uuid\) to service_role/i,'domain reader must be service-role only');

console.log('basket molds domain r1: PASS');
