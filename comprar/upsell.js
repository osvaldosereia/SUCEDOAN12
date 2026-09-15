(()=>{
  'use strict';
  const app=window.DA_COMPRAR_APP;if(!app)return;
  const {state,productApi,image,money}=app;
  const MAX_AFTER_BASKET=4,MAX_BEFORE_CHECKOUT=3,MIN_RELEVANT=2,RELEVANCE_THRESHOLD=20;
  const suggestedProductIds=new Set();
  let stopped=false,afterBasketUsed=false,beforeCheckoutUsed=false;

  function cartProductIds(){return new Set((state.cart?.items||[]).filter(i=>Number(i.quantity||0)>0).map(i=>String(i.product_id||i.product?.id||'')))}
  function cartCategories(){const set=new Set();for(const item of state.cart?.items||[]){const p=item.product||item;for(const value of [p.customer_category,p.customer_subcategory,p.category,p.subcategory])if(value)set.add(String(value).toLowerCase())}return set}
  function chooseSection(){const blob=JSON.stringify(state.cart?.items||[]).toLowerCase();return /limpeza|lavanderia|detergente|sab[aã]o|amaciante|casa|pet/.test(blob)?'Para Você':'Para Casa'}
  function score(product){
    const ids=cartProductIds(),id=String(product.id||'');if(!id||ids.has(id)||suggestedProductIds.has(id))return -1000;
    const price=Number(product.price||0),total=Math.max(1,Number(state.cart?.total??state.cart?.commercial_total??0));if(price<=0)return -1000;
    let value=0;if(product.is_offer===true)value+=30;
    const categories=cartCategories(),pcat=String(product.customer_subcategory||product.customer_category||product.category||'').toLowerCase();
    if(categories.size&&pcat&&!categories.has(pcat))value+=20;
    if(String(product.customer_category||'')===chooseSection())value+=20;
    if(price<=total*.10)value+=10;else if(price<=total*.20)value+=5;else if(price>total*.35)value-=20;
    return value;
  }
  async function fetchCandidates(){
    const preferred=chooseSection();
    const calls=[productApi('page',{offers:true,offset:0,limit:12}),productApi('page',{customer_category:preferred,offers:false,offset:0,limit:12})];
    const results=await Promise.allSettled(calls),map=new Map();
    for(const result of results){if(result.status!=='fulfilled')continue;for(const p of result.value?.products||[])map.set(String(p.id),p)}
    return [...map.values()].map(p=>({product:p,score:score(p)})).filter(x=>x.score>=RELEVANCE_THRESHOLD).sort((a,b)=>b.score-a.score||Number(a.product.price||0)-Number(b.product.price||0)).map(x=>x.product);
  }
  function renderCards(products,limit,message,host){
    if(stopped||!host||!host.isConnected||products.length<MIN_RELEVANT)return false;
    const chosen=products.slice(0,limit);if(chosen.length<MIN_RELEVANT)return false;
    const strip=document.createElement('section');strip.className='upsell-strip';
    const title=document.createElement('p');title.className='upsell-message';title.textContent=message;strip.appendChild(title);
    const grid=document.createElement('div');grid.className='upsell-grid';strip.appendChild(grid);
    for(const product of chosen){
      suggestedProductIds.add(String(product.id));
      const card=document.createElement('article');card.className='upsell-card';card.appendChild(image(product.image_url,product.name));
      const copy=document.createElement('div');copy.className='upsell-card-copy';copy.innerHTML=`<strong>${app.escapeHtml(product.name||'Produto')}</strong><small>${money(product.price)}</small>`;card.appendChild(copy);
      const button=document.createElement('button');button.type='button';button.textContent='+ Adicionar';button.onclick=()=>{if(button.disabled)return;const ok=state.modules.products?.addSuggestedProduct?.(product);if(ok!==false){button.disabled=true;button.textContent='Adicionado'}};card.appendChild(button);grid.appendChild(card);
    }
    const resetAction=host.querySelector('.clear-order-action');
    if(resetAction)host.insertBefore(strip,resetAction);else host.appendChild(strip);return true;
  }
  function queueRender(host,limit,message){
    fetchCandidates().then(products=>renderCards(products,limit,message,host)).catch(()=>{});
    return false;
  }
  function renderAfterBasket(host){
    if(stopped||afterBasketUsed||!host)return false;afterBasketUsed=true;
    return queueRender(host,MAX_AFTER_BASKET,'Separei algumas coisas que podem completar sua compra.');
  }

  function resetClientState(cart={items:[],total:0}){
    state.selectedBasket=null;
    state.basketItems=[];
    state.checkout=null;
    state.payment=null;
    state.productFilters={customerCategory:'',subcategory:'',subsubcategory:'',offers:false,query:''};
    app.setCart(cart||{items:[],total:0});
    document.querySelectorAll('.stage').forEach(el=>el.remove());
    document.querySelectorAll('.conversation-message').forEach(el=>el.remove());
    app.renderStart();
  }

  async function clearOrder(button){
    if(button?.dataset.busy==='1')return;
    const previous=button?.textContent||'Sim, limpar';
    if(button){button.dataset.busy='1';button.disabled=true;button.textContent='Limpando…'}
    try{
      await app.waitForPendingProductSyncs();
      const params=new URLSearchParams(location.search);
      const adminTest=params.get('admin_test')==='1'&&window.parent!==window;
      if(adminTest){resetClientState();return}
      const resetApi=app.config.resetApi||String(app.config.api||'').replace(/shopping-room-v1\/?(?:\?.*)?$/,'shopping-room-reset-v1');
      if(!resetApi||resetApi===app.config.api)throw new Error('Serviço de limpeza indisponível.');
      const data=await app.post(resetApi,'reset_cart');
      resetClientState(data.cart||{items:[],total:0});
      location.reload();
    }catch(error){app.toast(error.message||'Não consegui limpar o pedido.');if(button){button.dataset.busy='0';button.disabled=false;button.textContent=previous}}
  }

  function renderResetConfirmation(host,action){
    host.querySelector('.clear-order-confirm')?.remove();
    const box=document.createElement('section');box.className='conversation-tool-summary clear-order-confirm';
    const copy=document.createElement('div');copy.className='conversation-tool-summary-copy';copy.innerHTML='<strong>Quer limpar este pedido e começar novamente?</strong><small>A cesta e os produtos serão removidos. Seu cadastro continuará disponível.</small>';box.appendChild(copy);
    const actions=document.createElement('div');actions.className='conversation-tool-summary-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.className='text-button';cancel.textContent='Cancelar';cancel.onclick=()=>{box.remove();action.hidden=false};
    const confirm=document.createElement('button');confirm.type='button';confirm.className='secondary';confirm.textContent='Sim, limpar';confirm.onclick=()=>clearOrder(confirm);
    actions.append(cancel,confirm);box.appendChild(actions);action.hidden=true;host.appendChild(box);app.scrollTo(box,{block:'center'});
  }

  function renderResetAction(host){
    if(!host||host.querySelector('.clear-order-action'))return;
    const action=document.createElement('div');action.className='clear-order-action';
    const button=document.createElement('button');button.type='button';button.className='text-button clear-order-button';button.textContent='Limpar pedido';button.onclick=()=>renderResetConfirmation(host,action);
    action.appendChild(button);host.appendChild(action);
  }

  function renderBeforeCheckout(host){
    if(!host)return false;
    renderResetAction(host);
    if(stopped||beforeCheckoutUsed)return false;beforeCheckoutUsed=true;
    return queueRender(host,MAX_BEFORE_CHECKOUT,'Antes de finalizar, tem algo que costuma faltar em casa?');
  }
  function stop(){stopped=true;document.querySelectorAll('.upsell-strip').forEach(el=>el.remove())}
  app.registerModule('upsell',{renderAfterBasket,renderBeforeCheckout,stop,score});
})();