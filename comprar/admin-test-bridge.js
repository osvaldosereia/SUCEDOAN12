(()=>{
  'use strict';

  const params=new URLSearchParams(location.search);
  const active=params.get('admin_test')==='1'&&window.parent!==window;
  if(!active)return;

  const config=window.DA_SHOPPING_ROOM_CONFIG||{};
  const publicToken=(params.get('s')||params.get('c')||params.get('token')||'').trim();
  let adminToken='';
  let finished=false;

  const post=(type,detail={})=>window.parent.postMessage({type,detail},location.origin);

  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==window.parent)return;
    if(event.data?.type==='da-admin-test-auth')adminToken=String(event.data.access_token||'').trim();
  });

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

  function diagnostic(action,{ok=true,status=200,ms=0,source='',mode='',error=''}={}){
    post('da-admin-test-diagnostic',{action:action||'request',ok,status,ms,source,ai_used:false,mode,error});
  }

  async function confirmOrder(payload={}){
    const started=performance.now();
    try{
      if(!config.adminTestApi)throw new Error('API de teste administrativo indisponível.');
      if(!/^[a-f0-9]{64}$/i.test(publicToken))throw new Error('Sessão pública de teste inválida.');
      const token=await waitForAdminToken();
      const response=await fetch(config.adminTestApi,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
        body:JSON.stringify({...payload,action:'confirm_order',token:publicToken,admin_test:true}),
        cache:'no-store'
      });
      const data=await response.json().catch(()=>({ok:false,error:'invalid_response'}));
      diagnostic('confirm_order',{ok:response.ok&&data?.ok!==false,status:response.status,ms:performance.now()-started,source:'shopping-chat-admin-test-v1',mode:'dry-run',error:data?.detail||data?.error||''});
      if(!response.ok||data?.ok===false)throw new Error(String(data?.detail||data?.error||`Erro ${response.status}`));
      if(!finished){finished=true;post('da-admin-test-finished',{ms:performance.now()-started})}
      return {...data,admin_test:true};
    }catch(error){
      diagnostic('confirm_order',{ok:false,status:0,ms:performance.now()-started,mode:'dry-run',error:String(error?.message||error)});
      throw error;
    }
  }

  window.DA_ADMIN_TEST_TRANSPORT=Object.freeze({confirmOrder,diagnostic});
  post('da-admin-test-ready');

  const showBanner=()=>{
    if(document.querySelector('[data-admin-test-banner]'))return;
    const banner=document.createElement('div');
    banner.dataset.adminTestBanner='1';
    banner.textContent='MODO DE TESTE DO ADMIN · nenhum pedido real será criado';
    banner.style.cssText='position:sticky;top:0;z-index:9999;text-align:center;padding:7px 10px;background:#173c2b;color:#fff;font:700 12px/1.2 Arial,sans-serif;letter-spacing:.02em';
    document.body.prepend(banner);
  };
  if(document.body)showBanner();else document.addEventListener('DOMContentLoaded',showBanner,{once:true});
})();
