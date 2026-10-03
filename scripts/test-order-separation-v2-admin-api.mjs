import assert from 'node:assert/strict';
import fs from 'node:fs';

const file='supabase/functions/admin-products-live-v1/index.ts';
const src=fs.readFileSync(file,'utf8');

for(const action of ['order_separation_get','order_separation_assign','order_separation_item_set','order_separation_complete']){
  assert.ok(src.includes(`"${action}"`),`${action} must be registered in the Admin gateway`);
}
for(const action of ['order_separation_assign','order_separation_item_set','order_separation_complete']){
  const write=src.slice(src.indexOf('const WRITE_ACTIONS=new Set'),src.indexOf('const cors='));
  assert.ok(write.includes(`"${action}"`),`${action} must be a protected write action`);
}

assert.match(src,/async function adminAuth\(r:Request\)[\s\S]*Authorization[\s\S]*db\.auth\.getUser\(token\)[\s\S]*admin_users/i,'separation actions must reuse the existing Admin Bearer auth');
assert.match(src,/async function orderSeparationGet\(/,'Admin API must have a separation read handler');
assert.match(src,/ops2_get_order_separation_v2/,'read handler must use canonical separation RPC');
assert.match(src,/async function orderSeparationAssign\(/,'Admin API must have assignment handler');
assert.match(src,/ops2_set_order_separator_v2/,'assignment must persist through canonical RPC');
assert.match(src,/async function orderSeparationItemSet\(/,'Admin API must have per-item state handler');
assert.match(src,/ops2_set_order_separation_item_v2/,'item state must persist through canonical RPC');
assert.match(src,/stale_order_version|order_version_conflict/,'Admin API must preserve explicit stale-client conflicts');

const completeStart=src.indexOf('async function orderSeparationComplete');
assert.ok(completeStart>=0,'completion orchestrator missing');
const complete=src.slice(completeStart,src.indexOf('\nasync function ',completeStart+20)>completeStart?src.indexOf('\nasync function ',completeStart+20):src.length);
for(const marker of [
  'ops2_prepare_order_separation_completion_v2',
  'ops2_apply_order_separation_stock_v2',
  'ops2_refresh_order_public_snapshot_v1',
  'verified',
  'ready',
  'ops2_fiscal_dispatch_preflight_v1',
  'ops2_launch_physical_stock',
  'out_for_delivery',
  'ops2_mark_order_separation_completion_v2'
]) assert.ok(complete.includes(marker),`completion orchestrator missing phase marker: ${marker}`);
assert.match(complete,/needs_attention/i,'external failures must leave a recoverable completion state');
assert.match(complete,/physical_stock_launched/i,'physical stock success must be recorded before final status');

assert.match(src,/async function buildSnapshot\(oid:string,reason="first_separation"[^)]*\)/,'buildSnapshot must remain the canonical Bling snapshot builder');
assert.match(src,/deliverable_order_item_ids|order_separation_completions_v1/,'post-separation snapshots must filter to deliverable order lines');

const router=src.slice(src.indexOf('Deno.serve('));
assert.match(router,/a==="order_separation_get"/,'router must expose authenticated separation GET');
assert.match(router,/a==="order_separation_assign"/,'router must expose assignment write');
assert.match(router,/a==="order_separation_item_set"/,'router must expose item-state write');
assert.match(router,/a==="order_separation_complete"/,'router must expose completion write');
assert.doesNotMatch(src,/public_token[\s\S]{0,200}order_separation_(?:assign|item_set|complete)/i,'Admin mutations must never be authorized by public order token');

console.log('OK · separation v2 authenticated Admin API contract');
