const nativeFetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=async(input,init)=>{
  const response=await nativeFetch(input,init);
  try{
    const url=new URL(typeof input==='string'?input:input?.url,location.href);
    if(url.pathname.endsWith('/admin-whatsapp-ops-v1')&&url.searchParams.get('action')==='conversation'&&response.ok){
      response.clone().json().then(data=>{
        const messages=Array.isArray(data?.messages)?data.messages:[];
        document.dispatchEvent(new CustomEvent('attendance:conversation-refreshed',{detail:{conversation_id:url.searchParams.get('conversation_id')||'',messages}}));
      }).catch(()=>{});
    }
  }catch{}
  return response;
};