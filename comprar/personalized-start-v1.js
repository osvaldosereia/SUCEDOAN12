(()=>{
  'use strict';

  const app=window.DA_COMPRAR_APP;
  if(!app)return;

  const {state,customerApi}=app;

  function firstName(){
    return String(state.customer?.name||'').trim().split(/\s+/)[0]||'';
  }

  async function readContext(){
    let frequent=app.frequentPurchases?.getCache?.()||null;
    let repeat=app.repeatLastPurchase?.getCache?.()||null;

    if(!frequent&&state.customer?.id){
      const data=await customerApi('frequent_purchases').catch(()=>null);
      frequent=data?.frequent||null;
    }
    if(!repeat&&state.customer?.id){
      const data=await customerApi('repeat_last_purchase_preview').catch(()=>null);
      repeat=data?.preview||null;
    }
    return {frequent,repeat};
  }

  function shouldShowFavorite(favorite,repeat){
    if(!favorite||favorite.available===false||Number(favorite.purchase_count||0)<2)return false;
    if(!repeat?.available)return true;
    const same=String(favorite.basket_id||'')===String(repeat.basket?.id||'');
    if(!same)return true;
    return Number(repeat.addon_count||0)>0||repeat.basket_customization_detected===true;
  }

  function favoriteShortcut(favorite){
    const wrap=document.createElement('div');
    wrap.className='personalized-favorite-entry';

    const button=document.createElement('button');
    button.type='button';
    button.className='chip personalized-favorite-chip';
    button.textContent='Comprar minha cesta de sempre';
    button.onclick=()=>{
      const baskets=state.modules?.baskets;
      if(!baskets?.previewBasket){
        app.toast?.('Não consegui abrir esta cesta agora.');
        return;
      }
      app.userDecision?.('Quero minha cesta de sempre',{className:'decision personalized-favorite-decision'});
      baskets.previewBasket({
        id:favorite.basket_id,
        name:favorite.name,
        image_url:favorite.image_url,
        base_price:favorite.current_price
      },button);
    };

    wrap.appendChild(button);
    return wrap;
  }

  async function personalize(){
    const stage=document.querySelector('.start-stage');
    const chips=stage?.querySelector('.start-chips');
    if(!stage||!chips||!state.customer?.id)return;
    if(stage.dataset.personalizedStart==='1')return;

    const {frequent,repeat}=await readContext();
    const hasHistory=Number(frequent?.order_count||0)>0||repeat?.available===true;
    if(!hasHistory)return;

    const repeatEntry=stage.querySelector('.repeat-purchase-entry');
    const frequentEntry=stage.querySelector('.frequent-purchases-entry');
    const favorite=frequent?.favorite_basket||null;
    const showFavorite=shouldShowFavorite(favorite,repeat);

    const shortcuts=document.createElement('div');
    shortcuts.className='personalized-start-shortcuts';

    if(repeatEntry)shortcuts.appendChild(repeatEntry);
    if(frequentEntry)shortcuts.appendChild(frequentEntry);
    if(showFavorite)shortcuts.appendChild(favoriteShortcut(favorite));

    if(!shortcuts.children.length)return;

    const block=document.createElement('section');
    block.className='personalized-start-block';

    const head=document.createElement('div');
    head.className='personalized-start-head';
    const title=document.createElement('strong');
    title.textContent='Atalhos para você';
    const hint=document.createElement('small');
    hint.textContent='Com base nas suas compras anteriores';
    head.append(title,hint);

    block.append(head,shortcuts);
    stage.insertBefore(block,chips);

    const separator=document.createElement('div');
    separator.className='personalized-start-separator';
    separator.textContent='Ou compre diferente';
    stage.insertBefore(separator,chips);

    const greeting=document.querySelector('.start-message');
    const name=firstName();
    if(greeting){
      greeting.textContent=name
        ? 'Oi, '+name+'! Quer repetir algo que você já compra ou escolher algo diferente?'
        : 'Quer repetir algo que você já compra ou escolher algo diferente?';
    }

    const stageTitle=stage.querySelector('.stage-head strong');
    if(stageTitle)stageTitle.textContent='Como quer comprar hoje?';

    stage.dataset.personalizedStart='1';
  }

  const originalStart=app.start?.bind(app);
  if(originalStart){
    app.start=async(...args)=>{
      const result=await originalStart(...args);
      await personalize();
      return result;
    };
  }

  app.personalizedStart={refresh:personalize};
})();