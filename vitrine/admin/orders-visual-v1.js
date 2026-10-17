(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DonaAntoniaOrderVisual=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  const normalize=value=>String(value??'').trim().toUpperCase();

  function resolveState(labels=[]){
    const set=new Set((Array.isArray(labels)?labels:[]).map(normalize));
    if(set.has('CANCELADO')||set.has('ENTREGUE'))return 'neutral';
    if(set.has('SEPARADO'))return 'separated';
    if(set.has('CONFIRMADO'))return 'confirmed';
    return 'neutral';
  }

  function installStyles(doc){
    if(!doc||doc.getElementById('orders-status-visual-v1-style'))return;
    const style=doc.createElement('style');
    style.id='orders-status-visual-v1-style';
    style.textContent=`
      #content .order-v3-card.order-status-confirmed{background:#f0faf3;border-color:#a4d1b3;box-shadow:0 2px 8px rgba(23,107,67,.08)}
      #content .order-v3-card.order-status-separated{background:#fff4e3;border-color:#e9bb7b;box-shadow:0 2px 8px rgba(196,107,19,.08)}
      #content .order-v3-tag.order-status-confirmed-tag{background:#176b43;color:#fff;padding:8px 14px;font-size:15px;font-weight:950;box-shadow:0 2px 6px rgba(23,107,67,.22)}
      #content .order-v3-tag.order-status-separated-tag{background:#c66d16;color:#fff;padding:8px 14px;font-size:15px;font-weight:950;box-shadow:0 2px 6px rgba(198,109,22,.22)}
      #content .order-v3-action.order-separation-ready{background:#e4f4e9;border-color:#86b998;color:#145b38;font-weight:900}
      #content .order-v3-action.order-separation-ready:hover{background:#d8eedf;border-color:#6ca980;color:#0f5031}
    `;
    doc.head.appendChild(style);
  }

  function decorateCard(card){
    if(!card)return 'neutral';
    const tags=[...card.querySelectorAll('.order-v3-tag')];
    const state=resolveState(tags.map(tag=>tag.textContent));
    card.classList.toggle('order-status-confirmed',state==='confirmed');
    card.classList.toggle('order-status-separated',state==='separated');

    tags.forEach(tag=>tag.classList.remove('order-status-confirmed-tag','order-status-separated-tag'));
    const confirmedTag=tags.find(tag=>normalize(tag.textContent)==='CONFIRMADO');
    const separatedTag=tags.find(tag=>normalize(tag.textContent)==='SEPARADO');
    if(state==='confirmed'&&confirmedTag)confirmedTag.classList.add('order-status-confirmed-tag');
    if(state==='separated'&&separatedTag)separatedTag.classList.add('order-status-separated-tag');

    const separationButton=card.querySelector('[data-v3-separation]');
    if(separationButton){
      const canSeparate=state==='confirmed'&&normalize(separationButton.textContent).includes('ABRIR VITRINE SEPARA');
      separationButton.classList.toggle('order-separation-ready',canSeparate);
    }
    return state;
  }

  function decorate(doc=typeof document!=='undefined'?document:null){
    if(!doc)return;
    installStyles(doc);
    doc.querySelectorAll('.order-v3-card').forEach(decorateCard);
  }

  function boot(doc=typeof document!=='undefined'?document:null){
    if(!doc)return;
    installStyles(doc);
    let scheduled=false;
    const schedule=()=>{
      if(scheduled)return;
      scheduled=true;
      const run=()=>{scheduled=false;decorate(doc)};
      if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);
    };
    const host=doc.getElementById('content')||doc.body;
    if(host&&typeof MutationObserver==='function'){
      const observer=new MutationObserver(schedule);
      observer.observe(host,{subtree:true,childList:true,characterData:true});
    }
    schedule();
  }

  if(typeof document!=='undefined')boot(document);
  return {resolveState,decorateCard,decorate,boot};
});