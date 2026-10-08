import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const sql = fs.readFileSync('supabase/migrations/20261008032000_order_public_identity_at_creation_v1.sql', 'utf8');
const part = (start, end) => {
  const a = sql.indexOf(start);
  assert.ok(a !== -1, 'missing section: ' + start);
  const b = sql.indexOf(end, a + start.length);
  assert.ok(b !== -1, 'missing end section: ' + end);
  return sql.slice(a, b);
};

test('numeric order codes are exactly four digits; sequence does not cycle', () => {
  assert.match(sql, /minvalue\s+1000\s+maxvalue\s+9999\s+start with 1000[\s\S]*?no cycle/i);
  assert.match(sql, /lpad\(v_number::text,\s*4,\s*'0'\)/i);
  assert.match(sql, /when sqlstate '2200H'/i);
});

test('legacy AA000 public codes remain allowed and are not rewritten', () => {
  assert.match(sql, /public_code ~ '\^\[A-Z\]\{2\}\[0-9\]\{3\}\$'/);
  assert.match(sql, /public_code ~ '\^\[0-9\]\{4\}\$'/);
  assert.doesNotMatch(sql, /update\s+public\.order_public_snapshots_v1\s+set\s+public_code/i);
});

test('new snapshot INSERTs obtain an identity in a BEFORE INSERT trigger', () => {
  assert.match(sql, /alter column public_code drop default;/i);
  assert.match(sql, /before insert on public\.order_public_snapshots_v1 for each row/i);
  const resolver = part('create or replace function public.ops2_resolve_snapshot_public_identity_v1()', 'revoke all on function public.ops2_resolve_snapshot_public_identity_v1()');
  assert.match(resolver, /if v_existing is not null then\s+new\.public_code := v_existing;/i);
  assert.match(resolver, /elsif new\.public_code is null then\s+new\.public_code := public\.ops2_next_order_public_code_4d_v1\(\);/i);
  assert.doesNotMatch(sql, /'0000'/);
});

test('order creation does not invoke the sequence generator twice', () => {
  const assign = part('create or replace function public.ops2_assign_order_public_identity_v1()', 'revoke all on function public.ops2_assign_order_public_identity_v1()');
  assert.match(assign, /values\(new\.id,'\{\}'::jsonb,default\)\s+on conflict\(order_id\) do nothing;/i);
  assert.doesNotMatch(assign, /ops2_next_order_public_code_4d_v1\(/);
  assert.match(sql, /after insert on public\.orders for each row/i);
});

test('snapshot identity is immutable after insertion', () => {
  const guard = part('create or replace function public.ops2_guard_order_public_identity_v1()', 'revoke all on function public.ops2_guard_order_public_identity_v1()');
  assert.match(guard, /new\.public_code is distinct from old\.public_code/i);
  assert.match(guard, /new\.order_id is distinct from old\.order_id/i);
  assert.match(guard, /raise exception 'order_public_identity_immutable'/i);
  assert.match(sql, /before update on public\.order_public_snapshots_v1 for each row/i);
});

test('sequence privileges are not granted to public, anon or authenticated', () => {
  assert.match(sql, /revoke all on function public\.ops2_next_order_public_code_4d_v1\(\) from public, anon, authenticated;/i);
  assert.match(sql, /grant execute on function public\.ops2_next_order_public_code_4d_v1\(\) to service_role;/i);
  assert.match(sql, /grant usage on sequence public\.order_public_code_4d_seq_v1 to service_role;/i);
});

test('SQL function bodies use paired PostgreSQL dollar delimiters', () => {
  const count = (sql.match(/\$\$/g) || []).length;
  assert.equal(count, 8, 'four function bodies need opening/closing delimiters');
});

test('public snapshot refresh preserves public code on conflict', () => {
  const migration = fs.readFileSync('supabase/migrations/20261007143000_order_vitrines_hide_basket_line_v1.sql', 'utf8');
  assert.match(migration, /on conflict\(order_id\) do update\s+set snapshot=excluded\.snapshot,refreshed_at=now\(\);/i);
  assert.doesNotMatch(migration, /set public_code=excluded\.public_code/i);
});

test('all order service consumers accept both public identity formats', () => {
  for (const path of [
    'supabase/functions/admin-orders-v1/index.ts',
    'supabase/functions/admin-products-live-v1/index.ts',
    'supabase/functions/admin-order-vitrine-send-v1/index.ts',
    'supabase/functions/order-separation-notify-v1/index.ts'
  ]) {
    const source = fs.readFileSync(path, 'utf8');
    assert.ok(source.includes('^(?:[A-Z]{2}[0-9]{3}|[0-9]{4})$'), path + ' must accept four-digit public codes');
  }
});

test('outbound customer fields use public identity, not technical order number', () => {
  const source = fs.readFileSync('supabase/functions/admin-orders-v1/index.ts', 'utf8');
  assert.match(source, /order_number:publicOrderCode,/);
  assert.match(source, /order_number_short:publicOrderCode,/);
});
