(()=>{
  'use strict';
  const help=document.getElementById('helpToggle'),composer=document.getElementById('composer'),input=document.getElementById('messageInput');
  if(!help||!composer)return;
  function setOpen(open){composer.classList.toggle('composer-open',open);composer.classList.toggle('composer-collapsed',!open);help.setAttribute('aria-expanded',String(open));help.textContent=open?'Fechar ajuda':'💬 Ajuda';document.body.classList.toggle('help-open',open);if(open)setTimeout(()=>input?.focus(),80)}
  help.onclick=()=>setOpen(help.getAttribute('aria-expanded')!=='true');
  composer.addEventListener('submit',()=>setTimeout(()=>setOpen(false),120));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&help.getAttribute('aria-expanded')==='true')setOpen(false)});
  const refresh=()=>{const checkout=!!document.querySelector('.checkout-v2-stage');help.classList.toggle('hidden',checkout);if(checkout)setOpen(false)};
  new MutationObserver(refresh).observe(document.documentElement,{childList:true,subtree:true});
  refresh();
})();
