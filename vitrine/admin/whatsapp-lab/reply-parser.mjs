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
