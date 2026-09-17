(()=>{
  'use strict';

  const app=window.DA_COMPRAR_APP;
  if(!app?.stage)return;

  const originalStage=app.stage.bind(app);

  function hasVisibleCheckoutTool(node){
    return !!node?.querySelector?.('.checkout-turn-card,.checkout-address-preview,.checkout-address-compact,.checkout-confirm-card,.checkout-card.success');
  }

  function placeAtCurrentTurn(node){
    const timeline=document.getElementById('timeline');
    if(!timeline||!node)return;
    if(node.parentElement!==timeline||timeline.lastElementChild!==node)timeline.appendChild(node);
  }

  app.stage=(step,title,subtitle,className='')=>{
    const node=originalStage(step,title,subtitle,className);
    if(!node||!String(className||'').includes('checkout-conversation-stage'))return node;

    const timeline=document.getElementById('timeline');
    if(node.parentElement===timeline)node.remove();

    let relocating=false;
    const observer=new MutationObserver(()=>{
      if(relocating||!hasVisibleCheckoutTool(node))return;
      relocating=true;
      placeAtCurrentTurn(node);
      queueMicrotask(()=>{relocating=false});
    });
    observer.observe(node,{childList:true,subtree:true});
    return node;
  };
})();
