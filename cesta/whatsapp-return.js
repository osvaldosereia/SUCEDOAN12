(()=>{
  const API="https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/basket-shop-v1";
  const token=new URLSearchParams(location.search).get("t")||"";
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

      button.disabled=false;
      button.dataset.returnDone="1";
      button.textContent="Pronto ✓";
      toast("Pronto! Sua cesta foi salva e a continuação já foi enviada no WhatsApp. Agora volte para a conversa.");
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
      toast("A continuação já está no WhatsApp. Use o botão Voltar do celular para retornar à conversa.");
      return;
    }

    finish(button.id==="orderBtn"?"order":"extras_done",button);
  },true);
})();
