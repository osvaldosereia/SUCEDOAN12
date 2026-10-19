import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const helperStart=source.indexOf('async function syncDeliveryStopBestEffort(');
const helperEnd=source.indexOf('async function rejectCriticalStatusBypass',helperStart);
assert.ok(helperStart>0&&helperEnd>helperStart,'missing non-blocking delivery projection helper');
const helper=source.slice(helperStart,helperEnd);
assert.match(helper,/ops_sync_delivery_stop_v1/);
assert.match(helper,/result\.error/,'RPC status errors must be checked even when transport succeeds');
assert.match(helper,/catch\(error\)/,'transport failures must be observed');
assert.match(helper,/delivery_stop_sync_failed/);
assert.equal((source.match(/await syncDeliveryStopBestEffort\(oid,/g)||[]).length,5);
assert.doesNotMatch(source,/try\{await db\.rpc\("ops_sync_delivery_stop_v1"[^}]*\}\)\}catch\{\}/,'legacy silent RPC failure');
for(const status of ['"ready"','"out_for_delivery"','"delivered"','next']){
  assert.ok(source.includes('syncDeliveryStopBestEffort(oid,'+status+')'),'missing delivery transition '+status);
}
const refreshStart=source.indexOf('async function refreshPublicOrderSnapshotBestEffort(');
const refreshEnd=source.indexOf('async function rejectCriticalStatusBypass',refreshStart);
assert.ok(refreshStart>0&&refreshEnd>refreshStart,'missing public snapshot best-effort helper');
const refresh=source.slice(refreshStart,refreshEnd);
assert.match(refresh,/ops2_refresh_order_public_snapshot_v1/);
assert.match(refresh,/result\.error/);
assert.match(refresh,/order_public_snapshot_refresh_failed/);
assert.equal((source.match(/await refreshPublicOrderSnapshotBestEffort\(oid\)/g)||[]).length,4);
assert.doesNotMatch(source,/try\{await db\.rpc\("ops2_refresh_order_public_snapshot_v1"[^}]*\}\)\}catch\{\}/);
console.log('Admin order delivery projection diagnostics contract: PASS');
