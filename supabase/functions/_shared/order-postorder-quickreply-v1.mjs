// Parse only the exact structured quick-reply payload returned by Meta.
// Free-form text, forwarded button labels, and provider delivery statuses
// are never accepted as purchase instructions.
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parsePostorderReply(raw){
  if(typeof raw!=='string'||raw.length>150)return null;
  const m=/^DA4:([CE]):([0-9a-f-]{36}):([a-f0-9]{32})$/i.exec(raw);
  if(!m||!ID.test(m[2]))return null;
  return {action:m[1]==='C'?'confirm':'edit',orderId:m[2].toLowerCase(),nonce:m[3].toLowerCase()};
}
export function findPostorderReply(payload,messageId){
  if(typeof messageId!=='string'||!messageId||messageId.length>240)return null;
  for(const entry of Array.isArray(payload?.entry)?payload.entry:[]){
    for(const change of Array.isArray(entry?.changes)?entry.changes:[]){
      const messages=Array.isArray(change?.value?.messages)?change.value.messages:[];
      for(const message of messages){
        if(message?.id!==messageId)continue;
        const raw=message?.type==='button'?message?.button?.payload:
          message?.type==='interactive'&&message?.interactive?.type==='button_reply'?
            message.interactive?.button_reply?.id:null;
        return parsePostorderReply(raw);
      }
    }
  }
  return null;
}

