(()=>{
  'use strict';

  const app=window.DA_COMPRAR_APP;
  if(!app)return;
  const {state,stage,image,money,escapeHtml,text,toast,setCart,api,productApi,registerPendingProductSync}=app;
  const pendingProductSyncs=state.pendingProductSyncs;
  const registry=new Map(),syncState=new Map();
  let generation=0,offset=0,hasMore=true,loading=false,activeStage=null,productGrid=null,detailLayer=null;

  function sectionConfig(label){
    if(label==='Ofertas')return {customerCategory:'',offers:true,label:'Ofertas'};
    if(label==='Para Casa')return {customerCategory:'Para Casa',offers:false,label:'Para Casa'};
    return {customerCategory:'Para Você',offers:false,label:'Para Você'};
  }

  function hasOfferPrice(product){
    if(product?.is_offer!==true||product?.offer_price===null||product?.offer_price===undefined||product?.offer_price==='')return false;
    const value=Number(product.offer_price);return Number.isFinite(value)&&value>=0;
  }

  function effectiveProductPrice(product){return hasOfferPrice(product)?Number(product.offer_price):Number(product?.price||0)}

  function appendProductPrice(host,product){
    const pricing=document.createElement('div');pricing.className='product-pricing';
    if(hasOfferPrice(product)){
      const regular=document.createElement('span');regular.className='product-price-regular';regular.textContent=money(product.price);pricing.appendChild(regular);
      const offer=document.createElement('strong');offer.className='price product-price-offer';offer.textContent=money(product.offer_price);pricing.appendChild(offer);
    }else{
      const price=document.createElement('strong');price.className='price';price.textContent=money(product.price);pricing.appendChild(price);
    }
    host.appendChild(pricing);
  }

  function detailPriceHtml(product){
    if(!hasOfferPrice(product))return `<strong class="product-detail-price">${money(product.price)}</strong>`;
    return `<div class="product-detail-offer"><span class="product-offer-badge">OFERTA</span><span class="product-price-regular">${money(product.price)}</span><strong class="product-detail-price product-price-offer">${money(product.offer_price)}</strong></div>`;
  }

  function renderEntry({auto=false,section=''}={}){
    document.querySelectorAll('.stage.products-entry-stage,.stage.products-stage,.stage.checkout-stage,.stage.order-review-stage').forEach(el=>el.remove());
    if(!auto||section)return openSection(section||'Para Você');
    const host=stage(2,'Adicionar produtos','','products-entry-stage');if(!host)return null;
    const chips=document.createElement('div');chips.className='chips products-entry-chips';host.appendChild(chips);
    for(const label of ['Para Você','Para Casa','Ofertas']){
      const button=document.createElement('button');button.type='button';button.className='chip';button.textContent=label;button.onclick=()=>openSection(label);chips.appendChild(button);
    }
    return host;
  }

  async function openSection(label='Para Você'){
    const config=sectionConfig(label);
    state.productFilters={customerCategory:config.customerCategory,subcategory:'',subsubcategory:'',offers:config.offers,query:''};
    document.querySelectorAll('.stage.products-entry-stage,.stage.products-stage,.stage.checkout-stage,.stage.order-review-stage').forEach(el=>el.remove());
    document.querySelectorAll('.products-browser-message').forEach(el=>el.remove());
    app.assistantMessage(`Veja ${config.label==='Ofertas'?'as ofertas':'os produtos de '+config.label}.`,{className:'products-browser-message'});
    const host=stage(2,'Adicionar produtos',config.label,'products-stage');activeStage=host;if(!host)return;

    const selector=document.createElement('div');selector.className='chips products-section-chips';
    for(const choice of ['Para Você','Para Casa','Ofertas']){const button=document.createElement('button');button.type='button';button.className=`chip ${choice===label?'active':''}`;button.textContent=choice;button.onclick=()=>openSection(choice);selector.appendChild(button)}host.appendChild(selector);
    const sticky=document.createElement('div');sticky.className='products-filter-sticky';host.appendChild(sticky);
    const search=document.createElement('form');search.className='product-search';search.innerHTML='<input type="search" autocomplete="off" placeholder="Buscar produto"><button type="submit">Buscar</button>';sticky.appendChild(search);
    search.onsubmit=event=>{event.preventDefault();state.productFilters.query=text(search.querySelector('input').value);resetProducts()};
    const categories=document.createElement('div');categories.className='chips chips-categories';categories.dataset.categories='1';sticky.appendChild(categories);
    const subcategories=document.createElement('div');subcategories.className='chips chips-subcategories';subcategories.dataset.subcategories='1';subcategories.hidden=true;sticky.appendChild(subcategories);
    productGrid=document.createElement('div');productGrid.className='products-grid';host.appendChild(productGrid);
    const bottom=document.createElement('div');bottom.className='products-loading';bottom.dataset.productsLoading='1';host.appendChild(bottom);
    const requestGeneration=++generation;resetPagination();renderFilterChips([],{});
    try{
      const [filters]=await Promise.all([productApi('filters',{customer_category:config.customerCategory,offers:config.offers}),loadMore(requestGeneration)]);
      if(requestGeneration!==generation)return;
      const list=(filters.subcategories||[]).slice().sort((a,b)=>String(a.label||'').localeCompare(String(b.label||''),'pt-BR'));
      state.productFilters.availableCategories=list;state.productFilters.availableSubcategories=filters.subsubcategories||{};renderFilterChips(list,filters.subsubcategories||{});
    }catch(error){if(requestGeneration!==generation)return;toast(error.message)}
    app.scrollTo(host,{block:'start'});
  }

  async function openLookup(query=''){
    const value=text(query);if(!value)return renderEntry({auto:false});
    state.productFilters={customerCategory:'',subcategory:'',subsubcategory:'',offers:false,query:value,availableCategories:[],availableSubcategories:{}};
    document.querySelectorAll('.stage.products-entry-stage,.stage.products-stage,.stage.checkout-stage,.stage.order-review-stage').forEach(el=>el.remove());
    document.querySelectorAll('.products-browser-message').forEach(el=>el.remove());
    const host=stage(2,'Produtos encontrados',`Busca: ${value}`,'products-stage');activeStage=host;if(!host)return;
    const selector=document.createElement('div');selector.className='chips products-section-chips';
    for(const choice of ['Para Você','Para Casa','Ofertas']){const button=document.createElement('button');button.type='button';button.className='chip';button.textContent=choice;button.onclick=()=>openSection(choice);selector.appendChild(button)}host.appendChild(selector);
    const sticky=document.createElement('div');sticky.className='products-filter-sticky';host.appendChild(sticky);
    const search=document.createElement('form');search.className='product-search';search.innerHTML='<input type="search" autocomplete="off" placeholder="Buscar produto"><button type="submit">Buscar</button>';sticky.appendChild(search);
    const input=search.querySelector('input');if(input)input.value=value;
    search.onsubmit=event=>{event.preventDefault();state.productFilters.query=text(search.querySelector('input').value);resetProducts()};
    productGrid=document.createElement('div');productGrid.className='products-grid';host.appendChild(productGrid);
    const bottom=document.createElement('div');bottom.className='products-loading';bottom.dataset.productsLoading='1';host.appendChild(bottom);
    const requestGeneration=++generation;resetPagination();await loadMore(requestGeneration);app.scrollTo(host,{block:'start'});
  }

  function renderFilterChips(categories=[],subMap={}){
    if(!activeStage)return;const categoryHost=activeStage.querySelector('[data-categories]'),subHost=activeStage.querySelector('[data-subcategories]');if(!categoryHost||!subHost)return;
    categoryHost.innerHTML='';const all=document.createElement('button');all.type='button';all.className=`chip ${!state.productFilters.subcategory?'active':''}`;all.textContent='Todos';all.onclick=()=>{state.productFilters.subcategory='';state.productFilters.subsubcategory='';resetProducts()};categoryHost.appendChild(all);
    for(const category of categories){const button=document.createElement('button');button.type='button';button.className=`chip ${state.productFilters.subcategory===category.key?'active':''}`;button.textContent=category.label;button.onclick=()=>{state.productFilters.subcategory=category.key;state.productFilters.subsubcategory='';resetProducts()};categoryHost.appendChild(button)}
    subHost.innerHTML='';const leaves=state.productFilters.subcategory?(subMap[state.productFilters.subcategory]||[]):[];subHost.hidden=!leaves.length;if(!leaves.length)return;
    const subAll=document.createElement('button');subAll.type='button';subAll.className=`chip ${!state.productFilters.subsubcategory?'active':''}`;subAll.textContent='Todos';subAll.onclick=()=>{state.productFilters.subsubcategory='';resetProducts()};subHost.appendChild(subAll);
    for(const sub of leaves){const button=document.createElement('button');button.type='button';button.className=`chip ${state.productFilters.subsubcategory===sub.key?'active':''}`;button.textContent=sub.label;button.onclick=()=>{state.productFilters.subsubcategory=sub.key;resetProducts()};subHost.appendChild(button)}
  }

  function resetPagination(){offset=0;hasMore=true;loading=false;if(productGrid)productGrid.innerHTML=''}
  function resetProducts(){const requestGeneration=++generation;resetPagination();renderFilterChips(state.productFilters.availableCategories||[],state.productFilters.availableSubcategories||{});loadMore(requestGeneration)}
  function renderLoadMore(){const host=activeStage?.querySelector('[data-products-loading]');if(!host)return;host.innerHTML='';if(!hasMore)return;const button=document.createElement('button');button.type='button';button.className='secondary products-more';button.setAttribute('data-products-more','1');button.textContent='Ver mais';button.onclick=()=>loadMore(generation);host.appendChild(button)}

  async function loadMore(requestGeneration=generation){
    if(loading||!hasMore||!productGrid)return;loading=true;const loadingNode=activeStage?.querySelector('[data-products-loading]');if(loadingNode)loadingNode.textContent='Carregando…';
    try{
      const data=await productApi('page',{customer_category:state.productFilters.customerCategory,offers:state.productFilters.offers,customer_subcategory:state.productFilters.subcategory,customer_subsubcategory:state.productFilters.subsubcategory,q:state.productFilters.query,offset,limit:24});
      if(requestGeneration!==generation)return;
      if(offset===0&&data.personalized===true&&activeStage&&!activeStage.querySelector('.personalized-offers-note')){
        const note=document.createElement('div');note.className='personalized-offers-note';note.textContent='Primeiro aparecem ofertas mais próximas das suas compras. As demais ofertas continuam disponíveis abaixo.';activeStage.insertBefore(note,productGrid);
      }
      const products=data.products||[];
      if(offset===0&&!products.length){const empty=document.createElement('div');empty.className='products-empty';empty.textContent='Nenhum produto encontrado.';productGrid.appendChild(empty)}
      for(const product of products){registry.set(String(product.id),product);productGrid.appendChild(productCard(product))}
      offset=data.next_offset??offset+products.length;hasMore=data.has_more===true;
    }catch(error){if(requestGeneration!==generation)return;if(loadingNode)loadingNode.textContent='Não consegui carregar mais produtos.';toast(error.message);return}finally{if(requestGeneration===generation)loading=false}
    if(requestGeneration===generation)renderLoadMore();
  }

  function productState(product){
    const key=String(product.id);let sync=syncState.get(key);
    if(!sync){const quantity=Math.max(0,Number(product.quantity||0));sync={desiredQuantity:quantity,confirmedQuantity:quantity,syncing:false,product};syncState.set(key,sync)}else sync.product=product;return sync;
  }

  function productCard(product){
    const sync=productState(product),card=document.createElement('article');card.className='product';card.dataset.productId=String(product.id);
    const picture=image(product.image_url,product.name);picture.className='product-detail-trigger';picture.onclick=()=>openDetail(product);card.appendChild(picture);
    if(hasOfferPrice(product)){const badge=document.createElement('span');badge.className='product-offer-badge';badge.textContent='OFERTA';card.appendChild(badge)}
    const title=document.createElement('h3');title.className='product-detail-trigger';title.textContent=product.name||'Produto';title.onclick=()=>openDetail(product);card.appendChild(title);
    const meta=document.createElement('div');meta.className='meta';meta.textContent=[product.brand,product.packaging].filter(Boolean).join(' · ');card.appendChild(meta);
    appendProductPrice(card,product);
    if(product.personalized_reason){
      const reason=document.createElement('div');reason.className='product-personalized-reason';reason.textContent=product.personalized_reason;card.appendChild(reason);
    }
    const qty=document.createElement('div');qty.className='qty';const minus=document.createElement('button'),num=document.createElement('span'),plus=document.createElement('button');minus.type=plus.type='button';minus.textContent='−';plus.textContent='+';num.dataset.qty='1';num.textContent=String(sync.desiredQuantity);minus.onclick=()=>changeQuantity(product,-1);plus.onclick=()=>changeQuantity(product,1);qty.append(minus,num,plus);card.appendChild(qty);return card;
  }

  function refreshProductViews(productId){const sync=syncState.get(String(productId));if(!sync)return;document.querySelectorAll(`[data-product-id="${CSS.escape(String(productId))}"] [data-qty]`).forEach(node=>{node.textContent=String(sync.desiredQuantity)});if(detailLayer?.dataset.productId===String(productId)){const node=detailLayer.querySelector('[data-detail-qty]');if(node)node.textContent=String(sync.desiredQuantity)}}
  function applyOptimisticDelta(product,before,after){
    const cart=state.cart?structuredClone(state.cart):{items:[],total:0};if(!Array.isArray(cart.items))cart.items=[];
    const key=String(product.id),unitPrice=effectiveProductPrice(product);let item=cart.items.find(entry=>String(entry.product_id)===key&&entry.source==='addon');
    if(!item&&after>0){item={product_id:product.id,source:'addon',quantity:0,unit_price:unitPrice,line_total:0,product:{id:product.id,name:product.name,image_url:product.image_url,price:product.price,offer_price:product.offer_price,is_offer:product.is_offer,customer_category:product.customer_category,customer_subcategory:product.customer_subcategory}};cart.items.push(item)}
    if(item){item.unit_price=unitPrice;item.quantity=after;item.line_total=after*unitPrice;if(after<=0)cart.items=cart.items.filter(entry=>entry!==item)}
    const currentTotal=Number(cart.total??cart.commercial_total??0),nextTotal=Math.max(0,currentTotal+(after-before)*unitPrice);cart.total=nextTotal;if(Object.prototype.hasOwnProperty.call(cart,'commercial_total'))cart.commercial_total=nextTotal;setCart(cart);
  }

  function changeQuantity(product,delta){
    const sync=productState(product),before=sync.desiredQuantity,next=Math.max(0,before+delta);if(next===before)return;
    sync.desiredQuantity=next;product.quantity=next;refreshProductViews(product.id);applyOptimisticDelta(product,before,next);
    if(!sync.syncing){const promise=syncProduct(product,sync);registerPendingProductSync(product.id,promise)}
  }

  function addSuggestedProduct(product){const sync=productState(product);if(sync.desiredQuantity>0)return false;changeQuantity(product,1);return true}

  async function syncProduct(product,sync){
    sync.syncing=true;const cardSelector=`[data-product-id="${CSS.escape(String(product.id))}"]`;document.querySelectorAll(cardSelector).forEach(card=>card.classList.add('saving'));
    try{
      while(sync.desiredQuantity!==sync.confirmedQuantity){const target=sync.desiredQuantity;try{const data=await api('set_quantity',{product_id:product.id,quantity:target});const confirmed=Math.max(0,Number(data.quantity??target));sync.confirmedQuantity=confirmed;if(sync.desiredQuantity===target&&confirmed!==target)sync.desiredQuantity=confirmed;product.quantity=sync.desiredQuantity;if(data.cart)setCart(data.cart);refreshProductViews(product.id)}catch(error){const current=sync.desiredQuantity;sync.desiredQuantity=sync.confirmedQuantity;product.quantity=sync.confirmedQuantity;applyOptimisticDelta(product,current,sync.confirmedQuantity);refreshProductViews(product.id);toast(error.message);break}}
    }finally{sync.syncing=false;document.querySelectorAll(cardSelector).forEach(card=>card.classList.remove('saving'))}
  }

  async function waitForPending(){while(pendingProductSyncs.size)await app.waitForPendingProductSyncs()}

  function openDetail(product){
    closeDetail();const sync=productState(product);detailLayer=document.createElement('div');detailLayer.className='product-detail-layer open';detailLayer.dataset.productId=String(product.id);
    detailLayer.innerHTML=`<button class="product-detail-backdrop" type="button" aria-label="Fechar"></button><section class="product-detail-sheet" role="dialog" aria-modal="true"><button class="product-detail-close" type="button" aria-label="Fechar">×</button><div class="product-detail-image"></div><div class="product-detail-copy"><h2>${escapeHtml(product.name||'Produto')}</h2><p class="product-detail-meta">${escapeHtml([product.brand,product.packaging].filter(Boolean).join(' · '))}</p>${detailPriceHtml(product)}${product.personalized_reason?`<p class="product-detail-personalized">${escapeHtml(product.personalized_reason)}</p>`:''}${product.description_short?`<p class="product-detail-description">${escapeHtml(product.description_short)}</p>`:''}<div class="product-detail-actions"><div class="product-detail-qty"><button type="button" data-detail-minus>−</button><strong data-detail-qty>${sync.desiredQuantity}</strong><button type="button" data-detail-plus>+</button></div></div></div></section>`;
    detailLayer.querySelector('.product-detail-image').appendChild(image(product.image_url,product.name));detailLayer.querySelector('.product-detail-backdrop').onclick=closeDetail;detailLayer.querySelector('.product-detail-close').onclick=closeDetail;detailLayer.querySelector('[data-detail-minus]').onclick=()=>changeQuantity(product,-1);detailLayer.querySelector('[data-detail-plus]').onclick=()=>changeQuantity(product,1);document.body.appendChild(detailLayer);document.body.classList.add('product-detail-open');
  }
  function closeDetail(){if(detailLayer){detailLayer.remove();detailLayer=null}document.body.classList.remove('product-detail-open')}
  window.addEventListener('keydown',event=>{if(event.key==='Escape')closeDetail()});

  app.registerModule('products',{renderEntry,openSection,openLookup,resetProducts,loadMore,changeQuantity,addSuggestedProduct,openDetail,closeDetail,waitForPending});
})();