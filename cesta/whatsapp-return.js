(()=>{
  const API="https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/basket-shop-v1";
  const WHATSAPP_PHONE="556584491018";
  const params=new URLSearchParams(location.search);
  const token=params.get("t")||"";
  const validToken=/^[a-f0-9]{64}$/i.test(token);
  const originalLabels=new WeakMap();
  let sending=false;

  function toast(message){
    const el=document.getElementById("toast");
    if(!el)return;
    el.textContent=message;
    el.classList.remove("hidden");
    clearTimeout(toast.timer);
    toast.timer=setTimeout(()=>el.classList.add("hidden"),5000);
  }

  function isMobile(){
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent||"");
  }

  function whatsappAppUrl(){
    return `whatsapp://send?phone=${WHATSAPP_PHONE}`;
  }

  function whatsappWebUrl(){
    return `https://web.whatsapp.com/send?phone=${WHATSAPP_PHONE}`;
  }

  function whatsappUrl(){
    return isMobile()?whatsappAppUrl():whatsappWebUrl();
  }

  function openWhatsApp(){
    const url=whatsappUrl();
    try{
      location.href=url;
    }catch{
      if(!isMobile())location.href=whatsappWebUrl();
    }
    return url;
  }

  function showReturnButton(){
    if(document.getElementById("whatsappReturnFallback"))return;
    const wrap=document.createElement("div");
    wrap.id="whatsappReturnFallback";
    wrap.setAttribute("role","status");
    wrap.style.cssText="position:fixed;inset:auto 0 0 0;z-index:1000;background:#fff;border-top:1px solid #ddd;padding:12px 14px calc(12px + env(safe-area-inset-bottom));";
    const link=document.createElement("a");
    link.id="whatsappReturnLink";
    link.href=whatsappUrl();
    link.textContent="Voltar ao WhatsApp";
    link.style.cssText="display:flex;width:100%;min-height:52px;align-items:center;justify-content:center;box-sizing:border-box;text-decoration:none;border:0;border-radius:8px;background:#f36b21;color:#fff;font:700 16px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";
    link.addEventListener("click",()=>toast("Abrindo o WhatsApp…"),{passive:true});
    wrap.appendChild(link);
    document.body.appendChild(wrap);
  }

  function returnToConversation(){
    showReturnButton();
    toast("Pronto! Sua cesta foi salva. Voltando para o WhatsApp…");
    setTimeout(openWhatsApp,40);
    setTimeout(()=>{
      if(document.visibilityState==="visible"){
        showReturnButton();
        toast("Sua cesta já foi salva. Toque em Voltar ao WhatsApp para continuar.");
      }
    },1200);
  }

  function autoOpenAddProducts(){
    if(params.get("add")!=="1")return;
    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      const button=document.getElementById("extrasBtn");
      if(button&&!button.disabled&&button.offsetParent!==null){
        clearInterval(timer);
        try{
          const url=new URL(location.href);
          url.searchParams.delete("add");
          history.replaceState(null,"",url.toString());
        }catch{}
        button.click();
      }else if(tries>=30){
        clearInterval(timer);
      }
    },120);
  }

  async function finish(intent,button){
    if(sending||!validToken)return;
    sending=true;
    if(!originalLabels.has(button))originalLabels.set(button,button.textContent||"Continuar");
    button.disabled=true;
    button.textContent="Salvando…";

    try{
      const response=await fetch(API,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"return",token,intent}),
        cache:"no-store",
        credentials:"omit"
      });
      const data=await response.json().catch(()=>({ok:false,error:"invalid_response"}));
      if(!response.ok||!data.ok)throw new Error(data.detail||data.error||"Não consegui concluir agora");

      button.dataset.returnDone="1";
      button.textContent="Voltando…";
      returnToConversation();
    }catch(error){
      button.disabled=false;
      button.textContent=originalLabels.get(button)||"Tentar novamente";
      toast("Não consegui concluir agora. Tente novamente em alguns segundos.");
    }finally{
      sending=false;
    }
  }

  document.addEventListener("click",event=>{
    const button=event.target.closest?.("#orderBtn,#sendBtn");
    if(!button)return;
    if(button.id==="sendBtn"&&/voltar\s+para\s+cesta/i.test(button.textContent||""))return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if(button.dataset.returnDone==="1"){
      returnToConversation();
      return;
    }

    finish(button.id==="orderBtn"?"order":"extras_done",button);
  },true);

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",autoOpenAddProducts,{once:true});
  else autoOpenAddProducts();
})();
