import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const ui = fs.readFileSync(new URL('vitrine/admin/leitura-ean/index.html', root), 'utf8');
const ean = fs.readFileSync(new URL('supabase/functions/admin-ean-capture-v1/index.ts', root), 'utf8');
const products = fs.readFileSync(new URL('supabase/functions/admin-products-live-v1/index.ts', root), 'utf8');
const admin = fs.readFileSync(new URL('vitrine/admin/admin-runtime.js', root), 'utf8');
const migration = fs.readFileSync(new URL('supabase/migrations/20261021100000_oscb_gtin_research_cache_v1.sql', root), 'utf8');

assert.match(admin, /<option value="created_desc">Cadastros mais recentes<\/option>/,
  'admin should offer a creation-date sort distinct from last updated');
assert.match(products, /"created_desc"/,
  'products API should accept the creation-date sort');
assert.match(products, /sort==="created_desc"\)q=q\.order\("created_at",\{ascending:false\}\)/,
  'products API should order newest product registrations first');
assert.match(ean, /oscb_reserve_gtin_lookup_v1/,
  'lookups should use the atomic quota reservation');
assert.match(migration, /p_gtin text[\s\S]*pg_advisory_xact_lock/,
  'quota reservation should serialize concurrent external lookups');
assert.match(migration, /status in \('review', 'not_found'\)/,
  'completed GTIN states should be terminal');
assert.match(migration, /oscb_gtin_research_attempts_v1/,
  'external attempts should be counted independently of capture rows');
assert.match(ean, /from\("oscb_gtin_research_cache_v1"\)/,
  'completed results should be shared across duplicate or recreated capture rows');
assert.match(ui, /!\['review','not_found'\]\.includes\(r\.cosmos_research\.status\)/,
  'UI should hide the external lookup button after a completed product result');
assert.match(ui, /Consultar OSCBR \(manual\)/,
  'manual external lookup should be labeled OSCBR');
assert.match(ui, /Nenhum produto localizado\. Esta consulta foi encerrada/,
  'not-found EANs should remain terminal and clearly separated for manual handling');

console.log('catalog priority assertions passed');
