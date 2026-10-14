// Pure, fail-closed verification of a Flow completion against a stored outbound session.
// Caller must fetch the session by an unpredictable token hash from the server, never
// trust a session supplied by the client. Atomic consume/idempotency is handled in SQL.
const phone1018='+5565984491018';
const hex64=/^[a-f0-9]{64}$/i;
const id=/^[a-zA-Z0-9._:-]{6,256}$/;
export function verify1018FlowSession({completion,session,release,channelPhone,accountId,customerPhone,now=new Date()}={}){
  if(channelPhone!==phone1018)return {ok:false,reason:'not_1018'};
  if(!completion?.ok||completion?.actionable!==false||completion?.requiresSessionVerification!==true)
    return {ok:false,reason:'untrusted_completion'};
  if(!session||session.status!=='pending')return {ok:false,reason:'session_not_pending'};
  if(release?.mode!=='pilot'||!Number.isSafeInteger(release.generation)||release.generation<1
    ||session.release_generation!==release.generation)
    return {ok:false,reason:'pilot_not_active_or_generation_mismatch'};
  if(!accountId||session.whatsapp_account_id!==accountId)return {ok:false,reason:'account_mismatch'};
  if(!customerPhone||session.customer_phone_e164!==customerPhone)return {ok:false,reason:'customer_mismatch'};
  if(!id.test(String(session.flow_id||''))||!id.test(String(session.outbound_message_id||'')))
    return {ok:false,reason:'missing_flow_origin'};
  if(!hex64.test(String(session.flow_token_sha256||'')))return {ok:false,reason:'token_hash_invalid'};
  const issued=Date.parse(session.issued_at||''),expires=Date.parse(session.expires_at||''),current=now instanceof Date?now.getTime():NaN;
  if(!Number.isFinite(current)||!Number.isFinite(issued)||!Number.isFinite(expires)||expires<=issued
    ||expires-issued>30*60*1000||current<issued||current>=expires)
    return {ok:false,reason:'session_expired_or_invalid'};
  if(!id.test(String(session.inbound_message_id||''))&&session.inbound_message_id!=null)
    return {ok:false,reason:'invalid_inbound_reference'};
  if(session.inbound_message_id!=null)return {ok:false,reason:'session_already_consumed'};
  return {ok:true,verified:true,intent:completion.intent,kind:completion.kind,
    requiresHuman:completion.requiresHuman,requiresOrderLookup:completion.requiresOrderLookup,
    allowOrderMutation:false,allowCustomerMutation:false,allowPriceChange:false,
    allowInventoryChange:false,allowMessageSend:false,actionable:false,
    requiresAtomicConsume:true};
}
