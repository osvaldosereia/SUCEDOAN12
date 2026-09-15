(()=>{
  'use strict';

  const config=window.DA_SHOPPING_ROOM_CONFIG||{};
  const params=new URLSearchParams(location.search);
  let token=(params.get('s')||params.get('c')||params.get('token')||'').trim();
  let started=false;
  let renewingRoom=null;

  const state={
    session:null,customer:null,baskets:[],selectedBasket:null,basketItems:[],cart:null,checkout:null,payment:null,
    productFilters:{customerCategory:'',subcategory:'',subsubcategory:'',offers:false,query:''},
    pendingProductSyncs:new Map(),modules:Object.create(null)
  };

  const $=id=>document.getElementById(id);
  const text=value=>String(value??'').replace(/\s+/g,' ').trim();
  const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fallbackImage='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="100%" height="100%" fill="#f2f4f2"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#718078" font-family="Arial" font-size="14">Dona Antônia</text></svg>');

  const errors={
    invalid_token:'Link inválido.',room_not_found:'Esta compra não foi encontrada.',room_expired:'Este link expirou.',room_closed:'Este pedido já foi concluído.',room_inactive:'Este pedido já foi concluído.',
    payment_method_required:'Escolha como vai pagar na entrega.',invalid_payment_method:'Escolha uma forma de pagamento válida.',customer_name_required:'Informe seu nome.',
    valid_whatsapp_required:'Informe seu WhatsApp com DDD.',customer_document_required:'Informe o CPF para concluir.',customer_identification_required:'Preencha seus dados para concluir.',
    delivery_address_required:'Informe o endereço de entrega.',empty_cart:'Escolha uma cesta ou produto antes de finalizar.',product_not_available:'Este produto não está disponível no momento.',
    quantity_exceeds_stock:'A quantidade escolhida é maior que o estoque disponível.',quantity_exceeds_customer_limit:'Você atingiu o limite permitido para este produto.',
    customer_identity_conflict:'Este WhatsApp já está vinculado a outro cadastro. Fale com a Dona Antônia para corrigirmos.',
    order_persistence_failed:'Não consegui salvar seu pedido. Tente novamente.',order_items_persistence_failed:'Não consegui salvar os itens do pedido. Tente novamente.',
    invalid_response:'Não consegui concluir esta ação agora.'
  };

  function errorText(value){const key=String(value||'invalid_response');return errors[key]||key}
  function toast(message){const element=$('toast');if(!element)return;element.textContent=errorText(message);element.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>element.classList.remove('show'),2800)}
  function scrollTo(element,{block='start',behavior='smooth'}={}){if(!element)return;requestAnimationFrame(()=>element.scrollIntoView({block,behavior}))}
  function cartCount(cart=state.cart){return (cart?.items||[]).reduce((sum,item)=>sum+Math.max(0,Number(item.quantity||0)),0)}

  function setCart(cart){
    state.cart=cart||{items:[],total:0};
    const count=Math.round(cartCount()),total=state.cart?.total??state.cart?.commercial_total??0;
    const countElement=$('cartCount'),totalElement=$('cartTotal'),summary=$('cartSummaryText'),bar=$('cartBar'),checkout=$('checkoutButton');
    if(countElement)countElement.textContent=String(count);
    if(totalElement)totalElement.textContent=money(total);
    if(summary)summary.textContent=`${count} ${count===1?'item':'itens'} · ${money(total)}`;
    if(bar)bar.classList.remove('hidden');
    if(checkout)checkout.disabled=count<=0;
    document.querySelectorAll('[data-cart-total]').forEach(element=>{element.textContent=money(total)});
    return state.cart;
  }

  function bodyFor(action,payload={}){return {action,...(token?{token}:{}),...payload}}
  async function post(url,action,payload={},options={}){
    if(!url)throw new Error('Serviço indisponível.');
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(options.headers||{})},body:JSON.stringify(bodyFor(action,payload)),cache:'no-store',signal:options.signal});
    const data=await response.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!response.ok||data?.ok===false)throw new Error(errorText(data?.detail||data?.error||`Erro ${response.status}`));
    return data;
  }

  function api(action,payload={},options={}){return post(config.api,action,payload,options)}
  function productApi(action,payload={},options={}){return post(config.productsApi||config.api,action,payload,options)}
  function customerApi(action,payload={},options={}){return post(config.customerApi,action,payload,options)}
  function checkoutApi(action,payload={},options={}){return post(config.checkoutApi,action,payload,options)}
  function basketStorefrontApi(action,payload={},options={}){return post(config.basketStorefrontApi,action,payload,options)}

  async function uploadMedia(kind,file,durationMs=0){
    if(!config.api)throw new Error('Serviço indisponível.');
    const form=new FormData();form.append('action','upload_media');if(token)form.append('token',token);form.append('kind',kind);if(durationMs)form.append('duration_ms',String(durationMs));form.append('file',file,file.name||`${kind}-${Date.now()}`);
    const response=await fetch(config.api,{method:'POST',body:form,cache:'no-store'}),data=await response.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!response.ok||data?.ok===false)throw new Error(errorText(data?.detail||data?.error||`Erro ${response.status}`));return data;
  }

  function isAdminTest(){return params.get('admin_test')==='1'&&window.parent!==window}
  function markOrderCompleted(data={}){
    if(data.admin_test===true||isAdminTest())return;
    state.session={...(state.session||{}),status:'closed',current_view:'success',completed_at:new Date().toISOString()};
    requestAnimationFrame(()=>document.querySelectorAll('.stage:not(.checkout-stage)').forEach(element=>element.remove()));
  }
  async function confirmOrder(payload={}){
    if(isAdminTest()){
      const transport=window.DA_ADMIN_TEST_TRANSPORT;
      if(!transport||typeof transport.confirmOrder!=='function')throw new Error('Modo de teste do Admin ainda não está pronto.');
      return transport.confirmOrder(payload);
    }
    const data=await checkoutApi('confirm_order',payload);markOrderCompleted(data);return data;
  }

  function registerModule(name,module){if(!name||!module)throw new Error('Módulo inválido.');state.modules[name]=module;return module}
  function registerPendingProductSync(productId,promise){
    const key=String(productId);state.pendingProductSyncs.set(key,promise);
    Promise.resolve(promise).finally(()=>{if(state.pendingProductSyncs.get(key)===promise)state.pendingProductSyncs.delete(key)});return promise;
  }
  async function waitForPendingProductSyncs(){while(state.pendingProductSyncs.size)await Promise.allSettled([...state.pendingProductSyncs.values()])}

  function image(url,alt=''){const element=document.createElement('img');element.src=url||fallbackImage;element.alt=alt;element.loading='lazy';element.decoding='async';element.onerror=()=>{if(element.src!==fallbackImage)element.src=fallbackImage};return element}
  function bubble(message,who='assistant'){const timeline=$('timeline');if(!timeline||!message)return null;const element=document.createElement('div');element.className=`bubble ${who}`;element.textContent=String(message);timeline.appendChild(element);return element}
  function conversationMessage(textValue,who='assistant',className=''){
    const timeline=$('timeline');if(!timeline||!textValue)return null;
    const node=document.createElement('div');node.className=`conversation-message ${who} ${className}`.trim();node.textContent=String(textValue);timeline.appendChild(node);return node;
  }
  function assistantMessage(textValue,options={}){return conversationMessage(textValue,'assistant',options.className||'')}
  function userDecision(textValue,options={}){return conversationMessage(textValue,'user',options.className||'decision')}
  function compactToolSummary({className='',title='',meta='',actions=[]}={}){
    const node=document.createElement('section');node.className=`conversation-tool-summary ${className}`.trim();
    const copy=document.createElement('div');copy.className='conversation-tool-summary-copy';copy.innerHTML=`<strong>${escapeHtml(title)}</strong>${meta?`<small>${escapeHtml(meta)}</small>`:''}`;node.appendChild(copy);
    if(actions.length){const host=document.createElement('div');host.className='conversation-tool-summary-actions';for(const action of actions){const button=document.createElement('button');button.type='button';button.className=action.primary?'primary':'text-button';button.textContent=action.label;button.onclick=action.onClick;host.appendChild(button)}node.appendChild(host)}
    return node;
  }
  function stage(number,title,subtitle='',className=''){const timeline=$('timeline');if(!timeline)return null;const section=document.createElement('section');section.className=`stage ${className}`.trim();section.innerHTML=`<div class="stage-head"><span class="stage-no">${escapeHtml(number)}</span><div><strong>${escapeHtml(title)}</strong>${subtitle?`<small>${escapeHtml(subtitle)}</small>`:''}</div></div>`;timeline.appendChild(section);return section}
  function clearStages(selector='.stage'){document.querySelectorAll(selector).forEach(element=>element.remove())}
  function removeConversation(selector){document.querySelectorAll(selector).forEach(element=>element.remove())}

  function applyOpenData(data={}){state.session=data.session||null;state.customer=data.customer||null;state.baskets=Array.isArray(data.baskets)?data.baskets:[];setCart(data.cart||{items:[],total:0});return data}

  function roomUrl(nextToken,resume=''){
    const adminTest=params.get('admin_test')==='1'?'&admin_test=1':'';const next=resume?`&resume=${encodeURIComponent(resume)}`:'';return `${location.pathname}?s=${encodeURIComponent(nextToken)}${adminTest}${next}${location.hash||''}`;
  }
  async function createRoomToken(){
    const previousToken=token;token='';
    try{const data=await api('create_web_room');const nextToken=String(data.token||'').trim();if(!/^[a-f0-9]{64}$/i.test(nextToken))throw new Error('Não consegui iniciar sua compra.');token=nextToken;history.replaceState({},'',roomUrl(token));return token}catch(error){token=previousToken;throw error}
  }
  async function renewRoom(resume='start'){
    if(renewingRoom)return renewingRoom;
    renewingRoom=(async()=>{const nextToken=await createRoomToken();location.replace(roomUrl(nextToken,resume));await new Promise(()=>{})})();
    try{return await renewingRoom}finally{renewingRoom=null}
  }
  async function ensureActiveRoom(resume='start'){if(state.session?.status==='closed'||state.session?.current_view==='success')await renewRoom(resume);return state}

  async function openAddProductsStage(options={auto:false}){await ensureActiveRoom('products');return state.modules.products?.renderEntry?.(options)}

  function orderReviewMeta(){
    const items=state.cart?.items||[];
    const basketItems=items.filter(item=>item.source!=='addon').reduce((sum,item)=>sum+Math.max(0,Number(item.quantity||0)),0);
    const extrasItems=items.filter(item=>item.source==='addon'&&Math.max(0,Number(item.quantity||0))>0);
    const extras=extrasItems.reduce((sum,item)=>sum+Math.max(0,Number(item.quantity||0)),0);
    return {basketItems,extras,extrasItems,total:state.cart?.total??state.cart?.commercial_total??0,count:cartCount()};
  }

  async function renderOrderReview(trigger){
    await ensureActiveRoom('start');
    if(trigger?.dataset.busy==='1')return;
    document.querySelector('.stage.checkout-stage')?.remove();
    document.querySelector('.stage.order-review-stage')?.remove();
    document.querySelectorAll('.stage.products-entry-stage,.stage.products-stage,.stage.selected-basket-expanded').forEach(element=>element.remove());
    removeConversation('.products-browser-message');
    removeConversation('.order-review-message');
    const meta=orderReviewMeta();
    if(!meta.count){toast('empty_cart');return}
    assistantMessage('Confira seu pedido antes de finalizar.',{className:'order-review-message'});
    const section=stage(2,'Seu pedido','','order-review-stage');if(!section)return;
    const inner=document.createElement('div');inner.className='order-review-tool';section.appendChild(inner);
    if(state.selectedBasket){
      const basketName=state.modules.baskets?.basketDisplayName?.(state.selectedBasket)||state.selectedBasket.name||'Cesta básica';
      const row=document.createElement('div');row.className='order-review-row';row.innerHTML=`<div><strong>${escapeHtml(basketName)}</strong><small>${meta.basketItems} ${meta.basketItems===1?'item':'itens'} da cesta</small></div><button type="button" class="text-button" data-review-composition>Ver composição</button>`;inner.appendChild(row);
      row.querySelector('[data-review-composition]').onclick=()=>state.modules.baskets?.expandSelectedBasket?.();
    }
    if(meta.extrasItems.length){
      const row=document.createElement('div');row.className='order-review-row';
      const copy=document.createElement('div');
      const heading=document.createElement('strong');heading.textContent='Produtos extras';copy.appendChild(heading);
      const summary=document.createElement('small');summary.textContent=`${meta.extrasItems.length} ${meta.extrasItems.length===1?'produto':'produtos'} · ${meta.extras} ${meta.extras===1?'unidade':'unidades'}`;copy.appendChild(summary);
      const list=document.createElement('div');list.className='order-review-extra-list';
      for(const item of meta.extrasItems){const quantity=Math.max(0,Number(item.quantity||0));const product=item.product||item;const line=document.createElement('div');line.className='muted order-review-extra-item';line.textContent=`${quantity}× ${product.name||item.name||'Produto'}`;list.appendChild(line)}
      copy.appendChild(list);
      const alter=document.createElement('button');alter.type='button';alter.className='text-button';alter.dataset.reviewProducts='1';alter.textContent='Alterar';alter.onclick=()=>openAddProductsStage({auto:false});
      row.append(copy,alter);inner.appendChild(row);
    }
    const total=document.createElement('div');total.className='order-review-total';total.innerHTML=`<span>Total</span><strong>${money(meta.total)}</strong>`;inner.appendChild(total);
    const upsellHost=document.createElement('div');upsellHost.className='order-review-upsell';inner.appendChild(upsellHost);
    try{await state.modules.upsell?.renderBeforeCheckout?.(upsellHost)}catch{}
    const actions=document.createElement('div');actions.className='actions order-review-actions';
    const products=document.createElement('button');products.type='button';products.className='secondary';products.textContent='+ Produtos';products.onclick=()=>openAddProductsStage({auto:false});
    const finish=document.createElement('button');finish.type='button';finish.className='primary';finish.textContent='Finalizar pedido';finish.onclick=()=>state.modules.checkout?.open?.(finish);
    actions.append(products,finish);inner.appendChild(actions);scrollTo(section,{block:'start'});return section;
  }

  async function openCheckout(button){return renderOrderReview(button)}

  function bindShell(){
    const checkoutButton=$('checkoutButton'),cartButton=$('cartButton'),backButton=$('backButton');
    if(checkoutButton)checkoutButton.onclick=()=>openCheckout(checkoutButton);
    if(cartButton)cartButton.onclick=()=>openCheckout(cartButton);
    if(backButton)backButton.onclick=async()=>{
      await ensureActiveRoom('start');
      const checkout=document.querySelector('.stage.checkout-stage');
      if(checkout){checkout.remove();removeConversation('.checkout-intro-message');state.modules.help?.setCheckoutMode?.(false);return renderOrderReview()}
      const review=document.querySelector('.stage.order-review-stage');if(review){review.remove();removeConversation('.order-review-message');return state.selectedBasket?state.modules.baskets?.renderSelectedBasketSummary?.():renderStart()}
      if(state.selectedBasket){state.modules.baskets?.renderSelectedBasketSummary?.();state.modules.products?.renderEntry?.({auto:true});return}
      renderStart();
    };
  }

  function renderStart(){
    clearStages('.stage');removeConversation('.start-message');
    assistantMessage('Olá! Como posso ajudar na sua compra?',{className:'start-message'});
    const section=stage(1,'Como posso ajudar?','','start-stage');if(!section)return;
    const chips=document.createElement('div');chips.className='chips start-chips';
    const choices=[['Cestas Básicas',()=>state.modules.baskets?.renderPicker?.()],['Ofertas',()=>openAddProductsStage({section:'Ofertas'})],['Para Você',()=>openAddProductsStage({section:'Para Você'})],['Para Casa',()=>openAddProductsStage({section:'Para Casa'})]];
    for(const [label,handler] of choices){const button=document.createElement('button');button.type='button';button.className='chip';button.textContent=label;button.onclick=handler;chips.appendChild(button)}section.appendChild(chips);scrollTo(section,{block:'center'});
  }

  async function ensureToken(){if(token){if(!/^[a-f0-9]{64}$/i.test(token))throw new Error('Link inválido.');return token}return createRoomToken()}
  function clearResumeParam(){if(!params.get('resume'))return;history.replaceState({},'',roomUrl(token))}

  async function start(){
    if(started)return state;started=true;bindShell();
    try{
      await ensureToken();const data=await api('open');if(data.closed===true){await renewRoom(params.get('resume')||'start');return state}applyOpenData(data);$('loadingCard')?.remove();const resume=params.get('resume')||'';clearResumeParam();
      if(resume==='products'){await openAddProductsStage({auto:false});return state}
      if(state.cart?.basket_id&&state.modules.baskets?.restoreFromOpen)await state.modules.baskets.restoreFromOpen(data);else renderStart();return state;
    }catch(error){started=false;$('loadingCard')?.remove();bubble(error.message||'Não consegui abrir sua compra.');throw error}
  }

  window.DA_COMPRAR_APP={
    config,state,get token(){return token},$,text,money,escapeHtml,fallbackImage,errorText,toast,scrollTo,image,bubble,assistantMessage,userDecision,compactToolSummary,stage,clearStages,
    post,api,productApi,customerApi,checkoutApi,basketStorefrontApi,uploadMedia,confirmOrder,setCart,cartCount,registerModule,registerPendingProductSync,
    waitForPendingProductSyncs,ensureActiveRoom,renewRoom,markOrderCompleted,openAddProductsStage,openCheckout,renderOrderReview,renderStart,start
  };
})();