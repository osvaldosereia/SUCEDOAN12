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
  function localWhatsappDigits(value){
    let d=digits(value,13);if(d.startsWith('55')&&d.length>=12)d=d.slice(2);return d.slice(0,11);
  }
  function formatUnifiedPhone(value){
    const d=localWhatsappDigits(value);if(!d)return '';if(d.length<=2)return d;const ddd=d.slice(0,2),mobile=d.slice(2);
    if(mobile.length<=4)return '('+ddd+') '+mobile;
    if(d.length<=10)return '('+ddd+') '+mobile.slice(0,4)+'-'+mobile.slice(4,8);
    return '('+ddd+') '+mobile.slice(0,5)+'-'+mobile.slice(5,9);
  }
  function liveCheckoutPhone(){
    const unified=byId('checkoutWhatsappUnified');let local=unified?localWhatsappDigits(unified.value):'';
    if(local.length===10)local=local.slice(0,2)+'9'+local.slice(2);
    if(local.length===11){const ddd=local.slice(0,2),mobile=local.slice(2),valid=mobile.startsWith('9');return {ddd,mobile,valid,full:valid?'+55'+local:''}}
    const ddd=digits(field('checkoutDdd'),2);let mobile=digits(field('checkoutPhone'),9);if(mobile.length===8)mobile='9'+mobile;
    const valid=ddd.length===2&&mobile.length===9&&mobile.startsWith('9');return {ddd,mobile,valid,full:valid?'+55'+ddd+mobile:''};
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
    return Boolean(result?.classList?.contains('found')&&!byId('checkoutName'));
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

  function injectCheckoutStyles(){
    if(byId('daCheckoutRequiredStyles')||!document.head)return;
    const style=document.createElement('style');
    style.id='daCheckoutRequiredStyles';
    style.textContent=`
      .da-checkout-section{margin:14px 0;padding:16px;border:1px solid #e2e8e3;border-radius:16px;background:#fff}
      .da-checkout-section h3{margin:0 0 5px!important;font-size:18px!important;color:#18221c}
      .da-checkout-section-desc{margin:0 0 13px;color:#66716a;font-size:13px;line-height:1.45}
      .da-checkout-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}
      .da-checkout-grid .span-all{grid-column:1/-1}
      .da-checkout-section .wa-field span{font-size:13px!important;line-height:1.3;margin-bottom:5px!important}
      .da-checkout-section .wa-field input,.da-checkout-section .wa-field select{height:52px!important;min-height:52px!important;font-size:16px!important;border-radius:12px!important;padding:0 12px!important}
      .da-required-star{color:#a52232;font-weight:900;margin-left:3px}
      .da-validation-summary{margin:12px 0;padding:13px 14px;border:2px solid #b42a3a;border-radius:14px;background:#fff4f5;color:#72202b;font-size:14px;line-height:1.5}
      .da-validation-summary strong{display:block;margin-bottom:5px;font-size:15px}
      .da-field-error{margin-top:6px;color:#a52232;font-size:13px;font-weight:750;line-height:1.35}
      .da-section-invalid{border-color:#d05a67!important;box-shadow:0 0 0 3px rgba(180,42,58,.08)}
      [aria-invalid="true"]{border-color:#b42a3a!important;box-shadow:0 0 0 3px rgba(180,42,58,.10)!important;background:#fffafa!important}
      .da-checkout-ok{padding:12px 13px;border-radius:11px;background:#eef7f1;color:#17613f;font-size:14px;font-weight:750}
      .da-phone-unified{display:block}.da-phone-unified input{width:100%}
      .da-phone-legacy{display:none!important}
      .da-date-source{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
      .da-date-options{display:grid;grid-template-columns:1fr 1fr;gap:9px}.da-date-option{min-height:56px;border:1px solid #d7dfd9;border-radius:13px;background:#fff;color:#18221c;padding:10px 12px;text-align:left;font-size:14px;font-weight:800}
      .da-date-option[aria-pressed="true"]{border-color:#176b43;background:#edf6f0;color:#135938;box-shadow:0 0 0 2px rgba(23,107,67,.08)}
      .da-checkout-section .payments{gap:9px!important}.da-checkout-section .pay{min-height:52px!important;padding:11px 12px!important;font-size:14px!important;border-radius:13px!important}.da-checkout-section .pay:has(input:checked){border-color:#176b43;background:#edf6f0}
      .da-address-confirm{font-size:14px!important}.da-address-confirm>div{margin-top:8px!important}
      #editAddress{min-height:52px!important;font-size:14px!important}
      .checkout-marketing-choice{display:flex;align-items:center;gap:9px;margin:10px 0 2px;font-size:14px;font-weight:700;line-height:1.3}.checkout-marketing-choice input{width:22px;height:22px;flex:0 0 auto}
      .da-checkout-final-total{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 2px 4px}.da-checkout-final-total span{font-size:12px;color:#66716a;font-weight:750}.da-checkout-final-total strong{font-size:21px;color:#18221c}
      #sendWhats{min-height:56px!important;font-size:17px!important;border-radius:14px!important}.action-stack #addMoreCheckout{min-height:48px!important;font-size:13px!important}
      #saveCheckoutRegistration{display:none!important}
      @media(max-width:560px){.da-checkout-section{padding:14px 12px}.da-checkout-grid{grid-template-columns:1fr}.da-checkout-grid .span-all{grid-column:auto}.da-date-options{grid-template-columns:1fr}.da-checkout-section .payments{grid-template-columns:1fr!important}}
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
  let automaticLookupTimer=null;
  function scheduleAutomaticLookup(){
    if(automaticLookupTimer)clearTimeout(automaticLookupTimer);const ph=liveCheckoutPhone();if(!ph.valid)return;
    automaticLookupTimer=originalSetTimeout(()=>{const current=liveCheckoutPhone(),lookup=byId('lookupCustomer');if(current.valid&&lookup)lookup.click()},320);
  }
  function syncUnifiedPhoneToLegacy(input){
    const local=localWhatsappDigits(input?.value||'');if(input)input.value=formatUnifiedPhone(local);
    const ddd=byId('checkoutDdd'),phone=byId('checkoutPhone');if(ddd){ddd.value=local.slice(0,2);ddd.dispatchEvent(new Event('input',{bubbles:true}))}if(phone){phone.value=local.slice(2);phone.dispatchEvent(new Event('input',{bubbles:true}))}
    clearFieldError(input);scheduleAutomaticLookup();
  }
  function setupUnifiedWhatsapp(waBox){
    if(!waBox||byId('checkoutWhatsappUnified'))return;const grid=waBox.querySelector('.wa-grid'),ddd=byId('checkoutDdd'),phone=byId('checkoutPhone'),lookup=byId('lookupCustomer');
    const initialDdd=digits(ddd?.value,2),initialMobile=digits(phone?.value,9),initial=initialDdd.length===2&&initialMobile.length>=8?initialDdd+initialMobile:'';
    const label=document.createElement('label');label.className='wa-field da-phone-unified';label.innerHTML='<span>WhatsApp com DDD</span><input id="checkoutWhatsappUnified" inputmode="tel" autocomplete="tel" maxlength="16" placeholder="(65) 99815-0975" aria-label="WhatsApp com DDD">';
    waBox.insertBefore(label,grid||waBox.firstChild);const input=byId('checkoutWhatsappUnified');if(input){input.value=formatUnifiedPhone(initial);input.addEventListener('input',()=>syncUnifiedPhoneToLegacy(input));appendRequired(label)}
    if(grid)grid.classList.add('da-phone-legacy');if(lookup){lookup.hidden=true;lookup.style.display='none'}
  }
  function setupDateChoices(sec,select,label){
    if(!sec||!select||sec.querySelector('.da-date-options'))return;const options=[...select.options].filter(o=>o.value);if(!options.length)return;if(label)label.classList.add('da-date-source');
    const host=document.createElement('div');host.className='da-date-options';for(const option of options){const btn=document.createElement('button');btn.type='button';btn.className='da-date-option';btn.textContent=option.textContent;btn.dataset.date=option.value;btn.setAttribute('aria-pressed',String(select.value===option.value));btn.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));host.querySelectorAll('.da-date-option').forEach(x=>x.setAttribute('aria-pressed',String(x===btn)));clearFieldError(select)};host.appendChild(btn)}
    sec.insertBefore(host,label?.nextSibling||null);
  }
  function setupCheckoutFooter(){
    const stack=byId('sheetAction')?.querySelector('.action-stack'),btn=byId('sendWhats');if(!stack||!btn)return;let total=stack.querySelector('.da-checkout-final-total');if(!total){total=document.createElement('div');total.className='da-checkout-final-total';total.innerHTML='<span>Total do pedido</span><strong></strong>';stack.prepend(total)}
    const add=byId('addMoreCheckout');if(add&&btn.nextSibling!==add)stack.insertBefore(btn,add);refreshCheckoutPresentation();
  }
  function refreshCheckoutPresentation(){
    const btn=byId('sendWhats');if(btn&&!btn.disabled&&btn.textContent!=='Confirmar pedido')btn.textContent='Confirmar pedido';const total=byId('checkoutTotal')?.textContent||'',target=document.querySelector('.da-checkout-final-total strong');if(target&&target.textContent!==total)target.textContent=total;
  }
  function organizeCheckoutSections(){
    const body=byId('sheetBody');if(!body||!byId('sendWhats')||body.querySelector('[data-da-checkout-organized="1"]'))return;injectCheckoutStyles();const marker=document.createElement('span');marker.dataset.daCheckoutOrganized='1';marker.hidden=true;body.prepend(marker);
    const minimumNotice=[...body.querySelectorAll('.rule-notice')].find(x=>/Pedido mínimo/i.test(String(x.textContent||'')));if(minimumNotice&&!minimumNotice.classList.contains('warn'))minimumNotice.remove();
    const waHeading=checkoutHeading(body,/WhatsApp/i),dateHeading=checkoutHeading(body,/Data de entrega/i),paymentHeading=checkoutHeading(body,/Como você vai pagar/i),waBox=body.querySelector('.wa-lookup');
    if(waHeading&&waBox){const sec=makeSection('WhatsApp','', 'whatsapp');waHeading.parentNode.insertBefore(sec,waHeading);waHeading.remove();sec.appendChild(waBox);setupUnifiedWhatsapp(waBox)}
    const formName=byId('checkoutName');
    if(formName){const grid=formName.closest('div[style*="display:grid"]')||formName.parentElement?.parentElement,personal=makeSection('Seus dados','', 'personal'),personalGrid=document.createElement('div');personalGrid.className='da-checkout-grid';personal.appendChild(personalGrid);const delivery=makeSection('Endereço','', 'delivery'),deliveryGrid=document.createElement('div');deliveryGrid.className='da-checkout-grid';delivery.appendChild(deliveryGrid),anchor=dateHeading||grid;if(anchor?.parentNode){anchor.parentNode.insertBefore(personal,anchor);anchor.parentNode.insertBefore(delivery,anchor)}
      const nameLabel=byId('checkoutName')?.closest('label'),docLabel=byId('checkoutDocument')?.closest('label');if(nameLabel){nameLabel.classList.add('span-all');personalGrid.appendChild(nameLabel);appendRequired(nameLabel)}if(docLabel){personalGrid.appendChild(docLabel);if(!byId('customerLookupResult')?.classList?.contains('found'))appendRequired(docLabel)}const marketing=byId('checkoutMarketing')?.closest('label');if(marketing){marketing.classList.add('span-all');personalGrid.appendChild(marketing)}
      for(const id of ['checkoutStreet','checkoutNumber','checkoutNeighborhood','checkoutCity','checkoutPostal','checkoutComplement','checkoutReference']){const label=byId(id)?.closest('label');if(!label)continue;if(['checkoutStreet','checkoutComplement','checkoutReference'].includes(id))label.classList.add('span-all');deliveryGrid.appendChild(label);if(['checkoutStreet','checkoutNumber','checkoutNeighborhood','checkoutCity'].includes(id))appendRequired(label)}const save=byId('saveCheckoutRegistration');if(save)delivery.appendChild(save);if(grid&&grid.children.length===0)grid.remove();const oldNotice=[...body.querySelectorAll('.rule-notice')].find(x=>/Cadastro opcional|Cadastro do cliente|pedido pode ser finalizado/i.test(String(x.textContent||'')));if(oldNotice)oldNotice.remove();
    }else if(existingRegistrationComplete()){const delivery=makeSection('Endereço','', 'delivery'),addressNotice=byId('editAddress')?.closest('.rule-notice'),anchor=dateHeading||addressNotice;if(anchor?.parentNode)anchor.parentNode.insertBefore(delivery,anchor);if(addressNotice){addressNotice.classList.add('da-address-confirm');delivery.appendChild(addressNotice)}const edit=byId('editAddress');if(edit)edit.textContent='Trocar endereço'}
    if(dateHeading){const sec=makeSection('Data de entrega','', 'date');dateHeading.parentNode.insertBefore(sec,dateHeading);dateHeading.remove();const select=byId('checkoutDeliveryDate'),label=select?.closest('label'),note=label?.nextElementSibling;if(label){sec.appendChild(label);appendRequired(label)}setupDateChoices(sec,select,label);if(note?.classList?.contains('note'))note.remove()}
    if(paymentHeading){const sec=makeSection('Pagamento na entrega','', 'payment');paymentHeading.parentNode.insertBefore(sec,paymentHeading);paymentHeading.remove();const payments=body.querySelector('.payments'),note=payments?.nextElementSibling;if(payments)sec.appendChild(payments);if(note?.classList?.contains('note'))note.remove()}
    setupCheckoutFooter();body.querySelectorAll('input,select').forEach(el=>{const clear=()=>clearFieldError(el);el.addEventListener('input',clear);el.addEventListener('change',clear)});
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
    if(!ph.valid)issues.push(issue('checkoutWhatsappUnified','Digite seu WhatsApp com DDD. Ex.: (65) 99815-0975.','checkoutWhatsappUnified'));
    const completeExisting=existingRegistrationComplete();
    const draft=checkoutRegistrationDraft();
    if(ph.valid&&!completeExisting&&!byId('checkoutName')){scheduleAutomaticLookup();issues.push(issue('checkoutWhatsappUnified','Estamos conferindo seu cadastro. Aguarde um instante.','checkoutWhatsappUnified'))}
    if(byId('checkoutName')){
      if(!draft.name)issues.push(issue('checkoutName','Digite seu nome completo.'));
      const known=byId('customerLookupResult')?.classList?.contains('found');
      if(!known&&!digits(draft.document,14))issues.push(issue('checkoutDocument','Digite seu CPF ou CNPJ.'));
      else if(digits(draft.document,14)&&!validDocument(draft.document))issues.push(issue('checkoutDocument','Confira o CPF/CNPJ. Parece que algum número está errado.'));
      if(!draft.street)issues.push(issue('checkoutStreet','Digite o nome da rua.'));
      if(!draft.number)issues.push(issue('checkoutNumber','Digite o número da casa. Se não tiver número, digite SN.'));
      if(!draft.neighborhood)issues.push(issue('checkoutNeighborhood','Digite seu bairro.'));
      if(!['Cuiabá','Várzea Grande'].includes(draft.city))issues.push(issue('checkoutCity','Escolha Cuiabá ou Várzea Grande.'));
    }
    if(!field('checkoutDeliveryDate'))issues.push(issue('checkoutDeliveryDate','Escolha a data da entrega.'));
    if(!document.querySelector?.('input[name="payment"]:checked'))issues.push(issue('payment','Escolha como vai pagar na entrega.','payment'));
    return {ok:issues.length===0,issues};
  }
  function markIssue(item){
    if(item.id==='payment'){const sec=document.querySelector?.('[data-da-section="payment"]');sec?.classList.add('da-section-invalid');return sec}
    if(item.id==='checkoutDeliveryDate'){const sec=document.querySelector?.('[data-da-section="date"]');sec?.classList.add('da-section-invalid');return sec?.querySelector?.('.da-date-options')||sec}
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
    const orderId=String(saved?.order_id||'').trim(),shortUrl=String(saved?.order_public_url||'').trim(),enrichedUrl=String(saved?.order_public_url_with_addon||'').trim(),addonUrl=String(saved?.order_addon_url||'').trim(),safeAddon=/^https:\/\/donaantonia\.com\.br\/adicionar\/#t=[A-Za-z0-9_-]{32,96}$/.test(addonUrl)?addonUrl:'',orderUrl=/^https:\/\/donaantonia\.com\.br\/(?:p|pedido)\/\?[^#]+#a=[A-Za-z0-9_-]{32,96}$/i.test(enrichedUrl)?enrichedUrl:(/^https:\/\/donaantonia\.com\.br\/p\/\?k=[a-f0-9]{16}$/i.test(shortUrl)?shortUrl:(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)?'https://donaantonia.com.br/pedido/?o='+encodeURIComponent(orderId):'')),total=Number(saved?.total_cents||0)/100;
    title.textContent='Pedido ajustado e recebido';
    body.innerHTML=`<div class="rule-notice warn"><strong>O estoque mudou enquanto você finalizava.</strong>${items.map(x=>`<div style="margin-top:7px">${escapeHtml(adjustmentLine(x))}</div>`).join('')}<div style="margin-top:10px"><b>Novo total: ${total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</b></div><div style="margin-top:6px">O pedido continuou normalmente com os itens disponíveis.</div>${safeAddon?'<div style="margin-top:7px"><b>Esqueceu algo?</b> Ainda dá tempo de acrescentar produtos ao mesmo pedido.</div>':''}</div>`;
    action.innerHTML='<div class="action-stack">'+(safeAddon?'<button type="button" class="primary" id="stockAdjustmentAddon">Adicionar produtos ao mesmo pedido</button>':'')+(orderUrl?'<button type="button" class="'+(safeAddon?'secondary':'primary')+'" id="stockAdjustmentOrder">Ver meu pedido</button>':'')+'<button type="button" class="secondary" id="stockAdjustmentStore">Voltar à vitrine</button></div>';
    document.querySelector('#stockAdjustmentAddon')?.addEventListener('click',()=>{pendingAdjustment=null;window.location.assign(safeAddon)});
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
            // The server validates these fields to preserve the selected identity
            // even if a legacy phone lookup is ambiguous. A customer ID is not proof.
            body.checkout_registration=draft;
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
    organizeCheckoutSections();refreshCheckoutPresentation();
    const fallback=document.querySelector?.('.wa-fallback');if(fallback&&pendingWhatsappReturnUrl)fallback.href=pendingWhatsappReturnUrl;
    const toast=document.querySelector?.('#toast');if(!toast||!pendingSubmitError)return;
    const text=String(toast.textContent||'');if(text.includes('Não consegui registrar')||text.includes('O estoque mudou. Atualize a cesta'))toast.textContent=humanError(pendingSubmitError);
  });
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  originalSetTimeout(()=>{organizeCheckoutSections();refreshCheckoutPresentation()},0);

  window.__DA_CHECKOUT_RESILIENCE__={CUTOFF_HOUR,applyStockAdjustment,confirmStockAdjustment,formatUnifiedPhone,liveCheckoutPhone,checkoutRegistrationDraft,registrationDraftComplete,existingRegistrationComplete,validateCheckoutBasics,showCheckoutValidation};
})();

// Public storefront recovery for constrained in-app browsers (Instagram/Facebook webviews).
if (!window.__DA_INSTAGRAM_RESILIENCE_LOADED__) {
  window.__DA_INSTAGRAM_RESILIENCE_LOADED__ = true;
  const s=document.createElement('script');
  s.src='/vitrine/instagram-resilience.js?v=20261005-1';
  s.defer=true;
  document.head.appendChild(s);
}
