import {classify1018MetaFlowMessage,locateSignedMetaFlowReply} from './ana-1018-meta-flow-completion-v1.mjs';

// Disabled by default. Only signed, canonical 1018 inbound nfm_reply events are
// eligible. This helper ONLY consumes the session atomically; it never sends
// a WhatsApp message or mutates customer/order/catalog data.
export async function handle1018FlowWebhook({
  enabled=false,expectedAccountId,expectedFlowId,
  canonicalMessage,signedPayload,ingestResult,db,signatureVerified=false
}={}){
  if(enabled!==true||!expectedAccountId||!expectedFlowId)return {handled:false,reason:'disabled'};
  if(canonicalMessage?.whatsapp_account_id!==expectedAccountId)return {handled:false,reason:'another_account'};
  if(canonicalMessage?.message?.metadata?.interactive?.type!=='nfm_reply')return {handled:false,reason:'not_flow'};
  const raw=locateSignedMetaFlowReply({canonicalMessage,signedPayload});
  let flowToken='';
  try{flowToken=JSON.parse(raw||'')?.flow_token||''}catch{/* invalid input */}
  if(typeof flowToken!=='string'||!flowToken.startsWith('da1018_'))
    return {handled:false,reason:'not_pilot_flow'};
  // No duplicate callback may initiate another database transaction.
  if(ingestResult?.duplicate===true)return {handled:true,duplicate:true,consumed:false};
  if(!ingestResult?.message_id||!canonicalMessage?.provider_message_id||!canonicalMessage?.phone_e164)
    return {handled:true,rejected:true,reason:'missing_canonical_identity'};
  const parsed=await classify1018MetaFlowMessage({
    canonicalMessage,signedPayload,channelPhone:'+5565984491018',signatureVerified
  });
  if(!parsed.ok)return {handled:true,rejected:true,reason:parsed.reason};
  if(typeof db?.rpc!=='function')return {handled:true,rejected:true,reason:'session_store_unavailable'};
  const consumed=await db.rpc('ops2_1018_flow_session_consume_v1',{
    p_whatsapp_account_id:expectedAccountId,
    p_customer_phone_e164:canonicalMessage.phone_e164,
    p_token_sha256:parsed.flowTokenSha256,
    p_flow_id:expectedFlowId,
    p_inbound_message_id:canonicalMessage.provider_message_id,
    p_intent:parsed.intent
  });
  if(consumed.error)return {handled:true,rejected:true,reason:'session_rpc_error'};
  if(consumed.data?.ok!==true)return {handled:true,rejected:true,reason:String(consumed.data?.error||'session_not_verified')};
  return {handled:true,consumed:consumed.data.replayed!==true,replayed:consumed.data.replayed===true,
    intent:parsed.intent,requiresHuman:parsed.requiresHuman,requiresOrderLookup:parsed.requiresOrderLookup,
    allowOrderMutation:false,allowMessageSend:false};
}
