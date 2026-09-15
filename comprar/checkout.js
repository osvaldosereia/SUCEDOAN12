(()=>{
  'use strict';

  const app=window.DA_COMPRAR_APP;
  if(!app)return;
  const {state,stage,money,escapeHtml,text,toast,api,customerApi,checkoutApi}=app;
  const local={stage:null,phone:'',address:null,addressConfirmed:false,editing:null,locator:null,orderSaved:false,whatsappUrl:'',opening:false};

  const paymentLabels={pix:'PIX',credit_card:'Cartão de crédito',meal_card:'Alimentação / refeição',cash:'Dinheiro'};

  function sectionTitle(number,title,subtitle=''){
    return `<div class="checkout-head"><span>${number}</span><div><strong>${escapeHtml(title)}</strong>${subtitle?`<small>${escapeHtml(subtitle)}</small>`:''}</div></div>`;
  }

  function addressLine(address={}){
    return [address.street,address.number&&`nº ${address.number}`,address.neighborhood,address.city,address.state].filter(Boolean).join(' · ');
  }

  function setButtonBusy(button,busy,busyText='Carregando…'){
    if(!button)return;
    if(busy){button.dataset.busy='1';button.dataset.label=button.textContent;button.disabled=true;button.textContent=busyText}
    else{button.dataset.busy='0';button.disabled=false;if(button.dataset.label)button.textContent=button.dataset.label}
  }

  async function refreshCheckout(){
    const data=await api('checkout_preview');
    state.checkout=data.checkout||{};
    state.payment=data.payment_method||state.payment||null;
    return state.checkout;
  }

  async function open(button){
    if(local.opening||button?.dataset.busy==='1')return;
    local.opening=true;setButtonBusy(button,true,'Abrindo pedido…');
    try{
      await state.modules.products?.waitForPending?.();
      await refreshCheckout();
      local.address=null;local.addressConfirmed=false;local.editing=null;
      document.querySelector('.stage.checkout-stage')?.remove();
      local.stage=stage(3,'Finalizar pedido','Confirme cadastro, entrega e pagamento.','checkout-stage');
      if(!local.stage)return;
      local.stage.classList.add('checkout-clean-stage');
      state.modules.help?.setCheckoutMode?.(true);
      render();
      app.scrollTo(local.stage,{block:'start'});
    }catch(error){toast(error.message)}
    finally{local.opening=false;setButtonBusy(button,false)}
  }

  function render(){
    const host=local.stage;if(!host)return;
    const checkout=state.checkout||{},customer=checkout.customer||state.customer||null;
    host.innerHTML=`<div class="checkout-shell"><div class="checkout-title"><h2>Finalizar pedido</h2><p>Confirme os dados abaixo. É rápido.</p></div><div data-checkout-body></div></div>`;
    const body=host.querySelector('[data-checkout-body]');
    if(!customer?.id){renderIdentification(body);return}
    state.customer=customer;
    renderAddress(body);
  }

  function renderIdentification(host){
    host.innerHTML=`<section class="checkout-card">${sectionTitle(1,'Identificação','Digite seu WhatsApp para localizar seu cadastro.')}<div class="checkout-form"><label><span>WhatsApp com DDD</span><input id="checkoutPhoneLookup" inputmode="tel" autocomplete="tel" placeholder="(65) 99999-9999" value="${escapeHtml(local.phone)}"></label><button id="checkoutPhoneLookupButton" class="primary" type="button">Continuar</button><small id="checkoutPhoneLookupStatus" class="muted"></small></div></section>`;
    host.querySelector('#checkoutPhoneLookupButton').onclick=lookupCustomer;
  }

  async function lookupCustomer(){
    const input=document.getElementById('checkoutPhoneLookup'),status=document.getElementById('checkoutPhoneLookupStatus'),button=document.getElementById('checkoutPhoneLookupButton');
    local.phone=text(input?.value);
    if(local.phone.replace(/\D/g,'').length<10){if(status)status.textContent='Digite o WhatsApp com DDD.';input?.focus();return}
    if(button?.dataset.busy==='1')return;
    setButtonBusy(button,true,'Buscando…');if(status)status.textContent='Procurando seu cadastro…';
    try{
      const data=await customerApi('lookup_customer',{phone:local.phone});
      if(data.verified&&data.checkout){state.checkout=data.checkout;state.customer=data.checkout.customer||state.customer;render();return}
      if(data.found&&data.verification_required){renderVerification(data);return}
      renderNewCustomer();
    }catch(error){if(status)status.textContent=error.message;setButtonBusy(button,false)}
  }

  function renderVerification(data){
    const host=local.stage?.querySelector('[data-checkout-body]');if(!host)return;
    const href=data.whatsapp_url||app.config.whatsappFallback||'#';
    host.innerHTML=`<section class="checkout-card">${sectionTitle(1,'Confirmar cadastro','Por segurança, confirme pelo seu próprio WhatsApp.')}<p class="checkout-note">Encontramos seu cadastro. Abra o WhatsApp, envie a mensagem pronta e depois volte para esta tela.</p><a id="checkoutVerifyWhatsApp" class="primary checkout-link" href="${escapeHtml(href)}">Confirmar pelo WhatsApp</a><button id="checkoutVerifyAgain" class="secondary" type="button">Verificar novamente</button><small id="checkoutVerifyStatus" class="muted">Aguardando confirmação.</small></section>`;
    const link=host.querySelector('#checkoutVerifyWhatsApp');link.onclick=event=>{event.preventDefault();location.assign(link.href)};
    host.querySelector('#checkoutVerifyAgain').onclick=checkVerification;
  }

  async function checkVerification(){
    const status=document.getElementById('checkoutVerifyStatus'),button=document.getElementById('checkoutVerifyAgain');
    if(button?.dataset.busy==='1')return;
    setButtonBusy(button,true,'Verificando…');if(status)status.textContent='Verificando confirmação…';
    try{
      const data=await customerApi('verification_status');
      if(data.verified&&data.checkout){state.checkout=data.checkout;state.customer=data.checkout.customer||state.customer;render();return}
      if(status)status.textContent='Ainda não chegou. Envie a mensagem pronta pelo WhatsApp.';
    }catch(error){if(status)status.textContent=error.message}
    finally{setButtonBusy(button,false)}
  }

  function renderNewCustomer(){
    const host=local.stage?.querySelector('[data-checkout-body]');if(!host)return;
    const needsDocument=state.checkout?.requires_document!==false;
    host.innerHTML=`<section class="checkout-card">${sectionTitle(1,'Seu cadastro','Não encontrei esse número. Complete os dados para continuar.')}<div class="checkout-form"><label><span>Nome</span><input id="checkoutName" autocomplete="name"></label><label><span>WhatsApp</span><input id="checkoutPhone" inputmode="tel" value="${escapeHtml(local.phone)}"></label>${needsDocument?'<label><span>CPF</span><input id="checkoutDocument" inputmode="numeric" placeholder="Somente números"></label>':''}<button id="checkoutIdentify" class="primary" type="button">Salvar e continuar</button><small id="checkoutIdentifyStatus" class="muted"></small></div></section>`;
    host.querySelector('#checkoutIdentify').onclick=identifyNew;
  }

  async function identifyNew(){
    const button=document.getElementById('checkoutIdentify'),status=document.getElementById('checkoutIdentifyStatus');
    if(button?.dataset.busy==='1')return;
    setButtonBusy(button,true,'Salvando…');if(status)status.textContent='Salvando cadastro…';
    try{
      await api('identify',{name:text(document.getElementById('checkoutName')?.value),phone:text(document.getElementById('checkoutPhone')?.value),document:text(document.getElementById('checkoutDocument')?.value)||null});
      await refreshCheckout();
      state.customer=state.checkout?.customer||state.customer;
      render();
    }catch(error){if(status)status.textContent=error.message;setButtonBusy(button,false)}
  }

  function renderAddress(host){
    const addresses=state.checkout?.addresses||[];
    const cards=addresses.map(address=>`<article class="checkout-address ${local.address?.id===address.id&&local.addressConfirmed?'selected':''}"><div><strong>${escapeHtml(address.label||'Endereço')}</strong><p>${escapeHtml(addressLine(address))}</p>${address.complement?`<small>${escapeHtml(address.complement)}</small>`:''}</div><div class="checkout-address-actions"><button class="primary" type="button" data-use-address="${escapeHtml(address.id)}">Entregar aqui</button><button class="text-button" type="button" data-edit-address="${escapeHtml(address.id)}">Editar</button></div></article>`).join('');
    host.innerHTML=`<section class="checkout-card">${sectionTitle(2,'Endereço de entrega','Confirme onde devemos entregar.')}<div class="checkout-address-list">${cards||'<p class="checkout-note">Você ainda não tem endereço salvo.</p>'}</div><button class="secondary" type="button" id="checkoutNewAddress">${addresses.length?'Usar outro endereço':'Cadastrar endereço'}</button><div id="checkoutAddressEditor"></div></section><div id="checkoutAfterAddress"></div>`;
    host.querySelectorAll('[data-use-address]').forEach(button=>button.onclick=()=>useAddress(button.dataset.useAddress));
    host.querySelectorAll('[data-edit-address]').forEach(button=>button.onclick=()=>editAddress(button.dataset.editAddress));
    host.querySelector('#checkoutNewAddress').onclick=()=>showAddressEditor(null);
    if(local.addressConfirmed)renderPayment();
  }

  function useAddress(id){
    const address=(state.checkout?.addresses||[]).find(item=>String(item.id)===String(id));
    if(!address)return;
    local.address={...address};local.addressConfirmed=true;local.editing=null;
    renderAddress(local.stage.querySelector('[data-checkout-body]'));
  }

  function editAddress(id){
    const address=(state.checkout?.addresses||[]).find(item=>String(item.id)===String(id));
    if(address)showAddressEditor(address);
  }

  function showAddressEditor(address){
    local.editing=address||null;
    const host=document.getElementById('checkoutAddressEditor');if(!host)return;
    const value=address||{};
    host.innerHTML=`<div class="checkout-editor"><div class="checkout-editor-head"><strong>${address?'Editar endereço':'Novo endereço'}</strong><button id="checkoutCancelAddress" type="button">×</button></div><div class="checkout-grid"><label class="wide"><span>Rua</span><input id="checkoutStreet" value="${escapeHtml(value.street||'')}"></label><label><span>Número</span><input id="checkoutNumber" value="${escapeHtml(value.number||'')}"></label><label><span>Bairro</span><input id="checkoutNeighborhood" value="${escapeHtml(value.neighborhood||'')}"></label><label class="wide"><span>Complemento</span><input id="checkoutComplement" value="${escapeHtml(value.complement||'')}"></label><label class="wide"><span>Referência</span><input id="checkoutReference" value="${escapeHtml(value.reference||'')}"></label><label><span>Cidade</span><input id="checkoutCity" value="${escapeHtml(value.city||'Cuiabá')}"></label><label><span>UF</span><input id="checkoutState" value="${escapeHtml(value.state||'MT')}"></label><label class="wide"><span>CEP</span><input id="checkoutPostal" inputmode="numeric" value="${escapeHtml(value.postal_code||'')}"></label></div><button id="checkoutLocation" class="secondary" type="button">📍 Usar minha localização</button><small id="checkoutLocationStatus" class="muted"></small>${address?'<div class="checkout-save-choice"><label><input type="radio" name="checkoutSaveMode" value="replace" checked> Substituir este endereço</label><label><input type="radio" name="checkoutSaveMode" value="add"> Adicionar como outro endereço</label></div>':''}<button id="checkoutSaveAddress" class="primary" type="button">Salvar endereço</button><small id="checkoutAddressStatus" class="muted"></small></div>`;
    host.querySelector('#checkoutCancelAddress').onclick=()=>{host.innerHTML=''};
    host.querySelector('#checkoutLocation').onclick=requestLocation;
    host.querySelector('#checkoutSaveAddress').onclick=saveAddress;
  }

  function addressForm(){
    return {street:text(document.getElementById('checkoutStreet')?.value),number:text(document.getElementById('checkoutNumber')?.value),neighborhood:text(document.getElementById('checkoutNeighborhood')?.value),complement:text(document.getElementById('checkoutComplement')?.value),reference:text(document.getElementById('checkoutReference')?.value),city:text(document.getElementById('checkoutCity')?.value),state:text(document.getElementById('checkoutState')?.value)||'MT',postal_code:text(document.getElementById('checkoutPostal')?.value)};
  }

  async function saveAddress(){
    const button=document.getElementById('checkoutSaveAddress'),status=document.getElementById('checkoutAddressStatus'),mode=document.querySelector('input[name="checkoutSaveMode"]:checked')?.value||'add',address=addressForm();
    if(!address.street||!address.number||!address.city){if(status)status.textContent='Informe rua, número e cidade.';return}
    if(button?.dataset.busy==='1')return;
    setButtonBusy(button,true,'Salvando…');if(status)status.textContent='Salvando endereço…';
    try{
      const data=await checkoutApi('save_address',{delivery_address:address,mode,address_id:mode==='replace'?local.editing?.id:null});
      if(data.checkout)state.checkout=data.checkout;else await refreshCheckout();
      const saved=(state.checkout?.addresses||[]).find(item=>String(item.id)===String(data.address?.id));
      local.address=saved||{...address,id:data.address?.id};local.addressConfirmed=true;local.editing=null;
      renderAddress(local.stage.querySelector('[data-checkout-body]'));
    }catch(error){if(status)status.textContent=error.message;setButtonBusy(button,false)}
  }

  async function requestLocation(){
    const status=document.getElementById('checkoutLocationStatus');
    if(!navigator.geolocation){if(status)status.textContent='Localização indisponível neste aparelho.';return}
    if(status)status.textContent='Localizando…';
    navigator.geolocation.getCurrentPosition(async position=>{
      local.locator={latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy_m:Math.round(position.coords.accuracy||0),captured_at:new Date().toISOString()};
      try{
        const data=await customerApi('reverse_geocode',{latitude:local.locator.latitude,longitude:local.locator.longitude});
        const address=data.address||{};
        for(const [id,key] of [['checkoutStreet','street'],['checkoutNumber','number'],['checkoutNeighborhood','neighborhood'],['checkoutCity','city'],['checkoutState','state'],['checkoutPostal','postal_code']]){const input=document.getElementById(id);if(input&&address[key])input.value=address[key]}
        if(status)status.textContent='Endereço localizado. Confira os dados.';
      }catch{if(status)status.textContent='Localização recebida. Complete o endereço manualmente.'}
    },()=>{if(status)status.textContent='Não consegui obter sua localização. Preencha manualmente.'},{enableHighAccuracy:true,timeout:10000,maximumAge:60000});
  }

  function renderPayment(){
    const host=document.getElementById('checkoutAfterAddress');if(!host)return;
    host.innerHTML=`<section class="checkout-card">${sectionTitle(3,'Forma de pagamento','Escolha como vai pagar na entrega.')}<div class="checkout-payments"></div><small id="checkoutPaymentStatus" class="muted"></small></section><div id="checkoutConfirmHost"></div>`;
    const grid=host.querySelector('.checkout-payments');
    for(const [key,label] of Object.entries(paymentLabels)){
      const button=document.createElement('button');button.type='button';button.dataset.payment=key;button.className=`pay ${state.payment===key?'active':''}`;button.textContent=label;button.onclick=()=>setPayment(key,button);grid.appendChild(button);
    }
    if(state.payment)renderConfirmation();
  }

  async function setPayment(key,button){
    const status=document.getElementById('checkoutPaymentStatus');if(button?.dataset.busy==='1')return;
    setButtonBusy(button,true,'Salvando…');
    try{
      const data=await api('set_payment',{payment_method:key});state.payment=data.payment_method||key;
      document.querySelectorAll('[data-payment]').forEach(item=>item.classList.toggle('active',item.dataset.payment===state.payment));
      if(status)status.textContent=`Pagamento confirmado: ${paymentLabels[state.payment]||state.payment}.`;
      renderConfirmation();
    }catch(error){if(status)status.textContent=error.message}
    finally{setButtonBusy(button,false)}
  }

  function renderConfirmation(){
    const host=document.getElementById('checkoutConfirmHost');if(!host||!local.addressConfirmed||!state.payment)return;
    const total=state.checkout?.cart?.total??state.cart?.total??0;
    host.innerHTML=`<section class="checkout-card checkout-summary">${sectionTitle(4,'Confirmar pedido','Confira o resumo antes de enviar.')}<div class="checkout-summary-line"><span>Entrega</span><strong>${escapeHtml(addressLine(local.address))}</strong></div><div class="checkout-summary-line"><span>Pagamento</span><strong>${escapeHtml(paymentLabels[state.payment]||state.payment)}</strong></div><div class="checkout-summary-line total"><span>Total</span><strong>${money(total)}</strong></div><button id="checkoutConfirmOrder" class="confirm" type="button">Confirmar pedido</button><small id="checkoutConfirmStatus" class="muted"></small></section>`;
    host.querySelector('#checkoutConfirmOrder').onclick=()=>confirmOrder(host.querySelector('#checkoutConfirmOrder'));
  }

  async function confirmOrder(button){
    if(local.orderSaved){if(local.whatsappUrl)location.assign(local.whatsappUrl);return}
    if(!local.addressConfirmed){toast('Confirme o endereço de entrega.');return}
    if(!state.payment){toast('Escolha como vai pagar na entrega.');return}
    if(button?.dataset.busy==='1')return;
    const status=document.getElementById('checkoutConfirmStatus');setButtonBusy(button,true,'Confirmando…');if(status)status.textContent='Salvando seu pedido…';
    try{
      const payload={payment_method:state.payment,delivery_address:local.address,save_address:true,...(local.locator?{delivery_locator:local.locator}:{})};
      const data=await app.confirmOrder(payload);
      local.orderSaved=true;local.whatsappUrl=data.whatsapp_url||'';
      renderSuccess(data);
    }catch(error){if(status)status.textContent=error.message;setButtonBusy(button,false)}
  }

  function renderSuccess(data){
    if(!local.stage)return;
    const order=data.order||{};
    const simulated=data.admin_test===true||new URLSearchParams(location.search).get('admin_test')==='1';
    local.stage.innerHTML=`<div class="checkout-card success ${simulated?'admin-test-success':''}"><div class="check">${simulated?'🧪':'✓'}</div><h2>${simulated?'Simulação concluída':'Pedido confirmado'}</h2><p class="muted">${simulated?'Checkout validado. Nenhum pedido real foi criado.':'Seu pedido foi salvo e está pronto para confirmação no WhatsApp.'}</p>${order.order_number||order.number?`<strong>Pedido #${escapeHtml(order.order_number||order.number)}</strong>`:''}${!simulated&&local.whatsappUrl?`<a class="checkout-whatsapp-return primary" href="${escapeHtml(local.whatsappUrl)}">Continuar no WhatsApp</a>`:''}</div>`;
    state.modules.help?.setCheckoutMode?.(true);
    app.scrollTo(local.stage,{block:'start'});
  }

  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&document.getElementById('checkoutVerifyStatus'))checkVerification()});

  app.registerModule('checkout',{open,render,renderIdentification,renderVerification,renderNewCustomer,renderAddress,renderPayment,requestLocation,confirmOrder,renderSuccess});
})();
