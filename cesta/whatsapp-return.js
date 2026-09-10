(()=>{
  const API="https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/basket-shop-v1";
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

  function returnToConversation(){
    toast("Pronto! Sua escolha foi enviada. Voltando para o WhatsApp…");
    setTimeout(()=>{
      try{ history.back(); }catch{}
      try{ window.close(); }catch{}
    },220);
    setTimeout(()=>{
      if(document.visibilityState==="visible"){
        toast("Sua escolha já está no WhatsApp. Toque em Voltar ao WhatsApp se esta tela não fechar sozinha.");
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
