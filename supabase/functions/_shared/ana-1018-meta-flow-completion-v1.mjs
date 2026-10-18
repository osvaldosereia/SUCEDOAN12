import {classify1018FlowCompletion} from './ana-1018-flow-intent-v1.mjs';
import {normalizePhone} from './whatsapp-core-v1.mjs';

const tokenPattern=/^da1018_[A-Za-z0-9_-]{32,80}$/;
const hex=bytes=>[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');

// The canonical normalizer intentionally REDACTS response_json. Resolve the
// ephemeral raw reply by verified WAMID + phone + Meta phone_number_id instead.
// Never persist, log or return this raw value to the caller.
export function locateSignedMetaFlowReply({canonicalMessage,signedPayload}={}){
  if(canonicalMessage?.provider!=='meta'||canonicalMessage?.message?.direction!=='inbound'
    ||canonicalMessage?.message?.message_type!=='interactive'
    ||canonicalMessage?.message?.metadata?.interactive?.type!=='nfm_reply'
    ||!canonicalMessage?.phone_number_id||!canonicalMessage?.provider_message_id||!canonicalMessage?.phone_e164)
    return null;
  const matches=[];
  for(const entry of Array.isArray(signedPayload?.entry)?signedPayload.entry:[]){
    if(String(entry?.id||'')!==String(canonicalMessage.waba_id||''))continue;
    for(const change of Array.isArray(entry?.changes)?entry.changes:[]){
      if(String(change?.value?.metadata?.phone_number_id||'')!==String(canonicalMessage.phone_number_id))continue;
      for(const msg of Array.isArray(change?.value?.messages)?change.value.messages:[]){
        if(msg?.id!==canonicalMessage.provider_message_id||normalizePhone(msg.from)!==canonicalMessage.phone_e164
          ||msg?.type!=='interactive'||msg?.interactive?.type!=='nfm_reply')continue;
        const response=msg.interactive.nfm_reply?.response_json;
        if(typeof response==='string')matches.push(response);
      }
    }
  }
  return matches.length===1?matches[0]:null;
}

export async function classify1018MetaFlowMessage({
  canonicalMessage,signedPayload,channelPhone,signatureVerified=false
}={}){
  if(signatureVerified!==true)return {ok:false,reason:'webhook_not_verified'};
  const raw=locateSignedMetaFlowReply({canonicalMessage,signedPayload});
  if(typeof raw!=='string'||raw.length>4096)return {ok:false,reason:'flow_json_missing_or_oversized'};
  let data;
  try{data=JSON.parse(raw)}catch{return {ok:false,reason:'flow_json_invalid'}}
  if(!data||typeof data!=='object'||Array.isArray(data))return {ok:false,reason:'flow_json_invalid'};
  const keys=Object.keys(data).sort();
  if(keys.length!==2||keys[0]!=='flow_token'||keys[1]!=='intent')
    return {ok:false,reason:'unexpected_flow_fields'};
  if(typeof data.flow_token!=='string'||!tokenPattern.test(data.flow_token))
    return {ok:false,reason:'invalid_flow_token'};
  const intent=classify1018FlowCompletion({
    channelPhone,verifiedWebhook:signatureVerified,flowData:{intent:data.intent}
  });
  if(!intent.ok)return intent;
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data.flow_token));
  return {...intent,flowTokenSha256:hex(new Uint8Array(bytes)),
    requiresSessionVerification:true,actionable:false};
}
