(()=>{
  'use strict';

  const app=window.DA_COMPRAR_APP;
  if(!app)return;

  const {state,customerApi,money,escapeHtml}=app;
  let payloadCache=null;
  let opening=false;

  const byId=id=>document.getElementById(id);

  function meaningful(data){
    if(!data||Number(data.order_count||0)<2)return false;
    const products=Array.isArray(data.frequent_products)?data.frequent_products:[];
    const extras=Array.isArray(data.recent_extras)?data.recent_extras:[];
    return products.length>0||extras.length>0||!!data.favorite_basket;
  }

  function entryHost(){
    const chips=document.querySelector('.start-stage .start-chips');
    return chips?.closest('.start-stage')||null;
  }

  function ensureEntry(data){
    const stage=entryHost();
    const chips=stage?.querySelector('.start-chips');
    if(!stage||!chips||stage.querySelector('[data-frequent-purchases]'))return;
    const wrap=document.createElement('div');
    wrap.className='frequent-purchases-entry';
    const button=document.createElement('button');
    button.type='button';
    button.className='chip frequent-purchases-chip';
    button.dataset.frequentPurchases='1';
    button.textContent='Minhas compras frequentes';
    button.onclick=()=>openFrequent(data);
    wrap.appendChild(button);
    stage.insertBefore(wrap,chips);
  }

  async function load(){
    if(!state.customer?.id||!entryHost())return null;
    try{
      const data=await customerApi('frequent_purchases');
      const frequent=data?.frequent||null;
      if(meaningful(frequent)){
        payloadCache=frequent;
        ensureEntry(frequent);
      }
      return frequent;
    }catch{
      return null;
    }
  }

  function formatFrequency(data){
    const label=String(data?.frequency_label||'').trim();
    const days=Number(data?.average_interval_days);
    if(label&&Number.isFinite(days)&&days>=1)return label+' · em média a cada '+Math.round(days)+' dias';
    if(label)return label;
    return 'Histórico em formação';
  }

  function productRow(item,kind){
    const row=document.createElement('article');
    row.className='frequent-product-row'+(item.available===false?' unavailable':'');
    if(item.image_url){
      const img=document.createElement('img');
      img.src=item.image_url;
      img.alt='';
      img.loading='lazy';
      img.decoding='async';
      row.appendChild(img);
    }else{
      const spacer=document.createElement('div');
      spacer.className='frequent-product-image-empty';
      row.appendChild(spacer);
    }

    const copy=document.createElement('div');
    copy.className='frequent-product-copy';
    const name=document.createElement('strong');
    name.textContent=item.name||'Produto';
    copy.appendChild(name);

    const meta=document.createElement('small');
    if(kind==='frequent'){
      const count=Number(item.purchase_count||0);
      meta.textContent=count+' '+(count===1?'compra':'compras')+' · '+money(item.current_price||0);
    }else{
      const count=Number(item.purchase_count||0);
      meta.textContent=(count>1?count+' compras · ':'Último extra · ')+money(item.current_price||0);
    }
    copy.appendChild(meta);
    row.appendChild(copy);

    const action=document.createElement('button');
    action.type='button';
    action.className='frequent-add-button';
    action.textContent=item.available===false?'Indisponível':'Adicionar novamente';
    action.disabled=item.available===false;
    action.onclick=()=>addAgain(item,action);
    row.appendChild(action);
    return row;
  }

  function favoriteBasketCard(basket){
    if(!basket)return null;
    const card=document.createElement('section');
    card.className='frequent-favorite-basket';
    if(basket.image_url){
      const img=document.createElement('img');
      img.src=basket.image_url;
      img.alt='';
      img.loading='lazy';
      card.appendChild(img);
    }
    const copy=document.createElement('div');
    const eyebrow=document.createElement('small');
    eyebrow.textContent='Sua cesta mais comprada';
    const name=document.createElement('strong');
    name.textContent=basket.name||'Cesta básica';
    const meta=document.createElement('span');
    const count=Number(basket.purchase_count||0);
    meta.textContent=count+' '+(count===1?'compra':'compras')+(basket.current_price!=null?' · '+money(basket.current_price):'');
    copy.append(eyebrow,name,meta);
    card.appendChild(copy);

    const button=document.createElement('button');
    button.type='button';
    button.className='secondary';
    button.textContent=basket.available===false?'Indisponível agora':'Ver esta cesta';
    button.disabled=basket.available===false;
    button.onclick=()=>{
      const module=state.modules?.baskets;
      if(!module?.previewBasket)return app.toast?.('Não consegui abrir esta cesta agora.');
      app.userDecision?.('Quero ver minha cesta mais comprada',{className:'decision frequent-basket-decision'});
      document.querySelector('.frequent-purchases-card')?.remove();
      module.previewBasket({
        id:basket.basket_id,
        name:basket.name,
        image_url:basket.image_url,
        base_price:basket.current_price
      },button);
    };
    card.appendChild(button);
    return card;
  }

  function sectionTitle(textValue,subtitle){
    const head=document.createElement('div');
    head.className='frequent-section-title';
    const box=document.createElement('div');
    const title=document.createElement('h3');
    title.textContent=textValue;
    box.appendChild(title);
    if(subtitle){
      const small=document.createElement('small');
      small.textContent=subtitle;
      box.appendChild(small);
    }
    head.appendChild(box);
    return head;
  }

  function renderCard(data){
    document.querySelectorAll('.frequent-purchases-card').forEach(node=>node.remove());
    const timeline=byId('timeline');
    if(!timeline)return null;

    const card=document.createElement('section');
    card.className='frequent-purchases-card';

    const top=document.createElement('div');
    top.className='frequent-purchases-head';
    const copy=document.createElement('div');
    const eyebrow=document.createElement('small');
    eyebrow.textContent='Baseado nas suas compras reais';
    const title=document.createElement('h2');
    title.textContent='Minhas compras frequentes';
    const freq=document.createElement('p');
    freq.textContent='Ritmo aproximado: '+formatFrequency(data);
    copy.append(eyebrow,title,freq);
    top.appendChild(copy);
    const close=document.createElement('button');
    close.type='button';
    close.className='frequent-close';
    close.setAttribute('aria-label','Fechar');
    close.textContent='×';
    close.onclick=()=>card.remove();
    top.appendChild(close);
    card.appendChild(top);

    const basket=favoriteBasketCard(data.favorite_basket);
    if(basket)card.appendChild(basket);

    const products=Array.isArray(data.frequent_products)?data.frequent_products:[];
    if(products.length){
      const section=document.createElement('section');
      section.className='frequent-list-section';
      section.appendChild(sectionTitle('Produtos recorrentes','Ordenados por número de compras, recência e quantidade.'));
      const list=document.createElement('div');
      list.className='frequent-products-list';
      const initial=products.slice(0,6);
      initial.forEach(item=>list.appendChild(productRow(item,'frequent')));
      section.appendChild(list);
      if(products.length>6){
        const more=document.createElement('button');
        more.type='button';
        more.className='frequent-more';
        more.textContent='Ver mais '+(products.length-6);
        more.onclick=()=>{
          products.slice(6).forEach(item=>list.appendChild(productRow(item,'frequent')));
          more.remove();
        };
        section.appendChild(more);
      }
      card.appendChild(section);
    }

    const frequentIds=new Set(products.map(item=>String(item.product_id||'')));
    const extras=(Array.isArray(data.recent_extras)?data.recent_extras:[]).filter(item=>!frequentIds.has(String(item.product_id||'')));
    if(extras.length){
      const section=document.createElement('section');
      section.className='frequent-list-section';
      section.appendChild(sectionTitle('Extras recentes','Produtos adicionados fora da cesta nas últimas compras.'));
      const list=document.createElement('div');
      list.className='frequent-products-list';
      extras.slice(0,6).forEach(item=>list.appendChild(productRow(item,'extra')));
      section.appendChild(list);
      card.appendChild(section);
    }

    if(!products.length&&!extras.length&&!data.favorite_basket){
      const empty=document.createElement('div');
      empty.className='frequent-empty';
      empty.textContent='Seu histórico ainda não tem recorrência suficiente.';
      card.appendChild(empty);
    }

    const note=document.createElement('p');
    note.className='frequent-purchases-note';
    note.textContent='Os preços, estoque e disponibilidade são conferidos novamente no momento de adicionar.';
    card.appendChild(note);

    timeline.appendChild(card);
    app.scrollTo?.(card,{block:'center'});
    return card;
  }

  async function openFrequent(initial){
    if(opening)return;
    opening=true;
    try{
      app.userDecision?.('Quero ver minhas compras frequentes',{className:'decision frequent-purchases-decision'});
      app.assistantMessage?.('Separei o que aparece com mais frequência no seu histórico.',{className:'frequent-purchases-message'});
      const fresh=await customerApi('frequent_purchases').catch(()=>null);
      const data=meaningful(fresh?.frequent)?fresh.frequent:(initial||payloadCache);
      if(!meaningful(data)){
        app.assistantMessage?.('Seu histórico ainda não tem compras suficientes para formar hábitos de compra.');
        return;
      }
      payloadCache=data;
      renderCard(data);
    }finally{
      opening=false;
    }
  }

  async function addAgain(item,button){
    if(button.dataset.busy==='1')return;
    button.dataset.busy='1';
    button.disabled=true;
    const original=button.textContent;
    button.textContent='Adicionando…';
    try{
      const opened=await app.api('open');
      const currentItems=Array.isArray(opened?.cart?.items)?opened.cart.items:[];
      const current=currentItems
        .filter(entry=>String(entry.product_id)===String(item.product_id)&&entry.source==='addon')
        .reduce((sum,entry)=>sum+Math.max(0,Number(entry.quantity||0)),0);
      const max=Math.max(1,Number(item.max_addable_quantity||6));
      const target=Math.min(max,current+1);
      if(target<=current)throw new Error('Você atingiu o limite disponível para este produto.');
      const data=await app.api('set_quantity',{product_id:item.product_id,quantity:target});
      if(data?.cart)app.setCart(data.cart);
      button.textContent='Adicionado ✓';
      app.toast?.('Produto adicionado ao carrinho.');
      setTimeout(()=>{
        button.dataset.busy='0';
        button.disabled=item.available===false;
        button.textContent=original;
      },1100);
    }catch(error){
      button.dataset.busy='0';
      button.disabled=item.available===false;
      button.textContent=original;
      app.toast?.(error?.message||'Não consegui adicionar este produto.');
    }
  }

  const originalStart=app.start?.bind(app);
  if(originalStart){
    app.start=async(...args)=>{
      const result=await originalStart(...args);
      await load();
      return result;
    };
  }

  app.frequentPurchases={load,open:openFrequent,getCache:()=>payloadCache};
})();