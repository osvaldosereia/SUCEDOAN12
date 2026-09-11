(()=>{
  'use strict';
  const C=window.DA_ADMIN_V3_CONFIG||{};
  const AUTH_KEY='da_admin_v3_auth';
  const form=document.getElementById('loginForm');
  const pin=document.getElementById('pinInput');
  const button=document.getElementById('loginButton');
  const status=document.getElementById('loginStatus');
  if(!form||!pin||!button)return;

  const setStatus=(message,kind='')=>{if(!status)return;status.textContent=message||'';status.dataset.kind=kind};
  const saveSession=session=>localStorage.setItem(AUTH_KEY,JSON.stringify(session));
  const hasSession=()=>{try{const x=JSON.parse(localStorage.getItem(AUTH_KEY)||'null');return !!(x?.access_token||x?.refresh_token)}catch{return false}};

  async function authenticate(accessCode){
    const start=await fetch(`${C.supabaseUrl}/functions/v1/admin-pin-auth-v1`,{
      method:'POST',
      headers:{apikey:C.supabasePublishableKey,'Content-Type':'application/json'},
      body:JSON.stringify({pin:accessCode}),
      cache:'no-store',
      credentials:'omit'
    });
    const issued=await start.json().catch(()=>({}));
    if(!start.ok||!issued?.token_hash){
      if(start.status===429){const seconds=Math.max(1,Number(issued.retry_after_seconds||60));throw new Error(`Muitas tentativas. Tente novamente em ${Math.ceil(seconds/60)} min.`)}
      const left=issued?.remaining_attempts;
      throw new Error(left===null||left===undefined?'Código inválido.':`Código inválido. Restam ${left} tentativa(s).`);
    }
    const verify=await fetch(`${C.supabaseUrl}/auth/v1/verify`,{
      method:'POST',
      headers:{apikey:C.supabasePublishableKey,'Content-Type':'application/json'},
      body:JSON.stringify({type:issued.verification_type||'magiclink',token_hash:issued.token_hash}),
      cache:'no-store',
      credentials:'omit'
    });
    const session=await verify.json().catch(()=>({}));
    if(!verify.ok||!session?.access_token||!session?.refresh_token)throw new Error('Não consegui abrir a sessão do Admin. Tente novamente.');
    saveSession(session);
  }

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    event.stopImmediatePropagation();
    const accessCode=String(pin.value||'').replace(/\D/g,'').slice(0,6);
    pin.value=accessCode;
    if(accessCode.length!==6){setStatus('Digite os 6 números do código.','error');pin.focus();return}
    button.disabled=true;pin.disabled=true;setStatus('Abrindo Admin…','loading');
    try{
      await authenticate(accessCode);
      setStatus('Acesso liberado.','ok');
      const next=new URLSearchParams(location.search).get('next');
      if(next&&/^[a-z0-9._/-]+$/i.test(next)&&!next.includes('..'))location.href=next;
      else location.reload();
    }catch(error){setStatus(error?.message||'Não consegui liberar o acesso.','error');button.disabled=false;pin.disabled=false;pin.select()}
  },true);

  pin.addEventListener('input',()=>{pin.value=pin.value.replace(/\D/g,'').slice(0,6);if(status?.dataset.kind==='error')setStatus('')});
  pin.addEventListener('keyup',event=>{if(event.key==='Enter'&&pin.value.length===6)form.requestSubmit()});

  if(!hasSession())setTimeout(()=>pin.focus(),60);
})();
