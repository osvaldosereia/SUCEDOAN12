(()=>{
  'use strict';
  const C=window.DA_SHOPPING_ROOM_CONFIG||{};
  if(!C.customerApi||!C.api)return;
  const nativeFetch=window.fetch.bind(window);
  const token=()=>new URLSearchParams(location.search).get('s')||new URLSearchParams(location.search).get('c')||new URLSearchParams(location.search).get('token')||'';
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  let basketPolicies=[];
  let lastCheckout=null;
  let verificationTimer=null;
  let lastWhatsappUrl='';
  let whatsappReturnScheduled=false;

  async function helper(action,payload={}){
    const r=await nativeFetch(C.customerApi,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token:token(),...payload}),cache:'no-store'});
    const d=await r.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!r.ok||d.ok===false)throw new Error(String(d.detail||d.error||`Erro ${r.status}`));
    return d;
  }

  function mergePolicies(items){
    if(!Array.isArray(items)||!basketPolicies.length)return items;
    const map=new Map(basketPolicies.map(p=>[String(p.product_id),p]));
    return items.map(item=>({...item,...(map.get(String(item.product_id))||{})}));
  }

  function buildWhatsappReturn(order){
    const base=String(C.whatsappFallback||'https://wa.me/556584491018');
    const ref=String(order?.order_number||order?.number||order?.order_id||'').trim();
    const total=Number(order?.total||0);
    const message=`Olá! Meu pedido foi confirmado na Sala de Compra da Dona Antônia${ref?` · Pedido ${ref}`:''}${total>0?` · Total ${money(total)}`:''}. Quero continuar o atendimento por aqui.`;
    return `${base}${base.includes('?')?'&':'?'}text=${encodeURIComponent(message)}`;
  }

  window.fetch=async(input,init={})=>{
    const url=typeof input==='string'?input:input?.url;
    const response=await nativeFetch(input,init);
    if(url!==C.api||!init?.body||typeof init.body!=='string')return response;
    let requestBody;try{requestBody=JSON.parse(init.body)}catch{return response}
    const action=String(requestBody?.action||'').toLowerCase();
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
    if(action==='checkout_preview')lastCheckout=data.checkout||null;
    if(action==='confirm_order'){
      lastWhatsappUrl=buildWhatsappReturn(data.order||{});
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
    customerCard.innerHTML='<h3>Identificar cadastro</h3><p class="muted checkout-phone-hint">Digite primeiro seu WhatsApp. Se já tiver cadastro, eu confirmo o número antes de mostrar seus dados.</p><label class="field"><span>WhatsApp com DDD</span><input id="checkoutPhoneLookup" inputmode="tel" autocomplete="tel" placeholder="(65) 99999-9999"></label><button id="checkoutPhoneLookupButton" type="button" class="primary checkout-phone-button">Continuar</button><small id="checkoutPhoneLookupStatus" class="muted"></small>';
    const input=customerCard.querySelector('#checkoutPhoneLookup');const button=customerCard.querySelector('#checkoutPhoneLookupButton');const status=customerCard.querySelector('#checkoutPhoneLookupStatus');
    button.onclick=async()=>{
      const phone=String(input.value||'').trim();const digits=phone.replace(/\D/g,'');
      if(digits.length<10){status.textContent='Digite o WhatsApp com DDD.';input.focus();return}
      button.disabled=true;button.textContent='Buscando…';status.textContent='';
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
    setTimeout(()=>input?.focus(),0);
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
    decorateBasketRows();
    decorateOrderSuccess();
    const stage=document.querySelector('.stage.checkout-stage');
    if(stage){setupPhoneFirst(stage);setupAddressConfirmation(stage)}
  }
  const observer=new MutationObserver(refresh);observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  document.addEventListener('click',()=>setTimeout(refresh,0),true);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&document.querySelector('#checkoutVerifyStatus')){const status=document.querySelector('#checkoutVerifyStatus');pollVerification(status,0)}});
  refresh();
})();
