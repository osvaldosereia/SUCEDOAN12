(()=>{
  'use strict';

  let inFlight=false;

  function toast(message){
    const bridge=window.DonaAntoniaAdminBridge||{};
    if(typeof bridge.toast==='function')bridge.toast(message);
    else console.warn(message);
  }

  function waitFor(getter,timeout=4000){
    const started=Date.now();
    return new Promise((resolve,reject)=>{
      const tick=()=>{
        try{
          const value=getter();
          if(value){resolve(value);return}
        }catch(error){}
        if(Date.now()-started>=timeout){reject(new Error('canonical_basket_navigation_timeout'));return}
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  function findBasketCard(basketId){
    return [...document.querySelectorAll('[data-store-basket-card]')]
      .find(card=>String(card.dataset.storeBasketCard||'')===String(basketId))||null;
  }

  async function openStoreBasket(basketId){
    const id=String(basketId||'').trim();
    if(!id)throw new Error('basket_id_required');
    if(inFlight)return;
    inFlight=true;
    try{
      const nav=document.querySelector('#adminNav [data-tab="baskets"], [data-tab="baskets"]');
      if(!nav)throw new Error('basket_navigation_unavailable');
      nav.click();

      const controller=await waitFor(()=>{
        const api=window.DonaAntoniaBasketAdmin;
        return api&&typeof api.render==='function'&&typeof api.setTab==='function'?api:null;
      });
      await controller.render();
      await controller.setTab('store');

      const card=await waitFor(()=>findBasketCard(id));
      card.click();
      card.classList.add('active');
      card.setAttribute('aria-current','true');
      if(typeof card.scrollIntoView==='function')card.scrollIntoView({block:'center',behavior:'smooth'});
      return card;
    }finally{
      inFlight=false;
    }
  }

  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target.closest('[data-open-product-basket]'):null;
    if(!target)return;
    const basketId=String(target.dataset.openProductBasket||'').trim();
    if(!basketId)return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openStoreBasket(basketId).catch(error=>{
      console.error('[product-basket-cutover]',error);
      toast('Não consegui abrir esta cesta em Cestas do Site. Tente novamente.');
    });
  },true);

  window.DonaAntoniaProductBasketCutover={open:openStoreBasket};
})();
