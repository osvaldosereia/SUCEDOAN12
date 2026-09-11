import fs from 'node:fs';
import assert from 'node:assert/strict';

const edge=fs.readFileSync('supabase/functions/admin-simple-v2/index.ts','utf8');
const app=fs.readFileSync('admin/app-lite.js','utf8');
const html=fs.readFileSync('admin/index.html','utf8');

assert.doesNotMatch(edge,/\.eq\("physically_verified",true\)\.range\(/,'products must not globally hide non-verified AI/inventory rows');
assert.match(edge,/source_system/,'products response must expose source_system');
assert.match(edge,/ai-review/,'products endpoint must support AI review filter');
assert.match(edge,/google_maps_url/,'customer API must support google_maps_url');
assert.match(app,/REVISÃO IA/,'Admin UI must identify AI review products');
assert.match(app,/google_maps_url/,'customer editor must include Google Maps URL');
assert.match(html,/Balanço rápido/,'Admin menu must expose quick inventory balance');
assert.match(html,/\.\.\/contagem\//,'quick balance must reuse existing inventory app');
assert.doesNotMatch(edge,/balance_scan|record_inventory_fast_balance_scan_v\d+|inventory-fast-balance-v\d+/,'public admin endpoint must not expose stock balance writes');

console.log('admin-v2-operational-contract ok');
