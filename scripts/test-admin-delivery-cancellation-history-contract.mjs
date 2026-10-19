import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('vitrine/admin/index.html','utf8')+'\n'+fs.readFileSync('vitrine/admin/admin-runtime.js','utf8')+'\n'+fs.readFileSync('vitrine/admin/orders/fiscal-controller.js','utf8')+'\n'+fs.readFileSync('vitrine/admin/orders/detail-controller.js','utf8')+'\n'+fs.readFileSync('vitrine/admin/orders/documents.js','utf8')+'\n'+fs.readFileSync('vitrine/admin/delivery/controller.js','utf8');
const api=fs.readFileSync('supabase/functions/admin-products-live-v1/index.ts','utf8');
function between(source,startToken,endToken){
  const start=source.indexOf(startToken);
  assert.ok(start>=0,'missing '+startToken);
  const end=source.indexOf(endToken,start+startToken.length);
  assert.ok(end>start,'missing end '+endToken+' after '+startToken);
  return source.slice(start,end);
}
const dispatch=between(api,'async function orderDispatchStartV4(','function rejectCriticalStatusBypass');
const bypass=between(api,'function rejectCriticalStatusBypass(','\nasync function updateOrderCanonical');
const fail=between(api,'async function registerFailedDelivery(','\nasync function confirmDeliveryReturn');
const ret=between(api,'async function confirmDeliveryReturn(','\nasync function reverseDeliveryReturnStockIfNeeded');
const review=between(api,'async function resolveDeliveryReturnReview(','\nasync function captureDeliveryPayment');
const payment=between(api,'async function captureDeliveryPayment(','\nfunction orderFiscalBlockers');
const finish=between(api,'async function finalizeCapturedDeliveryV4(','\nasync function ');
const cancel=between(html,'  async function cancelCurrentOrder(){','    return Object.freeze({openOrder,saveOrderV3');
const delivery=between(html,'  async function captureDeliveryPaymentAndFinish(){','\n  async function confirmDeliveryFromExpedition');
const uiDispatch=between(html,'  async function startOrderDispatchV4(','\n  function quickConfirmOrder');
const uiReturn=between(html,'  async function returnOrderToExpedition(','\n  async function confirmPhysicalDeliveryReturn');
for(const pattern of [/orderFiscalStatusV4/,/fiscal\.authorized!==true/,/delivery_return_open/,/ops4_start_dispatch_v1/,/p_idempotency_key:key/])assert.match(dispatch,pattern);
assert.match(bypass,/canonical_dispatch_required/);
assert.match(bypass,/canonical_delivery_required/);
for(const pattern of [/ops_register_failed_delivery_v1/,/invalid_delivery_failure_reason/,/payment_already_captured/])assert.match(fail,pattern);
assert.match(ret,/ops_confirm_delivery_return_v1/);
for(const pattern of [/supervisor_required/,/reverseDeliveryReturnStockIfNeeded/,/ops_resolve_delivery_return_review_v1/])assert.match(review,pattern);
for(const pattern of [/parts\.length>8/,/amount_cents<=0/,/ops_record_delivery_payment_v1/,/p_idempotency_key:"delivery-payment:"\+oid/])assert.match(payment,pattern);
for(const pattern of [/delivery_return_open/,/delivery_payment_required/,/delivery_payment_mismatch/,/\.eq\("status","out_for_delivery"\)/,/delivery_state_conflict/])assert.match(finish,pattern);
for(const pattern of [/cancellation_reason:reason/,/cancellation_note:note/,/currentOrderEditablePayload\('cancelled'/])assert.match(cancel,pattern);
for(const pattern of [/order_delivery_complete_v3/,/order_payment_capture/,/order_delivery_finalize_v4/,/total!==Number\(d\.order\.total_cents\|\|0\)/])assert.match(delivery,pattern);
assert.match(api,/a==="history_sync_retry"/,'history retry backend remains available');
for(const pattern of [/f\.authorized!==true/,/order_dispatch_start_v4/,/idempotency_key:'dispatch-v4:'\+id/])assert.match(uiDispatch,pattern);
for(const pattern of [/delivery_fail_register/,/status==='returning'/,/A mercadoria continuará fora do estoque vendável/])assert.match(uiReturn,pattern);
console.log('Admin delivery cancellation and history contract: PASS');
