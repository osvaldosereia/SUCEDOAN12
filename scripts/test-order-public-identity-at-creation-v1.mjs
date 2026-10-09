import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const read = p => fs.readFileSync(p,'utf8');
const sql = read('supabase/migrations/20261008032000_order_public_identity_at_creation_v1.sql');
const portion = (start,end) => {
  const a=sql.toLowerCase().indexOf(start.toLowerCase());
  assert.ok(a>=0,'missing '+start);
  const b=sql.toLowerCase().indexOf(end.toLowerCase(),a+start.length);
  assert.ok(b>a,'missing '+end);
  return sql.slice(a,b);
};

test('R03 number generated atomically once per Monday-Sunday week',()=>{
  assert.match(sql,/create table if not exists public\.order_public_weekly_counters_v1/i);
  assert.match(sql,/week_start date primary key/i);
  assert.match(sql,/between 1 and 999/i);
  assert.match(sql,/at time zone 'America\/Cuiaba'/i);
  assert.match(sql,/extract\(isodow from v_date\)/i);
  assert.match(sql,/on conflict \(week_start\)\s+do update set last_seq=/i);
  assert.match(sql,/to_char\(v_date,'DD\|MM\|YYYY'\)/i);
  assert.doesNotMatch(sql,/create sequence if not exists public\.order_public_code_4d_seq_v1/i);
});

test('R03 before-order-insert number equals after-order-insert snapshot',()=>{
  const assign=portion('create or replace function public.ops2_assign_order_weekly_number_v1()','revoke all on function public.ops2_assign_order_weekly_number_v1()');
  assert.match(assign,/new\.order_number := public\.ops2_next_order_public_code_weekly_v1/i);
  assert.match(sql,/before insert on public\.orders for each row/i);
  const snapshot=portion('create or replace function public.ops2_assign_order_public_identity_v1()','revoke all on function public.ops2_assign_order_public_identity_v1()');
  assert.match(snapshot,/values\(new\.id,'\{\}'::jsonb,new\.order_number\)/i);
  assert.match(snapshot,/on conflict\(order_id\) do nothing/i);
  assert.match(sql,/after insert on public\.orders for each row/i);
});

test('R03 historical codes remain valid and untouched',()=>{
  assert.ok(sql.includes("public_code ~ '^[A-Z]{2}[0-9]{3}$'"));
  assert.ok(sql.includes("public_code ~ '^[0-9]{4}$'"));
  assert.ok(sql.includes("public_code ~ '^[0-9]{2}[|][0-9]{2}[|][0-9]{4} - [0-9]{3}$'"));
  assert.doesNotMatch(sql,/update\s+public\.order_public_snapshots_v1\s+set\s+public_code/i);
});

test('R03 snapshot refresh and order identity are immutable',()=>{
  assert.match(sql,/alter column public_code drop default;/i);
  const resolver=portion('create or replace function public.ops2_resolve_snapshot_public_identity_v1()','revoke all on function public.ops2_resolve_snapshot_public_identity_v1()');
  assert.match(resolver,/if v_existing is not null then\s+new\.public_code := v_existing;/i);
  assert.match(resolver,/new\.public_code := v_order_number/i);
  assert.match(resolver,/pg_catalog\.pg_advisory_xact_lock/i);
  assert.match(sql,/new\.order_number is distinct from old\.order_number/i);
  assert.match(sql,/new\.public_code is distinct from old\.public_code/i);
  assert.match(sql,/new\.order_id is distinct from old\.order_id/i);
});

test('R03 weekly allocator is protected from anon/authenticated',()=>{
  assert.match(sql,/alter table public\.order_public_weekly_counters_v1 enable row level security;/i);
  assert.match(sql,/revoke all on public\.order_public_weekly_counters_v1 from public, anon, authenticated;/i);
  assert.match(sql,/revoke all on function public\.ops2_next_order_public_code_weekly_v1\(timestamptz\)/i);
  assert.match(sql,/grant execute on function public\.ops2_next_order_public_code_weekly_v1\(timestamptz\)[\s\S]*?to service_role;/i);
});

test('R03 dollar quote function boundaries have matching pairs',()=>{
  for(const token of ['weekly','assign','guard','snapshot','order_snapshot','guard_snapshot','public_snapshot']){
    assert.equal((sql.match(new RegExp('\\$'+token+'\\$','g'))||[]).length,2,token);
  }
});

test('R03 public snapshot refresh never overwrites public code',()=>{
  const source=read('supabase/migrations/20261007143000_order_vitrines_hide_basket_line_v1.sql');
  assert.match(source,/on conflict\(order_id\) do update\s+set snapshot=excluded\.snapshot,refreshed_at=now\(\);/i);
  assert.doesNotMatch(source,/set public_code=excluded\.public_code/i);
});

test('R03 all six consumer surfaces accept old and new number formats',()=>{
  for(const path of [
    'supabase/functions/admin-orders-v1/index.ts',
    'supabase/functions/admin-products-live-v1/index.ts',
    'supabase/functions/admin-order-vitrine-send-v1/index.ts',
    'supabase/functions/order-separation-notify-v1/index.ts',
    'montar/app.js',
    'vitrine/admin/index.html'
  ]){
    const source=read(path);
    assert.ok(source.includes('[|][0-9]{2}[|]')||source.includes('[|]\\d{2}[|]'),path+' missing weekly regex');
    assert.ok(source.includes('[A-Z]{2}'),path+' missing legacy format');
  }
});

test('R03 customer-facing APIs cannot truncate 16 character number',()=>{
  assert.doesNotMatch(read('supabase/functions/admin-orders-v1/index.ts'),/text\(publicOrderLink\?\.public_code,5\)/);
  assert.doesNotMatch(read('supabase/functions/admin-products-live-v1/index.ts'),/tx\(row\.public_code,5\)/);
  assert.doesNotMatch(read('supabase/functions/admin-order-vitrine-send-v1/index.ts'),/clean\(link\.public_order_code,5\)/);
  assert.doesNotMatch(read('supabase/functions/order-separation-notify-v1/index.ts'),/clean\(publicLinkQ\.data\?\.public_code,5\)/);
  const source=read('supabase/functions/admin-orders-v1/index.ts');
  assert.match(source,/order_number:publicOrderCode,/);
  assert.match(source,/order_number_short:publicOrderCode,/);
});

test('R03 first item populates empty snapshot without reassigning code',()=>{
  const fn=portion('create or replace function public.ops2_order_item_public_snapshot_trigger_v1()','$public_snapshot$;');
  assert.match(fn,/s\.snapshot <> '\{\}'::jsonb/i);
  assert.match(fn,/perform public\.ops2_refresh_order_public_snapshot_v1\(new\.order_id\)/i);
  assert.doesNotMatch(fn,/new\.public_code\s*:=/i);
});
