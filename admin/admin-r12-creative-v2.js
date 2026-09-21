(()=>{
  'use strict';
  const MUTATING=/gerar|criar|salvar|publicar|aprovar|reprocessar|montar|nova variação|adicionar módulo/i;
  const EXTERNAL=/publicar|enviar|meta|instagram|facebook|pinterest|whatsapp/i;
  const busy=new WeakSet();
  function label(el){return [el.textContent,el.value,el.getAttribute?.('aria-label'),el.title].filter(Boolean).join(' ').trim()}
  function guard(e){
    const el=e.target.closest?.('button,a,[role="button"]');
    if(!el||!MUTATING.test(label(el)))return;
    if(busy.has(el)){e.preventDefault();e.stopImmediatePropagation();return}
    busy.add(el);el.setAttribute('aria-busy','true');
    const release=()=>{busy.delete(el);el.removeAttribute('aria-busy')};
    setTimeout(release,4500);el.addEventListener('r12:release',release,{once:true});
  }
  function note(){
    if(document.querySelector('.r12-safe-note'))return;
    const host=document.querySelector('main,.page,.container');if(!host)return;
    const box=document.createElement('div');box.className='r12-safe-note';box.setAttribute('role','note');
    box.innerHTML='<strong>Criação sob seu controle</strong>Gerar conteúdo pode usar IA/custo. Publicar ou enviar para canais externos continua separado e depende dos gates próprios.';
    const first=host.querySelector('.card,section')||host.firstElementChild;host.insertBefore(box,first||null);
  }
  function annotate(){document.querySelectorAll('button,a,[role="button"]').forEach(el=>{if(EXTERNAL.test(label(el)))el.dataset.r12ExternalAction='true'})}
  document.addEventListener('click',guard,true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{note();annotate()},{once:true});else{note();annotate()}
})();
