import fs from 'node:fs';

const storefrontFiles=['index.html','vitrine/index.html'];

function replaceLine(source,pattern,replacement,label){
  if(!pattern.test(source))throw new Error(label+' not found');
  return source.replace(pattern,replacement);
}

function patchStorefront(path){
  let s=fs.readFileSync(path,'utf8');

  s=replaceLine(s,/^    function customerLookupResultHtml\(\)\{.*\}$/m,
    "    function customerLookupResultHtml(){const lookup=state.customerLookup;if(lookup.status==='loading')return '<span>Consultando…</span>';if(lookup.status==='found')return '<span>✓ Cadastro encontrado</span>';if(lookup.status==='new')return '<span>Novo cliente</span>';if(lookup.status==='error')return '<span>Não consegui consultar.</span>';return '<span>Digite seu WhatsApp.</span>'}",
    'customerLookupResultHtml');

  const lookupNeedle="state.editRegistration=data.found?data.customer?.registration_complete!==true:true;try{sessionStorage.setItem(WHATSAPP_PHONE_KEY,info.full)}catch{}paintCheckout();";
  const lookupReplacement="state.editRegistration=data.found?data.customer?.registration_complete!==true:true;state.addressConfirmed=data.found&&data.customer?.registration_complete===true;try{sessionStorage.setItem(WHATSAPP_PHONE_KEY,info.full)}catch{}paintCheckout();";
  if(!s.includes(lookupNeedle))throw new Error('lookup state transition not found');
  s=s.replace(lookupNeedle,lookupReplacement);

  s=replaceLine(s,/^    function registrationFormHtml\(\)\{.*\}$/m,
    "    function registrationFormHtml(){const c=state.customerLookup.customer||{},a=c.address||{},name=c.display_name||state.checkoutName||'',city=a.city||'',marketingChecked=state.customerLookup.status==='new'||c.marketing_opt_in===true;return '<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px\"><label class=\"wa-field\" style=\"grid-column:1/-1\"><span>Nome completo</span><input id=\"checkoutName\" maxlength=\"180\" value=\"'+esc(name)+'\"></label><label class=\"wa-field\"><span>CPF/CNPJ</span><input id=\"checkoutDocument\" inputmode=\"numeric\" maxlength=\"18\" placeholder=\"CPF ou CNPJ\"></label><label class=\"wa-field\" style=\"grid-column:1/-1\"><span>Rua</span><input id=\"checkoutStreet\" maxlength=\"180\" value=\"'+esc(a.street||'')+'\"></label><label class=\"wa-field\"><span>Número</span><input id=\"checkoutNumber\" maxlength=\"40\" value=\"'+esc(a.number||'')+'\"></label><label class=\"wa-field\"><span>Bairro</span><input id=\"checkoutNeighborhood\" maxlength=\"120\" value=\"'+esc(a.neighborhood||a.district||'')+'\"></label><label class=\"wa-field\"><span>Cidade</span><select id=\"checkoutCity\" style=\"width:100%;height:42px;border:1px solid #d7dfd9;border-radius:9px;background:#fff;padding:0 9px\"><option value=\"\">Selecione</option><option '+(city==='Cuiabá'?'selected':'')+'>Cuiabá</option><option '+(city==='Várzea Grande'?'selected':'')+'>Várzea Grande</option></select></label><label class=\"wa-field\"><span>CEP (opcional)</span><input id=\"checkoutPostal\" inputmode=\"numeric\" maxlength=\"9\" value=\"'+esc(a.postal_code||'')+'\"></label><label class=\"wa-field\" style=\"grid-column:1/-1\"><span>Complemento (opcional)</span><input id=\"checkoutComplement\" maxlength=\"180\" value=\"'+esc(a.complement||'')+'\"></label><label class=\"wa-field\" style=\"grid-column:1/-1\"><span>Referência (opcional)</span><input id=\"checkoutReference\" maxlength=\"220\" value=\"'+esc(a.reference||'')+'\"></label><label class=\"checkout-marketing-choice\" style=\"grid-column:1/-1\"><input id=\"checkoutMarketing\" type=\"checkbox\" '+(marketingChecked?'checked':'')+'> Quero receber ofertas semanais por WhatsApp</label><button type=\"button\" class=\"wa-consult\" style=\"grid-column:1/-1\" id=\"saveCheckoutRegistration\">Salvar cadastro</button></div>'}",
    'registrationFormHtml');

  s=replaceLine(s,/^    function checkoutMarketingPreferenceHtml\(\)\{.*\}$/m,
    "    function checkoutMarketingPreferenceHtml(){const c=state.customerLookup.customer;if(state.customerLookup.status!=='found'||c?.registration_complete!==true||state.editRegistration)return '';return '<label class=\"checkout-marketing-choice\"><input id=\"checkoutMarketingExisting\" type=\"checkbox\" '+(c.marketing_opt_in?'checked':'')+'> Quero receber ofertas semanais por WhatsApp</label>'}",
    'checkoutMarketingPreferenceHtml');

  s=replaceLine(s,/^    function registrationSectionHtml\(\)\{.*\}$/m,
    "    function registrationSectionHtml(){const lookup=state.customerLookup;if(lookup.status==='found'&&lookup.customer?.registration_complete===true&&!state.editRegistration){const a=customerAddressLine(lookup.customer);return '<div class=\"rule-notice\"><strong>Endereço da entrega</strong>'+esc(a||'Endereço não informado')+'<div style=\"margin-top:8px\"><button type=\"button\" class=\"secondary\" id=\"editAddress\" style=\"min-height:42px\">Trocar endereço</button></div></div>'}if(lookup.status==='new'||lookup.status==='found')return registrationFormHtml();return ''}",
    'registrationSectionHtml');

  const saveMatch=s.match(/^    async function saveCheckoutRegistration\(\)\{.*\}$/m);
  if(!saveMatch)throw new Error('saveCheckoutRegistration not found');
  const marketingFn="\n    async function saveCheckoutMarketingPreference(checked){const info=checkoutPhoneData(),c=state.customerLookup.customer,a=c?.address||{},box=$('#checkoutMarketingExisting');if(!info.valid||state.customerLookup.status!=='found'||c?.registration_complete!==true){if(box)box.checked=!checked;return}if(box)box.disabled=true;const payload={source:'checkout',phone:info.full,name:c.display_name||state.checkoutName||'',street:a.street||'',number:a.number||'',neighborhood:a.neighborhood||a.district||'',city:a.city||'',postal_code:a.postal_code||'',complement:a.complement||'',reference:a.reference||'',marketing_opt_in:checked};try{const data=await api('customer_register',{}, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});state.customerLookup={status:'found',phoneKey:info.key,customer:data.customer};state.checkoutName=data.customer?.display_name||payload.name;state.addressConfirmed=true}catch{if(box)box.checked=!checked;toast('Não consegui salvar essa preferência.')}finally{if(box)box.disabled=false}}";
  s=s.replace(saveMatch[0],saveMatch[0]+marketingFn);

  s=replaceLine(s,/^    async function loadDeliveryOptions\(\)\{.*\}$/m,
    "    async function loadDeliveryOptions(){try{const d=await api('delivery_options',{}, {cache:'no-store'});state.deliveryOptions=Array.isArray(d.options)?d.options:[];if(!state.checkoutDeliveryDate||!state.deliveryOptions.some(x=>x.date===state.checkoutDeliveryDate))state.checkoutDeliveryDate=state.deliveryOptions[0]?.date||''}catch{state.deliveryOptions=[];state.checkoutDeliveryDate=''}}",
    'loadDeliveryOptions');

  const paintStart="function paintCheckout(){if(!state.cart.length){renderCart();return}sheetTitle.textContent='Seu pedido';";
  if(!s.includes(paintStart))throw new Error('paintCheckout start not found');
  s=s.replace(paintStart,"function paintCheckout(){if(!state.cart.length){renderCart();return}const previousCheckoutScrollTop=sheetBody.scrollTop||0;sheetTitle.textContent='Seu pedido';");

  const confirmHandler="if($('#confirmAddress'))$('#confirmAddress').onclick=()=>{state.addressConfirmed=true;$('#confirmAddress').textContent='Endereço confirmado ✓';updateCheckoutSubmitState()};";
  s=s.replace(confirmHandler,'');
  const oldMarketingHandler="if($('#editMarketingPreference'))$('#editMarketingPreference').onclick=()=>{state.editRegistration=true;state.addressConfirmed=false;paintCheckout()};";
  s=s.replace(oldMarketingHandler,'');
  const editHandler="if($('#editAddress'))$('#editAddress').onclick=()=>{state.editRegistration=true;state.addressConfirmed=false;paintCheckout()};";
  if(!s.includes(editHandler))throw new Error('editAddress handler not found');
  s=s.replace(editHandler,editHandler+"if($('#checkoutMarketingExisting'))$('#checkoutMarketingExisting').onchange=()=>saveCheckoutMarketingPreference($('#checkoutMarketingExisting').checked);");

  const paintEnd="attachProductDetailHandlers(sheetBody);$('#addMoreCheckout').onclick=closeSheet;$('#sendWhats').onclick=sendWhatsApp;updateCheckoutSubmitState()}";
  if(!s.includes(paintEnd))throw new Error('paintCheckout end not found');
  s=s.replace(paintEnd,"attachProductDetailHandlers(sheetBody);$('#addMoreCheckout').onclick=closeSheet;$('#sendWhats').onclick=sendWhatsApp;updateCheckoutSubmitState();sheetBody.scrollTop=previousCheckoutScrollTop}");

  fs.writeFileSync(path,s);
}

for(const path of storefrontFiles)patchStorefront(path);

let ux=fs.readFileSync('checkout-resilience.js','utf8');
ux=ux.replace("      .da-checkout-helper{margin:0 0 10px;padding:10px 11px;border-radius:11px;background:#f6f8f6;color:#59645d;font-size:13px;line-height:1.4}\n",'');
ux=ux.replace("      .da-address-confirm{font-size:14px!important}.da-address-confirm>div{display:grid!important;grid-template-columns:minmax(0,1fr) auto;gap:9px!important}\n      #confirmAddress{min-height:52px!important;background:#176b43!important;color:#fff!important;font-size:14px!important}#editAddress{min-height:52px!important;font-size:13px!important}\n",
"      .da-address-confirm{font-size:14px!important}.da-address-confirm>div{margin-top:8px!important}\n      #editAddress{min-height:52px!important;font-size:14px!important}\n      .checkout-marketing-choice{display:flex;align-items:center;gap:9px;margin:10px 0 2px;font-size:14px;font-weight:700;line-height:1.3}.checkout-marketing-choice input{width:22px;height:22px;flex:0 0 auto}\n");
ux=ux.replace(".da-address-confirm>div{grid-template-columns:1fr!important}","");

const organizeStart=ux.indexOf('  function organizeCheckoutSections(){');
const organizeEnd=ux.indexOf('\n  function clearCheckoutValidation(){',organizeStart);
if(organizeStart<0||organizeEnd<0)throw new Error('organizeCheckoutSections block not found');
const newOrganize=`  function organizeCheckoutSections(){
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
  }`;
ux=ux.slice(0,organizeStart)+newOrganize+ux.slice(organizeEnd);

ux=ux.replace("    }else if(completeExisting){\n      const confirm=byId('confirmAddress');if(confirm&&!/✓/.test(String(confirm.textContent||'')))issues.push(issue('confirmAddress','Confirme se este é o endereço da entrega.','confirmAddress'));\n    }\n", "    }\n");

fs.writeFileSync('checkout-resilience.js',ux);

const root=fs.readFileSync('index.html','utf8'),mirror=fs.readFileSync('vitrine/index.html','utf8');
if(root!==mirror)throw new Error('storefront mirrors diverged after patch');
console.log('calm simple checkout patch applied');
