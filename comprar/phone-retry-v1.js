(()=>{
  'use strict';

  function customerCard(stage){
    return [...stage.querySelectorAll('.checkout-card')].find(card=>card.querySelector('h3')?.textContent?.trim()==='Cadastro')||null;
  }

  function addRetryOption(){
    const stage=document.querySelector('.stage.checkout-stage');
    if(!stage||stage.dataset.phoneFirstReady!=='1')return;
    const card=customerCard(stage);if(!card)return;
    const phone=card.querySelector('#checkoutPhone');
    if(!phone||card.querySelector('#checkoutPhoneRetry')||card.querySelector('#checkoutPhoneLookup'))return;
    const field=phone.closest('.field');if(!field)return;
    const box=document.createElement('div');
    box.className='checkout-phone-retry-box';
    box.innerHTML='<small class="muted">Não encontramos um cadastro com esse número. Se você digitou errado, corrija o WhatsApp acima e busque novamente. Se o número estiver certo, continue o cadastro normalmente.</small><button id="checkoutPhoneRetry" type="button" class="secondary">Buscar novamente</button>';
    field.insertAdjacentElement('afterend',box);
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('#checkoutPhoneRetry');if(!button)return;
    const stage=button.closest('.checkout-stage');const card=stage&&customerCard(stage);const phone=card?.querySelector('#checkoutPhone');
    if(!stage||!phone)return;
    const current=String(phone.value||'').trim();
    delete stage.dataset.phoneFirstReady;
    const marker=document.createElement('i');marker.hidden=true;stage.appendChild(marker);marker.remove();
    setTimeout(()=>{
      const input=document.getElementById('checkoutPhoneLookup');
      const search=document.getElementById('checkoutPhoneLookupButton');
      const status=document.getElementById('checkoutPhoneLookupStatus');
      if(input){input.value=current;input.focus();input.select?.()}
      if(search)search.textContent='Buscar novamente';
      if(status)status.textContent='Confira o número e faça uma nova busca.';
    },0);
  });

  const observer=new MutationObserver(addRetryOption);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  addRetryOption();
})();
