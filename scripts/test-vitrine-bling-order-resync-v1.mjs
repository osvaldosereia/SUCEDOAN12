import fs from 'node:fs';
import assert from 'node:assert/strict';

const vitrine=fs.readFileSync('supabase/functions/vitrine-admin-v1/index.ts','utf8');
const hub=fs.readFileSync('supabase/functions/admin-service-intelligence-v1/index.ts','utf8');

assert.match(vitrine,/async function sha256Short\(value:string\)/);
assert.match(vitrine,/vitrine_qx:order:"\+orderId\+":v2:"\+digest/);
assert.match(vitrine,/admin_order_update/);
assert.match(vitrine,/blingRelevantChange/);
assert.match(vitrine,/\["processing","ready","out_for_delivery"\]\.includes\(effectiveStatus\)/);
assert.match(vitrine,/bling_order_queued:blingOrderQueued/);

assert.match(hub,/queueReason==="first_separation" \|\| payment\?\.stock_consumed===true/);
assert.match(hub,/function blingHubOrderManagedProjection\(order:any\)/);
assert.match(hub,/function blingHubOrderManagedDiff\(current:any,desired:any\)/);
assert.match(hub,/\/pedidos\/vendas\/"\+encodeURIComponent\(String\(blingOrderId\)\),"PUT",preview\.desired_order/);
assert.match(hub,/order_has_invoice/);
assert.match(hub,/post_update_order_mismatch/);
assert.match(hub,/updated_by_hub:updatedExisting/);
assert.match(hub,/updated:0,unchanged:0/);

console.log('OK · ressincronização segura de pedido no Bling');
