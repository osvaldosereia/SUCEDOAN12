(() => {
  'use strict';

  function byId(id){return document.getElementById(id)}
  function digits(value,max=20){return String(value??'').replace(/\D+/g,'').slice(0,max)}
  function field(id,fallback=''){const el=byId(id);return el?String(el.value??'').trim():String(fallback??'').trim()}

  function livePhone(){
    const ddd=digits(byId('checkoutDdd')?.value,2);
    let mobile=digits(byId('checkoutPhone')?.value,9);
    if(mobile.length===8)mobile='9'+mobile;
    const valid=ddd.length===2&&mobile.length===9&&mobile.startsWith('9');
    return {ddd,mobile,valid,full:valid?'+55'+ddd+mobile:''};
  }

  function draft(){
    return {
      name:field('checkoutName'),
      document:field('checkoutDocument'),
      street:field('checkoutStreet'),
      number:field('checkoutNumber'),
      neighborhood:field('checkoutNeighborhood'),
      city:field('checkoutCity'),
      postal_code:field('checkoutPostal'),
      complement:field('checkoutComplement'),
      reference:field('checkoutReference'),
      marketing_opt_in:byId('checkoutMarketing')?.checked===true
    };
  }

  function registrationComplete(d){
    const doc=digits(d?.document,14);
    return Boolean(d?.name&&[11,14].includes(doc.length)&&d?.street&&d?.number&&d?.neighborhood&&d?.city);
  }

  function currentOrigin(){
    try{
      const saved=JSON.parse(sessionStorage.getItem('da_marketing_context_v1')||'null');
      if(saved?.origin==='1018'||saved?.origin==='0975')return saved.origin;
    }catch{}
    return '0975';
  }

  function draftAddress(d){
    const out={};
    const map={name:'customer_name',street:'street',number:'number',neighborhood:'neighborhood',city:'city',postal_code:'postal_code',complement:'complement',reference:'reference'};
    for(const [src,dst] of Object.entries(map)){const v=String(d?.[src]??'').trim();if(v)out[dst]=v}
    if(out.neighborhood)out.district=out.neighborhood;
    return out;
  }

  async function saveCompleteRegistration(apiBase,phone,d){
    if(!phone.valid||!registrationComplete(d))return null;
    try{
      const url=new URL(apiBase);url.searchParams.set('action','customer_register');
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:'checkout',phone:phone.full,...d}),cache:'no-store'});
      const data=await response.json().catch(()=>null);
      return response.ok&&data?.ok!==false?data:null;
    }catch{return null}
  }

  const originalFetch=window.fetch.bind(window);
  let inflightSave=null;
  window.fetch=async(input,init={})=>{
    const requestUrl=String(input?.url||input||'');
    if(requestUrl.includes('/functions/v1/storefront-v2')&&requestUrl.includes('action=submit_order')&&String(init?.method||'GET').toUpperCase()==='POST'){
      try{
        const originalBody=typeof init.body==='string'?JSON.parse(init.body):null;
        if(originalBody&&typeof originalBody==='object'){
          const phone=livePhone(),customerDraft=draft();
          if(phone.valid)originalBody.whatsapp_phone=phone.full;
          originalBody.customer_draft=customerDraft;
          originalBody.customer_draft_address=draftAddress(customerDraft);
          if(!originalBody.whatsapp_origin)originalBody.whatsapp_origin=currentOrigin();
          inflightSave=saveCompleteRegistration(requestUrl,phone,customerDraft);
          await inflightSave;
          init={...init,body:JSON.stringify(originalBody)};
        }
      }catch{}
    }
    return originalFetch(input,init);
  };

  window.__DA_CHECKOUT_CUSTOMER_CAPTURE__={livePhone,draft,registrationComplete,draftAddress};
})();
