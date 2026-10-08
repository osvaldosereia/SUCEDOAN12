import assert from 'node:assert/strict';
import {evaluateAnaFollowupV1 as evaluate} from '../supabase/functions/_shared/ana-followup-policy-v1.mjs';

const base={
  event:'satisfaction_check',eventId:'evt_12345678',orderId:'123e4567-e89b-42d3-a456-426614174000',
  orderStatus:'delivered',eventAt:'2026-10-08T00:00:00Z',now:'2026-10-08T03:00:00Z',
  channel:'whatsapp',template:{name:'satisfacao_v1',status:'APPROVED',category:'MARKETING'},
  marketingConsent:'MKT_OK'
};
const decide=changes=>evaluate({...base,...changes});
const accepted=decide({});
assert.equal(accepted.decision,'queue_candidate');
assert.equal(accepted.category,'MARKETING');
assert.equal(accepted.dispatch_authorized,false);
assert.equal(accepted.requires_final_consent_check,true);
assert.equal(decide({}).idempotency_key,accepted.idempotency_key);
assert.equal(decide({marketingConsent:''}).reason,'marketing_consent_missing');
assert.equal(decide({marketingConsent:'NAO_CONTATAR'}).reason,'opted_out');
assert.equal(decide({optOut:true}).reason,'opted_out');
assert.equal(decide({template:{...base.template,category:'UTILITY'}}).reason,'template_not_approved_for_category');
assert.equal(decide({template:{...base.template,status:'PENDING'}}).reason,'template_not_approved_for_category');
assert.equal(decide({now:'2026-10-08T01:00:00Z'}).reason,'too_early');
assert.equal(decide({now:'2026-10-08T07:00:00Z'}).reason,'window_expired');
assert.equal(decide({orderStatus:'confirmed'}).reason,'order_not_delivered');
assert.equal(decide({hasOpenSupportCase:true}).reason,'support_case_open');
assert.equal(decide({channel:'email'}).reason,'invalid_context');
assert.equal(decide({event:'unsupported'}).reason,'event_not_supported');
assert.equal(decide({eventAt:'not-a-date'}).reason,'invalid_event_time');
assert.equal(decide({eventId:'x'}).reason,'invalid_context');
const utility=decide({
  event:'delivered_notice',now:'2026-10-08T00:05:00Z',marketingConsent:'',optOut:true,
  template:{name:'pedido_entregue',status:'APPROVED',category:'UTILITY'}
});
assert.equal(utility.decision,'queue_candidate','operational Utility must not be mistaken for marketing');
assert.equal(utility.category,'UTILITY');
assert.equal(utility.requires_final_consent_check,false);
assert.equal(utility.dispatch_authorized,false);
assert.equal(decide({event:'delivered_notice',template:base.template}).reason,'template_not_approved_for_category');
const reorder={
  event:'reorder_reminder',now:'2026-10-20T00:00:00Z',
  template:{name:'recompra_v1',status:'APPROVED',category:'MARKETING'}
};
assert.equal(decide({...reorder,newPurchaseAfterEvent:true}).reason,'already_reordered');
assert.equal(decide({...reorder,newPurchaseAfterEvent:false}).decision,'queue_candidate');
assert.equal(decide({...reorder,now:'2026-10-10T00:00:00Z'}).reason,'too_early');
console.log('PASS: ANA V3 R8 follow-up policy is consent-gated, template-gated and dispatch-disabled');
