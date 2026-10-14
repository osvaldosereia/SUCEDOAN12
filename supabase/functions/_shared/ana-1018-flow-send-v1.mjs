import {create1018FlowToken,sha2561018FlowToken,build1018FlowDraftMessage} from './ana-1018-flow-outbound-v1.mjs';

// Pilot-only send coordinator. Injected dependencies make this testable without Meta.
// Never retries a Meta send after an ambiguous network result.
export async function send1018PilotFlow({enabled=false,accountId,expectedAccountId,
 customerPhone,flowId,release,db,send,mode='draft',serviceWindowVerified=false}={}){
 if(!enabled)return {ok:false,reason:'disabled'};
 if(!accountId||accountId!==expectedAccountId)return {ok:false,reason:'wrong_account'};
 if(release?.mode!=='pilot'||!Number.isSafeInteger(release.generation)||release.generation<1)
  return {ok:false,reason:'pilot_inactive'};
 if(serviceWindowVerified!==true)return {ok:false,reason:'service_window_unverified'};
 if(typeof db?.rpc!=='function'||typeof send!=='function')
  return {ok:false,reason:'dependencies_missing'};
 const token=create1018FlowToken();
 const hash=await sha2561018FlowToken(token);
 let payload;
 try{payload=build1018FlowDraftMessage({toE164:customerPhone,flowId,flowToken:token,mode})}
 catch{return {ok:false,reason:'invalid_message'}};
 let response;
 try{response=await send(payload)}
 catch{return {ok:false,reason:'send_uncertain',requiresReconciliation:true}};
 const wamid=response?.messages?.[0]?.id;
 if(typeof wamid!=='string'||!/^wamid[.][A-Za-z0-9._:-]{6,240}$/.test(wamid))
  return {ok:false,reason:'wamid_missing',requiresReconciliation:true};
 let registered;
 try{registered=await db.rpc('ops2_1018_flow_session_register_v1',{
   p_whatsapp_account_id:accountId,p_customer_phone_e164:customerPhone,
   p_flow_id:flowId,p_outbound_message_id:wamid,
   p_token_sha256:hash,p_release_generation:release.generation,p_ttl_seconds:900
 })}
 catch{return {ok:false,reason:'registration_uncertain',requiresReconciliation:true}};
 if(registered?.error||registered?.data?.ok!==true)
  return {ok:false,reason:'registration_failed',requiresReconciliation:true};
 return {ok:true,sessionId:registered.data.session_id,outboundMessageId:wamid,
  releaseGeneration:release.generation};
}
