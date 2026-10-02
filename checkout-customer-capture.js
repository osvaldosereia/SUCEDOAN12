(() => {
  'use strict';

  function byId(id){return document.getElementById(id)}
  function digits(value,max=20){return String(value??'').replace(/\D+/g,'').slice(0,max)}
  function value(id){const el=byId(id);return el?String(el.value??'').trim():''}

  function livePhone(){
    const ddd=digits(value('checkoutDdd'),2);
    let mobile=digits(value('checkoutPhone'),9);
    if(mobile.length===8)mobile='9'+mobile;
    const valid=ddd.length===2&&mobile.length===9&&mobile.startsWith('9');
    return {ddd,mobile,valid,full:valid?'+55'+ddd+mobile:''};
  }

  function registrationDraft(){
    return {
      name:value('checkoutName'),
      document:value('checkoutDocument'),
      street:value('checkoutStreet'),
      number:value('checkoutNumber'),
      neighborhood:value('checkoutNeighborhood'),
      city:value('checkoutCity'),
      postal_code:value('checkoutPostal'),
      complement:value('checkoutComplement'),
      reference:value('checkoutReference'),
      marketing_opt_in:byId('checkoutMarketing')?.checked===true
    };
  }

  function complete(d){
    const documentDigits=digits(d?.document,14);
    return Boolean(d?.name&&[11,14].includes(documentDigits.length)&&d?.street&&d?.number&&d?.neighborhood&&d?.city);
  }

  async function saveRegistration(apiBase,phone,draft){
    if(!phone.valid||!complete(draft))return;
    try{
      const url=new URL(apiBase);
      url.searchParams.set('action','customer_register');
      await window.__DA_ORIGINAL_FETCH__(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:'checkout',phone:phone.full,...draft}),cache:'no-store'});
    }catch{}
  }

  window.__DA_ORIGINAL_FETCH__=window.fetch.bind(window);
  window.fetch=async(input,init={})=>{
    const requestUrl=String(input?.url||input||'');
    const method=String(init?.method||'GET').toUpperCase();
    if(requestUrl.includes('/functions/v1/storefront-v2')&&requestUrl.includes('action=submit_order')&&method==='POST'){
      try{
        const body=typeof init.body==='string'?JSON.parse(init.body):null;
        if(body&&typeof body==='object'){
          const phone=livePhone();
          const draft=registrationDraft();
          if(phone.valid)body.whatsapp_phone=phone.full;
          body.customer_draft=draft;
          await saveRegistration(requestUrl,phone,draft);
          init={...init,body:JSON.stringify(body)};
        }
      }catch{}
    }
    return window.__DA_ORIGINAL_FETCH__(input,init);
  };

  window.__DA_CHECKOUT_CUSTOMER_CAPTURE__={livePhone,registrationDraft,complete};
})();
