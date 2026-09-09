(()=>{
  const API="https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/basket-shop-v1";
  const WHATSAPP_PHONE="556584491018";
  const token=new URLSearchParams(location.search).get("t")||"";

  const messageFor=intent=>intent==="order"
    ?"Quero encomendar a cesta que escolhi."
    :"Terminei de escolher os produtos adicionais da minha cesta. Pode finalizar meu pedido.";

  function registerReturn(intent){
    if(!/^[a-f0-9]{64}$/i.test(token))return;
    try{
      fetch(API,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"return",token,intent}),
        cache:"no-store",
        keepalive:true
      }).catch(()=>{});
    }catch{}
  }

  function openWhatsapp(intent,button){
    const message=messageFor(intent);
    const encoded=encodeURIComponent(message);

    // Link HTTPS universal/app-link primeiro: funciona melhor dentro do navegador
    // embutido do WhatsApp e do WhatsApp Business e não força um pacote específico.
    const primary=`https://wa.me/${WHATSAPP_PHONE}?text=${encoded}`;
    const native=`whatsapp://send?phone=${WHATSAPP_PHONE}&text=${encoded}`;
    const webFallback=`https://api.whatsapp.com/send?phone=${WHATSAPP_PHONE}&text=${encoded}`;
    let leftPage=false;

    registerReturn(intent);

    if(button){
      button.disabled=true;
      button.textContent="Abrindo WhatsApp…";
    }

    const markLeft=()=>{leftPage=true};
    document.addEventListener("visibilitychange",()=>{
      if(document.visibilityState==="hidden")markLeft();
    },{once:true});
    window.addEventListener("pagehide",markLeft,{once:true});

    // A navegação precisa acontecer sincronamente no clique do usuário. Evita
    // bloqueio de deep-link em webviews do WhatsApp/WhatsApp Business.
    location.assign(primary);

    // Se o navegador impedir a navegação HTTPS, tenta o esquema nativo.
    setTimeout(()=>{
      if(!leftPage&&document.visibilityState==="visible")location.href=native;
    },1200);

    // Último fallback oficial para navegadores que não tratam o esquema nativo.
    setTimeout(()=>{
      if(!leftPage&&document.visibilityState==="visible")location.href=webFallback;
    },2400);

    setTimeout(()=>{
      if(!leftPage&&document.visibilityState==="visible"&&button){
        button.disabled=false;
        button.textContent="Abrir WhatsApp";
      }
    },3600);
  }

  document.addEventListener("click",event=>{
    const button=event.target.closest?.("#orderBtn,#sendBtn");
    if(!button)return;

    if(button.id==="sendBtn"&&/voltar\s+para\s+cesta/i.test(button.textContent||""))return;

    const intent=button.id==="orderBtn"?"order":"extras_done";
    event.preventDefault();
    event.stopImmediatePropagation();
    openWhatsapp(intent,button);
  },true);
})();
