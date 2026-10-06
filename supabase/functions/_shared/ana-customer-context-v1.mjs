const safeFirstName=(value)=>{
  const first=String(value??'').trim().split(/\s+/u)[0]||'';
  return /^[\p{L}][\p{L}'’-]{1,31}$/u.test(first)?first:'';
};

// Only use the explicit customer link on the conversation. Never match or infer a person by name/phone here.
export async function linkedCustomerFirstName(db,conversationId){
  const id=String(conversationId??'').trim();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return '';
  const conversation=await db.from('conversations').select('customer_id').eq('id',id).maybeSingle();
  if(conversation.error||!conversation.data?.customer_id)return '';
  const customer=await db.from('customers').select('name').eq('id',conversation.data.customer_id).maybeSingle();
  if(customer.error)return '';
  return safeFirstName(customer.data?.name);
}

