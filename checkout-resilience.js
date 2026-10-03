(() => {
  'use strict';

  const CUTOFF_HOUR=11;
  const originalFetch=window.fetch.bind(window);
  const originalSetTimeout=window.setTimeout.bind(window);
  let pendingAdjustment=null;
  let pendingSubmitError=null;
  let pendingWhatsappReturnUrl=null;

  function byId(id){return document.getElementById(id)}
  function digits(value,max=20){return String(value??'').replace(/\D+/g,'').slice(0,max)}
  function field(id){const el=byId(id);return el?String(el.value??'').trim():''}
  function liveCheckoutPhone(){
    const ddd=digits(field('checkoutDdd'),2);
    let mobile=digits(field('checkoutPhone'),9);
    if(mobile.length===8)mobile='9'+mobile;
    const valid=ddd.length===2&&mobile.length===9&&mobile.startsWith('9');
    return {ddd,mobile,valid,full:valid?'+55'+ddd+mobile:''};
  }
  function checkoutRegistrationDraft(){
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
  function registrationDraftComplete(draft){
    // CPF/CNPJ pode vir vazio somente ao editar um cliente que já existe: o backend
    // reaproveita o documento privado sem expô-lo no checkout público.
    return Boolean(draft?.name&&draft?.street&&draft?.number&&draft?.neighborhood&&draft?.city);
  }
  function existingRegistrationComplete(){
    const result=byId('customerLookupResult');
    return Boolean(result?.classList?.contains('found')&&/cadastro completo/i.test(String(result.textContent||''))&&!byId('checkoutName'));
  }
  function validCpf(value){
    const d=digits(value,11);if(d.length!==11||/^(\d)\1{10}$/.test(d))return false;
    let sum=0;for(let i=0;i<9;i++)sum+=Number(d[i])*(10-i);let check=(sum*10)%11;if(check===10)check=0;if(check!==Number(d[9]))return false;
    sum=0;for(let i=0;i<10;i++)sum+=Number(d[i])*(11-i);check=(sum*10)%11;if(check===10)check=0;return check===Number(d[10]);
  }
  function validCnpj(value){
    const d=digits(value,14);if(d.length!==14||/^(\d)\1{13}$/.test(d))return false;
    const calc=(base,weights)=>{let sum=0;for(let i=0;i<weights.length;i++)sum+=Number(base[i])*weights[i];const r=sum%11;return r<2?0:11-r};
    const c1=calc(d,[5,4,3,2,9,8,7,6,5,4,3,2]);if(c1!==Number(d[12]))return false;
    const c2=calc(d,[6,5,4,3,2,9,8,7,6,5,4,3,2]);return c2===Number(d[13]);
  }
  function validDocument(value){const d=digits(value,14);return d.length===11?validCpf(d):d.length===14?validCnpj(d):false}

  async function persistRegistrationBeforeOrder(requestUrl,phone,draft){
    if(!phone.valid||!registrationDraftComplete(draft))return {ok:false,error:'registration_incomplete'};
    try{
      const url=new URL(requestUrl);
      url.searchParams.set('action','customer_register');
      const response=await originalFetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:'checkout',phone:phone.full,...draft}),cache:'no-store'});
      const data=await response.json().catch(()=>({ok:false,error:'registration_unavailable'}));
      return response.ok&&data?.ok!==false?{ok:true,...data}:{ok:false,error:data?.error||'registration_unavailable'};
    }catch{return {ok:false,error:'registration_unavailable'}}
  }

  function injectCheckoutStyles(){
    if(byId('daCheckoutRequiredStyles')||!document.head)return;
    const style=document.createElement('style');
    style.id='daCheckoutRequiredStyles';
    style.textContent=`
      .da-checkout-section{margin:14px 0;padding:14px;border:1px solid #e2e8e3;border-radius:16px;background:#fff}
      .da-checkout-section h3{margin:0 0 5px!important;font-size:17px!important;color:#18221c}
      .da-checkout-section-desc{margin:0 0 12px;color:#66716a;font-size:12px;line-height:1.4}
      .da-checkout-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .da-checkout-grid .span-all{grid-column:1/-1}
      .da-required-star{color:#a52232;font-weight:900;margin-left:3px}
      .da-validation-summary{margin:12px 0;padding:12px 13px;border:2px solid #b42a3a;border-radius:14px;background:#fff4f5;color:#72202b;font-size:13px;line-height:1.45}
      .da-validation-summary strong{display:block;margin-bottom:5px;font-size:14px}
      .da-field-error{margin-top:5px;color:#a52232;font-size:12px;font-weight:750;line-height:1.3}
      .da-section-invalid{border-color:#d05a67!important;box-shadow:0 0 0 3px rgba(180,42,58,.08)}
      [aria-invalid="true"]{border-color:#b42a3a!important;box-shadow:0 0 0 3px rgba(180,42,58,.10)!important;background:#fffafa!important}
      .da-checkout-ok{padding:10px 11px;border-radius:11px;background:#eef7f1;color:#17613f;font-size:12px;font-weight:750}
      .da-checkout-helper{margin:0 0 10px;padding:9px 10px;border-radius:11px;background:#f6f8f6;color:#59645d;font-size:12px}
      #saveCheckoutRegistration{display:none!important}
      @media(max-width:560px){.da-checkout-section{padding:13px 12px}.da-checkout-grid{grid-template-columns:1fr}.da-checkout-grid .span-all{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }
  function makeSection(title,description,key){
    const sec=document.createElement('section');sec.className='da-checkout-section';sec.dataset.daSection=key;
    const h=document.createElement('h3');h.textContent=title;sec.appendChild(h);
    if(description){const p=document.createElement('p');p.className='da-checkout-section-desc';p.textContent=description;sec.appendChild(p)}
    return sec;
  }
  function appendRequired(label){
    if(!label||label.querySelector('.da-required-star'))return;
    const span=label.querySelector('span');if(!span)return;
    const star=document.createElement('span');star.className='da-required-star';star.textContent='*';star.setAttribute('aria-hidden','true');span.appendChild(star);
  }
  function checkoutHeading(body,pattern){return [...body.querySelectorAll('h3.checkout-title')].find(h=>pattern.test(String(h.textContent||'')))}
  function organizeCheckoutSections(){
    const body=byId('sheetBody');
    if(!body||!byId('sendWhats')||body.querySelector('[data-da-checkout-organized="1"]'))return;
    injectCheckoutStyles();
    const marker=document.createElement('span');marker.dataset.daCheckoutOrganized='1';marker.hidden=true;body.prepend(marker);

    const waHeading=checkoutHeading(body,/WhatsApp/i),dateHeading=checkoutHeading(body,/Data de entrega/i),paymentHeading=checkoutHeading(body,/Como você vai pagar/i);
    const waBox=body.querySelector('.wa-lookup');
    if(waHeading&&waBox){
      const sec=makeSection('Seu WhatsApp','Usamos este número para identificar seu cadastro e enviar a cópia do pedido.','whatsapp');
      waHeading.parentNode.insertBefore(sec,waHeading);waHeading.remove();sec.appendChild(waBox);
      const helper=document.createElement('div');helper.className='da-checkout-helper';helper.textContent='Digite seu WhatsApp e toque em Continuar.';sec.insertBefore(helper,waBox);
      const lookup=byId('lookupCustomer');if(lookup)lookup.textContent='Continuar';
      appendRequired(byId('checkoutDdd')?.closest('label'));appendRequired(byId('checkoutPhone')?.closest('label'));
    }

    const formName=byId('checkoutName');
    if(formName){
      const grid=formName.closest('div[style*="display:grid"]')||formName.parentElement?.parentElement;
      const personal=makeSection('Informações pessoais','Preencha somente os dados básicos para identificar o pedido.','personal');
      const personalGrid=document.createElement('div');personalGrid.className='da-checkout-grid';personal.appendChild(personalGrid);
      const delivery=makeSection('Dados da entrega','Informe onde devemos entregar seu pedido.','delivery');
      const deliveryGrid=document.createElement('div');deliveryGrid.className='da-checkout-grid';delivery.appendChild(deliveryGrid);
      const anchor=dateHeading||grid;
      if(anchor?.parentNode){anchor.parentNode.insertBefore(personal,anchor);anchor.parentNode.insertBefore(delivery,anchor)}

      const nameLabel=byId('checkoutName')?.closest('label'),docLabel=byId('checkoutDocument')?.closest('label');
      if(nameLabel){nameLabel.classList.add('span-all');personalGrid.appendChild(nameLabel);appendRequired(nameLabel)}
      if(docLabel){personalGrid.appendChild(docLabel);if(!byId('customerLookupResult')?.classList?.contains('found'))appendRequired(docLabel)}
      const marketing=byId('checkoutMarketing')?.closest('label');if(marketing){marketing.classList.add('span-all');personalGrid.appendChild(marketing)}

      for(const id of ['checkoutStreet','checkoutNumber','checkoutNeighborhood','checkoutCity','checkoutPostal','checkoutComplement','checkoutReference']){
        const label=byId(id)?.closest('label');if(!label)continue;
        if(['checkoutStreet','checkoutComplement','checkoutReference'].includes(id))label.classList.add('span-all');
        deliveryGrid.appendChild(label);
        if(['checkoutStreet','checkoutNumber','checkoutNeighborhood','checkoutCity'].includes(id))appendRequired(label);
      }
      const save=byId('saveCheckoutRegistration');if(save)delivery.appendChild(save);
      if(grid&&grid.children.length===0)grid.remove();
      const oldNotice=[...body.querySelectorAll('.rule-notice')].find(x=>/Cadastro opcional|Cadastro do cliente|pedido pode ser finalizado/i.test(String(x.textContent||'')));
      if(oldNotice)oldNotice.remove();
    }else if(existingRegistrationComplete()){
      const personal=makeSection('Informações pessoais','Seus dados pessoais já estão cadastrados. Você não precisa digitar tudo novamente.','personal');
      const ok=document.createElement('div');ok.className='da-checkout-ok';ok.textContent='✓ Cadastro encontrado pelo seu WhatsApp.';personal.appendChild(ok);
      const delivery=makeSection('Dados da entrega','Confira o endereço abaixo antes de continuar.','delivery');
      const addressNotice=byId('confirmAddress')?.closest('.rule-notice');
      const anchor=dateHeading||addressNotice;
      if(anchor?.parentNode){anchor.parentNode.insertBefore(personal,anchor);anchor.parentNode.insertBefore(delivery,anchor)}
      if(addressNotice)delivery.appendChild(addressNotice);
      const marketingNotice=byId('editMarketingPreference')?.closest('.rule-notice');if(marketingNotice)personal.appendChild(marketingNotice);
    }

    if(dateHeading){
      const sec=makeSection('Data da entrega','Escolha quando deseja receber.','date');
      dateHeading.parentNode.insertBefore(sec,dateHeading);dateHeading.remove();
      const select=byId('checkoutDeliveryDate'),label=select?.closest('label'),note=label?.nextElementSibling;
      if(label){sec.appendChild(label);appendRequired(label)}if(note?.classList?.contains('note'))sec.appendChild(note);
    }
    if(paymentHeading){
      const sec=makeSection('Forma de pagamento','O pagamento é feito na entrega.','payment');
      paymentHeading.parentNode.insertBefore(sec,paymentHeading);paymentHeading.remove();
      const payments=body.querySelector('.payments'),note=payments?.nextElementSibling;if(payments)sec.appendChild(payments);if(note?.classList?.contains('note'))sec.appendChild(note);
    }

    const btn=byId('sendWhats');if(btn)btn.textContent='Finalizar pedido';
    body.querySelectorAll('input,select').forEach(el=>{
      const clear=()=>clearFieldError(el);el.addEventListener('input',clear);el.addEventListener('change',clear);
    });
  }

  function clearCheckoutValidation(){
    byId('checkoutValidationSummary')?.remove();
    document.querySelectorAll?.('.da-field-error').forEach(x=>x.remove());
    document.querySelectorAll?.('[aria-invalid="true"]').forEach(x=>x.removeAttribute('aria-invalid'));
    document.querySelectorAll?.('.da-section-invalid').forEach(x=>x.classList.remove('da-section-invalid'));
  }
  function clearFieldError(el){
    if(!el)return;el.removeAttribute?.('aria-invalid');
    const label=el.closest?.('label');label?.querySelector?.('.da-field-error')?.remove();
    el.closest?.('.da-checkout-section')?.classList?.remove('da-section-invalid');
  }
  function issue(id,message,target=null){return {id,message,target:target||id}}
  function validateCheckoutBasics(){
    const issues=[];const ph=liveCheckoutPhone();
    if(!ph.valid)issues.push(issue('checkoutPhone','Confira o WhatsApp. Digite o DDD e o número com 9 dígitos.','checkoutPhone'));
    const completeExisting=existingRegistrationComplete();
    const draft=checkoutRegistrationDraft();
    if(ph.valid&&!completeExisting&&!byId('checkoutName'))issues.push(issue('lookupCustomer','Depois do WhatsApp, toque em Continuar para carregar seus dados.','lookupCustomer'));
    if(byId('checkoutName')){
      if(!draft.name)issues.push(issue('checkoutName','Digite seu nome completo.'));
      const known=byId('customerLookupResult')?.classList?.contains('found');
      if(!known&&!digits(draft.document,14))issues.push(issue('checkoutDocument','Digite seu CPF ou CNPJ.'));
      else if(digits(draft.document,14)&&!validDocument(draft.document))issues.push(issue('checkoutDocument','Confira o CPF/CNPJ. Parece que algum número está errado.'));
      if(!draft.street)issues.push(issue('checkoutStreet','Digite o nome da rua.'));
      if(!draft.number)issues.push(issue('checkoutNumber','Digite o número da casa. Se não tiver número, digite SN.'));
      if(!draft.neighborhood)issues.push(issue('checkoutNeighborhood','Digite seu bairro.'));
      if(!['Cuiabá','Várzea Grande'].includes(draft.city))issues.push(issue('checkoutCity','Escolha Cuiabá ou Várzea Grande.'));
    }else if(completeExisting){
      const confirm=byId('confirmAddress');if(confirm&&!/✓/.test(String(confirm.textContent||'')))issues.push(issue('confirmAddress','Confirme se este é o endereço da entrega.','confirmAddress'));
    }
    if(!field('checkoutDeliveryDate'))issues.push(issue('checkoutDeliveryDate','Escolha a data da entrega.'));
    if(!document.querySelector?.('input[name="payment"]:checked'))issues.push(issue('payment','Escolha como vai pagar na entrega.','payment'));
    return {ok:issues.length===0,issues};
  }
  function markIssue(item){
    if(item.id==='payment'){
      const sec=document.querySelector?.('[data-da-section="payment"]');sec?.classList.add('da-section-invalid');return sec;
    }
    const el=byId(item.target);if(!el)return null;
    el.setAttribute?.('aria-invalid','true');
    const sec=el.closest?.('.da-checkout-section');sec?.classList.add('da-section-invalid');
    const label=el.closest?.('label');
    if(label&&!label.querySelector('.da-field-error')){const msg=document.createElement('div');msg.className='da-field-error';msg.textContent=item.message;label.appendChild(msg)}
    return el;
  }
  function showCheckoutValidation(result){
    clearCheckoutValidation();if(result?.ok)return true;
    const body=byId('sheetBody');if(!body)return false;
    const summary=document.createElement('div');summary.id='checkoutValidationSummary';summary.className='da-validation-summary';
    summary.innerHTML='<strong>Falta só isto para concluir:</strong>'+result.issues.map(x=>'<div>• '+escapeHtml(x.message)+'</div>').join('');
    const firstSection=body.querySelector('.da-checkout-section');body.insertBefore(summary,firstSection||body.firstChild);
    let first=null;for(const item of result.issues){const marked=markIssue(item);if(!first&&marked)first=marked}
    const target=first||summary;originalSetTimeout(()=>{target.scrollIntoView?.({behavior:'smooth',block:'center'});if(target.matches?.('input,select'))target.focus?.({preventScroll:true})},0);
    return false;
  }
  function showRegistrationServerError(error){
    const code=String(error||'registration_incomplete');let item;
    if(code==='invalid_document'||code==='document_mismatch'||code==='document_already_in_use')item=issue('checkoutDocument',code==='invalid_document'?'Confira o CPF/CNPJ. Parece que algum número está errado.':code==='document_already_in_use'?'Este CPF/CNPJ já está ligado a outro cadastro.':'Este CPF/CNPJ não confere com o cadastro.');
    else if(code==='unsupported_city')item=issue('checkoutCity','Escolha Cuiabá ou Várzea Grande.');
    else if(code==='identity_mismatch')item=issue('checkoutName','O nome informado não confere com este cadastro.');
    else item=issue('checkoutName','Confira seus dados pessoais e o endereço antes de finalizar.');
    showCheckoutValidation({ok:false,issues:[item]});
  }

  function adjustmentLine(item){
    const name=String(item?.name||'Item');
    const requested=Number(item?.requested||0);
    const available=Number(item?.available||0);
    if(item?.action==='reduced'&&available>0)return `${name}: quantidade ajustada de ${requested} para ${available}.`;
    if(String(item?.reason||'').includes('composicao'))return `${name}: retirado porque a composição disponível mudou.`;
    return `${name}: retirado porque ficou sem estoque.`;
  }
  function applyStockAdjustment(saved){return Array.isArray(saved?.adjusted_items)?saved.adjusted_items.filter(Boolean):[]}
  function confirmStockAdjustment(saved){
    const items=applyStockAdjustment(saved);if(!items.length)return false;
    const title=document.querySelector('#sheetTitle'),body=document.querySelector('#sheetBody'),action=document.querySelector('#sheetAction');if(!title||!body||!action)return false;
    const orderId=String(saved?.order_id||'').trim(),shortUrl=String(saved?.order_public_url||'').trim(),orderUrl=/^https:\/\/donaantonia\.com\.br\/p\/\?k=[a-f0-9]{16}$/i.test(shortUrl)?shortUrl:(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)?'https://donaantonia.com.br/pedido/?o='+encodeURIComponent(orderId):''),total=Number(saved?.total_cents||0)/100;
    title.textContent='Pedido ajustado e recebido';
    body.innerHTML=`<div class="rule-notice warn"><strong>O estoque mudou enquanto você finalizava.</strong>${items.map(x=>`<div style="margin-top:7px">${escapeHtml(adjustmentLine(x))}</div>`).join('')}<div style="margin-top:10px"><b>Novo total: ${total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</b></div><div style="margin-top:6px">O pedido continuou normalmente com os itens disponíveis.</div></div>`;
    action.innerHTML='<div class="action-stack">'+(orderUrl?'<button type="button" class="primary" id="stockAdjustmentOrder">Ver meu pedido</button>':'')+'<button type="button" class="secondary" id="stockAdjustmentStore">Voltar à vitrine</button></div>';
    document.querySelector('#stockAdjustmentOrder')?.addEventListener('click',()=>{pendingAdjustment=null;window.location.assign(orderUrl)});
    document.querySelector('#stockAdjustmentStore')?.addEventListener('click',()=>{pendingAdjustment=null;document.querySelector('#closeSheet')?.click()});return true;
  }
  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function humanError(data){
    const code=String(data?.error||''),items=Array.isArray(data?.adjusted_items)?data.adjusted_items:[];
    if(code==='required_checkout_data')return 'Confira os campos destacados no checkout antes de finalizar o pedido.';
    if(code==='registration_incomplete')return 'Complete seus dados pessoais e o endereço antes de finalizar o pedido.';
    if(code==='invalid_document')return 'Confira o CPF/CNPJ. Parece que algum número está errado.';
    if(code==='unsupported_city')return 'Atendemos somente Cuiabá e Várzea Grande.';
    if(code==='all_items_unavailable')return items.length?items.map(adjustmentLine).join(' '):'Os itens deste pedido ficaram sem estoque neste momento. Escolha outros produtos ou fale conosco no WhatsApp.';
    if(code==='rate_limited')return 'Recebemos várias tentativas seguidas. Seu carrinho continua salvo. Aguarde alguns segundos e toque novamente em Finalizar pedido.';
    if(code==='minimum_order')return 'O total atual ficou abaixo do pedido mínimo antes da confirmação. Seu carrinho continua salvo.';
    if(code==='rate_limit_unavailable'||code==='service_unavailable')return 'O sistema de pedidos está temporariamente indisponível. Seu carrinho continua salvo para você tentar novamente.';
    if(['insufficient_stock','product_unavailable','basket_unavailable','basket_lot_unavailable','basket_lot_insufficient','basket_component_not_in_lot','basket_kit_lot_unavailable','basket_kit_lot_insufficient','basket_component_not_in_selected_kit'].includes(code))return items.length?items.map(adjustmentLine).join(' '):'A disponibilidade mudou enquanto o pedido era enviado. Toque novamente em Finalizar pedido; vamos ajustar automaticamente os itens disponíveis.';
    return `O pedido não foi enviado por causa de ${code||'uma falha de comunicação'}. Seu carrinho continua salvo.`;
  }

  if(typeof document.addEventListener==='function')document.addEventListener('click',event=>{
    const btn=event.target?.closest?.('#sendWhats');if(!btn)return;
    organizeCheckoutSections();const validation=validateCheckoutBasics();
    if(!validation.ok){event.preventDefault();event.stopImmediatePropagation();showCheckoutValidation(validation)}
  },true);

  window.fetch=async(...args)=>{
    let [input,options]=args;const requestUrl=String(input?.url||input||'');
    if(requestUrl.includes('/functions/v1/storefront-v2')&&requestUrl.includes('action=submit_order')&&String(options?.method||'GET').toUpperCase()==='POST'){
      try{
        const body=typeof options?.body==='string'?JSON.parse(options.body):null;
        if(body&&typeof body==='object'){
          const phone=liveCheckoutPhone(),draft=checkoutRegistrationDraft();
          if(phone.valid)body.whatsapp_phone=phone.full;
          if(!existingRegistrationComplete()){
            const saved=await persistRegistrationBeforeOrder(requestUrl,phone,draft);
            if(saved?.ok!==true){pendingSubmitError={error:saved?.error||'registration_incomplete'};showRegistrationServerError(pendingSubmitError.error);throw new Error(pendingSubmitError.error)}
          }
          options={...options,body:JSON.stringify(body)};args=[input,options];
        }
      }catch(error){if(pendingSubmitError)throw error}
    }
    const response=await originalFetch(...args);
    try{
      if(requestUrl.includes('/functions/v1/storefront-v2')&&requestUrl.includes('action=submit_order')){
        const data=await response.clone().json();
        const returnPhone=digits(data?.whatsapp_return_phone,15);
        if(response.ok&&/^55\d{10,11}$/.test(returnPhone))pendingWhatsappReturnUrl='https://wa.me/'+returnPhone;
        else if(response.ok)pendingWhatsappReturnUrl=null;
        if(response.ok&&data?.stock_adjustment===true&&applyStockAdjustment(data).length){pendingAdjustment=data;pendingSubmitError=null;originalSetTimeout(()=>confirmStockAdjustment(data),0)}
        else if(!response.ok){pendingSubmitError=data;if(['required_checkout_data','registration_incomplete','invalid_document','unsupported_city','identity_mismatch','document_mismatch','document_already_in_use'].includes(String(data?.error||'')))originalSetTimeout(()=>showRegistrationServerError(data.error),0)}
        else{pendingAdjustment=null;pendingSubmitError=null}
      }
    }catch{}
    return response;
  };

  window.setTimeout=(fn,delay,...rest)=>{
    if(Number(delay)===0&&pendingWhatsappReturnUrl&&typeof fn==='function'){
      try{
        if(Function.prototype.toString.call(fn).includes('location.assign')){
          const target=pendingWhatsappReturnUrl;
          return originalSetTimeout(()=>window.location.assign(target),0);
        }
      }catch{}
    }
    if(Number(delay)===3000&&pendingAdjustment&&typeof fn==='function'){try{if(Function.prototype.toString.call(fn).includes('location.assign'))return 0}catch{}}
    return originalSetTimeout(fn,delay,...rest);
  };

  const observer=new MutationObserver(()=>{
    organizeCheckoutSections();
    const fallback=document.querySelector?.('.wa-fallback');if(fallback&&pendingWhatsappReturnUrl)fallback.href=pendingWhatsappReturnUrl;
    const toast=document.querySelector?.('#toast');if(!toast||!pendingSubmitError)return;
    const text=String(toast.textContent||'');if(text.includes('Não consegui registrar')||text.includes('O estoque mudou. Atualize a cesta'))toast.textContent=humanError(pendingSubmitError);
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  originalSetTimeout(organizeCheckoutSections,0);

  window.__DA_CHECKOUT_RESILIENCE__={CUTOFF_HOUR,applyStockAdjustment,confirmStockAdjustment,liveCheckoutPhone,checkoutRegistrationDraft,registrationDraftComplete,existingRegistrationComplete,validateCheckoutBasics,showCheckoutValidation};
})();