(()=>{
  'use strict';
  const C=window.DA_SHOPPING_ROOM_CONFIG||{};
  if(!C.api)return;
  const nativeFetch=window.fetch.bind(window);
  const token=()=>new URLSearchParams(location.search).get('s')||new URLSearchParams(location.search).get('c')||new URLSearchParams(location.search).get('token')||'';
  const parse=body=>{if(typeof body!=='string')return null;try{return JSON.parse(body)}catch{return null}};
  async function syncCheckoutContext(){
    try{
      await nativeFetch(C.api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'checkout_preview',token:token()}),cache:'no-store'});
    }catch{}
  }
  window.fetch=async(input,init={})=>{
    const response=await nativeFetch(input,init);
    if(!response.ok)return response;
    const url=typeof input==='string'?input:input?.url||'',body=parse(init?.body),action=String(body?.action||'').toLowerCase();
    const customerRefresh=url===C.customerApi&&['lookup_customer','verification_status'].includes(action);
    const identifyRefresh=url===C.api&&action==='identify';
    const addressRefresh=url===C.checkoutApi&&action==='save_address';
    if(customerRefresh||identifyRefresh||addressRefresh){
      try{
        const data=await response.clone().json();
        const meaningful=identifyRefresh||data?.verified===true||!!data?.checkout||!!data?.address;
        if(meaningful)await syncCheckoutContext();
      }catch{}
    }
    return response;
  };
})();
