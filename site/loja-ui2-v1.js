'use strict';

    function setQty(id, qty) {
      const product=state.productsById.get(String(id)); if (!product) return;
      const value=Math.max(0,Math.min(Number(qty)||0,product.stock));
      if (value<=0) {
        delete state.cart[id];state.cartOrder=state.cartOrder.filter(item=>item!==String(id));
      } else {
        state.cart[id]=value;if(!state.cartOrder.includes(String(id)))state.cartOrder.push(String(id));
      }
      saveCart();updateCartUi();syncControls();
      if ($('cart-drawer').classList.contains('open')) renderCart();
    }

    function addToCart(id, amount=1) {
      const product=state.productsById.get(String(id)); if (!isAvailable(product)) return toast('Produto indisponível.');
      const current=Number(state.cart[id]||0), next=Math.min(product.stock,current+amount);
      if(next===current)return toast(`Estoque máximo: ${product.stock}.`);
      setQty(String(id),next);toast('Produto adicionado.');
    }

    function addBundle(type, bundle, selectedRows) {
      const rows=selectedRows || resolveBundleProducts(bundle.products);
      if (!rows.length || (!selectedRows && rows.length !== bundle.products.length)) return toast('Alguns produtos deste conjunto não estão disponíveis.');
      const itemMap={};
      for (const row of rows) itemMap[row.product.id]=Number(itemMap[row.product.id]||0)+Number(row.qty||0);
      for (const [id,qty] of Object.entries(itemMap)) {
        const product=state.productsById.get(id);
        if (!product || Number(state.cart[id]||0)+qty>product.stock) return toast(`Estoque insuficiente para ${product ? product.name : 'um item'}.`);
      }
      Object.entries(itemMap).forEach(([id,qty])=>{
        state.cart[id]=Number(state.cart[id]||0)+qty;if(!state.cartOrder.includes(id))state.cartOrder.push(id);
      });
      const retail=rows.reduce((sum,row)=>sum+row.product.price*row.qty,0);
      const adjustment=type==='kit' ? round(bundle.price-retail) : round(bundle.price-resolveBundleProducts(bundle.products).reduce((sum,row)=>sum+row.product.price*row.qty,0));
      state.bundles.push({uid:`${type}-${bundle.id}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,type,id:bundle.id,name:bundle.name,items:itemMap,adjustment});
      saveCart();updateCartUi();syncControls();toast(type==='kit'?'Kit adicionado.':'Cesta adicionada.');
    }

    function favoriteKey(id,kind='product'){return kind==='kit'?`kit:${id}`:String(id)}
    function isFavorite(id,kind='product'){return state.favorites.has(favoriteKey(id,kind))}
    function toggleFavorite(id,kind='product'){
      const key=favoriteKey(id,kind);state.favorites.has(key)?state.favorites.delete(key):state.favorites.add(key);
      saveFavorites();updateCartUi();renderRoute();
    }

    function productRoute(product){return `${encodeURIComponent(product.codigo||product.id)}-${product.slug}`}
    function findRouteProduct(value){
      const raw=decodeURIComponent(String(value||'')).split('?')[0],code=raw.split('-')[0];
      return state.products.find(product=>norm(product.codigo)===norm(code)||norm(product.id)===norm(code)||norm(productRoute(product))===norm(raw)||product.slug===norm(raw))||null;
    }

    function controlHtml(product,full=false){
      const qty=Number(state.cart[product.id]||0);
      if(!isAvailable(product))return `<button class="add" disabled aria-label="Esgotado">×</button>`;
      if(!qty)return `<button class="add" data-action="add" data-id="${esc(product.id)}" type="button">${full?'Adicionar':'+'}</button>`;
      return `<div class="qty"><button data-action="dec" data-id="${esc(product.id)}" type="button">−</button><span>${qty}</span><button data-action="inc" data-id="${esc(product.id)}" type="button">+</button></div>`;
    }

    function favoriteHtml(id,kind='product'){
      return `<button class="favorite ${isFavorite(id,kind)?'active':''}" data-action="favorite" data-id="${esc(id)}" data-kind="${kind}" type="button" aria-label="Favoritar"><svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8z"></path></svg></button>`;
    }

    function productCard(product,eager=false){
      const display=productDisplay(product);
      return `<article class="card">
        <a class="card-media" href="#/produto/${productRoute(product)}">
          <img src="${esc(product.image)}" alt="${esc(product.name)}" width="420" height="420" loading="${eager?'eager':'lazy'}" decoding="async"${eager?' fetchpriority="high"':''} onerror="DAImageError(this)">
          ${display.discount?`<span class="discount">-${display.discount}%</span>`:''}
        </a>
        ${favoriteHtml(product.id)}
        <div class="card-body">
          <div class="eyebrow">${esc(product.brand||product.category)}</div>
          <a class="card-name" href="#/produto/${productRoute(product)}">${esc(product.name)}</a>
          ${product.expiryDays!=null&&product.expiryDays<=105?`<div class="expiry">Validade: ${esc(formatDate(product.expiry))}</div>`:''}
          <div class="card-bottom"><div>${display.original>display.effective?`<div class="old">${money(display.original)}</div>`:''}<div class="price">${money(display.effective)}</div></div>${controlHtml(product)}</div>
        </div>
      </article>`;
    }

    function pageHead(title,subtitle='',back='#/'){
      return `<div class="page-head"><a class="back" href="${back}" aria-label="Voltar"><svg viewBox="0 0 24 24"><path d="M19 12H5m7 7-7-7 7-7"></path></svg></a><div><h1>${esc(title)}</h1>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div></div>`;
    }

    function section(title,subtitle,content,href=''){
      if(!content)return'';
      return `<section class="section"><div class="section-head"><div><h2>${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>${href?`<a class="see-all" href="${href}">Ver todos</a>`:''}</div>${content}</section>`;
    }

    function getCategories(){
      const map=new Map();
      state.products.filter(isAvailable).forEach(product=>map.set(product.category,(map.get(product.category)||0)+1));
      return Array.from(map.entries()).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt-BR'));
    }

    function categoryImage(category){
      return (state.products.find(product=>isAvailable(product)&&norm(product.category)===norm(category)) || {}).image || CONFIG.LOGO;
    }

    function categoryGrid(limit=999){
      const categories=getCategories().slice(0,limit);
      return `<div class="category-grid">${categories.map(([category,count])=>`<a class="category" href="#/categoria/${encodeURIComponent(category)}"><img src="${esc(categoryImage(category))}" alt="" loading="lazy" decoding="async" onerror="DAImageError(this)"><div><strong>${esc(category)}</strong><span>${count} produtos</span></div></a>`).join('')}</div>`;
    }

    function topOffers(limit=20){
      return state.products.filter(product=>isAvailable(product)&&productDisplay(product).discount>0).sort((a,b)=>productDisplay(b).discount-productDisplay(a).discount||a.price-b.price).slice(0,limit);
    }

    function productSearch(query){
      const terms=norm(query).split(/\s+/).filter(Boolean);
      if(!terms.length)return state.products.filter(isAvailable);
      return state.products.filter(isAvailable).map(product=>{
        let score=0;
        for(const term of terms){
          if(!product.search.includes(term))return null;
          if(norm(product.codigo)===term||norm(product.gtin)===term)score+=100;
          else if(norm(product.name).startsWith(term))score+=50;
          else score+=15;
        }
        return {product,score};
      }).filter(Boolean).sort((a,b)=>b.score-a.score||a.product.name.localeCompare(b.product.name,'pt-BR')).map(item=>item.product);
    }

    function routineProducts(key){
      const routine=ROUTINES[key]||ROUTINES['compra-mes'];
      return state.products.filter(isAvailable).map(product=>{
        const score=routine.terms.reduce((sum,term)=>sum+(product.search.includes(norm(term))?1:0),0);
        return score?{product,score}:null;
      }).filter(Boolean).sort((a,b)=>b.score-a.score||a.product.price-b.product.price).map(item=>item.product);
    }

    function bannerActive(banner){
      if(!banner||banner.ativo===false||banner.status==='inativo')return false;
      const start=parseDate(banner.data_inicio||banner.inicio||banner.agendamento && banner.agendamento.inicio,false);
      const end=parseDate(banner.data_fim||banner.fim||banner.validade||banner.agendamento && banner.agendamento.fim,true);
      const now=new Date();return(!start||now>=start)&&(!end||now<=end);
    }

    function bannerPosition(banner){return norm(banner.posicao||banner.position||banner.local||banner.slot||banner.destino && banner.destino.posicao)}
    function bannerImage(banner){return canonicalImage(banner.imagem||banner.url_imagem||banner.image||banner.arquivo||banner.path)}
    function bannerHref(banner){
      const raw=banner.link && banner.link.url||banner.url_destino||banner.rota||banner.href||'';
      if(raw)return raw;
      const category=banner.categoria||banner.destino && banner.destino.categoria;if(category)return `#/categoria/${encodeURIComponent(category)}`;
      const product=banner.produto||banner.destino && banner.destino.produto;if(product)return `#/produto/${encodeURIComponent(product)}`;
      return '#/';
    }
    function bannerSlot(position,target=''){
      const wanted=norm(position),targetNorm=norm(target);
      const banners=state.banners.filter(banner=>{
        if(!bannerActive(banner)||bannerPosition(banner)!==wanted)return false;
        const bannerTarget=norm(banner.categoria||banner.marca||banner.subcategoria||banner.alvo||banner.destino && banner.destino.valor||'');
        return !targetNorm||!bannerTarget||bannerTarget===targetNorm;
      });
      if(!banners.length)return'';
      return `<div class="banner">${banners.map(banner=>`<a href="${esc(bannerHref(banner))}"><img src="${esc(bannerImage(banner))}" alt="${esc(banner.titulo||'Oferta')}" loading="lazy" decoding="async" onerror="DAImageError(this)"></a>`).join('')}</div>`;
    }

    function bundleCard(bundle,type){
      const rows=resolveBundleProducts(bundle.products),retail=rows.reduce((sum,row)=>sum+row.product.price*row.qty,0);
      const discount=retail>bundle.price?Math.round((retail-bundle.price)/retail*100):0;
      const href=type==='kit'?`#/kit/${encodeURIComponent(bundle.id)}`:`#/cesta/${encodeURIComponent(bundle.id)}`;
      return `<article class="bundle"><a class="bundle-media" href="${href}"><img src="${esc(bundle.image)}" alt="${esc(bundle.name)}" loading="lazy" decoding="async" onerror="DAImageError(this)">${discount?`<span class="discount">-${discount}%</span>`:''}</a><div class="bundle-copy"><h3><a href="${href}">${esc(bundle.name)}</a></h3><p>${esc(bundle.description||`${rows.length} produtos selecionados`)}</p><div>${retail>bundle.price?`<div class="old">${money(retail)}</div>`:''}<div class="price">${money(bundle.price)}</div></div><div class="bundle-actions"><a class="secondary" href="${href}">Ver itens</a><button class="primary" data-action="add-${type}" data-id="${esc(bundle.id)}" type="button">Adicionar</button></div></div></article>`;
    }

