(()=>{
  'use strict';
  const params=new URLSearchParams(location.search);
  if(params.get('admin_test')!=='1'||window.parent===window)return;
  const C=window.DA_SHOPPING_ROOM_CONFIG||{};
  const commercialFetch=window.fetch.bind(window);
  const actionFrom=body=>{if(typeof body!=='string')return '';try{return String(JSON.parse(body)?.action||'')}catch{return ''}};
  window.fetch=(input,init={})=>{
    const url=typeof input==='string'?input:input?.url||'';
    const action=actionFrom(init?.body);
    if(url===C.api&&action==='confirm_order'&&typeof window.DA_ADMIN_TEST_CONFIRM==='function')return window.DA_ADMIN_TEST_CONFIRM(input,init);
    return commercialFetch(input,init);
  };
})();
