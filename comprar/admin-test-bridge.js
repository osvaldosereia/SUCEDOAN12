(()=>{
  'use strict';
  const params=new URLSearchParams(location.search);
  const active=params.get('admin_test')==='1'&&window.parent!==window;
  if(!active)return;
  const C=window.DA_SHOPPING_ROOM_CONFIG||{};
  const nativeFetch=window.fetch.bind(window);
  let adminToken='';
  let finished=false;

  const post=(type,detail={})=>window.parent.postMessage({type,detail},location.origin);
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==window.parent)return;
    if(event.data?.type==='da-admin-test-auth')adminToken=String(event.data.access_token||'').trim();
  });
  post('da-admin-test-ready');

  function actionFrom(body){
    if(typeof body==='string'){try{return String(JSON.parse(body)?.action||'')}catch{return ''}}
    if(body instanceof FormData)return String(body.get('action')||'');
    return '';
  }
  function jsonBody(body){if(typeof body!=='string')return null;try{return JSON.parse(body)}catch{return null}}
  function waitForAdminToken(timeoutMs=5000){
    if(adminToken)return Promise.resolve(adminToken);
    return new Promise((resolve,reject)=>{
      const started=Date.now();
      const timer=setInterval(()=>{
        if(adminToken){clearInterval(timer);resolve(adminToken);return}
        if(Date.now()-started>=timeoutMs){clearInterval(timer);reject(new Error('Sessão do Admin não foi recebida.'))}
      },50);
    });
  }
  function diagnostic(action,response,data,ms,error=''){
    const routing=data?.routing||{};
    post('da-admin-test-diagnostic',{action:action||'request',ok:!error&&response?.ok!==false&&data?.ok!==false,status:response?.status||0,ms,source:routing.source||data?.source||'',ai_used:routing.ai_used,mode:routing.mode||data?.mode||data?.ui?.type||'',error:error||data?.detail||data?.error||''});
  }

  window.DA_ADMIN_TEST_CONFIRM=async(input,init={})=>{
    const started=performance.now();
    const action=actionFrom(init?.body)||'confirm_order';
    try{
      const body=jsonBody(init.body)||{};
      const token=await waitForAdminToken();
      const headers=new Headers(init.headers||{});
      headers.set('Content-Type','application/json');
      headers.set('Authorization',`Bearer ${token}`);
      const response=await nativeFetch(C.adminTestApi,{...init,headers,body:JSON.stringify({...body,action:'confirm_order',admin_test:true})});
      let data={};try{data=await response.clone().json()}catch{}
      diagnostic(action,response,data,performance.now()-started);
      return response;
    }catch(error){
      diagnostic(action,null,null,performance.now()-started,String(error?.message||error));
      throw error;
    }
  };

  window.fetch=async(input,init={})=>{
    const url=typeof input==='string'?input:input?.url||'';
    const action=actionFrom(init?.body);
    const tracked=[C.api,C.productsApi,C.menuApi,C.customerApi].filter(Boolean).includes(url);
    const started=performance.now();
    try{
      const response=await nativeFetch(input,init);
      if(tracked){let data={};try{data=await response.clone().json()}catch{}diagnostic(action,response,data,performance.now()-started)}
      return response;
    }catch(error){
      if(tracked)diagnostic(action,null,null,performance.now()-started,String(error?.message||error));
      throw error;
    }
  };

  function protectSuccess(){
    const success=document.querySelector('.checkout-card.success');
    if(!success)return;
    success.classList.remove('success');
    success.classList.add('admin-test-success');
    success.querySelector('.check')?.replaceChildren(document.createTextNode('🧪'));
    const title=success.querySelector('h2');if(title)title.textContent='Simulação concluída';
    const muted=success.querySelector('.muted');if(muted)muted.textContent='Checkout validado. Nenhum pedido real foi criado.';
    const stageTitle=success.closest('.checkout-stage')?.querySelector('.stage-head strong');if(stageTitle)stageTitle.textContent='Pedido de teste validado';
    document.querySelectorAll('.checkout-whatsapp-return').forEach(el=>el.remove());
    if(!finished){finished=true;post('da-admin-test-finished',{ms:0})}
  }
  const observer=new MutationObserver(()=>protectSuccess());
  observer.observe(document.documentElement,{childList:true,subtree:true});

  const banner=document.createElement('div');
  banner.textContent='MODO DE TESTE DO ADMIN · nenhum pedido real será criado';
  banner.style.cssText='position:sticky;top:0;z-index:9999;text-align:center;padding:7px 10px;background:#173c2b;color:#fff;font:700 12px/1.2 Arial,sans-serif;letter-spacing:.02em';
  document.body.prepend(banner);
})();
