// Pure parser for the official Meta interactive list reply stored by the existing webhook.
// Only accepts the 1018 internal test conversation. Never interprets arbitrary message text.
const SIZES=new Set(['economica','mini','pequena','media','grande']);
const RECIPIENT='+5565999828360';
const SENDER='+5565984491018';
export const CANARY_CONVERSATION='20490a03-2b35-4ffb-9b41-6ee187d1cfc6';
export function parseBasketReply(message){
  if(!message||message.direction!=='inbound'||message.message_type!=='interactive')return null;
  const inter=message.metadata?.interactive;
  if(inter?.type!=='list_reply'||typeof inter.list_reply?.id!=='string')return null;
  const id=inter.list_reply.id;
  const sizeId=/^da:whatsapp:size:(economica|mini|pequena|media|grande)$/.exec(id);
  if(sizeId&&SIZES.has(sizeId[1]))return {kind:'size',size:sizeId[1],id};
  const basketId=/^da:whatsapp:basket:(economica|mini|pequena|media|grande):([1-3])$/.exec(id);
  if(basketId&&SIZES.has(basketId[1]))return {kind:'basket',size:basketId[1],number:Number(basketId[2]),id};
  return null;
}
export function latestCanaryReply(detail){
  if(detail?.ok!==true||detail?.conversation?.id!==CANARY_CONVERSATION)return null;
  if(detail?.account?.phone_e164!==SENDER||detail?.conversation?.phone_e164!==RECIPIENT)return null;
  if(detail.conversation?.whatsapp_account_id!==detail.account?.id)return null;
  const inbound=(Array.isArray(detail.messages)?detail.messages:[]).filter(x=>x.direction==='inbound').sort((a,b)=>Date.parse(b.message_at||b.received_at||0)-Date.parse(a.message_at||a.received_at||0));
  for(const message of inbound){const parsed=parseBasketReply(message);if(parsed)return {...parsed,receivedAt:message.message_at||message.received_at||null};}
  return null;
}

const FLOW_REQUEST_RESULT='solicitacao_para_atendimento';
function safeFlowText(value,max){
  if(typeof value!=='string')return '';
  return value.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,' ').trim().slice(0,max);
}
export function parseBasketFlowRequest(message){
  if(!message||message.provider!=='meta'||message.direction!=='inbound'||message.message_type!=='interactive')return null;
  const raw=message.metadata?.interactive?.nfm_reply?.response_json;
  if(typeof raw!=='string'||raw.length>12000)return null;
  let payload;
  try{payload=JSON.parse(raw)}catch{return null}
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.resultado!==FLOW_REQUEST_RESULT)return null;
  const request={
    summary:safeFlowText(payload.resumo,180),
    total:safeFlowText(payload.valor,80),
    items:safeFlowText(payload.itens,2500),
    receivedAt:message.message_at||message.received_at||null
  };
  return request.summary&&request.total&&request.items?request:null;
}
export function latestBasketFlowRequest(detail){
  if(detail?.ok!==true||detail?.conversation?.id!==CANARY_CONVERSATION)return null;
  if(detail?.account?.phone_e164!==SENDER||detail?.conversation?.phone_e164!==RECIPIENT)return null;
  if(detail.conversation?.whatsapp_account_id!==detail.account?.id)return null;
  const inbound=(Array.isArray(detail.messages)?detail.messages:[])
    .filter(x=>x.direction==='inbound')
    .sort((a,b)=>Date.parse(b.message_at||b.received_at||0)-Date.parse(a.message_at||a.received_at||0));
  for(const message of inbound){const parsed=parseBasketFlowRequest(message);if(parsed)return parsed;}
  return null;
}
