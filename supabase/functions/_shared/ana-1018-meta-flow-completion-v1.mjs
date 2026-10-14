import {classify1018FlowCompletion} from './ana-1018-flow-intent-v1.mjs';

// Call only after Meta signature verification AND account resolution.
// This pure adapter does not persist, send, mutate orders, or execute an intent.
export function classify1018MetaFlowMessage({canonicalMessage,channelPhone,signatureVerified=false}={}){
  const metadata=canonicalMessage?.message?.metadata;
  if(canonicalMessage?.provider!=='meta'||canonicalMessage?.message?.direction!=='inbound'
    ||canonicalMessage?.message?.message_type!=='interactive'
    ||metadata?.interactive?.type!=='nfm_reply')return {ok:false,reason:'not_flow_completion'};
  const raw=metadata.interactive.nfm_reply?.response_json;
  if(typeof raw!=='string'||raw.length>4096)return {ok:false,reason:'flow_json_missing_or_oversized'};
  let data;
  try{data=JSON.parse(raw)}catch{return {ok:false,reason:'flow_json_invalid'}}
  if(!data||typeof data!=='object'||Array.isArray(data))return {ok:false,reason:'flow_json_invalid'};
  // flow_token and flow_id must be matched to a registered, 1018-scoped
  // outbound Flow session before this result can become actionable.
  // For now the adapter is intentionally classification-only.
  const intent=classify1018FlowCompletion({
    channelPhone,verifiedWebhook:signatureVerified,flowData:data
  });
  if(!intent.ok)return intent;
  return {...intent,requiresSessionVerification:true,actionable:false};
}
