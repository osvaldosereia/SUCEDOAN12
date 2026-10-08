// ANA V3 R8: policy-only decision. No WhatsApp calls, SQL writes or automatic dispatch.
const policies=Object.freeze({
  delivered_notice:{category:'UTILITY',minMs:0,maxMs:24*60*60*1000},
  satisfaction_check:{category:'MARKETING',minMs:2*60*60*1000,maxMs:6*60*60*1000},
  reorder_reminder:{category:'MARKETING',minMs:10*24*60*60*1000,maxMs:30*24*60*60*1000}
});
const skip=reason=>({decision:'skip',reason});
const safeId=value=>/^[A-Za-z0-9_-]{8,80}$/.test(String(value||''));
const safeName=value=>/^[a-z0-9_]{1,64}$/.test(String(value||''));
const validDate=value=>{const ms=Date.parse(String(value||''));return Number.isFinite(ms)?ms:null};

export function evaluateAnaFollowupV1({
  event='',eventId='',orderId='',orderStatus='',eventAt='',now='',
  template=null,channel='whatsapp',marketingConsent='',optOut=false,
  hasOpenSupportCase=false,newPurchaseAfterEvent=false
}={}){
  const policy=policies[event];
  if(!policy)return skip('event_not_supported');
  if(channel!=='whatsapp'||!safeId(eventId)||!safeId(orderId))return skip('invalid_context');
  if(orderStatus!=='delivered')return skip('order_not_delivered');
  const start=validDate(eventAt),current=validDate(now);
  if(start===null||current===null||current<start)return skip('invalid_event_time');
  const elapsed=current-start;
  if(elapsed<policy.minMs)return skip('too_early');
  if(elapsed>policy.maxMs)return skip('window_expired');
  if(!template||!safeName(template.name)||template.status!=='APPROVED'
    ||template.category!==policy.category)return skip('template_not_approved_for_category');
  if(policy.category==='MARKETING'){
    if(optOut===true||marketingConsent==='NAO_CONTATAR')return skip('opted_out');
    if(marketingConsent!=='MKT_OK')return skip('marketing_consent_missing');
    if(hasOpenSupportCase===true)return skip('support_case_open');
    if(event==='reorder_reminder'&&newPurchaseAfterEvent===true)return skip('already_reordered');
  }
  return {
    decision:'queue_candidate',
    reason:'policy_gates_passed',
    category:policy.category,
    template_name:template.name,
    idempotency_key:'ana_v3:'+event+':'+orderId+':'+eventId,
    requires_final_consent_check:policy.category==='MARKETING',
    dispatch_authorized:false
  };
}
