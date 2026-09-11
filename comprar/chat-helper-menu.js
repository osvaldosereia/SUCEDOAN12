(()=>{
  'use strict';
  const C=window.DA_SHOPPING_ROOM_CONFIG||{};
  const $=id=>document.getElementById(id);
  const timeline=$('timeline');
  if(!timeline)return;
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const fallback='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="140"><rect width="100%" height="100%" rx="14" fill="#f1f5f2"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#557064" font-family="Arial" font-size="14">Dona Antônia</text></svg>');
  const menuApi=C.menuApi||String(C.api||'').replace(/shopping-chat-v1$/,'shopping-chat-menu-v1');
  const productsApi=C.productsApi||String(C.api||'').replace(/shopping-chat-v1$/,'shopping-chat-products-v1');
  let cfg=null,root=null,panel=null,activeProductHost=null;

  function currentToken(){return new URLSearchParams(location.search).get('s')||new URLSearchParams(location.search).get('c')||new URLSearchParams(location.search).get('token')||''}
  async function waitToken(){for(let i=0;i<60;i++){const t=currentToken().trim();if(/^[a-f0-9]{64}$/i.test(t))return t;await new Promise(r=>setTimeout(r,100))}return ''}
  async function post(url,action,payload={}){const token=await waitToken();if(!token)throw new Error('Sessão do atendimento ainda não está pronta.');const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token,...payload}),cache:'no-store'});const d=await r.json().catch(()=>({ok:false,error:'invalid_response'}));if(!r.ok||d.ok===false)throw new Error(text(d.detail||d.error||`Erro ${r.status}`));return d}
  const chat=(action,payload={})=>post(C.api,action,payload);
  const menu=(action,payload={})=>post(menuApi,action,payload);
  const products=(action,payload={})=>post(productsApi,action,payload);

  function scrollEnd(){requestAnimationFrame(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'}))}
  function userChoice(label){const d=document.createElement('div');d.className='da-help-user-choice';d.textContent=label;timeline.appendChild(d);scrollEnd()}
  function answer(message){const d=document.createElement('div');d.className='da-help-answer';d.textContent=message;timeline.appendChild(d);scrollEnd();return d}
  function block(title,subtitle=''){const s=document.createElement('section');s.className='da-help-block';const h=document.createElement('h3');h.textContent=title;s.appendChild(h);if(subtitle){const p=document.createElement('p');p.textContent=subtitle;s.appendChild(p)}timeline.appendChild(s);scrollEnd();return s}
  function status(host,message){host.innerHTML='';const d=document.createElement('div');d.className='da-help-status';d.textContent=message;host.appendChild(d)}
  function rail(host){const r=document.createElement('div');r.className='da-help-rail';host.appendChild(r);return r}
  function img(url,alt){const i=document.createElement('img');i.src=url||fallback;i.alt=alt||'';i.loading='lazy';i.decoding='async';i.onerror=()=>{i.src=fallback};return i}
  function toast(message){document.querySelector('.da-help-toast')?.remove();const d=document.createElement('div');d.className='da-help-toast';d.textContent=message;document.body.appendChild(d);setTimeout(()=>d.remove(),2300)}
  function syncCart(cart){if(!cart)return;const items=cart.items||[];const count=items.reduce((n,x)=>n+Number(x.quantity||0),0);const cc=$('cartCount'),ct=$('cartTotal'),bar=$('cartBar');if(cc)cc.textContent=String(Math.round(count));if(ct)ct.textContent=money(cart.total||0);if(bar)bar.classList.toggle('hidden',count<=0);syncPosition()}
  function syncPosition(){if(!root)return;root.classList.toggle('is-cart-visible',!$('cartBar')?.classList.contains('hidden'))}
  function closePanel(){if(panel){panel.hidden=true;root?.querySelector('.da-helper-avatar')?.setAttribute('aria-expanded','false')}}
  function togglePanel(){if(!panel)return;panel.hidden=!panel.hidden;root?.querySelector('.da-helper-avatar')?.setAttribute('aria-expanded',String(!panel.hidden))}

  async function showBaskets(){
    closePanel();userChoice('Cestas Básicas');const host=block('Cestas Básicas','Deslize para o lado. Toque em uma cesta para ver os produtos.');status(host,'Carregando cestas…');
    try{const d=await chat('baskets');host.querySelector('.da-help-status')?.remove();const r=rail(host);for(const b of d.baskets||[]){const c=document.createElement('article');c.className='da-help-card';c.appendChild(img(b.image_url,b.name));const h=document.createElement('h4');h.textContent=b.name;c.appendChild(h);const price=document.createElement('strong');price.textContent=money(b.base_price);c.appendChild(price);const bt=document.createElement('button');bt.type='button';bt.textContent='Ver produtos';bt.onclick=()=>showBasketItems(b);c.appendChild(bt);r.appendChild(c)}if(!(d.baskets||[]).length)status(host,'Nenhuma cesta disponível agora.')}catch(e){status(host,e.message)}
  }

  async function showBasketItems(basket){
    userChoice(basket.name||'Ver cesta');const host=block(basket.name||'Cesta','Composição da cesta. Isso ainda não altera seu pedido.');status(host,'Carregando produtos…');
    try{const d=await menu('basket_items',{basket_id:basket.id});host.querySelector('.da-help-status')?.remove();const r=rail(host);for(const item of d.items||[]){const p=item.product||{},c=document.createElement('article');c.className='da-help-card da-help-composition-card';c.appendChild(img(p.image_url,p.name));const h=document.createElement('h4');h.textContent=p.name||'Produto';c.appendChild(h);const meta=document.createElement('small');meta.textContent=[p.brand,p.packaging].filter(Boolean).join(' · ');c.appendChild(meta);const q=document.createElement('div');q.className='qty-label';q.textContent=`${Number(item.quantity||0)} ${Number(item.quantity||0)===1?'unidade':'unidades'}`;c.appendChild(q);r.appendChild(c)}const f=document.createElement('div');f.className='da-help-footer';const choose=document.createElement('button');choose.type='button';choose.className='primary';choose.textContent='Escolher esta cesta';choose.onclick=()=>chooseBasket(d.basket||basket,choose);const back=document.createElement('button');back.type='button';back.className='secondary';back.textContent='Ver outras cestas';back.onclick=showBaskets;f.append(choose,back);host.appendChild(f);if(!(d.items||[]).length)status(host,'A composição desta cesta não está disponível.')}catch(e){status(host,e.message)}
  }

  async function chooseBasket(basket,button){button.disabled=true;try{const d=await chat('start_basket',{basket_id:basket.id});syncCart(d.cart);answer(`${basket.name||'A cesta'} foi colocada no seu pedido. Você pode ajustar os itens normalmente antes de finalizar.`);toast('Cesta adicionada ao pedido.')}catch(e){toast(e.message)}finally{button.disabled=false}}

  async function addProduct(product,button){button.disabled=true;try{const next=Math.max(1,Number(product.quantity||0)+1);const d=await chat('set_quantity',{product_id:product.id,quantity:next});product.quantity=next;syncCart(d.cart);button.textContent=`Adicionar mais · ${next} no pedido`;toast('Produto adicionado.')}catch(e){toast(e.message)}finally{button.disabled=false}}

  function renderProducts(host,list,{empty='Nenhum produto disponível.'}={}){
    host.querySelector('.da-help-status')?.remove();host.querySelector('.da-help-rail')?.remove();if(!list?.length)return status(host,empty);const r=rail(host);
    for(const p of list){const c=document.createElement('article');c.className='da-help-card';c.appendChild(img(p.image_url,p.name));const h=document.createElement('h4');h.textContent=p.name;c.appendChild(h);const meta=document.createElement('small');meta.textContent=[p.brand,p.packaging].filter(Boolean).join(' · ');c.appendChild(meta);const price=document.createElement('strong');price.textContent=money(p.price);c.appendChild(price);const bt=document.createElement('button');bt.type='button';bt.textContent=Number(p.quantity||0)>0?`Adicionar mais · ${Number(p.quantity)} no pedido`:'Adicionar';bt.onclick=()=>addProduct(p,bt);c.appendChild(bt);r.appendChild(c)}
  }

  async function showOffers(){closePanel();userChoice('Ofertas');const host=block('Ofertas','Até 30 ofertas disponíveis agora. Deslize para o lado.');status(host,'Carregando ofertas…');try{const d=await products('page',{offers:true,offset:0,limit:30});renderProducts(host,d.products||[],{empty:'Não há ofertas disponíveis neste momento.'})}catch(e){status(host,e.message)}}

  const categoryOptions=[['mercearia','Mercearia'],['limpeza_lavanderia','Limpeza'],['higiene_beleza','Higiene e beleza'],['casa_pet','Casa e Pet']];
  async function loadCategory(host,key,label,button){host.querySelectorAll('.da-help-chip').forEach(x=>x.classList.toggle('active',x===button));let productHost=host.querySelector('[data-helper-products]');if(!productHost){productHost=document.createElement('div');productHost.dataset.helperProducts='1';host.appendChild(productHost)}status(productHost,`Carregando ${label.toLowerCase()}…`);try{const d=await products('page',{sales_categories:[key],offset:0,limit:30});renderProducts(productHost,d.products||[],{empty:`Nenhum produto disponível em ${label}.`})}catch(e){status(productHost,e.message)}}
  async function showProductsMenu(){closePanel();userChoice('Produtos');const host=block('Produtos','Escolha uma categoria. O carrossel aparece logo abaixo.');activeProductHost=host;const chips=document.createElement('div');chips.className='da-help-chips';host.appendChild(chips);categoryOptions.forEach(([key,label],index)=>{const b=document.createElement('button');b.type='button';b.className=`da-help-chip${index===0?' active':''}`;b.textContent=label;b.onclick=()=>loadCategory(host,key,label,b);chips.appendChild(b);if(index===0)queueMicrotask(()=>loadCategory(host,key,label,b))})}

  async function showProfile(item){closePanel();userChoice(item.label);const intro=text(item.response_text)||'Vou mostrar os dados básicos que já temos no seu cadastro.';const host=block('Meu cadastro','Informações identificadas nesta conversa.');status(host,'Consultando cadastro…');try{const d=await chat('open');host.querySelector('.da-help-status')?.remove();const c=d.customer;if(!c){answer(`${intro}\nAinda não identifiquei um cadastro nesta conversa. No fechamento do pedido vou pedir somente os dados necessários.`);return}const phone=String(c.phone||'').replace(/\D/g,'');const masked=phone?`•••• ${phone.slice(-4)}`:'não informado';answer(`${intro}\nNome: ${c.name||'não informado'}\nWhatsApp: ${masked}\nCPF cadastrado: ${c.has_document?'sim':'não'}.`)}catch(e){status(host,e.message)}}

  function staticAnswer(item){closePanel();userChoice(item.label);answer(text(item.response_text)||'Essa informação ainda não foi configurada no Admin.')}
  async function runItem(item){const kind=item.kind;if(kind==='baskets')return showBaskets();if(kind==='offers')return showOffers();if(kind==='products')return showProductsMenu();if(kind==='profile')return showProfile(item);return staticAnswer(item)}

  function build(config){
    cfg=config;if(config.enabled===false)return;root=document.createElement('div');root.className='da-helper';root.innerHTML='<button class="da-helper-prompt" type="button"></button><div class="da-helper-panel" hidden><div class="da-helper-head"><strong>Como posso ajudar?</strong><button class="da-helper-close" type="button" aria-label="Fechar">×</button></div><div class="da-helper-list"></div></div><button class="da-helper-avatar" type="button" aria-label="Abrir ajuda da Dona Antônia" aria-expanded="false"><span>DA</span></button>';
    const prompt=root.querySelector('.da-helper-prompt'),avatar=root.querySelector('.da-helper-avatar'),list=root.querySelector('.da-helper-list');panel=root.querySelector('.da-helper-panel');prompt.textContent=text(config.prompt_text)||'Quer ajuda?';
    const avatarUrl=text(config.avatar_url);if(avatarUrl){avatar.innerHTML='';const i=document.createElement('img');i.alt='Dona Antônia';i.src=avatarUrl;i.onerror=()=>{avatar.innerHTML='<span>DA</span>'};avatar.appendChild(i)}
    for(const item of config.menu_items||[]){if(item.enabled===false)continue;const b=document.createElement('button');b.type='button';b.className='da-helper-item';b.textContent=item.label;b.onclick=()=>runItem(item);list.appendChild(b)}
    prompt.onclick=togglePanel;avatar.onclick=togglePanel;root.querySelector('.da-helper-close').onclick=closePanel;document.body.appendChild(root);syncPosition();
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closePanel()});document.addEventListener('click',e=>{if(root&&!root.contains(e.target))closePanel()});
    if($('cartBar'))new MutationObserver(syncPosition).observe($('cartBar'),{attributes:true,attributeFilter:['class']});
  }

  async function init(){try{const d=await menu('get');build(d.config||{})}catch(e){console.warn('[chat-helper-menu]',e.message)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
