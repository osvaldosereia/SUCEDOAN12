import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(
  'supabase/migrations/20261008031000_order_addon_lock_order_v2.sql', 'utf8'
);
const orderLookup = sql.indexOf('select order_id into v_order_id');
const orderLock = sql.indexOf('where id=v_order_id for update');
const sessionLock = sql.indexOf('and order_id=v_order.id for update');
assert.ok(orderLookup > 0 && orderLock > orderLookup && sessionLock > orderLock,
  'the order must be locked before its add-on session');
assert.match(sql, /where token_hash=v_token_hash and order_id=v_order\.id for update/);
assert.match(sql, /position\(v_old in v_def\)=0 or position\(v_late in v_def\)=0/,
  'fail closed if source RPC has drifted');
assert.match(sql, /replace\(v_def,v_old,v_new\)/);
assert.match(sql, /replace\(v_def,v_late,''\)/,
  'remove the old late order lock');
assert.match(sql, /pg_get_functiondef\('public\.ops3_add_items_to_existing_order_v1\(text,text,jsonb\)'::regprocedure\)/);
assert.match(sql, /reserve_vitrine_order_stock_v1/);
assert.match(sql, /idempotent_replay/);
assert.doesNotMatch(sql, /insert into public\.orders/i);
console.log('PASS: canonical order-first lock migration contract (10 assertions)');
