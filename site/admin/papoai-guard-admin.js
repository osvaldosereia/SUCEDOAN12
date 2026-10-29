(() => {
  "use strict";
  const config=window.DONA_SITE_CONFIG||{};
  const base=String(config.supabaseUrl||"").replace(/\/$/,"");
  const apikey=config.publishableKey||"";
  const $=(id)=>document.getElementById(id);
  const panel=$("papoai-campaign-guard");
  if(!panel)return;
  const btn=$("papoai-guard-action");
  const label=$("papoai-guard-state");
  const info=$("papoai-guard-detail");
  const pending=$("papoai-guard-pending");
  const review=$("papoai-guard-review");
  const alert=$("papoai-guard-message");
  const refresh=$("papoai-guard-refresh");
  let guard=null;
  let busy=false;
  let loaded=false;

  async function request(action=null) {
    if(!base||!apikey)throw new Error("Configuração do Supabase indisponível.");
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await fetch(base+"/functions/v1/whatsapp-papoai-guard-v1",{
        method:action?"POST":"GET",
        headers:{apikey,"x-admin-code":window.DonaAdminAuth?.getCode?.()||"",...(action?{"Content-Type":"application/json"}:{})},
        cache:"no-store",signal:controller.signal,
        ...(action?{body:JSON.stringify({action})}:{}),
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||payload.ok!==true)throw new Error(payload.error||"O Supabase não respondeu.");
      return payload.guard||{};
    }catch(error){
      if(controller.signal.aborted)throw new Error("O Supabase demorou para responder. Tente novamente.");
      throw error;
    }finally{clearTimeout(timeout);}
  }
  function time(iso) {
    if(!iso)return "";
    const date=new Date(iso);
    if(!Number.isFinite(date.getTime()))return "";
    return new Intl.DateTimeFormat("pt-BR",{
      day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",
      timeZone:"America/Cuiaba",
    }).format(date);
  }
  function render() {
    const active=guard?.active===true&&new Date(guard.active_until).getTime()>Date.now();
    label.textContent=active?"Proteção ativa":"Funcionamento normal";
    label.dataset.active=String(active);
    info.textContent=active
      ?"Confirmações da Meta estão sendo armazenadas para processamento posterior. Desativa automaticamente em "+time(guard.active_until)+"."
      :"As confirmações são processadas normalmente. Ative a proteção ANTES de iniciar o disparo no PapoAI.";
    pending.textContent=Number(guard?.pending||0).toLocaleString("pt-BR");
    review.textContent=Number(guard?.review_required||0).toLocaleString("pt-BR");
    btn.textContent=active?"Encerrar proteção e processar fila":"Ativar proteção por 2 horas";
    btn.disabled=!loaded||busy;
    refresh.disabled=busy;
    btn.dataset.active=String(active);
  }
  function message(value,error=false) {
    alert.textContent=value;
    alert.dataset.error=String(error);
  }
  async function load() {
    if(busy)return;
    busy=true;render();message("Consultando o Supabase…");
    try {
      guard=await request();
      loaded=true;
      message("");
    }catch(error){
      loaded=false;
      message(error?.message||"Não foi possível consultar a proteção.",true);
    }finally{busy=false;render();}
  }
  async function change() {
    if(busy||!loaded)return;
    const isActive=guard?.active===true&&new Date(guard.active_until).getTime()>Date.now();
    if(isActive&&!window.confirm("Encerrar a proteção? As confirmações guardadas serão processadas gradualmente; mensagens de clientes continuam sendo recebidas."))return;
    busy=true;render();message(isActive?"Encerrando proteção…":"Ativando proteção…");
    try {
      guard=await request(isActive?"deactivate":"activate");
      loaded=true;
      render();
      message(isActive?"Proteção encerrada. O processamento da fila será retomado automaticamente.":"Proteção ativada. Agora você pode iniciar a campanha no PapoAI.");
    }catch(error){message(error?.message||"Não foi possível alterar o modo.",true);}
    finally{busy=false;render();}
  }
  btn.addEventListener("click",change);
  refresh.addEventListener("click",load);
  for(const tab of document.querySelectorAll('[data-view="whatsapp"]')){
    tab.addEventListener("click",()=>{if(!busy)void load();});
  }
  render();
})();