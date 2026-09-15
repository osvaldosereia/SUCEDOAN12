(()=>{
  'use strict';
  const C=window.DA_SHOPPING_ROOM_CONFIG||{};
  if(!C.api||!C.checkoutApi)return;
  const previousFetch=window.fetch.bind(window);
  window.fetch=(input,init={})=>{
    const url=typeof input==='string'?input:input?.url||'';
    if(url!==C.api||typeof init?.body!=='string')return previousFetch(input,init);
    let action='';
    try{action=String(JSON.parse(init.body)?.action||'').toLowerCase()}catch{}
    if(action!=='set_payment'&&action!=='confirm_order')return previousFetch(input,init);
    return previousFetch(C.checkoutApi,init);
  };
})();
