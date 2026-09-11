(()=>{
  'use strict';

  const C=window.DA_CATALOGO_CONFIG||{};
  const $=id=>document.getElementById(id);
  const params=new URLSearchParams(location.search);
  let token=(params.get('c')||params.get('t')||params.get('token')||'').trim();
  const initialQuery=(params.get('q')||'').trim();
  const FAV_KEY='da_vitrine_favoritos_v1';
  const CART_KEY='da_vitrine_carrinho_v2';
  const PLACEHOLDER='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="100%" height="100%" fill="#ECECEC"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#80868b" font-family="Arial" font-size="26">sem foto</text></svg>');
  const state={
    session:null,
    items:[],
    homeItems:[],
    baskets:[],
    categories:[],
    cart:null,
    whatsappUrl:'',
    selection:new Map(),
    view:'home',
    favorites:loadJson(FAV_KEY,{}),
    publicGuest:false
  };

  const tokenOk=v=>/^[a-f0-9]{64}$/i.test(String(v||''));
  const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const text=v=>String(v??'').replace(/\s+/g,' ').trim();
  const productId=item=>String(item?.product_id||item?.product?.id||'');
  const toast=msg=>{const el=$('toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2100)};

  function loadJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch{return fallback}}
  function saveJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
  function saveFavorites(){saveJson(FAV_KEY,state.favorites)}
  function savePublicCart(){
    if(!state.publicGuest)return;
    const rows={};
    for(const [id,row] of state.selection.entries())rows[id]={quantity:Number(row.quantity||0),product:row.product||{}};
    saveJson(CART_KEY,rows);
  }
  function restorePublicCart(){
    const rows=loadJson(CART_KEY,{});
    for(const [id,row] of Object.entries(rows||{})){
      const q=Math.max(0,Math.trunc(Number(row?.quantity||0)));
      if(q>0)state.selection.set(String(id),{quantity:q,product:row?.product||{}});
    }
  }

  async function api(action,payload={}){
    const ctl=new AbortController();
    const timer=setTimeout(()=>ctl.abort(),12000);
    try{
      const r=await fetch(C.api,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action,token,...payload}),
        cache:'no-store',
        signal:ctl.signal
      });
      const data=await r.json().catch(()=>({ok:false,error:'invalid_response'}));
      if(!r.ok||!data.ok)throw new Error(data.detail||data.error||'Falha na vitrine');
      return data;
    }catch(e){
      if(e?.name==='AbortError')throw new Error('A conexão demorou demais. Tente novamente.');
      throw e;
    }finally{clearTimeout(timer)}
  }

  function rememberToken(next){
    if(!tokenOk(next))return;
    token=next;
    params.set('c',token);
    params.delete('t');
    params.delete('token');
    const qs=params.toString();
    history.replaceState(null,'',`${location.pathname}${qs?'?'+qs:''}${location.hash||''}`);
  }

  function mergeProductIntoSelection(item){
    const id=productId(item);
    if(!id)return;
    const existing=state.selection.get(id);
    const q=Number(existing?.quantity??item?.quantity??0);
    if(q>0)state.selection.set(id,{quantity:q,product:{...(existing?.product||{}),...(item.product||{})}});
  }

  function syncSelection(items){for(const item of items||[])mergeProductIntoSelection(item)}

  function selectionTotals(){
    let count=0,total=0;
    for(const row of state.selection.values()){
      const q=Number(row.quantity||0);
      count+=q;
      total+=q*Number(row.product?.price||0);
    }
    return {count,total};
  }

  function renderTotals(){
    const {count,total}=selectionTotals();
    $('selectedCount').textContent=`${count} ${count===1?'item':'itens'}`;
    $('countBadge').textContent=String(count);
    $('selectedTotal').textContent=money(total);
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
    const host=$('basketRail');
    host.innerHTML='';
    for(const basket of state.baskets){
      const frag=$('basketTemplate').content.cloneNode(true);
      const card=frag.querySelector('.basket-card');
      const img=frag.querySelector('.basket-image');
      img.src=basket.image_url||PLACEHOLDER;
      img.alt=text(basket.name)||'Cesta básica';
      const name=text(basket.name);
      frag.querySelector('.basket-name').textContent=/cesta/i.test(name)?name:`Cesta ${name}`;
      frag.querySelector('.basket-price').textContent=money(basket.price);
      card.addEventListener('click',()=>openBasket(basket));
      host.appendChild(frag);
    }
  }

  function renderCategories(){
    const host=$('categoryRail');
    host.innerHTML='';
    for(const category of state.categories){
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='category-button';
      btn.dataset.category=category.id;
      btn.innerHTML=`<span class="category-icon">${iconSvg(category.id)}</span><span class="category-label"></span>`;
      btn.querySelector('.category-label').textContent=category.label;
      btn.addEventListener('click',()=>browse('category',category.id,category.label));
      host.appendChild(btn);
    }
  }

  function setNav(active){for(const id of ['navHome','navCategories','navFavorites','navAccount'])$(id).classList.toggle('active',id===active)}
  function setHomeVisible(show){$('homeBlocks').classList.toggle('hidden',!show)}

  function maxProductQty(product,current){
    const raw=product?.stock;
    if(raw===null||raw===undefined||raw==='')return Math.max(99,current);
    const stock=Math.max(0,Math.floor(Number(raw)||0));
    return Math.max(current,stock);
  }

  function setProductQty(item,next){
    const id=productId(item);
    if(!id)return;
    const p=item.product||{};
    const quantity=Math.max(0,Math.trunc(Number(next||0)));
    if(quantity>0)state.selection.set(id,{quantity,product:p});
    else state.selection.delete(id);
    item.quantity=quantity;
    for(const collection of [state.items,state.homeItems]){
      for(const row of collection){if(productId(row)===id)row.quantity=quantity}
    }
    savePublicCart();
    renderProducts();
  }

  function renderProducts(){
    const host=$('productGrid');
    host.innerHTML='';
    if(!state.items.length){
      $('stateBox').textContent=state.view==='favorites'?'Você ainda não salvou produtos favoritos.':'Nenhum produto encontrado.';
      $('stateBox').classList.remove('hidden');
      host.classList.add('hidden');
      renderTotals();
      return;
    }

    $('stateBox').classList.add('hidden');
    host.classList.remove('hidden');

    for(const item of state.items){
      const p=item.product||{};
      const id=productId(item);
      const frag=$('productTemplate').content.cloneNode(true);
      const card=frag.querySelector('.product');
      card.dataset.id=id;
      const img=frag.querySelector('.product-image');
      img.src=p.image_url||PLACEHOLDER;
      img.alt=text(p.name)||'Produto';
      frag.querySelector('.product-name').textContent=text(p.name)||'Produto';
      const meta=[text(p.packaging),text(p.brand)].filter(Boolean).join(' · ');
      const metaEl=frag.querySelector('.product-meta');
      metaEl.textContent=meta;
      if(!meta)metaEl.hidden=true;
      frag.querySelector('.product-price').textContent=money(p.price);

      const fav=frag.querySelector('.favorite');
      fav.classList.toggle('on',Boolean(state.favorites[id]));
      fav.setAttribute('aria-label',state.favorites[id]?'Remover dos favoritos':'Adicionar aos favoritos');
      fav.addEventListener('click',()=>{
        if(state.favorites[id]){delete state.favorites[id];toast('Removido dos favoritos')}
        else{state.favorites[id]={product_id:id,product:p};toast('Salvo nos favoritos')}
        saveFavorites();
        renderProducts();
      });

      const selected=state.selection.get(id);
      const qty=Number(selected?.quantity??item.quantity??0);
      const max=maxProductQty(p,qty);
      const add=frag.querySelector('.add-button');
      const qtyRow=frag.querySelector('.qty-row');
      const qtyEl=frag.querySelector('.qty');
      const minus=frag.querySelector('.minus');
      const plus=frag.querySelector('.plus');

      qtyEl.textContent=String(qty);
      add.classList.toggle('hidden',qty>0);
      qtyRow.classList.toggle('hidden',qty<=0);
      minus.disabled=qty<=0;
      plus.disabled=qty>=max;
      add.addEventListener('click',()=>setProductQty(item,1));
      minus.addEventListener('click',()=>setProductQty(item,qty-1));
      plus.addEventListener('click',()=>{
        if(qty>=max){toast('Estoque máximo deste produto atingido.');return}
        setProductQty(item,qty+1);
      });
      host.appendChild(frag);
    }
    renderTotals();
  }

  function showLoading(title){
    $('catalogTitle').textContent=title;
    $('stateBox').textContent='Carregando produtos...';
    $('stateBox').classList.remove('hidden');
    $('productGrid').classList.add('hidden');
  }

  async function browse(mode,value,title){
    state.view=mode;
    setHomeVisible(false);
    setNav(mode==='category'?'navCategories':'navHome');
    showLoading(title||'Produtos');
    $('viewAllButton').classList.add('hidden');
    try{
      const data=await api('browse',{mode,value});
      state.items=data.items||[];
      syncSelection(state.items);
      renderProducts();
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(e){
      $('stateBox').textContent='Não foi possível carregar estes produtos.';
      toast(e.message||'Falha na busca');
    }
  }

  function restoreHome(){
    state.view='home';
    state.items=state.homeItems;
    $('searchInput').value='';
    $('catalogTitle').textContent=state.publicGuest?'Mais procurados':(text(state.session?.title)||'Produtos');
    $('viewAllButton').classList.toggle('hidden',!state.publicGuest);
    setHomeVisible(state.publicGuest);
    setNav('navHome');
    renderProducts();
  }

  function openFavorites(){
    const list=Object.values(state.favorites).map(x=>({...x,quantity:state.selection.get(String(x.product_id))?.quantity||0}));
    state.view='favorites';
    state.items=list;
    setHomeVisible(false);
    $('catalogTitle').textContent='Favoritos';
    $('viewAllButton').classList.add('hidden');
    setNav('navFavorites');
    renderProducts();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function basketLocalTotal(basket,selection){
    let total=Number(basket.base_price??basket.price??0);
    for(const row of basket.items||[]){
      const q=Number(selection.get(String(row.product_id))??row.base_quantity??row.quantity??0);
      const base=Number(row.base_quantity??row.quantity??0);
      if(q<base)total-=(base-q)*Number(row.remove_unit_delta||0);
      else if(q>base)total+=(q-base)*Number(row.add_unit_delta||0);
    }
    return Math.max(0,Math.round((total+Number.EPSILON)*100)/100);
  }

  async function openBasket(basket){
    const dialog=$('basketDialog');
    const content=$('basketDialogContent');
    content.innerHTML='<div class="state">Carregando cesta...</div>';
    if(!dialog.open)dialog.showModal();

    try{
      const data=await api('basket_detail',{basket_id:basket.id});
      const b=data.basket;
      const selection=new Map((b.selection||[]).map(x=>[String(x.product_id),Number(x.quantity||0)]));
      let sending=false;

      content.innerHTML='<div class="basket-detail basket-editor"><div class="basket-detail-hero"><img alt=""><div><h2></h2><div class="basket-total-label">Valor da cesta</div><div class="basket-detail-price"></div></div></div><div class="basket-editor-note">Use − e + para ajustar. Quantidade 0 retira o produto.</div><div class="basket-detail-list"></div><div class="basket-dialog-actions"><button class="secondary" type="button">Continuar vendo</button><button class="primary" type="button">Enviar cesta no WhatsApp</button></div></div>';

      const hero=content.querySelector('.basket-detail-hero img');
      hero.src=b.image_url||PLACEHOLDER;
      hero.alt=text(b.name)||'Cesta';
      content.querySelector('h2').textContent=/cesta/i.test(b.name)?b.name:`Cesta ${b.name}`;
      const priceEl=content.querySelector('.basket-detail-price');
      const list=content.querySelector('.basket-detail-list');
      const sendBtn=content.querySelector('.primary');

      const render=()=>{
        priceEl.textContent=money(basketLocalTotal(b,selection));
        list.innerHTML='';
        for(const row of b.items||[]){
          const id=String(row.product_id);
          const q=Number(selection.get(id)||0);
          const min=0;
          const max=Math.max(Number(row.base_quantity||0),Number(row.max_quantity??99));
          const removed=q===0;
          const el=document.createElement('div');
          el.className=`basket-detail-item basket-edit-row${removed?' is-removed':''}`;
          el.innerHTML='<img alt=""><div class="basket-edit-copy"><strong></strong><span class="basket-removed-label"></span></div><div class="basket-stepper"><button class="basket-minus" type="button" aria-label="Diminuir">−</button><span class="basket-qty"></span><button class="basket-plus" type="button" aria-label="Aumentar">＋</button></div>';

          const img=el.querySelector('img');
          img.src=row.image_url||PLACEHOLDER;
          img.alt=text(row.name);
          el.querySelector('strong').textContent=row.name;
          el.querySelector('.basket-removed-label').textContent=removed?'Removido':'';
          el.querySelector('.basket-qty').textContent=String(q);

          const minus=el.querySelector('.basket-minus');
          const plus=el.querySelector('.basket-plus');
          minus.disabled=sending||q<=min;
          plus.disabled=sending||q>=max;

          minus.addEventListener('click',()=>{
            if(sending||q<=min)return;
            selection.set(id,q-1);
            render();
          });
          plus.addEventListener('click',()=>{
            if(sending)return;
            if(q>=max){toast('Estoque máximo deste produto atingido.');return}
            selection.set(id,q+1);
            render();
          });
          list.appendChild(el);
        }
      };

      render();
      content.querySelector('.secondary').addEventListener('click',()=>dialog.close());
      sendBtn.addEventListener('click',async()=>{
        if(sending)return;
        sending=true;
        sendBtn.disabled=true;
        sendBtn.textContent='Abrindo WhatsApp...';
        try{
          const selectionPayload=(b.items||[]).map(row=>({product_id:String(row.product_id),quantity:Number(selection.get(String(row.product_id))||0)}));
          const result=await api('basket_interest',{basket_id:b.id,selection:selectionPayload});
          if(!result.whatsapp_url)throw new Error('whatsapp_url_missing');
          window.location.assign(result.whatsapp_url);
        }catch(e){
          sending=false;
          sendBtn.disabled=false;
          sendBtn.textContent='Enviar cesta no WhatsApp';
          const msg=e.message==='basket_empty'?'A cesta ficou sem produtos.':e.message==='stock_insufficient'?'A quantidade escolhida ultrapassa o estoque disponível.':e.message||'Não foi possível abrir o WhatsApp.';
          toast(msg);
          render();
        }
      });
    }catch(e){
      content.innerHTML='<div class="state">Não foi possível abrir esta cesta.</div>';
      toast(e.message||'Falha ao abrir a cesta');
    }
  }

  function openCart(){
    const rows=[...state.selection.values()].filter(x=>Number(x.quantity||0)>0);
    const dialog=$('basketDialog');
    const content=$('basketDialogContent');
    if(!rows.length){toast('Seu carrinho está vazio');return}

    const {total}=selectionTotals();
    content.innerHTML='<div class="basket-detail"><div class="basket-detail-hero"><div><h2>Seu carrinho</h2><div class="basket-detail-price"></div></div></div><div class="basket-detail-list"></div><div class="basket-dialog-actions"><button class="secondary" type="button">Continuar vendo</button><button class="primary" type="button">Continuar no WhatsApp</button></div></div>';
    content.querySelector('.basket-detail-price').textContent=money(total);
    const list=content.querySelector('.basket-detail-list');

    for(const row of rows){
      const el=document.createElement('div');
      el.className='basket-detail-item';
      el.innerHTML='<img alt=""><strong></strong><span></span>';
      el.querySelector('img').src=row.product?.image_url||PLACEHOLDER;
      el.querySelector('img').alt=text(row.product?.name);
      el.querySelector('strong').textContent=text(row.product?.name)||'Produto';
      el.querySelector('span').textContent=`${row.quantity}x`;
      list.appendChild(el);
    }

    content.querySelector('.secondary').addEventListener('click',()=>dialog.close());
    content.querySelector('.primary').addEventListener('click',continueWhatsapp);
    if(!dialog.open)dialog.showModal();
  }

  async function continueWhatsapp(){
    const items=[...state.selection.entries()].filter(([,row])=>Number(row.quantity||0)>0).map(([id,row])=>({product_id:id,quantity:Number(row.quantity||0)}));
    if(!items.length){toast('Escolha pelo menos um produto.');return}

    const btn=$('whatsappButton');
    const old=btn.textContent;
    btn.disabled=true;
    btn.textContent='Abrindo WhatsApp...';
    try{
      const data=await api('return_whatsapp',{items});
      if(!data.whatsapp_url)throw new Error('whatsapp_url_missing');
      window.location.assign(data.whatsapp_url);
    }catch(e){
      const msg=e.message==='stock_insufficient'?'Uma quantidade ultrapassa o estoque disponível.':e.message||'Não foi possível abrir o WhatsApp.';
      toast(msg);
      btn.disabled=false;
      btn.textContent=old;
    }
  }

  function applyOpen(data){
    if(data.token)rememberToken(data.token);
    state.session=data.session||{};
    state.publicGuest=Boolean(data.session?.public_guest);
    state.items=data.items||[];
    state.homeItems=[...state.items];
    state.baskets=data.baskets||[];
    state.categories=data.categories||[];
    state.cart=data.cart||null;
    state.whatsappUrl=data.whatsapp_url||'';

    if(state.publicGuest)restorePublicCart();
    syncSelection(state.items);

    $('viewAllButton').classList.toggle('hidden',!state.publicGuest);
    setHomeVisible(state.publicGuest);
    if(state.publicGuest){
      renderBaskets();
      renderCategories();
      $('catalogTitle').textContent='Mais procurados';
    }else{
      $('catalogTitle').textContent=text(data.session?.title)||'Produtos';
    }
    renderProducts();
  }

  async function open(){
    try{
      const data=tokenOk(token)?await api('open'):await api('open_public');
      applyOpen(data);
      if(initialQuery.length>=2){
        $('searchInput').value=initialQuery;
        await browse('search',initialQuery,`Resultados para “${initialQuery}”`);
      }
    }catch(e){
      $('stateBox').textContent=e.message==='catalog_unavailable'?'Esta vitrine expirou ou não está mais disponível.':'Não foi possível abrir esta vitrine.';
      toast(e.message||'Falha ao abrir');
    }
  }

  let searchTimer;
  $('searchInput').addEventListener('input',e=>{
    clearTimeout(searchTimer);
    const q=text(e.target.value);
    if(!q){restoreHome();return}
    if(q.length<2)return;
    searchTimer=setTimeout(()=>browse('search',q,`Resultados para “${q}”`),260);
  });
  $('viewAllButton').addEventListener('click',()=>browse('all','','Todos os produtos'));
  $('navHome').addEventListener('click',restoreHome);
  $('navCategories').addEventListener('click',()=>{
    restoreHome();
    setNav('navCategories');
    setTimeout(()=>$('categoryRail').scrollIntoView({behavior:'smooth',block:'center'}),60);
  });
  $('navFavorites').addEventListener('click',openFavorites);
  $('navAccount').addEventListener('click',()=>{setNav('navAccount');window.location.assign(state.whatsappUrl||'https://wa.me/5565984491018')});
  $('cartButton').addEventListener('click',openCart);
  $('whatsappButton').addEventListener('click',continueWhatsapp);
  $('basketClose').addEventListener('click',()=>$('basketDialog').close());
  $('basketDialog').addEventListener('click',e=>{if(e.target===$('basketDialog'))$('basketDialog').close()});

  open();
})();
