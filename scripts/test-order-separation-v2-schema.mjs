import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath='supabase/migrations/20261003193000_order_separation_v2.sql';
assert.ok(fs.existsSync(migrationPath),`migration missing: ${migrationPath}`);
const sql=fs.readFileSync(migrationPath,'utf8');

for(const table of ['order_separation_assignments_v1','order_separation_items_v1','order_separation_completions_v1']){
  assert.match(sql,new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}`,'i'),`${table} must exist`);
  assert.match(sql,new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`,'i'),`${table} must enable RLS`);
  assert.match(sql,new RegExp(`revoke\\s+all\\s+on\\s+(?:table\\s+)?public\\.${table}\\s+from\\s+anon\\s*,\\s*authenticated`,'i'),`${table} must deny direct anon/authenticated access`);
}

assert.match(sql,/separator_key\s+text[\s\S]*check\s*\([\s\S]*jose[\s\S]*claudenil[\s\S]*kelly[\s\S]*jovenil/i,'separator keys must be constrained to the four approved people');
assert.match(sql,/state\s+text[\s\S]*check\s*\([\s\S]*pending[\s\S]*separated[\s\S]*missing/i,'item state must be pending|separated|missing');
assert.match(sql,/unique\s*\(\s*order_id\s*,\s*order_item_id\s*\)/i,'separation item must be unique per order item');
assert.match(sql,/order_separation_completions_v1[\s\S]*order_id\s+uuid[\s\S]*(?:unique\s*\(\s*order_id\s*\)|order_id\s+uuid\s+[^\n]*unique)/i,'completion must be unique per order');

for(const fn of [
  'ops2_init_order_separation_v2',
  'ops2_set_order_separator_v2',
  'ops2_set_order_separation_item_v2',
  'ops2_get_order_separation_v2'
]){
  assert.match(sql,new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`,'i'),`${fn} must exist`);
  assert.match(sql,new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${fn}`,'i'),`${fn} must not be public`);
  assert.match(sql,new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}`,'i'),`${fn} must be service-role callable`);
}

assert.match(sql,/ops2_init_order_separation_v2[\s\S]*insert\s+into\s+public\.order_separation_items_v1[\s\S]*on\s+conflict\s*\(\s*order_id\s*,\s*order_item_id\s*\)/i,'initialization must be idempotent');
assert.match(sql,/on\s+conflict[\s\S]*do\s+update[\s\S]*where[\s\S]*state\s*=\s*'pending'/i,'only pending rows may refresh canonical snapshots');

const itemFn=sql.slice(sql.toLowerCase().indexOf('create or replace function public.ops2_set_order_separation_item_v2'));
assert.match(itemFn,/p_expected_order_updated_at\s+timestamptz/i,'item state writes must require expected order version');
assert.match(itemFn,/stale_order_version|order_version_conflict/i,'stale clients must receive an explicit conflict marker');
assert.match(itemFn,/p_state[\s\S]*(pending|separated|missing)/i,'state writes must validate requested state');
assert.match(itemFn,/order_separation_completions_v1/i,'completed separation must block later item changes');
assert.match(itemFn,/order_item_id/i,'state write must scope to the canonical order item');

console.log('OK · separation v2 schema contract');
