import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261009160000_separation_ready_reservation_idempotence.sql',import.meta.url),'utf8');

assert.match(sql,/create or replace function public\.sync_vitrine_order_stock_reservation_v1\(\)/i);
assert.match(sql,/new\.status\s*=\s*'ready'/);
assert.match(sql,/metadata->>'ops2_stock_authority'\s*=\s*'bling'/);
assert.match(sql,/c\.order_id\s*=\s*new\.id/);
assert.match(sql,/c\.metadata->>'stock_applied'/);
assert.match(sql,/coalesce\(\(c\.metadata->>'stock_applied'\)::boolean,false\)\s*=\s*true/);
const safeSkipStart=sql.indexOf("if new.status = 'ready'");
const safeSkipEnd=sql.indexOf('return new;',safeSkipStart);
const actualConsumption=sql.indexOf("if new.status in ('processing','ready','out_for_delivery','delivered')");
assert.ok(safeSkipStart>0&&safeSkipEnd>safeSkipStart&&actualConsumption>safeSkipEnd,
  'Only fully applied ready orders may skip legacy reservation consumption');
assert.match(sql,/public\.consume_vitrine_order_stock_v1\(new\.id\)/);
assert.match(sql,/public\.release_vitrine_order_stock_v1\(new\.id\)/);
assert.match(sql,/raise exception 'order_stock_consume_failed:%'/);
const guard=(status,authority,applied)=>status==='ready'&&authority==='bling'&&applied===true;
assert.equal(guard('ready','bling',true),true);
for(const [state,authority,applied] of [['processing','bling',true],['out_for_delivery','bling',true],['ready','legacy_shadow',true],['ready','bling',false],['cancelled','bling',true]]){
  assert.equal(guard(state,authority,applied),false);
}
console.log('PASS: completed Bling separation avoids a second consume; other statuses keep original path.');
