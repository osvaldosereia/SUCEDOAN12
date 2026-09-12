(()=>{
  'use strict';
  const C=window.DA_SHOPPING_ROOM_CONFIG||{};
  if(!C.customerApi||!C.api)return;
  const nativeFetch=window.fetch.bind(window);
  const token=()=>new URLSearchParams(location.search).get('s')||new URLSearchParams(location.search).get('c')||new URLSearchParams(location.search).get('token')||'';
  let basketPolicies=[];
  let lastCheckout=null;

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

  window.fetch=async(input,init={})=>{
    const url=typeof input==='string'?input:input?.url;
    const response=await nativeFetch(input,init);
    if(url!==C.api||!init?.body||typeof init.body!=='string')return response;
    let requestBody;try{requestBody=JSON.parse(init.body)}catch{return response}
    const action=String(requestBody?.action||'').toLowerCase();
    if(!['open','start_basket','checkout_preview'].includes(action))return response;
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

  function setupPhoneFirst(stage){
    if(stage.dataset.phoneFirstReady==='1')return;
    const cards=[...stage.querySelectorAll('.checkout-card')];
    const customerCard=cards.find(card=>card.querySelector('h3')?.textContent?.trim()==='Cadastro');
    if(!customerCard||lastCheckout?.customer)return;
    stage.dataset.phoneFirstReady='1';
    const original=customerCard.innerHTML;
    deferCheckoutCards(stage,customerCard);
    customerCard.innerHTML='<h3>Identificar cadastro</h3><p class="muted checkout-phone-hint">Digite primeiro seu WhatsApp. Se já tiver cadastro, eu preencho seus dados automaticamente.</p><label class="field"><span>WhatsApp com DDD</span><input id="checkoutPhoneLookup" inputmode="tel" autocomplete="tel" placeholder="(65) 99999-9999"></label><button id="checkoutPhoneLookupButton" type="button" class="primary checkout-phone-button">Continuar</button><small id="checkoutPhoneLookupStatus" class="muted"></small>';
    const input=customerCard.querySelector('#checkoutPhoneLookup');const button=customerCard.querySelector('#checkoutPhoneLookupButton');const status=customerCard.querySelector('#checkoutPhoneLookupStatus');
    button.onclick=async()=>{
      const phone=String(input.value||'').trim();const digits=phone.replace(/\D/g,'');
      if(digits.length<10){status.textContent='Digite o WhatsApp com DDD.';input.focus();return}
      button.disabled=true;button.textContent='Buscando…';status.textContent='';
      try{
        const d=await helper('lookup_customer',{phone});
        if(d.found){status.textContent='Cadastro encontrado. Carregando seus dados…';lastCheckout=d.checkout||lastCheckout;document.getElementById('checkoutButton')?.click();return}
        customerCard.innerHTML=original;
        const phoneInput=customerCard.querySelector('#checkoutPhone');if(phoneInput)phoneInput.value=phone;
        revealCheckoutCards(stage);
        customerCard.querySelector('#checkoutName')?.focus();
      }catch(e){status.textContent=String(e?.message||'Não foi possível consultar o cadastro.');button.disabled=false;button.textContent='Continuar'}
    };
    setTimeout(()=>input?.focus(),0);
  }

  function refresh(){decorateBasketRows();const stage=document.querySelector('.stage.checkout-stage');if(stage)setupPhoneFirst(stage)}
  const observer=new MutationObserver(refresh);observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  document.addEventListener('click',()=>setTimeout(refresh,0),true);
  refresh();
})();
