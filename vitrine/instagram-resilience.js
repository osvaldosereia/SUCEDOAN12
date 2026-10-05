(() => {
  'use strict';

  const API='https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/storefront-v2';
  const CACHE_KEY='da_storefront_home_carousel_v1';
  const GUARD_KEY='da_storefront_recovery_once_v2';
  const HARD_ERROR=/Não consegui abrir a vitrine agora/i;
  let observer=null;
  let running=false;

  const content=()=>document.getElementById('content');
  const hasHardError=()=>HARD_ERROR.test(content()?.textContent||'');

  function writeCache(data){
    try{
      localStorage.setItem(CACHE_KEY,JSON.stringify({saved_at:Date.now(),data}));
      return true;
    }catch{return false}
  }
  function attemptedRecently(){
    try{
      const now=Date.now(),last=Number(sessionStorage.getItem(GUARD_KEY)||0);
      if(last&&now-last<120000)return true;
      sessionStorage.setItem(GUARD_KEY,String(now));
    }catch{}
    return false;
  }

  async function recoverOnce(){
    if(running||!hasHardError())return;
    observer?.disconnect();
    if(attemptedRecently())return;
    running=true;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const url=new URL(API);
      url.searchParams.set('action','home');
      url.searchParams.set('layout','basket-carousel-v1');
      const response=await fetch(url.toString(),{cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
      const data=await response.json().catch(()=>null);
      if(!response.ok||!data||data.ok===false||!Array.isArray(data.baskets))return;
      if(writeCache(data))location.reload();
    }catch{}finally{
      clearTimeout(timer);
      running=false;
    }
  }

  function watch(){
    const host=content();
    if(!host)return;
    if(hasHardError()){recoverOnce();return}
    observer=new MutationObserver(()=>{if(hasHardError())recoverOnce()});
    observer.observe(host,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});
  else watch();
})();
