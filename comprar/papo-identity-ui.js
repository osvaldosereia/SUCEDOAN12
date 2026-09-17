(()=>{
  'use strict';
  const app=window.DA_COMPRAR_APP;if(!app)return;

  function customerFirstName(customer=app.state?.customer){
    const raw=String(customer?.name||'').trim().split(/\s+/)[0]||'';
    return raw.replace(/[^\p{L}'’\-]/gu,'').slice(0,40);
  }

  function personalizeStartGreeting(){
    const firstName=customerFirstName();if(!firstName)return false;
    const node=document.querySelector('.start-message');if(!node)return false;
    node.textContent=`Oi, ${firstName} 😊 Como posso ajudar na sua compra?`;
    node.dataset.customerPersonalized='1';
    return true;
  }

  const originalStart=app.start?.bind(app);
  if(originalStart){
    app.start=async(...args)=>{
      const result=await originalStart(...args);
      personalizeStartGreeting();
      return result;
    };
  }

  const originalRenderStart=app.renderStart?.bind(app);
  if(originalRenderStart){
    app.renderStart=(...args)=>{
      const result=originalRenderStart(...args);
      personalizeStartGreeting();
      return result;
    };
  }

  app.customerFirstName=customerFirstName;
  app.personalizeStartGreeting=personalizeStartGreeting;
})();
