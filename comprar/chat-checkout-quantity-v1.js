(()=>{
  'use strict';
  const C=window.DA_SHOPPING_ROOM_CONFIG||{};
  if(!C.customerApi||!C.api)return;
  const nativeFetch=window.fetch.bind(window);
  const token=()=>new URLSearchParams(location.search).get('s')||new URLSearchParams(location.search).get('c')||new URLSearchParams(location.search).get('token')||'';
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const norm=v=>String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  let basketPolicies=[];
  let lastCheckout=null;
  let verificationTimer=null;
  let lastWhatsappUrl='';
  let whatsappReturnScheduled=false;
  let deliveryLocator=null;

  async function helper(action,payload={}){
    const r=await nativeFetch(C.customerApi,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token:token(),...payload}),cache:'no-store'});
    const d=await r.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!r.ok||d.ok===false)throw new Error(String(d.detail||d.error||`Erro ${r.status}`));
    return d;
  }

  async function roomRead(action,payload={}){
    const r=await nativeFetch(C.api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token:token(),...payload}),cache:'no-store'});
    const d=await r.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!r.ok||d.ok===false)throw new Error(String(d.detail||d.error||`Erro ${r.status}`));
    return d;
  }

  async function basketDetailApi(action,basketId){
    if(!C.basketStorefrontApi)throw new Error('Detalhes da cesta indisponíveis.');
    const r=await nativeFetch(C.basketStorefrontApi,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token:token(),basket_id:basketId}),cache:'no-store'});
    const d=await r.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!r.ok||d.ok===false)throw new Error(String(d.detail||d.error||`Erro ${r.status}`));
    return d;
  }

  async function previewBasket(card,button,originalChoose){
    if(button.dataset.previewBusy==='1')return;
    button.dataset.previewBusy='1';button.disabled=true;button.textContent='Abrindo…';
    try{
      const name=String(card.querySelector('h3')?.textContent||'').trim();
      const listed=await roomRead('baskets');
      const basket=(listed.baskets||[]).find(item=>norm(item?.name)===norm(name));
      if(!basket?.id)throw new Error('Não consegui abrir esta cesta agora.');
      const detail=await basketDetailApi('detail',basket.id),data=detail.basket||{};
      document.querySelector('.stage.basket-preview-stage')?.remove();
      const timeline=document.getElementById('timeline');if(!timeline)return;
      const section=document.createElement('section');section.className='stage basket-preview-stage';
      section.innerHTML=`<div class="stage-head"><span class="stage-no">1</span><div><strong>Confira esta cesta</strong><small>Veja todos os produtos antes de escolher.</small></div></div><div class="stage-inner"><div class="basket-hero"><img src="${esc(data.image_url||'')}" alt="${esc(data.name||name)}"><div><h2>${esc(data.name||name)}</h2><div class="value">${money(data.price||data.base_price||basket.base_price)}</div></div></div><div class="basket-list" data-basket-preview-list></div><div class="actions" data-basket-preview-actions></div></div>`;
      const list=section.querySelector('[data-basket-preview-list]');
      (data.items||[]).forEach(item=>{const row=document.createElement('div');row.className='basket-row';row.innerHTML=`<img src="${esc(item.image_url||'')}" alt=""><div><h3>${esc(item.name||'Produto')}</h3><small>${Number(item.quantity||0)===1?'1 unidade':`${Number(item.quantity||0)} unidades`}</small></div><span class="qty-fixed">${Number(item.quantity||0)}×</span>`;list.appendChild(row)});
      const actions=section.querySelector('[data-basket-preview-actions]');
      const back=document.createElement('button');back.type='button';back.className='secondary';back.textContent='Voltar às cestas';back.onclick=()=>{section.remove();card.scrollIntoView({behavior:'smooth',block:'center'})};
      const choose=document.createElement('button');choose.type='button';choose.className='primary';choose.textContent='Escolher esta cesta';choose.onclick=()=>{section.remove();originalChoose?.call(button)};
      actions.append(back,choose);timeline.appendChild(section);section.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){window.dispatchEvent(new CustomEvent('da-basket-preview-error',{detail:String(e?.message||e)}))}
    finally{button.dataset.previewBusy='0';button.disabled=false;button.textContent='Ver produtos'}
  }

  function decorateBasketPicker(){
    document.querySelectorAll('.basket-picker .basket-mini').forEach(card=>{
      const button=card.querySelector('button');if(!button||button.dataset.basketPreviewReady==='1')return;
      const originalChoose=button.onclick;if(typeof originalChoose!=='function')return;
      button.dataset.basketPreviewReady='1';button.textContent='Ver produtos';
      button.onclick=()=>previewBasket(card,button,originalChoose);
    });
  }

  function mergePolicies(items){
    if(!Array.isArray(items)||!basketPolicies.length)return items;
    const map=new Map(basketPolicies.map(p=>[String(p.product_id),p]));
    return items.map(item=>({...item,...(map.get(String(item.product_id))||{})}));
  }

  function itemSection(title,items){
    const rows=items.length?items.map(item=>Number(item.quantity||0)>0?`${Number(item.quantity||0)}x ${item.name}`:`Retirado: ${item.name}`).join('\n'):'Nenhum item.';
    const total=items.reduce((sum,item)=>sum+Math.max(0,Number(item.quantity||0)),0);
    return `*${title}*\n${rows}\nTotal de itens: ${total}`;
  }

  function paymentLabel(code){return ({pix:'PIX',cash:'Dinheiro',debit_card:'Cartão de débito',credit_card:'Cartão de crédito',food_card:'Vale-alimentação',meal_card:'Vale-refeição'})[String(code||'')]||String(code||'A confirmar')}
  function formatPhone(value){const d=String(value||'').replace(/\D/g,'').replace(/^55/,'');if(d.length===11)return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;if(d.length===10)return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;return String(value||'')}
  function buildWhatsappReturn(order,context={}){
    const base=String(C.whatsappFallback||'https://wa.me/5565998150975');
    const ref=String(order?.order_number||order?.number||order?.order_id||'').trim();
    const checkout=lastCheckout||{},items=Array.isArray(checkout.items)?checkout.items:[],policies=Array.isArray(basketPolicies)?basketPolicies:[];
    const basketItems=items.filter(item=>item.source==='basket'||item.source==='substitution'),current=new Map(basketItems.map(item=>[String(item.product_id),item])),policyMap=new Map(policies.map(item=>[String(item.product_id),item]));
    const standard=[],changed=[];
    policies.forEach(policy=>{
      const item=current.get(String(policy.product_id)),quantity=Number(item?.quantity??policy.quantity??0),baseQuantity=Number(policy.base_quantity??policy.quantity??0),entry={name:String(item?.name||policy.name||'Produto'),quantity};
      if(quantity===baseQuantity&&quantity>0)standard.push(entry);else changed.push(entry);
    });
    const extras=items.filter(item=>item.source==='addon'||!policyMap.has(String(item.product_id))).map(item=>({name:String(item.name||'Produto'),quantity:Number(item.quantity||0)}));
    const basketName=String(checkout.basket?.name||'').trim();
    const basketLine=basketName?`*CESTA:* ${basketName.toUpperCase()}${changed.length?' - ALTERADA':''}\n`:'';
    const cart=checkout.cart||{},discount=Number(order?.discount??cart.discount??0),total=Number(order?.total??cart.total??0),normal=Math.max(total,Number(total+discount));
    const request=context.requestBody||{},address=request.delivery_address||order?.delivery_address||{},known=checkout.customer||{};
    const name=String(document.getElementById('checkoutName')?.value||known.name||'Cliente').trim();
    const phone=String(document.getElementById('checkoutPhone')?.value||known.phone||'').trim();
    const payment=paymentLabel(request.payment_method||context.paymentMethod);
    const valueLines=[`Valor normal sem descontos: ${money(normal)}`,discount>0?`✅ *ECONOMIA TOTAL:* − ${money(discount)}`:'',`💰 *TOTAL FINAL:* ${money(total)}`].filter(Boolean).join('\n');
    const dataLines=[`Nome: ${name}`,phone?`Telefone/WhatsApp: ${formatPhone(phone)}`:'',address.city?`Cidade: ${address.city}${address.state?`/${address.state}`:''}`:'',address.neighborhood?`Bairro: ${address.neighborhood}`:'',address.street?`Rua: ${address.street}`:'',address.number?`Nº: ${address.number}`:'',address.reference?`Referência: ${address.reference}`:'',`💳 *Pagamento:* ${payment}`].filter(Boolean).join('\n');
    const message=`*PEDIDO #${ref||'CONFIRMADO'}*\n${basketLine}------------------------------\n*ITENS SELECIONADOS*\n${itemSection('PRODUTOS DA CESTA SEM ALTERACAO',standard)}\n------------------------------\n${itemSection('PRODUTOS DA CESTA COM QUANTIDADE ALTERADA',changed)}\n------------------------------\n${itemSection('PRODUTOS ADICIONADOS FORA DA CESTA',extras)}\n\n*RESUMO DE VALORES*\n${valueLines}\n------------------------------\n*👤 DADOS PARA ATENDIMENTO*\n${dataLines}\n------------------------------\nOlá! Gostaria de confirmar este pedido e o endereço de entrega.`;
    return `${base}${base.includes('?')?'&':'?'}text=${encodeURIComponent(message)}`;
  }

  window.fetch=async(input,init={})=>{
    const url=typeof input==='string'?input:input?.url;
    let requestBody=null,action='';
    if(url===C.api&&init?.body&&typeof init.body==='string'){
      try{requestBody=JSON.parse(init.body);action=String(requestBody?.action||'').toLowerCase()}catch{}
    }
    let outgoingInit=init;
    if(action==='confirm_order'&&deliveryLocator&&requestBody){
      outgoingInit={...init,body:JSON.stringify({...requestBody,delivery_locator:deliveryLocator})};
      requestBody={...requestBody,delivery_locator:deliveryLocator};
    }
    const response=await nativeFetch(input,outgoingInit);
    if(url!==C.api||!requestBody)return response;
    if(!['open','start_basket','checkout_preview','confirm_order'].includes(action))return response;
    let data;try{data=await response.clone().json()}catch{return response}
    if(!response.ok||data?.ok===false)return response;
    if(action==='open'||action==='start_basket'){
      try{
        const p=await helper('basket_policies');
        basketPolicies=Array.isArray(p.policies)?p.policies:[];
        if(Array.isArray(data.items))data.items=mergePolicies(data.items);
        if(data.cart&&Array.isArray(data.cart.items))data.cart.items=mergePolicies(data.cart.items);
      }catch{}
    }
    if(action==='checkout_preview'){
      lastCheckout=data.checkout||null;
      try{const p=await helper('basket_policies');basketPolicies=Array.isArray(p.policies)?p.policies:basketPolicies}catch{}
    }
    if(action==='confirm_order'){
      lastWhatsappUrl=buildWhatsappReturn(data.order||{},{requestBody,paymentMethod:data.payment_method});
      data.whatsapp_url=lastWhatsappUrl;
    }
    const headers=new Headers(response.headers);headers.delete('content-length');headers.set('content-type','application/json');
    return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
  };

  function policyForRow(row,index){
    const title=(row.querySelector('h3')?.textContent||'').trim();
    const byIndex=basketPolicies[index];
    if(byIndex&&title)return byIndex;
    return byIndex||null;
  }

  function decorateBasketRows(){
    const rows=[...document.querySelectorAll('.basket-list .basket-row')];
    rows.forEach((row,index)=>{
      if(row.closest('.basket-preview-stage'))return;
      const policy=policyForRow(row,index);if(!policy)return;
      const current=Number(row.querySelector('.qty span')?.textContent||row.querySelector('[data-q-label]')?.textContent?.match(/\d+/)?.[0]||policy.quantity||0);
      const ctrl=row.querySelector('.qty');if(!ctrl)return;
      if(policy.quantity_editable===false){
        const fixed=document.createElement('span');fixed.className='qty-fixed';fixed.textContent='Quantidade fixa';fixed.title='Este item faz parte da composição padrão desta cesta.';ctrl.replaceWith(fixed);return;
      }
      const buttons=ctrl.querySelectorAll('button');
      if(buttons[0])buttons[0].disabled=(policy.removable===false&&current<=Number(policy.quantity||0))||(policy.min_quantity!=null&&current<=Number(policy.min_quantity));
      if(buttons[1])buttons[1].disabled=policy.max_quantity!=null&&current>=Number(policy.max_quantity);
    });
  }

  function simplifyOrderSummary(stage){
    const order=[...stage.querySelectorAll('.checkout-card')].find(card=>card.querySelector('.total-line'));
    if(!order)return;
    order.classList.add('checkout-order');
    order.querySelectorAll('.order-line').forEach(line=>{
      line.querySelectorAll('span')[1]?.remove();
    });
  }

  function deferCheckoutCards(stage,customerCard){
    [...stage.querySelectorAll('.checkout-card')].forEach(card=>{if(card!==customerCard&&!card.querySelector('.total-line'))card.classList.add('checkout-deferred','hidden')});
    const confirm=stage.querySelector('.confirm');if(confirm)confirm.classList.add('checkout-deferred','hidden');
  }
  function revealCheckoutCards(stage){stage.querySelectorAll('.checkout-deferred').forEach(el=>el.classList.remove('hidden','checkout-deferred'))}
  function refreshVerifiedCheckout(checkout,status){
    clearTimeout(verificationTimer);
    lastCheckout=checkout||lastCheckout;
    if(status)status.textContent='Cadastro confirmado. Carregando seus dados…';
    setTimeout(()=>document.getElementById('checkoutButton')?.click(),250);
  }
  function pollVerification(status,tries=0){
    clearTimeout(verificationTimer);
    if(tries>=60){status.textContent='Se você já enviou a mensagem, volte para esta tela e toque em “Verificar novamente”.';return}
    verificationTimer=setTimeout(async()=>{
      try{
        const d=await helper('verification_status');
        if(d.verified){refreshVerifiedCheckout(d.checkout,status);return}
      }catch{}
      pollVerification(status,tries+1);
    },2000);
  }
  function showVerification(customerCard,data,stage){
    deferCheckoutCards(stage,customerCard);
    customerCard.innerHTML='<h3>Confirmar cadastro</h3><p class="muted checkout-phone-hint">Encontrei um cadastro com esse número. Por segurança, nenhum endereço será mostrado até você confirmar pelo próprio WhatsApp.</p><div class="checkout-verify-actions"><a id="checkoutVerifyWhatsApp" class="primary checkout-verify-whatsapp" target="_blank" rel="noopener">Confirmar pelo WhatsApp</a><button id="checkoutVerifyAgain" type="button" class="secondary">Verificar novamente</button></div><small id="checkoutVerifyStatus" class="muted">Abra o WhatsApp e envie a mensagem pronta. Depois volte para esta tela.</small>';
    const link=customerCard.querySelector('#checkoutVerifyWhatsApp');
    const again=customerCard.querySelector('#checkoutVerifyAgain');
    const status=customerCard.querySelector('#checkoutVerifyStatus');
    link.href=String(data.whatsapp_url||C.whatsappFallback||'#');
    link.onclick=()=>{status.textContent='Aguardando a confirmação enviada pelo WhatsApp…';pollVerification(status,0)};
    again.onclick=async()=>{
      again.disabled=true;status.textContent='Verificando…';
      try{const d=await helper('verification_status');if(d.verified){refreshVerifiedCheckout(d.checkout,status);return}status.textContent='Ainda não chegou a confirmação. Envie a mensagem pronta pelo WhatsApp.'}catch(e){status.textContent=String(e?.message||'Não foi possível verificar agora.')}finally{again.disabled=false}
    };
  }

  function setupPhoneFirst(stage){
    if(stage.dataset.phoneFirstReady==='1')return;
    const cards=[...stage.querySelectorAll('.checkout-card')];
    const customerCard=cards.find(card=>card.querySelector('h3')?.textContent?.trim()==='Cadastro');
    if(!customerCard||lastCheckout?.customer)return;
    stage.dataset.phoneFirstReady='1';
    const original=customerCard.innerHTML;
    deferCheckoutCards(stage,customerCard);
    customerCard.innerHTML='<h3>Identificar cadastro</h3><p class="muted checkout-phone-hint">Digite seu WhatsApp. Se você já compra com a gente, encontro seu cadastro automaticamente.</p><label class="field"><span>WhatsApp com DDD</span><input id="checkoutPhoneLookup" inputmode="tel" autocomplete="tel" placeholder="(65) 99999-9999"></label><button id="checkoutPhoneLookupButton" type="button" class="primary checkout-phone-button">Continuar</button><small id="checkoutPhoneLookupStatus" class="muted"></small>';
    const input=customerCard.querySelector('#checkoutPhoneLookup');const button=customerCard.querySelector('#checkoutPhoneLookupButton');const status=customerCard.querySelector('#checkoutPhoneLookupStatus');
    button.onclick=async()=>{
      const phone=String(input.value||'').trim();const digits=phone.replace(/\D/g,'');
      if(digits.length<10){status.textContent='Digite o WhatsApp com DDD.';input.focus();return}
      button.disabled=true;button.textContent='Buscando…';status.textContent='Procurando seu cadastro…';
      try{
        const d=await helper('lookup_customer',{phone});
        if(d.verified){refreshVerifiedCheckout(d.checkout,status);return}
        if(d.found&&d.verification_required){showVerification(customerCard,d,stage);return}
        customerCard.innerHTML=original;
        const phoneInput=customerCard.querySelector('#checkoutPhone');if(phoneInput)phoneInput.value=phone;
        revealCheckoutCards(stage);
        customerCard.querySelector('#checkoutName')?.focus();
      }catch(e){status.textContent=String(e?.message||'Não foi possível consultar o cadastro.');button.disabled=false;button.textContent='Continuar'}
    };
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();button.click()}});
  }

  function setupAddressConfirmation(stage){
    if(stage.dataset.addressConfirmReady==='1')return;
    const cards=[...stage.querySelectorAll('.checkout-card')];
    const deliveryCard=cards.find(card=>card.querySelector('h3')?.textContent?.trim()==='Entrega');
    if(!deliveryCard)return;
    stage.dataset.addressConfirmReady='1';

    const heading=deliveryCard.querySelector('h3');
    const prompt=document.createElement('p');
    prompt.className='muted address-confirm-required';
    prompt.textContent='Confirme o endereço desta entrega antes de concluir o pedido.';
    heading?.insertAdjacentElement('afterend',prompt);

    const radios=[...deliveryCard.querySelectorAll('input[name="address"]')];
    if(radios.length){
      radios.forEach(r=>{r.checked=false});
      deliveryCard.querySelector('#newAddress')?.classList.add('hidden');
    }

    const save=deliveryCard.querySelector('#saveAddress');
    if(save){
      save.checked=true;
      const saveLabel=save.closest('label');
      if(saveLabel)saveLabel.classList.add('always-save-address');
      const note=document.createElement('small');
      note.className='muted address-save-note';
      note.textContent='Novo endereço será salvo para as próximas compras.';
      saveLabel?.insertAdjacentElement('afterend',note);
    }

    const confirm=stage.querySelector('.confirm');
    if(confirm){
      confirm.addEventListener('click',event=>{
        const choices=[...deliveryCard.querySelectorAll('input[name="address"]')];
        const selected=choices.find(r=>r.checked);
        if(choices.length&&!selected){
          event.preventDefault();
          event.stopImmediatePropagation();
          prompt.classList.add('attention');
          prompt.setAttribute('role','alert');
          prompt.textContent='Escolha e confirme o endereço desta entrega.';
          deliveryCard.scrollIntoView({behavior:'smooth',block:'center'});
          return;
        }
        if(selected?.value==='new'&&save)save.checked=true;
        prompt.classList.remove('attention');
      },true);
    }
  }

  function fillAddressField(deliveryCard,id,value){
    if(value==null||String(value).trim()==='')return;
    const input=deliveryCard.querySelector(`#${id}`);if(!input)return;
    input.value=String(value).trim();
    input.dispatchEvent(new Event('input',{bubbles:true}));
  }

  function applyLocatedAddress(address,stage){
    const deliveryCard=[...stage.querySelectorAll('.checkout-card')].find(card=>card.querySelector('h3')?.textContent?.trim()==='Entrega');
    if(!deliveryCard)return;
    const newChoice=deliveryCard.querySelector('input[name="address"][value="new"]');
    if(newChoice){newChoice.checked=true;newChoice.dispatchEvent(new Event('change',{bubbles:true}))}
    deliveryCard.querySelector('#newAddress')?.classList.remove('hidden');
    fillAddressField(deliveryCard,'street',address?.street);
    fillAddressField(deliveryCard,'number',address?.number);
    fillAddressField(deliveryCard,'neighborhood',address?.neighborhood);
    fillAddressField(deliveryCard,'city',address?.city);
    fillAddressField(deliveryCard,'stateUf',address?.state);
    fillAddressField(deliveryCard,'postal',address?.postal_code);
    const save=deliveryCard.querySelector('#saveAddress');if(save)save.checked=true;
    const prompt=deliveryCard.querySelector('.address-confirm-required');
    if(prompt){prompt.classList.remove('attention');prompt.textContent='Confira o endereço preenchido pela localização antes de concluir.'}
    const status=deliveryCard.querySelector('#locationStatus');
    if(status){status.classList.add('location-success');status.textContent=address?.number?'Endereço preenchido ✓ Confira os dados.':'Endereço encontrado ✓ Informe ou confira o número.'}
    if(!address?.number)deliveryCard.querySelector('#number')?.focus();
  }

  function setupLocationFill(stage){
    if(stage.dataset.locationFillReady==='1')return;
    const deliveryCard=[...stage.querySelectorAll('.checkout-card')].find(card=>card.querySelector('h3')?.textContent?.trim()==='Entrega');
    const button=deliveryCard?.querySelector('#useLocation');const status=deliveryCard?.querySelector('#locationStatus');
    if(!deliveryCard||!button||!status)return;
    stage.dataset.locationFillReady='1';
    button.onclick=null;
    button.addEventListener('click',()=>{
      if(button.dataset.busy==='1')return;
      if(!navigator.geolocation){status.textContent='Localização não disponível neste aparelho.';return}
      button.dataset.busy='1';button.disabled=true;status.classList.remove('location-success');status.textContent='Localizando e preenchendo o endereço…';
      navigator.geolocation.getCurrentPosition(async pos=>{
        deliveryLocator={latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy_m:Math.round(pos.coords.accuracy||0),captured_at:new Date().toISOString()};
        try{
          const d=await helper('reverse_geocode',{latitude:deliveryLocator.latitude,longitude:deliveryLocator.longitude});
          applyLocatedAddress(d.address||{},stage);
        }catch{
          status.textContent='Localização recebida ✓ Não consegui preencher a rua automaticamente; complete o endereço abaixo.';
          const newChoice=deliveryCard.querySelector('input[name="address"][value="new"]');
          if(newChoice){newChoice.checked=true;newChoice.dispatchEvent(new Event('change',{bubbles:true}))}
          deliveryCard.querySelector('#newAddress')?.classList.remove('hidden');
        }finally{button.dataset.busy='0';button.disabled=false}
      },()=>{status.textContent='Não foi possível obter sua localização. Preencha o endereço abaixo.';button.dataset.busy='0';button.disabled=false},{enableHighAccuracy:true,timeout:10000,maximumAge:60000});
    });
  }

  function decorateOrderSuccess(){
    const success=document.querySelector('.checkout-card.success');
    if(!success||!lastWhatsappUrl)return;
    if(!success.querySelector('.checkout-whatsapp-return')){
      const link=document.createElement('a');
      link.className='primary checkout-whatsapp-return';
      link.href=lastWhatsappUrl;
      link.textContent='Continuar no WhatsApp';
      success.appendChild(link);
    }
    if(!whatsappReturnScheduled){
      whatsappReturnScheduled=true;
      setTimeout(()=>{if(lastWhatsappUrl)location.href=lastWhatsappUrl},1200);
    }
  }

  function refresh(){
    decorateBasketPicker();
    decorateBasketRows();
    decorateOrderSuccess();
    const stage=document.querySelector('.stage.checkout-stage');
    if(stage){simplifyOrderSummary(stage);setupPhoneFirst(stage);setupAddressConfirmation(stage);setupLocationFill(stage)}
  }
  const observer=new MutationObserver(refresh);observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  document.addEventListener('click',()=>setTimeout(refresh,0),true);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&document.querySelector('#checkoutVerifyStatus')){const status=document.querySelector('#checkoutVerifyStatus');pollVerification(status,0)}});
  window.addEventListener('da-basket-preview-error',event=>{const message=String(event?.detail||'Não consegui abrir esta cesta agora.');const toast=document.getElementById('toast');if(!toast)return;toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2600)});
  refresh();
})();