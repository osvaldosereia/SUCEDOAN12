import {classify1018FlowCompletion} from './ana-1018-flow-intent-v1.mjs';

const tokenPattern=/^[A-Za-z0-9_-]{32,128}$/;
const hex=bytes=>[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');

// This must receive an event whose raw-body signature was already verified
// and whose Meta phone_number_id was resolved to the expected account.
// Flow tokens are sensitive: only their SHA-256 digest is returned.
export async function classify1018MetaFlowMessage({canonicalMessage,channelPhone,signatureVerified=false}={}){
  const metadata=canonicalMessage?.message?.metadata;
  if(canonicalMessage?.provider!=='meta'||canonicalMessage?.message?.direction!=='inbound'
    ||canonicalMessage?.message?.message_type!=='interactive'
    ||metadata?.interactive?.type!=='nfm_reply')return {ok:false,reason:'not_flow_completion'};
  const raw=metadata.interactive.nfm_reply?.response_json;
  if(typeof raw!=='string'||raw.length>4096)return {ok:false,reason:'flow_json_missing_or_oversized'};
  let data;
  try{data=JSON.parse(raw)}catch{return {ok:false,reason:'flow_json_invalid'}}
  if(!data||typeof data!=='object'||Array.isArray(data))return {ok:false,reason:'flow_json_invalid'};
  // Meta returns the exact outbound flow_token beside submitted form fields.
  // No extra client-provided keys or order IDs are permitted in this prototype.
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
