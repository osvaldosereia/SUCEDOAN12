(()=>{
  'use strict';
  const C=window.DA_CATALOGO_CONFIG||{};
  const $=id=>document.getElementById(id);
  const params=new URLSearchParams(location.search);
  let token=(params.get('c')||params.get('t')||params.get('token')||'').trim();
  const initialQuery=(params.get('q')||'').trim();
  const FAV_KEY='da_vitrine_favoritos_v1';
  const PLACEHOLDER='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="100%" height="100%" fill="#ECECEC"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#80868b" font-family="Arial" font-size="26">sem foto</text></svg>');
  let state={session:null,items:[],homeItems:[],baskets:[],categories:[],cart:null,whatsappUrl:'',selection:new Map(),view:'home',favorites:loadFavorites()};
  const tokenOk=v=>/^[a-f0-9]{64}$/i.test(String(v||''));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const toast=msg=>{const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1900)};
  function loadFavorites(){try{return JSON.parse(localStorage.getItem(FAV_KEY)||'{}')||{}}catch{return {}}}
  function saveFavorites(){try{localStorage.setItem(FAV_KEY,JSON.stringify(state.favorites))}catch{}}
  async function api(action,payload={}){
    const r=await fetch(C.api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token,...payload}),cache:'no-store'});
    const data=await r.json().catch(()=>({ok:false,error:'invalid_response'}));
    if(!r.ok||!data.ok)throw new Error(data.detail||data.error||'Falha na vitrine');
    return data;
  }
  function rememberToken(next){
    if(!tokenOk(next))return;token=next;params.set('c',token);params.delete('t');params.delete('token');
    const qs=params.toString();history.replaceState(null,'',`${location.pathname}${qs?'?'+qs:''}${location.hash||''}`);
  }
  function syncSelection(items){
    for(const item of items||[]){
      const q=Number(item.quantity||0),id=String(item.product_id||item.product?.id||'');if(!id)continue;
      if(q>0)state.selection.set(id,{quantity:q,product:item.product||{}});else if(state.selection.has(id))state.selection.delete(id);
    }
  }
  function selectionTotals(){let count=0,total=0;for(const row of state.selection.values()){count+=Number(row.quantity||0);total+=Number(row.quantity||0)*Number(row.product?.price||0)}return {count,total}}
  function renderTotals(){
    const {count,total}=selectionTotals();$('selectedCount').textContent=`${count} ${count===1?'item':'itens'}`;$('countBadge').textContent=String(count);$('selectedTotal').textContent=state.cart?.total!=null?money(state.cart.total):money(total);
    $('stickyBar').classList.toggle('hidden',count===0);
  }
  function iconSvg(id){
    const paths={
      mercearia:'<path d="M5 8h14l-1.3 11H6.3L5 8Zm3 0 1.2-3h5.6L16 8M9 11v5m3-5v5m3-5v5"/>',
      limpeza:'<path d="M9 5h6m-4 0V3h4m-6 6h6l2 3v8H7v-8l2-3Zm7-4 3-2m-3 5 4-1"/>',
      higiene:'<path d="M10 3h4v4h-4V3Zm-1 4h6l1 3v10H8V10l1-3Zm2 5h2"/>',
      bebidas:'<path d="M10 3h4v3l1 2v12H9V8l1-2V3Zm0 8h4"/>',
      'casa-pet':'<path d="M3 11 12 4l9 7v9h-6v-6H9v6H3v-9Z"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[id]||paths.mercearia}</svg>`;
  }
  function renderBaskets(){
    const host=$('basketRail');host.innerHTML='';
    for(const basket of state.baskets){
      const frag=$('basketTemplate').content.cloneNode(true),card=frag.querySelector('.basket-card'),img=frag.querySelector('.basket-image');
      img.src=basket.image_url||PLACEHOLDER;img.alt=text(basket.name)||'Cesta básica';
      const name=text(basket.name);frag.querySelector('.basket-name').textContent=/cesta/i.test(name)?name:`Cesta ${name}`;frag.querySelector('.basket-price').textContent=money(basket.price);
      card.addEventListener('click',()=>openBasket(basket));host.appendChild(frag);
    }
  }
  function renderCategories(){
    const host=$('categoryRail');host.innerHTML='';
    for(const category of state.categories){
      const btn=document.createElement('button');btn.type='button';btn.className='category-button';btn.dataset.category=category.id;
      btn.innerHTML=`<span class="category-icon">${iconSvg(category.id)}</span><span class="category-label"></span>`;btn.querySelector('.category-label').textContent=category.label;
      btn.addEventListener('click',()=>browse('category',category.id,category.label));host.appendChild(btn);
    }
  }
  function setNav(active){for(const id of ['navHome','navCategories','navFavorites','navAccount'])$(id).classList.toggle('active',id===active)}
  function setHomeVisible(show){$('homeBlocks').classList.toggle('hidden',!show)}
  function renderProducts(){
    const host=$('productGrid');host.innerHTML='';
    if(!state.items.length){$('stateBox').textContent=state.view==='favorites'?'Você ainda não salvou produtos favoritos.':'Nenhum produto encontrado.';$('stateBox').classList.remove('hidden');host.classList.add('hidden');renderTotals();return}
    $('stateBox').classList.add('hidden');host.classList.remove('hidden');
    for(const item of state.items){
      const p=item.product||{},id=String(item.product_id||p.id||''),frag=$('productTemplate').content.cloneNode(true),card=frag.querySelector('.product');card.dataset.id=id;
      const img=frag.querySelector('.product-image');img.src=p.image_url||PLACEHOLDER;img.alt=text(p.name)||'Produto';
      frag.querySelector('.product-name').textContent=text(p.name)||'Produto';const meta=[text(p.packaging),text(p.brand)].filter(Boolean).join(' · '),metaEl=frag.querySelector('.product-meta');metaEl.textContent=meta;if(!meta)metaEl.hidden=true;
      frag.querySelector('.product-price').textContent=money(p.price);
      const fav=frag.querySelector('.favorite');fav.classList.toggle('on',Boolean(state.favorites[id]));fav.setAttribute('aria-label',state.favorites[id]?'Remover dos favoritos':'Adicionar aos favoritos');fav.addEventListener('click',()=>toggleFavorite(item));
      const selected=state.selection.get(id),qty=Number(selected?.quantity??item.quantity??0),add=frag.querySelector('.add-button'),qtyRow=frag.querySelector('.qty-row'),qtyEl=frag.querySelector('.qty'),minus=frag.querySelector('.minus'),plus=frag.querySelector('.plus');
      qtyEl.textContent=String(qty);add.classList.toggle('hidden',qty>0);qtyRow.classList.toggle('hidden',qty<=0);minus.disabled=qty<=0;
      add.addEventListener('click',()=>change(item,1,card));minus.addEventListener('click',()=>change(item,-1,card));plus.addEventListener('click',()=>change(item,1,card));host.appendChild(frag);
    }
    renderTotals();
  }
  function toggleFavorite(item){
    const id=String(item.product_id||item.product?.id||'');if(!id)return;
    if(state.favorites[id]){delete state.favorites[id];toast('Removido dos favoritos')}else{state.favorites[id]={product_id:id,product:item.product||{}};toast('Salvo nos favoritos')}
    saveFavorites();renderProducts();
  }
  async function change(item,delta,card){
    const id=String(item.product_id||item.product?.id||''),current=Number(state.selection.get(id)?.quantity??item.quantity??0),next=Math.max(0,Math.min(999,current+delta));if(next===current)return;
    card.classList.add('busy');
    try{
      const data=await api('set_quantity',{product_id:id,quantity:next});item.quantity=next;if(data.cart)state.cart=data.cart;
      for(const collection of [state.items,state.homeItems])for(const row of collection){if(String(row.product_id)===id)row.quantity=next}
      if(next>0)state.selection.set(id,{quantity:next,product:item.product||{}});else state.selection.delete(id);renderProducts();
    }catch(e){toast(e.message||'Não foi possível alterar');card.classList.remove('busy')}
  }
  function showLoading(title){$('catalogTitle').textContent=title;$('stateBox').textContent='Carregando produtos...';$('stateBox').classList.remove('hidden');$('productGrid').classList.add('hidden')}
  async function browse(mode,value,title){
    state.view=mode;setHomeVisible(false);setNav(mode==='category'?'navCategories':'navHome');showLoading(title||'Produtos');$('viewAllButton').classList.add('hidden');
    try{const data=await api('browse',{mode,value});state.items=data.items||[];syncSelection(state.items);renderProducts();window.scrollTo({top:0,behavior:'smooth'})}catch(e){$('stateBox').textContent='Não foi possível carregar estes produtos.';toast(e.message||'Falha na busca')}
  }
  function restoreHome(){
    state.view='home';state.items=state.homeItems;$('searchInput').value='';$('catalogTitle').textContent='Mais procurados';$('viewAllButton').classList.toggle('hidden',!state.session?.public_guest);setHomeVisible(Boolean(state.session?.public_guest));setNav('navHome');renderProducts();
  }
  function openFavorites(){
    const list=Object.values(state.favorites).map(x=>({...x,quantity:state.selection.get(String(x.product_id))?.quantity||0}));state.view='favorites';state.items=list;setHomeVisible(false);$('catalogTitle').textContent='Favoritos';$('viewAllButton').classList.add('hidden');setNav('navFavorites');renderProducts();window.scrollTo({top:0,behavior:'smooth'});
  }
  async function openBasket(basket){
    const dialog=$('basketDialog'),content=$('basketDialogContent');content.innerHTML='<div class="state">Carregando cesta...</div>';dialog.showModal();
    try{
      const data=await api('basket_detail',{basket_id:basket.id}),b=data.basket,items=b.items||[];
      content.innerHTML=`<div class="basket-detail"><div class="basket-detail-hero"><img alt=""><div><h2></h2><div class="basket-detail-price"></div></div></div><div class="basket-detail-list"></div><div class="basket-dialog-actions"><button class="secondary" type="button">Continuar vendo</button><button class="primary" type="button">Quero esta cesta</button></div></div>`;
      const heroImg=content.querySelector('.basket-detail-hero img');heroImg.src=b.image_url||PLACEHOLDER;heroImg.alt=text(b.name)||'Cesta';content.querySelector('h2').textContent=/cesta/i.test(b.name)?b.name:`Cesta ${b.name}`;content.querySelector('.basket-detail-price').textContent=money(b.price);
      const list=content.querySelector('.basket-detail-list');for(const row of items){const el=document.createElement('div');el.className='basket-detail-item';el.innerHTML='<img alt=""><strong></strong><span></span>';el.querySelector('img').src=row.image_url||PLACEHOLDER;el.querySelector('img').alt=text(row.name);el.querySelector('strong').textContent=row.name;el.querySelector('span').textContent=`${Number(row.quantity||0)}x`;list.appendChild(el)}
      content.querySelector('.secondary').addEventListener('click',()=>dialog.close());content.querySelector('.primary').addEventListener('click',async()=>{try{const r=await api('basket_interest',{basket_id:b.id});location.href=r.whatsapp_url||state.whatsappUrl}catch(e){toast(e.message||'Não foi possível continuar')}});
    }catch(e){content.innerHTML='<div class="state">Não foi possível abrir esta cesta.</div>';toast(e.message||'Falha ao abrir a cesta')}
  }
  function openCart(){
    const rows=[...state.selection.values()],dialog=$('basketDialog'),content=$('basketDialogContent');if(!rows.length){toast('Seu carrinho está vazio');return}
    const {total}=selectionTotals();content.innerHTML='<div class="basket-detail"><div class="basket-detail-hero"><div><h2>Seu carrinho</h2><div class="basket-detail-price"></div></div></div><div class="basket-detail-list"></div><div class="basket-dialog-actions"><button class="secondary" type="button">Continuar vendo</button><button class="primary" type="button">Continuar no WhatsApp</button></div></div>';content.querySelector('.basket-detail-price').textContent=money(total);
    const list=content.querySelector('.basket-detail-list');for(const row of rows){const el=document.createElement('div');el.className='basket-detail-item';el.innerHTML='<img alt=""><strong></strong><span></span>';el.querySelector('img').src=row.product?.image_url||PLACEHOLDER;el.querySelector('img').alt=text(row.product?.name);el.querySelector('strong').textContent=text(row.product?.name)||'Produto';el.querySelector('span').textContent=`${row.quantity}x`;list.appendChild(el)}
    content.querySelector('.secondary').addEventListener('click',()=>dialog.close());content.querySelector('.primary').addEventListener('click',continueWhatsapp);dialog.showModal();
  }
  async function continueWhatsapp(){try{const data=await api('return_whatsapp');location.href=data.whatsapp_url||state.whatsappUrl||'https://wa.me/5565984491018'}catch{location.href=state.whatsappUrl||'https://wa.me/5565984491018'}}
  function applyOpen(data){
    if(data.token)rememberToken(data.token);state.session=data.session;state.items=data.items||[];state.homeItems=[...state.items];state.baskets=data.baskets||[];state.categories=data.categories||[];state.cart=data.cart||null;state.whatsappUrl=data.whatsapp_url||'';syncSelection(state.items);
    const isPublic=Boolean(data.session?.public_guest);$('viewAllButton').classList.toggle('hidden',!isPublic);setHomeVisible(isPublic);if(isPublic){renderBaskets();renderCategories();$('catalogTitle').textContent='Mais procurados'}else{$('catalogTitle').textContent=text(data.session?.title)||'Produtos'}renderProducts();
  }
  async function open(){
    try{const data=tokenOk(token)?await api('open'):await api('open_public');applyOpen(data);if(initialQuery.length>=2){$('searchInput').value=initialQuery;await browse('search',initialQuery,`Resultados para “${initialQuery}”`)}}
    catch(e){$('stateBox').textContent=e.message==='catalog_unavailable'?'Esta vitrine expirou ou não está mais disponível.':'Não foi possível abrir esta vitrine.'}
  }
  let searchTimer;
  $('searchInput').addEventListener('input',e=>{clearTimeout(searchTimer);const q=text(e.target.value);if(!q){restoreHome();return}if(q.length<2)return;searchTimer=setTimeout(()=>browse('search',q,`Resultados para “${q}”`),320)});
  $('viewAllButton').addEventListener('click',()=>browse('all','','Todos os produtos'));
  $('navHome').addEventListener('click',restoreHome);
  $('navCategories').addEventListener('click',()=>{restoreHome();setNav('navCategories');setTimeout(()=>$('categoryRail').scrollIntoView({behavior:'smooth',block:'center'}),60)});
  $('navFavorites').addEventListener('click',openFavorites);
  $('navAccount').addEventListener('click',()=>{setNav('navAccount');location.href=state.whatsappUrl||'https://wa.me/5565984491018'});
  $('cartButton').addEventListener('click',openCart);$('whatsappButton').addEventListener('click',continueWhatsapp);$('basketClose').addEventListener('click',()=>$('basketDialog').close());$('basketDialog').addEventListener('click',e=>{if(e.target===$('basketDialog'))$('basketDialog').close()});
  open();
})();
