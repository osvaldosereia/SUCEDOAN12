// Keep previously paged messages while refreshing the latest page.
// Incoming canonical messages win by ID, so delivery/read status changes appear.
export function mergeAttendanceConversation(previous,current,maxMessages=500){
  if(!current||!Array.isArray(current.messages))return current;
  const old=Array.isArray(previous?.messages)?previous.messages:[];
  const fresh=current.messages;
  if(!old.length||!fresh.length)return current;
  const recentIds=new Set(fresh.map(message=>String(message?.id||'')).filter(Boolean));
  const earlier=old.filter(message=>message?.id&&!recentIds.has(String(message.id)));
  if(!earlier.length)return current;
  const limit=Number.isInteger(maxMessages)&&maxMessages>0?maxMessages:500;
  const messages=[...earlier,...fresh].slice(-limit);
  const cursor=Object.prototype.hasOwnProperty.call(previous,'next_before')
    ?previous.next_before:current.next_before;
  return {...current,messages,next_before:cursor};
}
