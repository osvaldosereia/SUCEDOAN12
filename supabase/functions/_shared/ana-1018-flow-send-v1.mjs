import {create1018FlowToken,sha2561018FlowToken,build1018FlowDraftMessage} from './ana-1018-flow-outbound-v1.mjs';

// Isolated pilot coordinator: reserve before sending, finalize WAMID atomically.
// Never retries an ambiguous Meta send. Does not call Meta unless caller injects
// an approved sender, verified service window, and active 1018 pilot generation.
export async function send1018PilotFlow({enabled=false,accountId,expectedAccountId,
 customerPhone,flowId,release,db,send,mode='draft',serviceWindowVerified=false,sendAuthorization=null}={}){
 if(!enabled)return {ok:false,reason:'disabled'};
 if(!accountId||accountId!==expectedAccountId)return {ok:false,reason:'wrong_account'};
 if(release?.mode!=='pilot'||!Number.isSafeInteger(release.generation)||release.generation<1)
  return {ok:false,reason:'pilot_inactive'};
 if(serviceWindowVerified!==true)return {ok:false,reason:'service_window_unverified'};
 if(sendAuthorization?.channel!=='1018'||sendAuthorization?.accountId!==accountId
  ||sendAuthorization?.generation!==release.generation||sendAuthorization?.verified!==true
  ||sendAuthorization?.customerPhone!==customerPhone||sendAuthorization?.flowId!==flowId
  ||!Number.isFinite(sendAuthorization?.verifiedAtMs)
  ||Date.now()-sendAuthorization.verifiedAtMs<0
  ||Date.now()-sendAuthorization.verifiedAtMs>60000)
  return {ok:false,reason:'authorization_missing'};
 if(typeof db?.rpc!=='function'||typeof send!=='function')
  return {ok:false,reason:'dependencies_missing'};
 const token=create1018FlowToken(),hash=await sha2561018FlowToken(token);
 let payload;
 try{payload=build1018FlowDraftMessage({toE164:customerPhone,flowId,flowToken:token,mode})}
 catch{return {ok:false,reason:'invalid_message'}};
 let reserved;
 try{reserved=await db.rpc('ops2_1018_flow_outbox_reserve_v1',{
  p_account:accountId,p_customer:customerPhone,p_flow:flowId,
  p_hash:hash,p_generation:release.generation
 })}catch{return {ok:false,reason:'reserve_uncertain'}};
 const outboxId=reserved?.data?.outbox_id;
 if(reserved?.error||reserved?.data?.ok!==true||!outboxId)
  return {ok:false,reason:'reserve_failed'};
 let response;
 try{response=await send(payload)}
 catch{
  await db.rpc('ops2_1018_flow_outbox_finalize_v1',{p_id:outboxId,p_state:'uncertain',p_wamid:null}).catch(()=>{});
  return {ok:false,reason:'send_uncertain',outboxId,requiresReconciliation:true};
 }
 const wamid=response?.messages?.[0]?.id;
 if(typeof wamid!=='string'||!/^wamid[.][A-Za-z0-9._:-]{6,240}$/.test(wamid)){
  await db.rpc('ops2_1018_flow_outbox_finalize_v1',{p_id:outboxId,p_state:'uncertain',p_wamid:null}).catch(()=>{});
  return {ok:false,reason:'wamid_missing',outboxId,requiresReconciliation:true};
 }
 let result;
 try{result=await db.rpc('ops2_1018_flow_outbox_finalize_v1',{
  p_id:outboxId,p_state:'sent',p_wamid:wamid
 })}catch{return {ok:false,reason:'finalization_uncertain',outboxId,requiresReconciliation:true}};
 if(result?.error||result?.data?.ok!==true)
  return {ok:false,reason:'finalization_failed',outboxId,requiresReconciliation:true};
 return {ok:true,sessionId:result.data.session_id,outboxId,
  outboundMessageId:wamid,releaseGeneration:release.generation};
}
