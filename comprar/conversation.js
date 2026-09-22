(()=>{
  'use strict';

  const app=window.DA_COMPRAR_APP;
  if(!app)return;

  const {state,productApi,customerApi,checkoutApi,api,money,image,escapeHtml,text,stage,toast}=app;
  const MIN_DELAY=800,MAX_DELAY=1500;
  const paymentLabels={pix:'PIX',credit_card:'Cartão de crédito',meal_card:'Alimentação / refeição',cash:'Dinheiro'};
  const ui={busy:false,prompt:null,offersSeen:false,postBasketResolved:false,checkoutStep:'idle'};
  const checkoutFlow={stage:null,phone:'',profile:null,selectedAddressId:null,form:null,payment:'',locator:null,opening:false,orderSaved:false,whatsappUrl:'',handoffWindow:null};

  const productsModule=state.modules.products||null;
  const upsellModule=state.modules.upsell||null;
  const checkoutModule=state.modules.checkout||null;
  const originalProductsRenderEntry=productsModule?.renderEntry?.bind(productsModule)||null;

  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,Math.max(0,Number(ms)||0)));
  const naturalDelay=()=>Math.round(MIN_DELAY+Math.random()*(MAX_DELAY-MIN_DELAY));
  const timeline=()=>document.getElementById('timeline');
  const isAdminTest=()=>new URLSearchParams(location.search).get('admin_test')==='1';

  function clearPrompt(){
    if(ui.prompt?.isConnected)ui.prompt.remove();
    ui.prompt=null;
    document.querySelectorAll('.conversation-quick-replies[data-active="1"]').forEach(node=>node.remove());
  }

  function consumeStartChoices(){document.querySelector('.stage.start-stage')?.remove()}
  function clearOfferStage(){document.querySelectorAll('.conversation-offers-stage').forEach(node=>node.remove())}

  function renderTyping(label='Ana está digitando…'){
    const host=timeline();if(!host)return null;
    const node=document.createElement('div');node.className='conversation-typing assistant';node.setAttribute('role','status');node.setAttribute('aria-live','polite');
    node.innerHTML=`<span class="conversation-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${escapeHtml(label)}</span>`;
    host.appendChild(node);app.scrollTo(node,{block:'nearest'});return node;
  }

  async function typing(delay=naturalDelay(),label='Ana está digitando…'){
    const node=renderTyping(label);
    await sleep(delay);
    node?.remove();
  }

  async function workWithTyping(work,{label='Ana está conferindo…',minDelay=MIN_DELAY}={}){
    const node=renderTyping(label),started=Date.now();
    try{return await work()}
    finally{
      const remaining=Math.max(0,Number(minDelay||0)-(Date.now()-started));
      if(remaining)await sleep(remaining);
      node?.remove();
    }
  }

  async function say(message,{delay=naturalDelay(),className=''}={}){
    if(delay>0)await typing(delay);
    const node=app.assistantMessage(message,{className});
    if(node)app.scrollTo(node,{block:'nearest'});
    return node;
  }

  async function revealTool(render,{delay=naturalDelay(),label='Ana está preparando…'}={}){
    await typing(delay,label);
    const node=typeof render==='function'?render():null;
    if(node)app.scrollTo(node,{block:'nearest'});
    return node;
  }

  async function choose(label,{onChoose=null,delay=naturalDelay(),className='decision'}={}){
    if(ui.busy)return false;
    ui.busy=true;clearPrompt();
    const bubble=app.userDecision(label,{className});
    if(bubble)app.scrollTo(bubble,{block:'nearest'});
    try{
      if(delay>0)await typing(delay);
      if(typeof onChoose==='function')await onChoose();
      return true;
    }finally{ui.busy=false}
  }

  function quickReplies(options=[],{host=null,className=''}={}){
    clearPrompt();
    const target=host||timeline();if(!target||!options.length)return null;
    const wrap=document.createElement('div');wrap.className=`conversation-quick-replies ${className}`.trim();wrap.dataset.active='1';
    for(const option of options){
      const button=document.createElement('button');button.type='button';button.className='conversation-quick-reply';button.textContent=option.label;
      button.onclick=()=>choose(option.userLabel||option.label,{delay:option.delay??naturalDelay(),onChoose:option.onChoose});
      wrap.appendChild(button);
    }
    target.appendChild(wrap);ui.prompt=wrap;app.scrollTo(wrap,{block:'nearest'});return wrap;
  }

  async function ask({text:message='',options=[],className='',delay=naturalDelay(),host=null,optionsDelay=MIN_DELAY}={}){
    clearPrompt();
    if(message)await say(message,{delay,className});
    if(options.length)await typing(optionsDelay,'Ana está preparando as opções…');
    return quickReplies(options,{host});
  }

  function cartProductIds(){
    return new Set((state.cart?.items||[]).filter(item=>Number(item.quantity||0)>0).map(item=>String(item.product_id||item.product?.id||'')));
  }

  function validOffer(product){
    return product?.is_offer===true&&Number(product.stock)>0&&Number(product.offer_price)>=0&&Number(product.offer_price)<Number(product.price)&&!cartProductIds().has(String(product.id||''));
  }

  function priceHtml(product){return `<div class="conversation-offer-price"><span>${money(product.price)}</span><strong>${money(product.offer_price)}</strong></div>`}

  async function addOfferProduct(product,button){
    if(!button||button.disabled)return false;
    const added=productsModule?.addSuggestedProduct?.(product);
    if(added===false){button.disabled=true;button.textContent='Já adicionado ✓';return false}
    button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Adicionando…';
    try{
      await productsModule?.waitForPending?.();
      if(cartProductIds().has(String(product.id||''))){button.textContent='Adicionado ✓';return true}
      button.disabled=false;button.textContent='+ Adicionar';return false;
    }catch(error){
      button.disabled=false;button.textContent='+ Adicionar';toast(error?.message||'Não consegui adicionar este produto.');return false;
    }finally{button.removeAttribute('aria-busy')}
  }

  function postBasketOptions(){
    return [
      {label:'Ver 6 ofertas de hoje',userLabel:'Quero ver as ofertas de hoje',onChoose:async()=>{ui.postBasketResolved=true;await showOffers()}},
      {label:'Procurar outros produtos',userLabel:'Quero procurar outros produtos',onChoose:()=>{ui.postBasketResolved=true;return originalProductsRenderEntry?.({auto:false})}},
      {label:'Não, revisar meu pedido',userLabel:'Não, quero revisar meu pedido',onChoose:()=>{ui.postBasketResolved=true;return app.renderOrderReview?.()}}
    ];
  }

  async function afterBasketSelected({basket=null,altered=false,renderSummary=null,resumed=false}={}){
    clearPrompt();ui.postBasketResolved=false;
    const name=String(basket?.name||'sua cesta').trim();
    const confirmation=resumed
      ?`Encontrei seu pedido aberto com a ${name}${altered?' com alterações':''}.`
      :(altered?`Perfeito! Recebi seu pedido da ${name} com alterações.`:`Perfeito! Recebi seu pedido da ${name} padrão.`);
    await say(confirmation,{className:'basket-confirm-message'});
    await revealTool(()=>typeof renderSummary==='function'?renderSummary():null,{label:'Ana está conferindo sua cesta…'});
    await say(resumed?'Podemos continuar de onde você parou. Quer ver ofertas, procurar outros produtos ou revisar o pedido?':'Antes de finalizarmos, que tal dar uma olhada nas ofertas de hoje ou acrescentar algum produto?');
    await typing(MIN_DELAY,'Ana está preparando as opções…');
    return quickReplies(postBasketOptions(),{className:'post-basket-replies'});
  }

  async function renderPostBasketPrompt(){
    ui.postBasketResolved=false;
    await typing(MIN_DELAY,'Ana está preparando as opções…');
    return quickReplies(postBasketOptions(),{className:'post-basket-replies'});
  }

  async function showOffers(){
    ui.offersSeen=true;clearOfferStage();
    let products=[];
    try{
      const data=await workWithTyping(()=>productApi('page',{offers:true,offset:0,limit:24}),{label:'Ana está separando as ofertas…'});
      products=(data.products||[]).filter(validOffer).slice(0,6);
    }catch(error){toast(error.message||'Não consegui carregar as ofertas.')}

    if(!products.length){
      await ask({text:'As melhores ofertas de hoje já acabaram, mas posso te mostrar outros produtos.',options:[
        {label:'Procurar outros produtos',userLabel:'Quero procurar outros produtos',onChoose:()=>originalProductsRenderEntry?.({auto:false})},
        {label:'Revisar meu pedido',userLabel:'Quero revisar meu pedido',onChoose:()=>app.renderOrderReview?.()}
      ]});
      return null;
    }

    await say(`Separei ${products.length} ${products.length===1?'oferta boa':'ofertas boas'} de hoje para você 👇`);
    const section=await revealTool(()=>{
      const host=stage(2,'Ofertas de hoje','','conversation-offers-stage');if(!host)return null;
      const grid=document.createElement('div');grid.className='conversation-offers-grid';host.appendChild(grid);
      for(const product of products){
        const card=document.createElement('article');card.className='conversation-offer-card';
        const picture=image(product.image_url,product.name);picture.className='conversation-offer-image';card.appendChild(picture);
        const copy=document.createElement('div');copy.className='conversation-offer-copy';
        copy.innerHTML=`<span class="conversation-offer-badge">OFERTA</span><strong>${escapeHtml(product.name||'Produto')}</strong>${priceHtml(product)}`;card.appendChild(copy);
        const button=document.createElement('button');button.type='button';button.className='conversation-offer-add';button.textContent='+ Adicionar';button.setAttribute('aria-label',`Adicionar ${product.name||'produto'} ao pedido`);
        button.onclick=()=>addOfferProduct(product,button);card.appendChild(button);grid.appendChild(card);
      }
      return host;
    },{label:'Ana está organizando as ofertas…'});
    await ask({text:'Quer continuar comprando ou conferir como ficou seu pedido?',options:[
      {label:'Ver outros produtos',userLabel:'Quero ver outros produtos',onChoose:()=>{clearOfferStage();return originalProductsRenderEntry?.({auto:false})}},
      {label:'Revisar meu pedido',userLabel:'Quero revisar meu pedido',onChoose:()=>{clearOfferStage();return app.renderOrderReview?.()}}
    ]});
    if(section)app.scrollTo(section,{block:'start'});return section;
  }

  function addressLine(address={}){return [address.street,address.number&&`nº ${address.number}`,address.neighborhood,address.city,address.state].filter(Boolean).join(' · ')}
  function addressIssue(address={},prefix='conversationCheckout'){
    if(!text(address.street))return {id:`${prefix}Street`,message:'Informe a rua.'};
    if(!text(address.number))return {id:`${prefix}Number`,message:'Informe o número da casa. Se não houver número, digite S/N.'};
    if(!text(address.city))return {id:`${prefix}City`,message:'Informe a cidade.'};
    return null;
  }
  function focusCheckoutIssue(issue,status){
    if(!issue)return;
    if(status)status.textContent=issue.message;
    toast(issue.message);
    const input=document.getElementById(issue.id);
    if(input){input.setAttribute('aria-invalid','true');input.focus({preventScroll:true});app.scrollTo(input,{block:'center'});}
  }
  function maskPhone(value=''){const digits=String(value).replace(/\D/g,'');if(digits.length<4)return 'meu número';const tail=digits.slice(-4),ddd=digits.length>=10?digits.slice(-11,-9):'';return ddd?`(${ddd}) *****-${tail}`:`*****-${tail}`}

  function resetCheckoutFlow(){Object.assign(checkoutFlow,{stage:null,phone:'',profile:null,selectedAddressId:null,form:null,payment:state.payment||'',locator:null,opening:false,orderSaved:false,whatsappUrl:'',handoffWindow:null});ui.checkoutStep='idle'}
  function checkoutBody(){return checkoutFlow.stage?.querySelector('[data-conversation-checkout-body]')||null}

  function setupCheckoutStage(){
    document.querySelectorAll('.stage.checkout-stage,.stage.order-review-stage').forEach(node=>node.remove());
    document.querySelectorAll('.checkout-intro-message').forEach(node=>node.remove());clearPrompt();
    checkoutFlow.stage=stage(3,'Finalizar pedido','','checkout-stage checkout-conversation-stage');
    if(checkoutFlow.stage)checkoutFlow.stage.innerHTML='<div class="checkout-conversation-shell" data-conversation-checkout-body></div>';
    state.modules.help?.setCheckoutMode?.(true);return checkoutFlow.stage;
  }

  async function openCheckoutConversation(button){
    if(checkoutFlow.opening||button?.dataset.busy==='1')return;checkoutFlow.opening=true;
    try{
      await state.modules.products?.waitForPending?.();
      const data=await workWithTyping(()=>api('checkout_preview'),{label:'Ana está conferindo seu pedido…'});state.checkout=data.checkout||{};state.payment=data.payment_method||state.payment||null;
      resetCheckoutFlow();checkoutFlow.opening=true;checkoutFlow.payment=state.payment||'';
      const customer=state.checkout?.customer||state.customer||null;
      if(customer?.id){checkoutFlow.profile={customer_id:customer.id,name:customer.name||'',phone:customer.phone||'',addresses:Array.isArray(state.checkout?.addresses)?state.checkout.addresses:[]};checkoutFlow.phone=customer.phone||'';const preferred=checkoutFlow.profile.addresses.find(item=>item.is_default)||checkoutFlow.profile.addresses[0]||null;checkoutFlow.selectedAddressId=preferred?.id||null}
      setupCheckoutStage();
      await say('Para finalizar, vou confirmar seus dados de entrega.',{className:'checkout-intro-message'});
      if(checkoutFlow.profile?.customer_id)await renderAddressStep();else await renderIdentificationStep();
      if(checkoutFlow.stage)app.scrollTo(checkoutFlow.stage,{block:'start'});
    }catch(error){toast(error.message||'Não consegui abrir o fechamento.')}finally{checkoutFlow.opening=false}
  }

  async function renderIdentificationStep(){
    ui.checkoutStep='identification';const host=checkoutBody();if(!host)return;
    await say('Qual é seu WhatsApp com DDD? Vou procurar seu cadastro.');
    await revealTool(()=>{host.innerHTML=`<section class="checkout-turn-card"><label><span>WhatsApp com DDD</span><input id="conversationCheckoutPhone" inputmode="tel" autocomplete="tel" placeholder="(65) 99999-9999" value="${escapeHtml(checkoutFlow.phone)}"></label><button id="conversationCheckoutLookup" class="primary" type="button">Continuar</button><small data-checkout-status class="muted"></small></section>`;return host},{label:'Ana está preparando o campo…'});
    const input=host.querySelector('#conversationCheckoutPhone'),button=host.querySelector('#conversationCheckoutLookup'),status=host.querySelector('[data-checkout-status]');
    const submit=async()=>{
      if(button.dataset.busy==='1')return;const phone=text(input.value);if(phone.replace(/\D/g,'').length<10){status.textContent='Digite o WhatsApp com DDD.';input.focus();return}
      button.dataset.busy='1';button.disabled=true;button.textContent='Buscando…';checkoutFlow.phone=phone;app.userDecision(`Meu WhatsApp é ${maskPhone(phone)}`);
      try{
        const data=await workWithTyping(()=>customerApi('lookup_customer',{phone}),{label:'Ana está procurando seu cadastro…'});const profile=data.profile||{customer_id:null,name:'',phone,addresses:[]};
        checkoutFlow.profile={customer_id:profile.customer_id||null,name:profile.name||'',phone:profile.phone||phone,addresses:Array.isArray(profile.addresses)?profile.addresses:[]};
        const preferred=checkoutFlow.profile.addresses.find(item=>item.is_default)||checkoutFlow.profile.addresses[0]||null;checkoutFlow.selectedAddressId=preferred?.id||null;
        host.innerHTML='';await say(profile.customer_id?'Encontrei seu cadastro.':'Não encontrei um cadastro com esse número. Vamos preencher os dados de entrega.');await renderAddressStep();
      }catch(error){status.textContent=error.message;button.dataset.busy='0';button.disabled=false;button.textContent='Continuar'}
    };
    button.onclick=submit;input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submit()}});app.scrollTo(host,{block:'center'});
  }

  async function renderAddressStep(forceNew=false){
    ui.checkoutStep='address';const host=checkoutBody();if(!host)return;
    const profile=checkoutFlow.profile||{customer_id:null,name:'',phone:checkoutFlow.phone,addresses:[]};
    const saved=(profile.addresses||[]).find(item=>String(item.id)===String(checkoutFlow.selectedAddressId))||(profile.addresses||[]).find(item=>item.is_default)||(profile.addresses||[])[0]||null;
    const savedIssue=saved?addressIssue(saved):null;
    if(saved&&!forceNew&&!savedIssue){
      await revealTool(()=>{host.innerHTML=`<section class="checkout-address-preview"><small>Endereço salvo</small><strong>${escapeHtml(addressLine(saved))}</strong>${saved.complement?`<span>${escapeHtml(saved.complement)}</span>`:''}</section>`;return host},{label:'Ana está conferindo seu endereço…'});
      await ask({text:'Posso entregar neste endereço?',options:[
        {label:'Sim, usar este endereço',onChoose:()=>{checkoutFlow.form={name:profile.name||'',phone:profile.phone||checkoutFlow.phone,address:{...saved}};checkoutFlow.selectedAddressId=saved.id||null;renderAddressSummary();return renderPaymentStep()}},
        {label:'Usar outro endereço',onChoose:()=>renderAddressStep(true)}
      ]});return;
    }
    if(saved&&!forceNew&&savedIssue)await say('Seu endereço salvo precisa ser completado antes de finalizar. É rapidinho.');
    await renderAddressForm(forceNew?{city:'Cuiabá',state:'MT'}:(saved||{city:'Cuiabá',state:'MT'}),{preserveAddressId:Boolean(saved&&!forceNew)});
  }

  async function renderAddressForm(address={},options={}){
    ui.checkoutStep='address';const host=checkoutBody();if(!host)return;const profile=checkoutFlow.profile||{};
    await say('Confira seus dados de entrega.');
    await revealTool(()=>{host.innerHTML=`<section class="checkout-turn-card checkout-address-form"><div class="checkout-form-grid"><label class="wide"><span>Nome</span><input id="conversationCheckoutName" autocomplete="name" value="${escapeHtml(profile.name||'')}"></label><label class="wide"><span>WhatsApp</span><input id="conversationCheckoutWhatsapp" inputmode="tel" autocomplete="tel" value="${escapeHtml(profile.phone||checkoutFlow.phone||'')}"></label><label class="wide"><span>Rua</span><input id="conversationCheckoutStreet" value="${escapeHtml(address.street||'')}"></label><label><span>Número</span><input id="conversationCheckoutNumber" value="${escapeHtml(address.number||'')}"></label><label><span>Bairro</span><input id="conversationCheckoutNeighborhood" value="${escapeHtml(address.neighborhood||'')}"></label><label class="wide"><span>Complemento</span><input id="conversationCheckoutComplement" value="${escapeHtml(address.complement||'')}"></label><label class="wide"><span>Referência</span><input id="conversationCheckoutReference" value="${escapeHtml(address.reference||'')}"></label><label><span>Cidade</span><input id="conversationCheckoutCity" value="${escapeHtml(address.city||'Cuiabá')}"></label><label><span>UF</span><input id="conversationCheckoutState" maxlength="2" value="${escapeHtml(address.state||'MT')}"></label><label class="wide"><span>CEP</span><input id="conversationCheckoutPostal" inputmode="numeric" value="${escapeHtml(address.postal_code||'')}"></label></div><div class="checkout-address-actions"><button type="button" class="secondary" data-use-location>📍 Usar minha localização</button><button type="button" class="primary" data-address-continue>Continuar para pagamento</button></div><small data-address-status class="muted"></small></section>`;return host},{label:'Ana está preparando os campos…'});
    const status=host.querySelector('[data-address-status]');
    host.querySelector('[data-use-location]').onclick=()=>requestLocation(status);
    host.querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>input.removeAttribute('aria-invalid')));
    host.querySelector('[data-address-continue]').onclick=()=>{
      try{
        checkoutFlow.form=readAddressForm();
        validateAddressForm(checkoutFlow.form);
        if(!options.preserveAddressId)checkoutFlow.selectedAddressId=null;
        choose('Usar este endereço',{onChoose:()=>{renderAddressSummary();return renderPaymentStep()}});
      }catch(error){
        const issue=error?.checkoutIssue||null;
        if(issue)focusCheckoutIssue(issue,status);else{status.textContent=error.message;toast(error.message);}
      }
    };
    app.scrollTo(host,{block:'start'});
  }

  function readAddressForm(){return {name:text(document.getElementById('conversationCheckoutName')?.value),phone:text(document.getElementById('conversationCheckoutWhatsapp')?.value),address:{street:text(document.getElementById('conversationCheckoutStreet')?.value),number:text(document.getElementById('conversationCheckoutNumber')?.value),neighborhood:text(document.getElementById('conversationCheckoutNeighborhood')?.value),complement:text(document.getElementById('conversationCheckoutComplement')?.value),reference:text(document.getElementById('conversationCheckoutReference')?.value),city:text(document.getElementById('conversationCheckoutCity')?.value),state:text(document.getElementById('conversationCheckoutState')?.value).toUpperCase()||'MT',postal_code:text(document.getElementById('conversationCheckoutPostal')?.value)}}}
  function checkoutValidationError(message,id){const error=new Error(message);error.checkoutIssue={message,id};return error}
  function validateAddressForm(form){
    if(!form.name||form.name.length<2)throw checkoutValidationError('Informe seu nome.','conversationCheckoutName');
    if(form.phone.replace(/\D/g,'').length<10)throw checkoutValidationError('Informe seu WhatsApp com DDD.','conversationCheckoutWhatsapp');
    const issue=addressIssue(form.address);if(issue)throw checkoutValidationError(issue.message,issue.id);
  }
  function renderAddressSummary(){const host=checkoutBody();if(!host||!checkoutFlow.form)return;host.innerHTML='';host.appendChild(app.compactToolSummary({className:'checkout-address-compact',title:'Entrega',meta:addressLine(checkoutFlow.form.address),actions:[{label:'Alterar',onClick:()=>renderAddressStep(true)}]}))}

  async function requestLocation(status){
    if(!navigator.geolocation){status.textContent='Localização indisponível neste aparelho.';return}status.textContent='Localizando…';
    navigator.geolocation.getCurrentPosition(async position=>{
      checkoutFlow.locator={latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy_m:Math.round(position.coords.accuracy||0),captured_at:new Date().toISOString()};
      try{
        const data=await customerApi('reverse_geocode',{latitude:checkoutFlow.locator.latitude,longitude:checkoutFlow.locator.longitude});
        fillAddressInputs(data.address||{});
        const form=readAddressForm(),issue=addressIssue(form.address);
        if(issue?.id==='conversationCheckoutNumber'){status.textContent='Localizei a rua. Digite o número da casa para continuar.';focusCheckoutIssue(issue,status);}
        else if(issue){status.textContent='Localização recebida. Complete o endereço manualmente.';focusCheckoutIssue(issue,status);}
        else status.textContent='Endereço localizado. Confira antes de continuar.';
      }catch{status.textContent='Localização recebida. Complete o endereço manualmente.'}
    },()=>{status.textContent='Não consegui obter sua localização. Preencha manualmente.'},{enableHighAccuracy:true,timeout:10000,maximumAge:60000});
  }

  function fillAddressInputs(address={}){const map=[['conversationCheckoutStreet','street',''],['conversationCheckoutNumber','number',''],['conversationCheckoutNeighborhood','neighborhood',''],['conversationCheckoutComplement','complement',''],['conversationCheckoutReference','reference',''],['conversationCheckoutCity','city','Cuiabá'],['conversationCheckoutState','state','MT'],['conversationCheckoutPostal','postal_code','']];for(const [id,key,fallback] of map){const input=document.getElementById(id);if(!input)continue;const incoming=text(address[key]);if(incoming)input.value=incoming;else if(!text(input.value)&&fallback)input.value=fallback}}

  function renderPaymentStep(){ui.checkoutStep='payment';return ask({text:'Como você prefere pagar na entrega?',options:Object.entries(paymentLabels).map(([key,label])=>({label,onChoose:()=>{checkoutFlow.payment=key;state.payment=key;return renderConfirmationStep()}}))})}

  async function renderConfirmationStep(){
    ui.checkoutStep='confirmation';clearPrompt();const host=checkoutBody();if(!host||!checkoutFlow.form)return;
    const total=state.checkout?.cart?.total??state.checkout?.cart?.commercial_total??state.cart?.total??state.cart?.commercial_total??0;
    await say('Perfeito. Confira tudo antes de confirmar:');
    await revealTool(()=>{host.innerHTML=`<section class="checkout-confirm-card"><div><span>Entrega</span><strong>${escapeHtml(addressLine(checkoutFlow.form.address))}</strong></div><div><span>Pagamento</span><strong>${escapeHtml(paymentLabels[checkoutFlow.payment]||'')}</strong></div><div class="checkout-confirm-total"><span>Total</span><strong>${money(total)}</strong></div><button type="button" class="confirm" data-confirm-conversation-order>Confirmar pedido</button><small data-confirm-status class="muted"></small></section>`;host.querySelector('[data-confirm-conversation-order]').onclick=event=>confirmAndSend(event.currentTarget);return host},{label:'Ana está organizando a confirmação…'});app.scrollTo(host,{block:'center'});
  }

  function reserveWhatsAppWindow(){if(isAdminTest())return null;try{const target=window.open('about:blank','da_whatsapp_order');if(target){try{target.opener=null;target.document.title='Abrindo WhatsApp';target.document.body.textContent='Salvando seu pedido…'}catch{}}return target}catch{return null}}
  function closeReservedWindow(){if(checkoutFlow.handoffWindow&&!checkoutFlow.handoffWindow.closed){try{checkoutFlow.handoffWindow.close()}catch{}}checkoutFlow.handoffWindow=null}

  function buildWhatsAppUrl(data={},form=checkoutFlow.form){
    const order=data.order||{},checkout=state.checkout||{},items=checkout.items||[];const total=checkout.cart?.total??checkout.cart?.commercial_total??order.total??state.cart?.total??state.cart?.commercial_total??0;const orderNumber=order.order_number||order.number||order.order_id||'';const lines=[];
    lines.push(orderNumber?`*PEDIDO #${orderNumber}*`:'*NOVO PEDIDO - DONA ANTÔNIA*',`*Cliente:* ${form.name}`,`*WhatsApp:* ${form.phone}`);if(addressLine(form.address))lines.push(`*Entrega:* ${addressLine(form.address)}`);if(form.address.complement)lines.push(`*Complemento:* ${form.address.complement}`);if(form.address.reference)lines.push(`*Referência:* ${form.address.reference}`);if(form.address.postal_code)lines.push(`*CEP:* ${form.address.postal_code}`);lines.push(`*Pagamento:* ${paymentLabels[checkoutFlow.payment]||checkoutFlow.payment}`,'','*ITENS:*');for(const item of items){const quantity=Number(item.quantity||0),name=item.name||item.product?.name||'Produto';if(quantity>0)lines.push(`• ${quantity}x ${name}`)}lines.push('',`*TOTAL:* ${money(total)}`);const base=app.config.whatsappFallback||'https://wa.me/5565998150975';return `${base}${base.includes('?')?'&':'?'}text=${encodeURIComponent(lines.join('\n'))}`;
  }

  function openSavedWhatsApp(){if(isAdminTest()||!checkoutFlow.whatsappUrl)return;if(checkoutFlow.handoffWindow&&!checkoutFlow.handoffWindow.closed){try{checkoutFlow.handoffWindow.location.replace(checkoutFlow.whatsappUrl);checkoutFlow.handoffWindow=null;return}catch{}}location.replace(checkoutFlow.whatsappUrl)}

  async function confirmAndSend(button){
    if(checkoutFlow.orderSaved){openSavedWhatsApp();return}
    const status=checkoutBody()?.querySelector('[data-confirm-status]');
    if(button?.dataset.busy==='1')return;
    if(!checkoutFlow.form||!checkoutFlow.payment){
      const message='Confira o endereço e a forma de pagamento antes de confirmar.';
      if(status)status.textContent=message;toast(message);return;
    }
    checkoutFlow.handoffWindow=reserveWhatsAppWindow();
    button.dataset.busy='1';button.disabled=true;button.textContent='Salvando pedido…';
    if(status)status.textContent='Confirmando seu pedido…';
    try{
      const form=checkoutFlow.form;
      const payload={
        customer_id:checkoutFlow.profile?.customer_id||null,
        name:form.name,
        phone:form.phone,
        payment_method:checkoutFlow.payment,
        delivery_address:form.address,
        address_mode:checkoutFlow.selectedAddressId?'replace':'add',
        address_id:checkoutFlow.selectedAddressId||null,
        ...(checkoutFlow.locator?{delivery_locator:checkoutFlow.locator}:{})
      };
      const data=await workWithTyping(
        ()=>isAdminTest()?app.confirmOrder(payload):checkoutApi('finalize_order',payload),
        {label:'Ana está confirmando seu pedido…'}
      );
      const simulated=data.admin_test===true||isAdminTest();
      if(!simulated&&!data?.order?.order_id&&!data?.order?.order_number)throw new Error('Não consegui confirmar o número do pedido.');
      if(!simulated)app.markOrderCompleted(data);
      state.payment=data.payment_method||checkoutFlow.payment;
      state.customer=data.customer||state.customer;
      checkoutFlow.orderSaved=true;
      checkoutFlow.whatsappUrl=simulated?'':(data.whatsapp_url||buildWhatsAppUrl(data,form));
      renderSuccess(data);
      if(!simulated)openSavedWhatsApp();else closeReservedWindow();
    }catch(error){
      closeReservedWindow();
      const message=error?.message||'Não consegui confirmar seu pedido. Tente novamente.';
      if(status)status.textContent=message;
      toast(message);
      button.dataset.busy='0';button.disabled=false;button.textContent='Confirmar pedido';
    }
  }

  function renderSuccess(data={}){ui.checkoutStep='success';clearPrompt();if(!checkoutFlow.stage)return;const order=data.order||{},simulated=data.admin_test===true||isAdminTest();checkoutFlow.stage.innerHTML=`<div class="checkout-card success ${simulated?'admin-test-success':''}"><div class="check">${simulated?'🧪':'✓'}</div><h2>${simulated?'Teste concluído':'Pedido confirmado!'}</h2><p>${order.order_number?`Pedido <strong>#${escapeHtml(order.order_number)}</strong> salvo com sucesso.`:'Seu pedido foi salvo com sucesso.'}</p>${simulated?'<small>Modo de teste: nenhum pedido real foi criado e o WhatsApp não será aberto.</small>':'<small>Vamos abrir o WhatsApp para você enviar a confirmação à equipe.</small><button type="button" class="primary" data-open-saved-whatsapp>Abrir WhatsApp</button>'}</div>`;const whatsappButton=checkoutFlow.stage.querySelector('[data-open-saved-whatsapp]');if(whatsappButton)whatsappButton.onclick=openSavedWhatsApp;state.modules.help?.setCheckoutMode?.(false);app.scrollTo(checkoutFlow.stage,{block:'center'})}

  function interceptSemanticClicks(event){
    const button=event.target.closest?.('button');if(!button)return;
    if(button.id==='checkoutButton'||button.id==='cartButton'){clearPrompt();clearOfferStage();return}
    if(button.id==='backButton'){clearPrompt();return}
    if(ui.busy)return;
    if(button.closest('.start-chips')){
      event.preventDefault();event.stopImmediatePropagation();const label=button.textContent.trim();
      const handlers={
        'Cestas Básicas':{userLabel:'Quero ver as cestas básicas',run:()=>state.modules.baskets?.renderPicker?.()},
        'Ofertas':{userLabel:'Quero ver as ofertas',run:()=>originalProductsRenderEntry?.({section:'Ofertas'})},
        'Para Você':{userLabel:'Quero produtos para mim',run:()=>originalProductsRenderEntry?.({section:'Para Você'})},
        'Para Casa':{userLabel:'Quero produtos para casa',run:()=>originalProductsRenderEntry?.({section:'Para Casa'})}
      };
      if(handlers[label]){consumeStartChoices();choose(handlers[label].userLabel,{onChoose:handlers[label].run})}return;
    }
    if(button.closest('.order-review-actions')){
      event.preventDefault();event.stopImmediatePropagation();
      if(button.classList.contains('primary'))choose('Finalizar pedido',{onChoose:()=>openCheckoutConversation(button)});
      else choose('Quero alterar meu pedido',{onChoose:()=>originalProductsRenderEntry?.({auto:false})});return;
    }
    if(button.matches('[data-review-products]')){event.preventDefault();event.stopImmediatePropagation();choose('Quero alterar os produtos',{onChoose:()=>originalProductsRenderEntry?.({auto:false})})}
  }

  app.registerModule('conversation',{ask,choose,say,revealTool,quickReplies,clearPrompt,typing,workWithTyping,isBusy:()=>ui.busy,showOffers,renderPostBasketPrompt,afterBasketSelected,openCheckoutConversation});

  if(upsellModule){state.modules.upsell.renderAfterBasket=()=>false;state.modules.upsell.renderBeforeCheckout=()=>false;state.modules.upsell.showOffers=showOffers}
  if(productsModule&&originalProductsRenderEntry){state.modules.products.renderEntry=options=>{if(options?.auto===true&&state.selectedBasket)return renderPostBasketPrompt();return originalProductsRenderEntry(options||{})}}
  if(checkoutModule)state.modules.checkout.open=openCheckoutConversation;
  document.addEventListener('click',interceptSemanticClicks,true);
})();
