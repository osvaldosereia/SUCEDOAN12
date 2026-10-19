import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8')+'\n'+fs.readFileSync('vitrine/admin/admin-runtime.js','utf8');
const service=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
const section=(source,begin,end)=>{
  const start=source.indexOf(begin);
  assert.ok(start>=0,'missing '+begin);
  const stop=source.indexOf(end,start+begin.length);
  assert.ok(stop>start,'missing end '+end);
  return source.slice(start,stop);
};
const update=section(service,'async function updateOrderCanonical(','\nasync function ');
const queue=section(service,'async function enqueuePickingPrint(','\nasync function cancelPendingPrints');
const assign=section(html,'  async function assignOrderSeparator(','\n  async function loadOrderSeparationSheet');
const item=section(html,'  async function setOrderSeparationItem(','\n  async function ');
const complete=section(html,'  async function completeOrderSeparation(','\n  async function ');
const packaging=section(html,'  async function showSeparationPackagingNotice(','\n  async function completeOrderSeparation');

for(const pattern of [
  /transitionAllowed\(cur,next\)/,
  /order_operational_data_incomplete/,
  /admin_order_stock_transition_atomic_v1/,
  /next==="confirmed"&&cur==="created"/,
  /print_queued=await enqueuePickingPrint/,
  /syncConfirmedOrderToBling/,
  /p_next_status:next/,
  /cancelPendingPrints\(oid\)/
])assert.match(update,pattern);
for(const pattern of [
  /ops_enqueue_print_job_v1/,
  /p_job_type:"picking"/,
  /p_printer_profile:"separation_85mm"/,
  /p_copies:1/,
  /p_idempotency_key:"picking:order:"\+oid\+":"\+versionKey/,
  /ops_open_attention_v1/,
  /print_queue_failed/,
  /return false/
])assert.match(queue,pattern);
for(const pattern of [/dataset\.separationBusy==='1'/,/order_separation_assign/,/separator_key:key/,/finally\{delete back\.dataset\.separationBusy\}/])assert.match(assign,pattern);
for(const pattern of [/dataset\.saving==='1'/,/order_separation_item_set/,/expected_order_updated_at:version/,/stale_order_version/,/order_version_conflict/,/separator_assignment_changed/])assert.match(item,pattern);
for(const pattern of [/if\(btn\.disabled\)return/,/order_separation_complete/,/expected_order_updated_at:expected/,/result\?\.status!=='ready'/,/persisted=true/,/if\(persisted\)/,/showSeparationPackagingNotice/])assert.match(complete,pattern);
assert.match(packaging,/resolveOriginalOrderCodeForPackaging/);
assert.match(packaging,/orders-packaging-backdrop/);
console.log('Admin confirmation, separation and print contract: PASS');
