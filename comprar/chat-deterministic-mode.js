(()=>{
  'use strict';
  const C=window.DA_SHOPPING_ROOM_CONFIG||{};
  if(!C.deterministic)return;
  document.body.classList.add('da-deterministic-chat');
  const $=id=>document.getElementById(id);
  const token=()=>new URLSearchParams(location.search).get('s')||new URLSearchParams(location.search).get('c')||new URLSearchParams(location.search).get('token')||'';
  const composer=$('composer');if(composer){composer.classList.add('hidden');composer.setAttribute('aria-hidden','true')}
  $('recordingBar')?.classList.add('hidden');
  const status=$('roomStatus');if(status)status.textContent='Atendimento rápido';

  const top=document.querySelector('.chat-topbar');
  if(top&&!$('humanButton')){
    const b=document.createElement('button');b.id='humanButton';b.className='da-human-button';b.type='button';b.textContent='Atendente';b.setAttribute('aria-label','Falar com atendente');top.appendChild(b);
    b.addEventListener('click',async()=>{
      const t=token().trim();if(!/^[a-f0-9]{64}$/i.test(t))return;
      b.disabled=true;
      try{
        const r=await fetch(C.api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'human_handoff',token:t}),cache:'no-store'});
        const d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw new Error(d.detail||d.error||'Não consegui chamar a atendente.');
        const timeline=$('timeline');if(timeline){const x=document.createElement('div');x.className='bubble assistant';x.textContent=d.reply||'Certo. Uma atendente vai continuar com você por aqui.';timeline.appendChild(x);x.scrollIntoView({behavior:'smooth',block:'end'})}
      }catch(e){const toast=$('toast');if(toast){toast.textContent=e?.message||'Não consegui chamar a atendente.';toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2600)}}
      finally{b.disabled=false}
    });
  }

  const note=document.createElement('div');note.className='da-mode-note';note.textContent='Escolha pelas opções abaixo · atendimento sem IA';
  const header=document.querySelector('.chat-topbar');header?.insertAdjacentElement('afterend',note);

  const cleanCopy=()=>{
    document.querySelectorAll('.stage-head small').forEach(el=>{
      if(el.textContent?.includes('Escolha uma opção ou escreva normalmente'))el.textContent='Escolha uma opção.';
    });
    document.querySelectorAll('.bubble.assistant').forEach(el=>{
      if(el.textContent?.includes('escreva normalmente'))el.textContent=el.textContent.replace(/\s*ou escreva normalmente\.?/i,'.');
    });
  };
  cleanCopy();new MutationObserver(cleanCopy).observe(document.body,{subtree:true,childList:true});
})();
