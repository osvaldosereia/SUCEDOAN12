(()=>{
  'use strict';

  const app=window.DA_COMPRAR_APP;
  if(!app)return;
  const {state,stage,money,escapeHtml,text,toast,api,customerApi,checkoutApi}=app;
  const local={stage:null,phone:'',profile:null,selectedAddressId:null,locator:null,orderSaved:false,whatsappUrl:'',opening:false,handoffWindow:null};
  const paymentLabels={pix:'PIX',credit_card:'Cartão de crédito',meal_card:'Alimentação / refeição',cash:'Dinheiro'};

  function sectionTitle(number,title,subtitle=''){
    return `<div class="checkout-head"><span>${number}</span><div><strong>${escapeHtml(title)}</strong>${subtitle?`<small>${escapeHtml(subtitle)}</small>`:''}</div></div>`;
  }
  function addressLine(address={}){return [address.street,address.number&&`nº ${address.number}`,address.neighborhood,address.city,address.state].filter(Boolean).join(' · ')}
  function isAdminTest(){return new URLSearchParams(location.search).get('admin_test')==='1'}
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
      local.profile=null;local.selectedAddressId=null;local.locator=null;local.orderSaved=false;local.whatsappUrl='';
      document.querySelector('.stage.checkout-stage')?.remove();
      local.stage=stage(3,'Finalizar pedido','Confirme seus dados, endereço e pagamento.','checkout-stage');
      if(!local.stage)return;
      local.stage.classList.add('checkout-clean-stage');
      state.modules.help?.setCheckoutMode?.(true);
      const customer=state.checkout?.customer||state.customer||null;
      if(customer?.id){
        local.profile={customer_id:customer.id,name:customer.name||'',phone:customer.phone||'',addresses:state.checkout?.addresses||[]};
        local.phone=customer.phone||'';
      }
      render();
      app.scrollTo(local.stage,{block:'start'});
    }catch(error){toast(error.message)}
    finally{local.opening=false;setButtonBusy(button,false)}
  }

  function render(){
    const host=local.stage;if(!host)return;
    host.innerHTML=`<div class="checkout-shell"><div class="checkout-title"><h2>Finalizar pedido</h2><p>Confirme os dados abaixo. Você pode corrigir tudo aqui mesmo.</p></div><div data-checkout-body></div></div>`;
    const body=host.querySelector('[data-checkout-body]');
    if(local.profile){renderCheckoutForm(body);return}
    renderIdentification(body);
  }

  function renderIdentification(host){
    host.innerHTML=`<section class="checkout-card">${sectionTitle(1,'Identificação','Digite seu WhatsApp para localizar seu cadastro.')}<div class="checkout-form"><label><span>WhatsApp com DDD</span><input id="checkoutPhoneLookup" inputmode="tel" autocomplete="tel" placeholder="(65) 99999-9999" value="${escapeHtml(local.phone)}"></label><button id="checkoutPhoneLookupButton" class="primary" type="button">Continuar</button><small id="checkoutPhoneLookupStatus" class="muted"></small></div></section>`;
    host.querySelector('#checkoutPhoneLookupButton').onclick=lookupCustomer;
    host.querySelector('#checkoutPhoneLookup').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();host.querySelector('#checkoutPhoneLookupButton').click()}});
  }

  async function lookupCustomer(){
    const input=document.getElementById('checkoutPhoneLookup'),status=document.getElementById('checkoutPhoneLookupStatus'),button=document.getElementById('checkoutPhoneLookupButton');
    local.phone=text(input?.value);
    if(local.phone.replace(/\D/g,'').length<10){if(status)status.textContent='Digite o WhatsApp com DDD.';input?.focus();return}
    if(button?.dataset.busy==='1')return;
    setButtonBusy(button,true,'Buscando…');if(status)status.textContent='Procurando seu cadastro…';
    try{
      const data=await customerApi('lookup_customer',{phone:local.phone});
      const profile=data.profile||{customer_id:null,name:'',phone:local.phone,addresses:[]};
      local.profile={customer_id:profile.customer_id||null,name:profile.name||'',phone:profile.phone||local.phone,addresses:Array.isArray(profile.addresses)?profile.addresses:[]};
      const preferred=local.profile.addresses.find(item=>item.is_default)||local.profile.addresses[0]||null;
      local.selectedAddressId=preferred?.id||null;
      render();
    }catch(error){if(status)status.textContent=error.message;setButtonBusy(button,false)}
  }

  function selectedAddress(){
    const addresses=local.profile?.addresses||[];
    return addresses.find(item=>String(item.id)===String(local.selectedAddressId))||addresses.find(item=>item.is_default)||addresses[0]||{};
  }

  function renderCheckoutForm(host){
    const profile=local.profile||{customer_id:null,name:'',phone:local.phone,addresses:[]},address=selectedAddress();
    const addressChoices=(profile.addresses||[]).map(item=>`<button type="button" class="chip ${String(item.id)===String(local.selectedAddressId)?'active':''}" data-checkout-address="${escapeHtml(item.id)}">${escapeHtml(item.label||addressLine(item)||'Endereço')}</button>`).join('');
    const total=state.checkout?.cart?.total??state.checkout?.cart?.commercial_total??state.cart?.total??state.cart?.commercial_total??0;
    host.innerHTML=`<section class="checkout-card checkout-unified">${sectionTitle(1,profile.customer_id?'Confira seu cadastro':'Complete seu cadastro',profile.customer_id?'Encontramos estes dados. Corrija o que precisar.':'Preencha os dados para entrega.')}<div class="checkout-form checkout-grid"><label class="wide"><span>Nome</span><input id="checkoutName" autocomplete="name" value="${escapeHtml(profile.name||'')}"></label><label class="wide"><span>WhatsApp</span><input id="checkoutPhone" inputmode="tel" autocomplete="tel" value="${escapeHtml(profile.phone||local.phone||'')}"></label>${addressChoices?`<div class="wide checkout-address-choices"><span>Endereço salvo</span><div class="chips">${addressChoices}<button type="button" class="chip" id="checkoutNewAddress">Novo endereço</button></div></div>`:''}<label class="wide"><span>Rua</span><input id="checkoutStreet" value="${escapeHtml(address.street||'')}"></label><label><span>Número</span><input id="checkoutNumber" value="${escapeHtml(address.number||'')}"></label><label><span>Bairro</span><input id="checkoutNeighborhood" value="${escapeHtml(address.neighborhood||'')}"></label><label class="wide"><span>Complemento</span><input id="checkoutComplement" value="${escapeHtml(address.complement||'')}"></label><label class="wide"><span>Referência</span><input id="checkoutReference" value="${escapeHtml(address.reference||'')}"></label><label><span>Cidade</span><input id="checkoutCity" value="${escapeHtml(address.city||'Cuiabá')}"></label><label><span>UF</span><input id="checkoutState" maxlength="2" value="${escapeHtml(address.state||'MT')}"></label><label class="wide"><span>CEP</span><input id="checkoutPostal" inputmode="numeric" value="${escapeHtml(address.postal_code||'')}"></label></div><button id="checkoutLocation" class="secondary" type="button">📍 Usar minha localização</button><small id="checkoutLocationStatus" class="muted"></small><div class="checkout-payment-block">${sectionTitle(2,'Forma de pagamento','Escolha como vai pagar na entrega.')}<div class="checkout-payments"></div></div><div class="checkout-summary-line total"><span>Total do pedido</span><strong>${money(total)}</strong></div><button id="checkoutConfirmOrder" class="confirm" type="button">Confirmar e enviar pedido</button><small id="checkoutConfirmStatus" class="muted"></small></section>`;

    host.querySelectorAll('[data-checkout-address]').forEach(button=>button.onclick=()=>selectAddress(button.dataset.checkoutAddress));
    host.querySelector('#checkoutNewAddress')?.addEventListener('click',()=>{local.selectedAddressId=null;fillAddress({city:'Cuiabá',state:'MT'})});
    host.querySelector('#checkoutLocation').onclick=requestLocation;
    const grid=host.querySelector('.checkout-payments');
    for(const [key,label] of Object.entries(paymentLabels)){
      const button=document.createElement('button');button.type='button';button.dataset.payment=key;button.className=`pay ${state.payment===key?'active':''}`;button.textContent=label;
      button.onclick=()=>{state.payment=key;host.querySelectorAll('[data-payment]').forEach(item=>item.classList.toggle('active',item.dataset.payment===key))};
      grid.appendChild(button);
    }
    host.querySelector('#checkoutConfirmOrder').onclick=()=>confirmAndSend(host.querySelector('#checkoutConfirmOrder'));
  }

  function selectAddress(id){
    local.selectedAddressId=id||null;
    const address=(local.profile?.addresses||[]).find(item=>String(item.id)===String(id));
    if(address)fillAddress(address);
    document.querySelectorAll('[data-checkout-address]').forEach(button=>button.classList.toggle('active',String(button.dataset.checkoutAddress)===String(local.selectedAddressId)));
  }

  function fillAddress(address={}){
    for(const [id,key,fallback] of [['checkoutStreet','street',''],['checkoutNumber','number',''],['checkoutNeighborhood','neighborhood',''],['checkoutComplement','complement',''],['checkoutReference','reference',''],['checkoutCity','city','Cuiabá'],['checkoutState','state','MT'],['checkoutPostal','postal_code','']]){
      const input=document.getElementById(id);if(input)input.value=address[key]||fallback;
    }
  }

  async function requestLocation(){
    const status=document.getElementById('checkoutLocationStatus');
    if(!navigator.geolocation){if(status)status.textContent='Localização indisponível neste aparelho.';return}
    if(status)status.textContent='Localizando…';
    navigator.geolocation.getCurrentPosition(async position=>{
      local.locator={latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy_m:Math.round(position.coords.accuracy||0),captured_at:new Date().toISOString()};
      try{
        const data=await customerApi('reverse_geocode',{latitude:local.locator.latitude,longitude:local.locator.longitude});
        local.selectedAddressId=null;fillAddress(data.address||{});if(status)status.textContent='Endereço localizado. Confira e complete se necessário.';
      }catch{if(status)status.textContent='Localização recebida. Complete o endereço manualmente.'}
    },()=>{if(status)status.textContent='Não consegui obter sua localização. Preencha manualmente.'},{enableHighAccuracy:true,timeout:10000,maximumAge:60000});
  }

  function readCheckoutForm(){
    return {
      name:text(document.getElementById('checkoutName')?.value),
      phone:text(document.getElementById('checkoutPhone')?.value),
      payment_method:state.payment||'',
      address:{street:text(document.getElementById('checkoutStreet')?.value),number:text(document.getElementById('checkoutNumber')?.value),neighborhood:text(document.getElementById('checkoutNeighborhood')?.value),complement:text(document.getElementById('checkoutComplement')?.value),reference:text(document.getElementById('checkoutReference')?.value),city:text(document.getElementById('checkoutCity')?.value),state:text(document.getElementById('checkoutState')?.value).toUpperCase()||'MT',postal_code:text(document.getElementById('checkoutPostal')?.value)}
    };
  }

  function validateCheckoutForm(form){
    if(!form.name||form.name.length<2)throw new Error('Informe seu nome.');
    if(form.phone.replace(/\D/g,'').length<10)throw new Error('Informe seu WhatsApp com DDD.');
    if(!form.address.street||!form.address.number||!form.address.city)throw new Error('Informe rua, número e cidade.');
    if(!form.payment_method||!paymentLabels[form.payment_method])throw new Error('Escolha como vai pagar na entrega.');
  }

  function buildWhatsAppUrl(data={},form=readCheckoutForm()){
    const order=data.order||{},checkout=state.checkout||{},items=checkout.items||[];
    const total=checkout.cart?.total??checkout.cart?.commercial_total??order.total??state.cart?.total??state.cart?.commercial_total??0;
    const orderNumber=order.order_number||order.number||order.order_id||'';
    const lines=[];
    lines.push(orderNumber?`*PEDIDO #${orderNumber}*`:'*NOVO PEDIDO - DONA ANTÔNIA*');
    lines.push(`*Cliente:* ${form.name}`);
    lines.push(`*WhatsApp:* ${form.phone}`);
    if(addressLine(form.address))lines.push(`*Entrega:* ${addressLine(form.address)}`);
    if(form.address.complement)lines.push(`*Complemento:* ${form.address.complement}`);
    if(form.address.reference)lines.push(`*Referência:* ${form.address.reference}`);
    if(form.address.postal_code)lines.push(`*CEP:* ${form.address.postal_code}`);
    lines.push(`*Pagamento:* ${paymentLabels[form.payment_method]||form.payment_method}`,'','*ITENS:*');
    for(const item of items){const quantity=Number(item.quantity||0),name=item.name||item.product?.name||'Produto';if(quantity>0)lines.push(`• ${quantity}x ${name}`)}
    lines.push('',`*TOTAL:* ${money(total)}`);
    const base=app.config.whatsappFallback||'https://wa.me/5565998150975';
    return `${base}${base.includes('?')?'&':'?'}text=${encodeURIComponent(lines.join('\n'))}`;
  }

  function reserveWhatsAppWindow(){
    if(isAdminTest())return null;
    try{
      const target=window.open('about:blank','da_whatsapp_order');
      if(target){try{target.opener=null;target.document.title='Abrindo WhatsApp';target.document.body.textContent='Salvando seu pedido…'}catch{} }
      return target;
    }catch{return null}
  }

  function openSavedWhatsApp(){
    if(isAdminTest()||!local.whatsappUrl)return;
    if(local.handoffWindow&&!local.handoffWindow.closed){
      try{local.handoffWindow.location.replace(local.whatsappUrl);local.handoffWindow=null;return}catch{}
    }
    location.replace(local.whatsappUrl);
  }

  function closeReservedWindow(){if(local.handoffWindow&&!local.handoffWindow.closed){try{local.handoffWindow.close()}catch{}}local.handoffWindow=null}

  async function confirmAndSend(button){
    if(local.orderSaved){openSavedWhatsApp();return}
    if(button?.dataset.busy==='1')return;
    const status=document.getElementById('checkoutConfirmStatus'),form=readCheckoutForm();
    try{validateCheckoutForm(form)}catch(error){if(status)status.textContent=error.message;return}
    local.handoffWindow=reserveWhatsAppWindow();
    setButtonBusy(button,true,'Salvando pedido…');if(status)status.textContent='Salvando cadastro, endereço e pedido…';
    try{
      const customerResult=await customerApi('commit_customer',{customer_id:local.profile?.customer_id||null,name:form.name,phone:form.phone});
      state.checkout=customerResult.checkout||state.checkout;state.customer=customerResult.customer||state.customer;
      const addressResult=await checkoutApi('save_address',{delivery_address:form.address,mode:local.selectedAddressId?'replace':'add',address_id:local.selectedAddressId||null});
      state.checkout=addressResult.checkout||state.checkout;
      const paymentResult=await api('set_payment',{payment_method:form.payment_method});state.payment=paymentResult.payment_method||form.payment_method;
      const payload={payment_method:state.payment,delivery_address:form.address,save_address:true,...(local.locator?{delivery_locator:local.locator}:{})};
      const data=await app.confirmOrder(payload);
      const simulated=data.admin_test===true||isAdminTest();
      if(!simulated&&!data?.order?.order_id&&!data?.order?.order_number)throw new Error('Não consegui confirmar o número do pedido.');
      local.orderSaved=true;
      local.whatsappUrl=simulated?'':(data.whatsapp_url||buildWhatsAppUrl(data,{...form,payment_method:state.payment}));
      renderSuccess(data);
      if(!simulated)openSavedWhatsApp();else closeReservedWindow();
    }catch(error){closeReservedWindow();if(status)status.textContent=error.message;setButtonBusy(button,false)}
  }

  function renderSuccess(data){
    if(!local.stage)return;
    const order=data.order||{},simulated=data.admin_test===true||isAdminTest();
    local.stage.innerHTML=`<div class="checkout-card success ${simulated?'admin-test-success':''}"><div class="check">${simulated?'🧪':'✓'}</div><h2>${simulated?'Simulação concluída':'Pedido confirmado'}</h2><p class="muted">${simulated?'Checkout validado. Nenhum pedido real foi criado.':'Seu pedido foi salvo. Se o WhatsApp não abriu automaticamente, use o botão abaixo.'}</p>${order.order_number||order.number?`<strong>Pedido #${escapeHtml(order.order_number||order.number)}</strong>`:''}${!simulated&&local.whatsappUrl?`<a class="checkout-whatsapp-return primary" href="${escapeHtml(local.whatsappUrl)}" target="_blank" rel="noopener">Abrir WhatsApp</a>`:''}</div>`;
    state.modules.help?.setCheckoutMode?.(true);app.scrollTo(local.stage,{block:'start'});
  }

  app.registerModule('checkout',{open,render,renderIdentification,renderCheckoutForm,requestLocation,readCheckoutForm,confirmAndSend,openSavedWhatsApp,renderSuccess});
})();
