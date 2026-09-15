(()=>{
  'use strict';
  const C=window.DA_SHOPPING_ROOM_CONFIG||{};
  if(!C.api||!C.checkoutApi)return;
  const previousFetch=window.fetch.bind(window);

  function requestAction(body){
    if(typeof body!=='string')return '';
    try{return String(JSON.parse(body)?.action||'').toLowerCase()}catch{return ''}
  }
  async function rewriteVerificationResponse(response){
    if(!response.ok||!C.whatsappFallback)return response;
    let data;try{data=await response.clone().json()}catch{return response}
    if(!data?.whatsapp_url)return response;
    const raw=String(data.whatsapp_url),query=raw.includes('?')?raw.slice(raw.indexOf('?')):'';
    data.whatsapp_url=`${String(C.whatsappFallback).replace(/\?.*$/,'')}${query}`;
    const headers=new Headers(response.headers);headers.delete('content-length');headers.set('content-type','application/json');
    return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
  }

  window.fetch=async(input,init={})=>{
    const url=typeof input==='string'?input:input?.url||'';
    const action=requestAction(init?.body);
    if(url===C.customerApi&&action==='lookup_customer')return rewriteVerificationResponse(await previousFetch(input,init));
    if(url===C.api&&(action==='set_payment'||action==='confirm_order'))return previousFetch(C.checkoutApi,init);
    return previousFetch(input,init);
  };
})();
