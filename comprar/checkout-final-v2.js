(()=>{
  'use strict';
  const C=window.DA_SHOPPING_ROOM_CONFIG||{};
  if(!C.api||!C.customerApi)return;
  const nativeFetch=window.fetch.bind(window);
  const params=new URLSearchParams(location.search);
  const token=()=>params.get('s')||params.get('c')||params.get('token')||'';
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const paymentLabel=v=>({pix:'PIX',credit_card:'Cartão de crédito',meal_card:'Alimentação / refeição',cash:'Dinheiro'})[String(v||'')]||'Não informado';
  const state={checkout:null,payment:null,address:null,addressConfirmed:false,locator:null,editing:null,saveMode:'add',phone:'',verifyTimer:null,orderSaved:false,whatsappUrl:'',mountedStage:null,busy:false};

  function parseBody(body){if(typeof body!=='string')return null;try{return JSON.parse(body)}catch{return null}}
  window.fetch=async(input,init={})=>{
    const response=await nativeFetch(input,init);
    const url=typeof input==='string'?input:input?.url||'',body=parseBody(init?.body);
    if(url===C.api&&body?.action==='checkout_preview'&&response.ok){
      try{const d=await response.clone().json();if(d?.checkout){state.checkout=d.checkout;state.payment=d.payment_method||state.payment;queueMount()}}catch{}
    }
    return response;
  };

  async function post(url,action,payload={}){
    const r=await nativeFetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token:token(),...payload}),cache:'no-store'});
    const d=await r.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!r.ok||d.ok===false)throw new Error(String(d.detail||d.error||`Erro ${r.status}`));
    return d;
  }
  const api=(action,payload={})=>post(C.api,action,payload);
  const customerApi=(action,payload={})=>post(C.customerApi,action,payload);
  const checkoutApi=(action,payload={})=>post(C.checkoutApi||'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/shopping-checkout-v2',action,payload);

  function toast(message){const el=document.getElementById('toast');if(!el)return;el.textContent=String(message||'Não foi possível continuar.');el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),3000)}
  function stage(){return document.querySelector('.stage.checkout-stage')}
  function queueMount(){setTimeout(()=>{const s=stage();if(s&&state.checkout)mount(s)},0)}
  function sectionTitle(n,title,subtitle=''){return `<div class="checkout-v2-head"><span>${n}</span><div><strong>${esc(title)}</strong>${subtitle?`<small>${esc(subtitle)}</small>`:''}</div></div>`}
  function addressLine(a={}){return [a.street,a.number&&`nº ${a.number}`,a.neighborhood,a.city,a.state].filter(Boolean).join(' · ')}
  function itemCount(){return (state.checkout?.items||[]).reduce((n,i)=>n+Number(i.quantity||0),0)}

  function mount(s){
    if(state.mountedStage===s&&s.dataset.checkoutV2Mounted==='1')return;
    state.mountedStage=s;s.dataset.checkoutV2Mounted='1';s.innerHTML='';s.classList.add('checkout-v2-stage');
    render();
  }
  function render(){
    const s=state.mountedStage;if(!s)return;
    const c=state.checkout||{},customer=c.customer||null;
    s.innerHTML=`<div class="checkout-v2-shell"><div class="checkout-v2-title"><h2>Finalizar pedido</h2><p>Confirme os dados abaixo. É rápido.</p></div><div data-checkout-v2-body></div></div>`;
    const body=s.querySelector('[data-checkout-v2-body]');
    if(!customer){renderIdentification(body);return}
    renderAddress(body);
  }

  function renderIdentification(host){
    host.innerHTML=`<section class="checkout-v2-card">${sectionTitle(1,'Identificação','Digite seu WhatsApp para localizar seu cadastro.')}<div class="checkout-v2-form"><label><span>WhatsApp com DDD</span><input id="v2Phone" inputmode="tel" autocomplete="tel" placeholder="(65) 99999-9999" value="${esc(state.phone)}"></label><button id="v2Lookup" class="checkout-v2-primary" type="button">Continuar</button><small id="v2IdentityStatus"></small></div></section>`;
    host.querySelector('#v2Lookup').onclick=lookupCustomer;
  }

  async function lookupCustomer(){
    const input=document.getElementById('v2Phone'),status=document.getElementById('v2IdentityStatus'),button=document.getElementById('v2Lookup');state.phone=text(input?.value);if(state.phone.replace(/\D/g,'').length<10){status.textContent='Digite o WhatsApp com DDD.';return}
    button.disabled=true;status.textContent='Procurando seu cadastro…';
    try{
      const d=await customerApi('lookup_customer',{phone:state.phone});
      if(d.verified&&d.checkout){state.checkout=d.checkout;render();return}
      if(d.found&&d.verification_required){renderVerification(d);return}
      renderNewCustomer();
    }catch(e){status.textContent=String(e.message||e);button.disabled=false}
  }

  function renderVerification(data){
    const host=state.mountedStage.querySelector('[data-checkout-v2-body]');host.innerHTML=`<section class="checkout-v2-card">${sectionTitle(1,'Confirmar cadastro','Por segurança, confirme pelo seu próprio WhatsApp.')}<p class="checkout-v2-note">Encontramos seu cadastro. Abra o WhatsApp e envie a mensagem pronta; depois volte para esta tela.</p><a id="v2VerifyWhatsApp" class="checkout-v2-primary checkout-v2-link" href="${esc(data.whatsapp_url||C.whatsappFallback||'#')}">Confirmar pelo WhatsApp</a><button id="v2VerifyAgain" class="checkout-v2-secondary" type="button">Verificar novamente</button><small id="v2VerifyStatus">Aguardando confirmação.</small></section>`;
    const link=host.querySelector('#v2VerifyWhatsApp');link.removeAttribute('target');link.onclick=e=>{e.preventDefault();document.getElementById('v2VerifyStatus').textContent='Abra o WhatsApp e envie a mensagem pronta.';location.assign(link.href)};
    host.querySelector('#v2VerifyAgain').onclick=checkVerification;
  }
  async function checkVerification(){
    const status=document.getElementById('v2VerifyStatus');if(status)status.textContent='Verificando…';
    try{const d=await customerApi('verification_status');if(d.verified&&d.checkout){state.checkout=d.checkout;render();return}if(status)status.textContent='Ainda não chegou. Envie a mensagem pronta pelo WhatsApp.'}catch(e){if(status)status.textContent=String(e.message||e)}
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&document.getElementById('v2VerifyStatus'))checkVerification()});

  function renderNewCustomer(){
    const host=state.mountedStage.querySelector('[data-checkout-v2-body]'),needsDoc=state.checkout?.requires_document!==false;
    host.innerHTML=`<section class="checkout-v2-card">${sectionTitle(1,'Seu cadastro','Não encontrei seu número. Complete os dados para continuar.')}<div class="checkout-v2-form"><label><span>Nome</span><input id="v2Name" autocomplete="name"></label><label><span>WhatsApp</span><input id="v2PhoneNew" inputmode="tel" value="${esc(state.phone)}"></label>${needsDoc?'<label><span>CPF</span><input id="v2Document" inputmode="numeric" placeholder="Somente números"></label>':''}<button id="v2Identify" class="checkout-v2-primary" type="button">Salvar e continuar</button><small id="v2IdentifyStatus"></small></div></section>`;
    host.querySelector('#v2Identify').onclick=identifyNew;
  }
  async function identifyNew(){
    const button=document.getElementById('v2Identify'),status=document.getElementById('v2IdentifyStatus');button.disabled=true;status.textContent='Salvando…';
    try{
      await api('identify',{name:text(document.getElementById('v2Name')?.value),phone:text(document.getElementById('v2PhoneNew')?.value),document:text(document.getElementById('v2Document')?.value)||null});
      const d=await checkoutApi('preview');state.checkout=d.checkout;render();
    }catch(e){status.textContent=String(e.message||e);button.disabled=false}
  }

  function renderAddress(host){
    const addresses=state.checkout?.addresses||[];
    let cards='';
    if(addresses.length){cards=addresses.map(a=>`<article class="checkout-v2-address ${state.address?.id===a.id&&state.addressConfirmed?'selected':''}"><div><strong>${esc(a.label||'Endereço')}</strong><p>${esc(addressLine(a))}</p>${a.complement?`<small>${esc(a.complement)}</small>`:''}</div><div class="checkout-v2-address-actions"><button class="checkout-v2-primary" type="button" data-use-address="${esc(a.id)}">Entregar aqui</button><button class="checkout-v2-text" type="button" data-edit-address="${esc(a.id)}">Trocar endereço</button></div></article>`).join('')}
    host.innerHTML=`<section class="checkout-v2-card">${sectionTitle(2,'Endereço de entrega','Confirme onde devemos entregar.')}<div class="checkout-v2-address-list">${cards||'<p class="checkout-v2-note">Você ainda não tem endereço salvo.</p>'}</div><button class="checkout-v2-secondary" type="button" id="v2NewAddress">${addresses.length?'Usar outro endereço':'Cadastrar endereço'}</button><div id="v2AddressEditor"></div></section><div id="v2AfterAddress"></div>`;
    host.querySelectorAll('[data-use-address]').forEach(btn=>btn.onclick=()=>useAddress(btn.dataset.useAddress));
    host.querySelectorAll('[data-edit-address]').forEach(btn=>btn.onclick=()=>editAddress(btn.dataset.editAddress));
    host.querySelector('#v2NewAddress').onclick=()=>showAddressEditor(null);
    if(state.addressConfirmed)renderPayment();
  }
  function useAddress(id){const a=(state.checkout?.addresses||[]).find(x=>String(x.id)===String(id));if(!a)return;state.address={...a};state.addressConfirmed=true;state.editing=null;renderAddress(state.mountedStage.querySelector('[data-checkout-v2-body]'))}
  function editAddress(id){const a=(state.checkout?.addresses||[]).find(x=>String(x.id)===String(id));if(a)showAddressEditor(a)}

  function showAddressEditor(address){
    state.editing=address||null;state.saveMode=address?'replace':'add';const host=document.getElementById('v2AddressEditor');if(!host)return;
    const a=address||{};host.innerHTML=`<div class="checkout-v2-editor"><div class="checkout-v2-editor-head"><strong>${address?'Editar endereço':'Novo endereço'}</strong><button id="v2CancelAddress" type="button">×</button></div><div class="checkout-v2-grid"><label class="wide"><span>Rua</span><input id="v2Street" value="${esc(a.street||'')}"></label><label><span>Número</span><input id="v2Number" value="${esc(a.number||'')}"></label><label><span>Bairro</span><input id="v2Neighborhood" value="${esc(a.neighborhood||'')}"></label><label class="wide"><span>Complemento</span><input id="v2Complement" value="${esc(a.complement||'')}"></label><label class="wide"><span>Referência</span><input id="v2Reference" value="${esc(a.reference||'')}"></label><label><span>Cidade</span><input id="v2City" value="${esc(a.city||'Cuiabá')}"></label><label><span>UF</span><input id="v2State" value="${esc(a.state||'MT')}"></label><label class="wide"><span>CEP</span><input id="v2Postal" inputmode="numeric" value="${esc(a.postal_code||'')}"></label></div><button id="v2Location" class="checkout-v2-location" type="button">📍 Usar minha localização</button><small id="v2LocationStatus"></small>${address?`<div class="checkout-v2-save-choice"><label><input type="radio" name="v2SaveMode" value="replace" checked> Substituir este endereço</label><label><input type="radio" name="v2SaveMode" value="add"> Adicionar como outro endereço</label></div>`:''}<button id="v2SaveAddress" class="checkout-v2-primary" type="button">Salvar endereço</button><small id="v2AddressStatus"></small></div>`;
    host.querySelector('#v2CancelAddress').onclick=()=>{host.innerHTML=''};host.querySelector('#v2Location').onclick=requestLocation;host.querySelector('#v2SaveAddress').onclick=saveAddress;
  }
  function addressForm(){return {street:text(document.getElementById('v2Street')?.value),number:text(document.getElementById('v2Number')?.value),neighborhood:text(document.getElementById('v2Neighborhood')?.value),complement:text(document.getElementById('v2Complement')?.value),reference:text(document.getElementById('v2Reference')?.value),city:text(document.getElementById('v2City')?.value),state:text(document.getElementById('v2State')?.value)||'MT',postal_code:text(document.getElementById('v2Postal')?.value)}}
  async function saveAddress(){
    const status=document.getElementById('v2AddressStatus'),button=document.getElementById('v2SaveAddress'),mode=document.querySelector('input[name="v2SaveMode"]:checked')?.value||'add',address=addressForm();if(!address.street||!address.number||!address.city){status.textContent='Informe rua, número e cidade.';return}
    button.disabled=true;status.textContent='Salvando…';
    try{const d=await checkoutApi('save_address',{delivery_address:address,mode,address_id:mode==='replace'?state.editing?.id:null});state.checkout=d.checkout||state.checkout;const saved=(state.checkout?.addresses||[]).find(x=>String(x.id)===String(d.address?.id));state.address=saved||{...address,id:d.address?.id};state.addressConfirmed=true;state.editing=null;renderAddress(state.mountedStage.querySelector('[data-checkout-v2-body]'))}catch(e){status.textContent=String(e.message||e);button.disabled=false}
  }

  async function requestLocation(){
    const status=document.getElementById('v2LocationStatus');if(!navigator.geolocation){status.textContent='Localização indisponível neste aparelho.';return}status.textContent='Localizando…';
    navigator.geolocation.getCurrentPosition(async pos=>{state.locator={latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy_m:Math.round(pos.coords.accuracy||0),captured_at:new Date().toISOString()};try{const d=await customerApi('reverse_geocode',{latitude:state.locator.latitude,longitude:state.locator.longitude});const a=d.address||{};for(const [id,key] of [['v2Street','street'],['v2Number','number'],['v2Neighborhood','neighborhood'],['v2City','city'],['v2State','state'],['v2Postal','postal_code']]){const el=document.getElementById(id);if(el&&a[key])el.value=a[key]}status.textContent='Endereço localizado. Confira os dados.'}catch{status.textContent='Localização recebida. Complete o endereço manualmente.'}},()=>{status.textContent='Não consegui obter sua localização. Preencha manualmente.'},{enableHighAccuracy:true,timeout:10000,maximumAge:60000});
  }

  function renderPayment(){
    const host=document.getElementById('v2AfterAddress');if(!host)return;
    host.innerHTML=`<section class="checkout-v2-card">${sectionTitle(3,'Forma de pagamento','Escolha como vai pagar na entrega.')}<div class="checkout-v2-payments">${[['pix','PIX'],['credit_card','Cartão de crédito'],['meal_card','Alimentação / refeição'],['cash','Dinheiro']].map(([k,l])=>`<button type="button" data-payment="${k}" class="${state.payment===k?'selected':''}">${esc(l)}</button>`).join('')}</div></section><div id="v2Review"></div>`;
    host.querySelectorAll('[data-payment]').forEach(btn=>btn.onclick=()=>selectPayment(btn.dataset.payment));if(state.payment)renderReview();
  }
  async function selectPayment(method){
    try{await api('set_payment',{payment_method:method});state.payment=method;renderPayment()}catch(e){toast(e.message)}
  }
  function renderReview(){
    const host=document.getElementById('v2Review');if(!host||!state.addressConfirmed||!state.payment)return;const total=state.checkout?.cart?.total||0,basket=state.checkout?.basket?.name||'',count=itemCount();
    host.innerHTML=`<section class="checkout-v2-card checkout-v2-review">${sectionTitle(4,'Confira e envie','Tudo pronto para confirmar.')}<div class="checkout-v2-check"><span>✓</span><div><strong>Endereço confirmado</strong><small>${esc(addressLine(state.address||{}))}</small></div></div><div class="checkout-v2-check"><span>✓</span><div><strong>Pagamento confirmado</strong><small>${esc(paymentLabel(state.payment))}</small></div></div><div class="checkout-v2-summary"><div><span>${basket?esc(basket):'Seu pedido'}</span><small>${count} item${count===1?'':'s'}</small></div><strong>${money(total)}</strong></div><button id="v2Confirm" class="checkout-v2-confirm" type="button">Confirmar e enviar no WhatsApp</button><small id="v2ConfirmStatus">O pedido será salvo antes de abrir o WhatsApp.</small></section>`;
    host.querySelector('#v2Confirm').onclick=confirmOrder;
  }

  function whatsappAppUrl(url){
    const raw=String(url||'');if(!raw)return '';
    try{const u=new URL(raw);let phone='';if(u.hostname.includes('wa.me'))phone=u.pathname.replace(/\D/g,'');else phone=u.searchParams.get('phone')||'';const message=u.searchParams.get('text')||'';if(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent||''))return `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;return `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`}catch{return raw}
  }
  async function confirmOrder(){
    if(state.busy)return;if(state.orderSaved){if(state.whatsappUrl)location.assign(whatsappAppUrl(state.whatsappUrl));return}
    const button=document.getElementById('v2Confirm'),status=document.getElementById('v2ConfirmStatus');state.busy=true;button.disabled=true;button.textContent='Salvando pedido…';status.textContent='Salvando todos os dados do pedido.';
    try{
      const d=await api('confirm_order',{delivery_address:state.address,payment_method:state.payment,delivery_locator:state.locator});state.orderSaved=true;state.whatsappUrl=d.whatsapp_url||C.whatsappFallback||'';renderSuccess(d);if(state.whatsappUrl)location.assign(whatsappAppUrl(state.whatsappUrl));
    }catch(e){status.textContent=String(e.message||e);button.disabled=false;button.textContent='Confirmar e enviar no WhatsApp'}finally{state.busy=false}
  }
  function renderSuccess(data){
    const s=state.mountedStage;if(!s)return;const total=data?.order?.total||state.checkout?.cart?.total||0;s.innerHTML=`<div class="checkout-v2-shell"><section class="checkout-v2-card checkout-v2-success"><div class="checkout-v2-success-icon">✓</div><h2>Pedido salvo</h2><p><strong>${money(total)}</strong></p><p>Agora é só enviar a mensagem pronta no WhatsApp.</p><a id="v2OpenWhatsApp" class="checkout-v2-confirm checkout-v2-link" href="${esc(whatsappAppUrl(state.whatsappUrl)||'#')}">Abrir WhatsApp</a><small>Seu pedido já está salvo. Tocar novamente não cria outro pedido.</small></section></div>`;const link=s.querySelector('#v2OpenWhatsApp');link.onclick=e=>{e.preventDefault();if(state.whatsappUrl)location.assign(whatsappAppUrl(state.whatsappUrl))}
  }

  const observer=new MutationObserver(()=>{const s=stage();if(s&&state.checkout)mount(s)});observer.observe(document.documentElement,{childList:true,subtree:true});
  window.DA_CHECKOUT_FINAL={state,mount,render};
})();
