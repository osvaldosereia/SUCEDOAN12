// Server-side payload builder ONLY. Never call Meta from this module.
const prefix='da1018_';
const tokenPattern=/^da1018_[A-Za-z0-9_-]{32,80}$/;
const phonePattern=/^[+]55[0-9]{10,11}$/;
const flowIdPattern=/^[0-9]{6,30}$/;
const hex=bytes=>[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');

export function create1018FlowToken(){
  const random=crypto.getRandomValues(new Uint8Array(32));
  return prefix+hex(random);
}
export async function sha2561018FlowToken(token){
  if(typeof token!=='string'||!tokenPattern.test(token))throw new TypeError('invalid_1018_flow_token');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return hex(new Uint8Array(digest));
}
// Caller must check the 1018 release generation AND Meta 24h service window,
// and must register the SHA-256 token with WAMID when a send succeeds.
// This builder cannot send messages, create orders or change the catalog.
export function build1018FlowDraftMessage({toE164,flowId,flowToken,mode='draft'}={}){
  if(!phonePattern.test(String(toE164||''))||!flowIdPattern.test(String(flowId||''))
    ||!tokenPattern.test(String(flowToken||''))||!['draft','published'].includes(mode))
    throw new TypeError('invalid_1018_flow_message');
  return {
    messaging_product:'whatsapp',recipient_type:'individual',to:toE164.slice(1),
    type:'interactive',interactive:{
      type:'flow',
      body:{text:'Escolha como podemos ajudar.'},
      action:{name:'flow',parameters:{
        mode,flow_message_version:'3',flow_token:flowToken,flow_id:flowId,
        flow_cta:'Abrir opções',flow_action:'navigate',
        flow_action_payload:{screen:'START'}
      }}
    }
  };
}
