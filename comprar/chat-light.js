(()=>{
  'use strict';
  const C=window.DA_SHOPPING_ROOM_CONFIG||{};
  const $=id=>document.getElementById(id);
  const params=new URLSearchParams(location.search);
  let token=(params.get('s')||params.get('c')||params.get('token')||'').trim();
  const timeline=$('timeline');
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const txt=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fallback='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="100%" height="100%" fill="#f2f4f2"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#718078" font-family="Arial" font-size="15">Dona Antônia</text></svg>');
  const state={session:null,customer:null,baskets:[],cart:null,basket:null,basketItems:[],products:[],checkout:null,payment:null,locator:null,seen:new Set(),pollTimer:null,record:null,stream:null,chunks:[],recordStarted:0,recordTimer:null};

  const errorText=e=>({invalid_token:'Link inválido.',room_not_found:'Esta compra não foi encontrada.',room_expired:'Este link expirou. Volte ao WhatsApp e abra novamente.',room_closed:'Este pedido já foi concluído.',payment_method_required:'Escolha como vai pagar na entrega.',invalid_payment_method:'Escolha uma forma de pagamento válida.',customer_name_required:'Informe seu nome.',valid_whatsapp_required:'Informe seu WhatsApp com DDD.',customer_document_required:'Informe o CPF para concluir.',customer_identification_required:'Preencha seus dados para concluir.',delivery_address_required:'Informe o endereço de entrega.',empty_cart:'Escolha uma cesta ou produto antes de finalizar.'})[String(e||'')]||String(e||'Não foi possível continuar.');
  function toast(message){const el=$('toast');el.textContent=errorText(message);el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2600)}
  function scrollEnd(){requestAnimationFrame(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'}))}

  async function api(action,payload={}){
    const r=await fetch(C.api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...(token?{token}:{}),...payload}),cache:'no-store'});
    const d=await r.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!r.ok||d.ok===false)throw new Error(errorText(d.detail||d.error||`Erro ${r.status}`));
    return d;
  }
  async function apiFile(kind,file,durationMs=0){const f=new FormData();f.append('action','upload_media');f.append('token',token);f.append('kind',kind);if(durationMs)f.append('duration_ms',String(durationMs));f.append('file',file,file.name||`${kind}-${Date.now()}`);const r=await fetch(C.api,{method:'POST',body:f,cache:'no-store'});const d=await r.json().catch(()=>({ok:false,error:'invalid_response'}));if(!r.ok||d.ok===false)throw new Error(errorText(d.detail||d.error||`Erro ${r.status}`));return d}

  function bubble(message,who='assistant',html=false){const d=document.createElement('div');d.className=`bubble ${who}`;if(html)d.innerHTML=message;else d.textContent=message;timeline.appendChild(d);scrollEnd();return d}
  function block(title,subtitle=''){const wrap=document.createElement('section');wrap.className='assistant-block';const head=document.createElement('div');head.className='block-title';head.innerHTML=`<div><strong>${esc(title)}</strong>${subtitle?`<small>${esc(subtitle)}</small>`:''}</div>`;wrap.appendChild(head);timeline.appendChild(wrap);scrollEnd();return wrap}
  function rail(parent){const r=document.createElement('div');r.className='rail';parent.appendChild(r);return r}
  function img(url,alt){const i=document.createElement('img');i.src=url||fallback;i.alt=alt||'';i.loading='lazy';i.decoding='async';i.width=180;i.height=180;i.onerror=()=>{i.src=fallback};return i}
  function updateCart(){const items=state.cart?.items||[];const count=items.reduce((n,x)=>n+Number(x.quantity||0),0);$('cartCount').textContent=String(Math.round(count));$('cartTotal').textContent=money(state.cart?.total||0);$('cartBar').classList.toggle('hidden',count<=0)}
  function firstName(){return txt(state.customer?.name).split(' ')[0]||''}
  function typing(){const d=bubble('<span class="typing"><i></i><i></i><i></i></span>','assistant',true);d.dataset.typing='1';return d}
  function clearTyping(){timeline.querySelectorAll('[data-typing="1"]').forEach(x=>x.remove())}

  function quickMenu(){const w=block('O que você quer fazer?','Toque em uma opção ou escreva normalmente.');const c=document.createElement('div');c.className='chips';w.appendChild(c);[['🧺 Cestas','baskets'],['🏷️ Ofertas','offers'],['🛒 Mercearia','mercearia'],['🧼 Limpeza','limpeza_lavanderia'],['🧴 Higiene','higiene_beleza'],['🏠 Casa e Pet','casa_pet']].forEach(([label,key])=>{const b=document.createElement('button');b.type='button';b.className='chip';b.textContent=label;b.onclick=()=>key==='baskets'?showBaskets():showProducts({offers:key==='offers',category:['offers','baskets'].includes(key)?'':key});c.appendChild(b)})}

  async function showBaskets(){
    let list=state.baskets;if(!list.length){try{const d=await api('baskets');list=state.baskets=d.baskets||[]}catch(e){return toast(e.message)}}
    if(!list.length)return bubble('As cestas ainda não estão disponíveis.','assistant');
    bubble('Separei nossas cestas. Deslize para o lado e toque na que gostar.','assistant');
    const w=block('Cestas básicas','Foto, nome e valor.');const r=rail(w);
    list.forEach(b=>{const c=document.createElement('article');c.className='basket-card';c.appendChild(img(b.image_url,b.name));c.insertAdjacentHTML('beforeend',`<h3>${esc(b.name)}</h3><p>${esc(b.description||'Toque para ver os produtos.')}</p><strong class="price">${money(b.base_price)}</strong>`);const bt=document.createElement('button');bt.type='button';bt.className='primary-btn';bt.textContent='Ver esta cesta';bt.onclick=()=>selectBasket(b);c.appendChild(bt);r.appendChild(c)});scrollEnd();
  }

  async function selectBasket(b){
    bubble(`Quero ver ${b.name}.`,'user');const t=typing();
    try{const d=await api('start_basket',{basket_id:b.id});clearTyping();state.basket=b;state.basketItems=d.items||[];state.cart=d.cart||state.cart;updateCart();bubble(`Perfeito. Esta é a ${b.name}. Você pode deixar como está ou ajustar as quantidades antes de continuar.`,'assistant');renderBasketEditor()}catch(e){t.remove();toast(e.message)}
  }

  function renderBasketEditor(){
    const b=state.basket;if(!b)return;const w=block(b.name,'Edite a cesta original primeiro.');const sum=document.createElement('div');sum.className='basket-summary';sum.appendChild(img(b.image_url,b.name));const copy=document.createElement('div');copy.innerHTML=`<h3>${esc(b.name)}</h3><p>Os itens da cesta não mostram preço individual.</p><strong>${money(state.cart?.total||b.base_price)}</strong>`;sum.appendChild(copy);w.appendChild(sum);
    const r=rail(w);state.basketItems.forEach(item=>{const p=item.product||{},c=document.createElement('article');c.className='basket-item-card';c.appendChild(img(p.image_url,p.name));c.insertAdjacentHTML('beforeend',`<h3>${esc(p.name||'Produto')}</h3><p>Item da cesta</p>`);const q=document.createElement('div');q.className='qty';const minus=document.createElement('button'),n=document.createElement('span'),plus=document.createElement('button');minus.textContent='−';plus.textContent='+';n.textContent=String(Number(item.quantity||0));minus.onclick=()=>changeBasketQty(item,-1,n);plus.onclick=()=>changeBasketQty(item,1,n);q.append(minus,n,plus);c.appendChild(q);r.appendChild(c)});
    const a=document.createElement('div');a.className='step-actions';const keep=document.createElement('button');keep.type='button';keep.className='primary-btn';keep.textContent='Pronto com a cesta';keep.onclick=showExtras;const extras=document.createElement('button');extras.type='button';extras.className='soft-btn';extras.textContent='Adicionar produtos';extras.onclick=showExtras;a.append(keep,extras);w.appendChild(a);scrollEnd();
  }
  async function changeBasketQty(item,delta,numberEl){const next=Math.max(0,Number(item.quantity||0)+delta);if(next===Number(item.quantity||0))return;try{const d=await api('set_basket_quantity',{product_id:item.product_id,quantity:next});item.quantity=next;numberEl.textContent=String(next);state.cart=d.cart||state.cart;updateCart()}catch(e){toast(e.message)}}

  function showExtras(){bubble('A cesta está pronta. Se quiser, escolha uma seção para acrescentar produtos.','assistant');const w=block('Quer acrescentar alguma coisa?','Você pode pular e finalizar agora.');const c=document.createElement('div');c.className='chips';w.appendChild(c);[['🏷️ Ofertas',{offers:true}],['🛒 Mercearia',{category:'mercearia'}],['🧼 Limpeza',{category:'limpeza_lavanderia'}],['🧴 Higiene',{category:'higiene_beleza'}],['🏠 Casa e Pet',{category:'casa_pet'}]].forEach(([label,opt])=>{const b=document.createElement('button');b.type='button';b.className='chip';b.textContent=label;b.onclick=()=>showProducts(opt);c.appendChild(b)});const a=document.createElement('div');a.className='step-actions';const finish=document.createElement('button');finish.type='button';finish.className='primary-btn';finish.textContent='Finalizar pedido';finish.onclick=showCheckout;a.appendChild(finish);w.appendChild(a);scrollEnd()}

  async function showProducts(opt={}){
    const title=opt.offers?'Ofertas':opt.category==='mercearia'?'Mercearia':opt.category==='limpeza_lavanderia'?'Limpeza e lavanderia':opt.category==='higiene_beleza'?'Higiene e beleza':opt.category==='casa_pet'?'Casa e Pet':'Produtos';
    bubble(`Vou abrir ${title.toLowerCase()} para você.`,'assistant');const t=typing();
    try{const d=await api('products',{category:opt.category||'',offers:!!opt.offers,q:opt.q||'',limit:18});t.remove();state.products=d.products||[];renderProducts(title,state.products,opt)}catch(e){t.remove();toast(e.message)}
  }
  function renderProducts(title,list,opt={}){const w=block(title,list.length?'Toque em + para adicionar.':'Nenhum produto encontrado.');if(!list.length)return;const r=rail(w);list.forEach(p=>{const c=document.createElement('article');c.className='product-card';c.appendChild(img(p.image_url,p.name));c.insertAdjacentHTML('beforeend',`<h3>${esc(p.name)}</h3><p>${esc([p.brand,p.packaging].filter(Boolean).join(' · '))}</p><strong class="price">${money(p.price)}</strong>`);const q=document.createElement('div');q.className='qty';const minus=document.createElement('button'),n=document.createElement('span'),plus=document.createElement('button');minus.textContent='−';plus.textContent='+';n.textContent=String(Number(p.quantity||0));minus.onclick=()=>changeProductQty(p,-1,n);plus.onclick=()=>changeProductQty(p,1,n);q.append(minus,n,plus);c.appendChild(q);r.appendChild(c)});const s=document.createElement('div');s.className='search-row';s.innerHTML='<input type="search" placeholder="Procurar outro produto"><button type="button" class="soft-btn">Buscar</button>';s.querySelector('button').onclick=()=>showProducts({q:s.querySelector('input').value});s.querySelector('input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();showProducts({q:e.target.value})}});w.appendChild(s);const a=document.createElement('div');a.className='step-actions';const finish=document.createElement('button');finish.type='button';finish.className='primary-btn';finish.textContent='Finalizar pedido';finish.onclick=showCheckout;a.appendChild(finish);w.appendChild(a);scrollEnd()}
  async function changeProductQty(p,delta,numberEl){const next=Math.max(0,Number(p.quantity||0)+delta);if(next===Number(p.quantity||0))return;try{const d=await api('set_quantity',{product_id:p.id,quantity:next});p.quantity=next;numberEl.textContent=String(next);state.cart=d.cart||state.cart;updateCart();toast(next>0?'Produto adicionado.':'Produto retirado.')}catch(e){toast(e.message)}}

  async function showCheckout(){
    const t=typing();try{const d=await api('checkout_preview');t.remove();state.checkout=d.checkout||{};state.payment=d.payment_method||state.payment;renderCheckout()}catch(e){t.remove();toast(e.message)}
  }
  function renderCheckout(){
    const c=state.checkout||{};bubble('Agora é só conferir seus dados, escolher como vai pagar e informar a entrega.','assistant');const w=block('Finalizar pedido','Poucos passos e pronto.');
    const order=document.createElement('div');order.className='checkout-card';order.innerHTML='<h3>Seu pedido</h3>';const lines=document.createElement('div');lines.className='order-lines';(c.items||[]).forEach(i=>{const l=document.createElement('div');l.className='order-line';l.innerHTML=`<span>${esc(i.quantity)}× ${esc(i.name)}</span><span>${i.source==='basket'?'incluído':money(i.line_total)}</span>`;lines.appendChild(l)});order.appendChild(lines);order.insertAdjacentHTML('beforeend',`<div class="total-line"><span>Total</span><strong>${money(c.cart?.total||state.cart?.total)}</strong></div>`);w.appendChild(order);

    const known=c.customer||state.customer||{};const needForm=!known.id||c.requires_document;const customer=document.createElement('div');customer.className='checkout-card';customer.innerHTML=`<h3>Cadastro</h3>${needForm?`<div class="grid2"><label class="wide">Nome<input id="checkoutName" type="text" autocomplete="name" value="${esc(known.name||'')}"></label><label class="wide">WhatsApp com DDD<input id="checkoutPhone" type="tel" inputmode="tel" autocomplete="tel" value="${esc(known.phone||'')}"></label>${c.requires_document?'<label class="wide">CPF<input id="checkoutDocument" type="text" inputmode="numeric" placeholder="Somente números"></label>':''}</div>`:`<p>Cadastro identificado: <strong>${esc(known.name||firstName()||'cliente')}</strong>. Não vou pedir tudo de novo.</p>`}`;w.appendChild(customer);

    const pay=document.createElement('div');pay.className='checkout-card';pay.innerHTML='<h3>Como vai pagar na entrega?</h3><div class="pay-options"></div>';const opts=pay.querySelector('.pay-options');[['pix','PIX'],['credit_card','Cartão de crédito'],['meal_card','Alimentação / refeição'],['cash','Dinheiro']].forEach(([key,label])=>{const b=document.createElement('button');b.type='button';b.className=`pay ${state.payment===key?'active':''}`;b.textContent=label;b.onclick=async()=>{state.payment=key;opts.querySelectorAll('.pay').forEach(x=>x.classList.remove('active'));b.classList.add('active');try{await api('set_payment',{payment_method:key})}catch(e){toast(e.message)}};opts.appendChild(b)});w.appendChild(pay);

    const address=document.createElement('div');address.className='checkout-card';address.innerHTML='<h3>Entrega</h3><div id="addressChoices"></div><div id="newAddress" class="grid2"></div><div class="location-box"><button id="useLocation" type="button" class="soft-btn">📍 Usar minha localização</button><span id="locationStatus" class="location-status">Ajuda o entregador a chegar mais rápido.</span><label>Referência ou observação<input id="deliveryReference" type="text" placeholder="Ex.: portão azul, casa da esquina"></label></div>';w.appendChild(address);
    const choices=address.querySelector('#addressChoices'),saved=c.addresses||[];saved.forEach((a,i)=>{const l=document.createElement('label');l.className='saved-address';l.innerHTML=`<input type="radio" name="deliveryAddress" value="${i}" ${i===0?'checked':''}><span><strong>${esc(a.label||'Endereço')}</strong><br>${esc(a.street)}, ${esc(a.number)} · ${esc(a.neighborhood||'')} · ${esc(a.city||'')}</span>`;choices.appendChild(l)});if(saved.length){const other=document.createElement('label');other.className='saved-address';other.innerHTML='<input type="radio" name="deliveryAddress" value="new"><span><strong>Usar outro endereço</strong></span>';choices.appendChild(other)}
    const nf=address.querySelector('#newAddress');nf.innerHTML='<label class="wide">Rua<input id="street" type="text"></label><label>Número<input id="number" type="text"></label><label>Bairro<input id="neighborhood" type="text"></label><label class="wide">Complemento<input id="complement" type="text"></label><label>Cidade<input id="city" type="text" value="Cuiabá"></label><label>UF<input id="stateUF" type="text" value="MT"></label>';
    const refresh=()=>{const x=address.querySelector('input[name="deliveryAddress"]:checked');nf.classList.toggle('hidden',saved.length&&x&&x.value!=='new')};choices.addEventListener('change',refresh);refresh();
    address.querySelector('#useLocation').onclick=()=>captureLocation(address.querySelector('#locationStatus'));

    const a=document.createElement('div');a.className='step-actions';const confirm=document.createElement('button');confirm.type='button';confirm.className='primary-btn';confirm.textContent='Confirmar pedido';confirm.onclick=()=>confirmOrder(confirm);a.appendChild(confirm);w.appendChild(a);scrollEnd();
  }
  async function captureLocation(status){if(!navigator.geolocation){status.textContent='Seu navegador não liberou localização. Use a referência abaixo.';return}status.textContent='Buscando sua localização…';navigator.geolocation.getCurrentPosition(pos=>{state.locator={lat:Number(pos.coords.latitude.toFixed(6)),lng:Number(pos.coords.longitude.toFixed(6)),accuracy_m:Math.round(pos.coords.accuracy),source:'browser_geolocation'};status.textContent='Localização recebida ✓';},()=>{status.textContent='Não consegui acessar. Você pode informar uma referência abaixo.';},{enableHighAccuracy:true,timeout:10000,maximumAge:60000})}
  function field(id){return txt($(id)?.value)}
  function deliveryAddress(){const saved=state.checkout?.addresses||[];const selected=document.querySelector('input[name="deliveryAddress"]:checked');if(selected&&selected.value!=='new'&&saved[Number(selected.value)])return {...saved[Number(selected.value)],reference:field('deliveryReference')||saved[Number(selected.value)].reference};return {street:field('street'),number:field('number'),neighborhood:field('neighborhood'),complement:field('complement'),reference:field('deliveryReference'),city:field('city')||'Cuiabá',state:field('stateUF')||'MT'}}
  async function confirmOrder(btn){
    if(!state.payment)return toast('Escolha como vai pagar na entrega.');btn.disabled=true;btn.textContent='Confirmando…';
    try{
      const c=state.checkout||{},known=c.customer||state.customer||{};if(!known.id||c.requires_document){const d=await api('identify',{name:field('checkoutName'),phone:field('checkoutPhone'),document:field('checkoutDocument')||null});state.customer={...(state.customer||{}),...(d.customer||{})};if(d.customer?.requires_document)throw new Error('Informe o CPF para concluir.')}
      const address=deliveryAddress();if(!address.street||!address.number||!address.city)throw new Error('Informe o endereço de entrega.');
      if(document.querySelector('input[name="deliveryAddress"]:checked')?.value==='new'||!(state.checkout?.addresses||[]).length){try{await api('save_address',{delivery_address:address})}catch{}}
      const d=await api('confirm_order',{delivery_address:address,delivery_locator:state.locator,payment_method:state.payment});state.cart=null;updateCart();$('composer').classList.add('hidden');$('cartBar').classList.add('hidden');bubble('Pedido confirmado! ✅','assistant');const s=block('Venda concluída','Seu pedido ficou registrado.');s.innerHTML+=`<div class="success"><div class="check">✅</div><h2>Pedido recebido</h2><p>Total ${money(d.order?.total)}. Agora é só aguardar nossa equipe preparar a entrega.</p></div>`;scrollEnd();
    }catch(e){toast(e.message);btn.disabled=false;btn.textContent='Confirmar pedido'}
  }

  function applyUi(ui){if(!ui||ui.type==='none')return;if(ui.type==='baskets')showBaskets();else if(ui.type==='checkout')showCheckout();else if(ui.type==='products')showProducts({category:ui.category||'',offers:!!ui.offers,q:ui.q||''})}
  async function sendMessage(message){const v=txt(message);if(!v)return;bubble(v,'user');$('messageInput').value='';const t=typing();try{const d=await api('send_text',{message:v});t.remove();if(d.message_id)state.seen.add(d.message_id);if(d.reply)bubble(d.reply,'assistant');if(d.ui?.type&&d.ui.type!=='none'){const label=d.ui.type==='baskets'?'Claro. Vou abrir as cestas para você.':d.ui.type==='checkout'?'Vamos finalizar.':d.ui.type==='products'?'Separei essa parte para você.':'';if(label)bubble(label,'assistant');applyUi(d.ui)}if(d.ai_job)pollNew(1200,12)}catch(e){t.remove();toast(e.message)}}
  async function pollNew(delay=1500,tries=1){clearTimeout(state.pollTimer);state.pollTimer=setTimeout(async()=>{try{const d=await api('messages');let found=false;for(const m of d.messages||[]){if(state.seen.has(m.id))continue;state.seen.add(m.id);if(m.direction==='outbound'){clearTyping();bubble(txt(m.body_text||m.transcript)||'Certo.','assistant');applyUi(m.ui);found=true}}if(!found&&tries>0)pollNew(Math.min(3000,delay+400),tries-1)}catch{}},delay)}

  async function upload(kind,file,duration=0){bubble(kind==='audio'?'🎤 Áudio enviado':'📷 Foto enviada','user');const t=typing();try{await apiFile(kind,file,duration);t.remove();pollNew(1600,16)}catch(e){t.remove();toast(e.message)}}
  function audioMime(){return ['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(x=>window.MediaRecorder?.isTypeSupported?.(x))||''}
  async function startRecording(){if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)return toast('Seu navegador não permite gravar áudio aqui.');try{state.stream=await navigator.mediaDevices.getUserMedia({audio:true});const mime=audioMime();state.record=new MediaRecorder(state.stream,mime?{mimeType:mime}:undefined);state.chunks=[];state.recordStarted=Date.now();state.record.ondataavailable=e=>{if(e.data?.size)state.chunks.push(e.data)};state.record.onstop=async()=>{clearInterval(state.recordTimer);$('recordingBar').classList.add('hidden');state.stream?.getTracks().forEach(x=>x.stop());if(!state.chunks.length)return;const type=state.record.mimeType||'audio/webm',ext=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm';const f=new File([new Blob(state.chunks,{type})],`audio-${Date.now()}.${ext}`,{type});await upload('audio',f,Date.now()-state.recordStarted)};state.record.start(250);$('recordingBar').classList.remove('hidden');state.recordTimer=setInterval(()=>{const s=Math.floor((Date.now()-state.recordStarted)/1000);$('recordingTime').textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;if(s>=90)stopRecording()},500)}catch{toast('Não consegui acessar o microfone.')}}
  function stopRecording(){if(state.record&&state.record.state!=='inactive')state.record.stop()}

  function renderExisting(messages){for(const m of messages||[]){state.seen.add(m.id);if(!txt(m.body_text||m.transcript))continue;bubble(txt(m.body_text||m.transcript),m.direction==='inbound'?'user':'assistant')}}
  async function init(){
    try{
      if(token&&!/^[a-f0-9]{64}$/i.test(token))throw new Error('Link inválido.');
      if(!token){const x=await api('create_web_room');token=x.token;history.replaceState({},'',`${location.pathname}?s=${encodeURIComponent(token)}`)}
      const d=await api('open');$('loadingCard')?.remove();state.session=d.session;state.customer=d.customer;state.baskets=d.baskets||[];state.cart=d.cart;updateCart();$('roomStatus').textContent='Atendimento online';
      const historyMessages=d.messages||[];if(historyMessages.length)renderExisting(historyMessages);
      else{const name=firstName(),basketEntry=String(d.session?.entry_intent||'').startsWith('basket');bubble(`${name?`Oi ${name}!`:'Oi!'} Aqui consigo te atender melhor e mais rápido.${basketEntry?' Já deixei as cestas separadas para você.':' Me diga o que você precisa.'}`,'assistant');if(basketEntry)await showBaskets();else quickMenu()}
    }catch(e){$('loadingCard')?.remove();bubble(e.message||'Não consegui abrir este atendimento.','system');$('composer').classList.add('hidden')}
  }

  $('composer').addEventListener('submit',e=>{e.preventDefault();sendMessage($('messageInput').value)});
  $('cartButton').onclick=showCheckout;$('checkoutButton').onclick=showCheckout;
  $('backButton').onclick=()=>{if(history.length>1)history.back();else location.href='/'};
  $('photoButton').onclick=()=>$('photoInput').click();$('photoInput').addEventListener('change',e=>{const f=e.target.files?.[0];e.target.value='';if(f)upload('image',f)});
  $('micButton').onclick=()=>state.record?.state==='recording'?stopRecording():startRecording();$('cancelRecording').onclick=()=>{state.chunks=[];stopRecording()};
  window.addEventListener('beforeunload',()=>state.stream?.getTracks().forEach(x=>x.stop()));
  init();
})();
