'use strict';

    function renderHome(){
      const offers=topOffers(10),baskets=state.baskets.slice(0,4),kits=state.kits.filter(kitActive).slice(0,4);
      const essentials=state.products.filter(isAvailable).sort((a,b)=>a.price-b.price).slice(0,10);
      app.innerHTML=`<div class="container">
        ${bannerSlot('home.topo')}
        <section class="hero"><small>Supermercado online local</small><h1>Compra simples, rápida e sem cadastro obrigatório.</h1><p>Escolha produtos, cestas ou kits. Confira tudo e envie o pedido pelo WhatsApp.</p><div class="quick-grid"><a class="quick primary" href="#/ofertas"><strong>Ofertas de hoje</strong><span>Veja os melhores preços</span></a><a class="quick" href="#/cestas"><strong>Cestas básicas</strong><span>Prontas e editáveis</span></a><a class="quick" href="#/kits"><strong>Kits promocionais</strong><span>Combos com desconto</span></a><a class="quick" href="#/rotina/compra-mes"><strong>Compra do mês</strong><span>Itens essenciais</span></a></div></section>
        ${section('Ofertas de hoje','Preços especiais disponíveis agora',offers.length?`<div class="rail">${offers.map((p,i)=>productCard(p,i===0)).join('')}</div>`:'','#/ofertas')}
        ${section('Cestas básicas','Opções prontas para facilitar sua compra',baskets.length?`<div class="bundle-grid">${baskets.map(item=>bundleCard(item,'basket')).join('')}</div>`:'','#/cestas')}
        ${section('Kits promocionais','Combos ativos com desconto',kits.length?`<div class="bundle-grid">${kits.map(item=>bundleCard(item,'kit')).join('')}</div>`:'','#/kits')}
        ${section('Essenciais da compra','Produtos úteis para completar o carrinho',`<div class="rail">${essentials.map(product=>productCard(product)).join('')}</div>`,'#/categorias')}
        ${section('Categorias','Encontre produtos por setor',categoryGrid(10),'#/categorias')}
      </div>`;
      setNav('home');updateMeta('Dona Antônia — Supermercado e Cestas','Supermercado online, cestas básicas e ofertas com entrega em Cuiabá e Várzea Grande.','/');
    }

    function renderCategories(){
      app.innerHTML=`<div class="container">${pageHead('Categorias','Escolha um setor para navegar.')}${bannerSlot('categorias.topo')}${categoryGrid()}</div>`;
      setNav('categories');
    }

    function renderCategory(value){
      const decoded=decodeURIComponent(value||''),all=state.products.filter(product=>isAvailable(product)&&norm(product.category)===norm(decoded));
      const canonical=all[0] ? all[0].category : ''||decoded,params=new URLSearchParams((location.hash.split('?')[1]||'')),sub=params.get('sub')||'Todos';
      const subs=Array.from(new Set(all.map(product=>product.subcategory).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'pt-BR'));
      const products=sub==='Todos'?all:all.filter(product=>norm(product.subcategory)===norm(sub));
      app.innerHTML=`<div class="container">${pageHead(canonical,`${products.length} produtos`,'#/categorias')}${bannerSlot('categoria',canonical)}<div class="chips"><a class="chip ${sub==='Todos'?'active':''}" href="#/categoria/${encodeURIComponent(canonical)}">Todos</a>${subs.map(item=>`<a class="chip ${item===sub?'active':''}" href="#/categoria/${encodeURIComponent(canonical)}?sub=${encodeURIComponent(item)}">${esc(item)}</a>`).join('')}</div>${products.length?`<div class="grid">${products.map(product=>productCard(product)).join('')}</div>`:empty('Nenhum produto disponível','Esta categoria está sem itens no momento.')}</div>`;
      setNav('categories');updateMeta(`${canonical} — Dona Antônia`,`Compre ${canonical} com entrega local.`,`/?categoria=${encodeURIComponent(canonical)}`);
    }

    function renderSubcategory(value){
      const decoded=decodeURIComponent(value||''),products=state.products.filter(product=>isAvailable(product)&&norm(product.subcategory)===norm(decoded));
      app.innerHTML=`<div class="container">${pageHead(decoded,`${products.length} produtos`,'#/categorias')}${bannerSlot('subcategoria',decoded)}${products.length?`<div class="grid">${products.map(product=>productCard(product)).join('')}</div>`:empty('Nenhum produto disponível','Esta subcategoria está sem itens.')}</div>`;
      setNav('categories');
    }

    function renderSubsubcategory(value){
      const decoded=decodeURIComponent(value||''),products=state.products.filter(product=>isAvailable(product)&&norm(product.subsubcategory)===norm(decoded));
      app.innerHTML=`<div class="container">${pageHead(decoded,`${products.length} produtos`,'#/categorias')}${bannerSlot('subsubcategoria',decoded)}${products.length?`<div class="grid">${products.map(product=>productCard(product)).join('')}</div>`:empty('Nenhum produto disponível','Esta seção está sem itens.')}</div>`;
      setNav('categories');
    }

    function renderBrand(value){
      const decoded=decodeURIComponent(value||''),products=state.products.filter(product=>isAvailable(product)&&norm(product.brand)===norm(decoded));
      app.innerHTML=`<div class="container">${pageHead(decoded,`${products.length} produtos`)}${bannerSlot('marca',decoded)}${products.length?`<div class="grid">${products.map(product=>productCard(product)).join('')}</div>`:empty('Nenhum produto disponível','Esta marca está sem itens.')}</div>`;
      setNav('home');
    }

    function renderOffers(){
      const products=topOffers(500);
      app.innerHTML=`<div class="container">${pageHead('Ofertas',`${products.length} produtos com desconto`)}${bannerSlot('ofertas.topo')}${products.length?`<div class="grid">${products.map(product=>productCard(product)).join('')}</div>`:empty('Sem ofertas no momento','Navegue pelas categorias para continuar comprando.')}</div>`;
      setNav('offers');
    }

    function renderRoutine(key){
      const routine=ROUTINES[key]||ROUTINES['compra-mes'],products=routineProducts(key);
      app.innerHTML=`<div class="container">${pageHead(routine.title,`${products.length} produtos`)}${bannerSlot(`rotina.${key}.topo`)}${products.length?`<div class="grid">${products.map(product=>productCard(product)).join('')}</div>`:empty('Nenhum produto encontrado','Use a busca para encontrar o que precisa.')}</div>`;
      setNav('home');
    }

    function renderBaskets(){
      app.innerHTML=`<div class="container">${pageHead('Cestas básicas','Escolha uma cesta pronta ou ajuste as quantidades.')}${bannerSlot('cestas.topo')}${state.baskets.length?`<div class="bundle-grid">${state.baskets.map(item=>bundleCard(item,'basket')).join('')}</div>`:empty('Nenhuma cesta disponível','O arquivo de cestas não retornou opções válidas.')}</div>`;
      setNav('home');
    }

    function basketDraft(basket){
      if(!state.basketDrafts[basket.id]){
        state.basketDrafts[basket.id]={};
        resolveBundleProducts(basket.products).forEach(row=>state.basketDrafts[basket.id][row.product.id]=row.qty);
      }
      return state.basketDrafts[basket.id];
    }

    function renderBasketDetail(id){
      const basket=state.baskets.find(item=>String(item.id)===String(decodeURIComponent(id||'')));
      if(!basket)return renderNotFound('Cesta não encontrada','#/cestas');
      const rows=resolveBundleProducts(basket.products),draft=basketDraft(basket);
      const selected=rows.map(row=>({product:row.product,qty:Number(draft[row.product.id] !== undefined ? draft[row.product.id] : row.qty)}));
      const selectedTotal=selected.reduce((sum,row)=>sum+row.product.price*row.qty,0);
      const defaultTotal=rows.reduce((sum,row)=>sum+row.product.price*row.qty,0);
      const total=round(selectedTotal+(basket.price-defaultTotal));
      app.innerHTML=`<div class="container">${pageHead(basket.name,'Altere as quantidades antes de adicionar.','#/cestas')}${bannerSlot('cesta',basket.id)}<div class="detail"><div class="detail-media"><img src="${esc(basket.image)}" alt="${esc(basket.name)}" onerror="DAImageError(this)"></div><div class="detail-copy"><h1>${esc(basket.name)}</h1><p>${esc(basket.description)}</p><div class="detail-price">${money(total)}</div><div class="editor">${selected.map(row=>`<div class="editor-row"><img src="${esc(row.product.image)}" alt="" onerror="DAImageError(this)"><div><strong>${esc(row.product.name)}</strong><span>${money(row.product.price)} cada</span></div><div class="qty"><button data-action="basket-dec" data-basket="${esc(basket.id)}" data-id="${esc(row.product.id)}" type="button">−</button><span>${row.qty}</span><button data-action="basket-inc" data-basket="${esc(basket.id)}" data-id="${esc(row.product.id)}" type="button">+</button></div></div>`).join('')}</div><button class="primary" data-action="add-custom-basket" data-id="${esc(basket.id)}" type="button">Adicionar cesta</button></div></div></div>`;
      setNav('home');
    }

    function renderKits(){
      const kits=state.kits.filter(kitActive);
      app.innerHTML=`<div class="container">${pageHead('Kits promocionais',`${kits.length} kits ativos`)}${bannerSlot('kits.topo')}${kits.length?`<div class="bundle-grid">${kits.map(item=>bundleCard(item,'kit')).join('')}</div>`:empty('Nenhum kit ativo','Os kits publicados estão vencidos, inativos ou sem estoque.')}</div>`;
      setNav('home');
    }

    function renderKitDetail(id){
      const decoded=decodeURIComponent(id||''),kit=state.kits.find(item=>String(item.id)===decoded||String(item.code)===decoded);
      if(!kit||!kitActive(kit))return renderNotFound('Kit indisponível','#/kits');
      const rows=resolveBundleProducts(kit.products),retail=rows.reduce((sum,row)=>sum+row.product.price*row.qty,0);
      app.innerHTML=`<div class="container">${pageHead(kit.name,'Oferta por tempo limitado.','#/kits')}${bannerSlot('kit',kit.id)}<div class="detail"><div class="detail-media">${favoriteHtml(kit.id,'kit')}<img src="${esc(kit.image)}" alt="${esc(kit.name)}" onerror="DAImageError(this)"></div><div class="detail-copy"><h1>${esc(kit.name)}</h1><p>${esc(kit.description||'Kit promocional com produtos selecionados.')}</p>${retail>kit.price?`<div class="old">${money(retail)}</div>`:''}<div class="detail-price">${money(kit.price)}</div><div class="editor">${rows.map(row=>`<a class="editor-row" href="#/produto/${productRoute(row.product)}"><img src="${esc(row.product.image)}" alt="" onerror="DAImageError(this)"><div><strong>${esc(row.product.name)}</strong><span>${row.qty} ${row.qty===1?'unidade':'unidades'}</span></div><strong>${money(row.product.price*row.qty)}</strong></a>`).join('')}</div><button class="primary" data-action="add-kit" data-id="${esc(kit.id)}" type="button">Adicionar kit</button></div></div></div>`;
      setNav('home');
    }

    function renderProduct(value){
      const product=findRouteProduct(value);
      if(!product)return renderNotFound('Produto não encontrado','#/');
      const display=productDisplay(product),related=state.products.filter(item=>isAvailable(item)&&item.id!==product.id&&(norm(item.category)===norm(product.category)||norm(item.brand)===norm(product.brand))).slice(0,10);
      app.innerHTML=`<div class="container">${pageHead(product.name,'','#/')}${bannerSlot('produto',product.id)}<article class="detail"><div class="detail-media">${favoriteHtml(product.id)}<img src="${esc(product.image)}" alt="${esc(product.name)}" width="720" height="720" fetchpriority="high" onerror="DAImageError(this)">${display.discount?`<span class="discount">-${display.discount}%</span>`:''}</div><div class="detail-copy"><div class="eyebrow">${esc(product.brand||product.category)}</div><h1>${esc(product.name)}</h1>${display.original>display.effective?`<div class="old">${money(display.original)}</div>`:''}<div class="detail-price">${money(display.effective)}</div>${product.expiry?`<div class="expiry">Validade: ${esc(formatDate(product.expiry))}</div>`:''}<p>${esc(product.description||`${product.category}${product.package?' · '+product.package:''}`)}</p><div class="facts"><div class="fact"><small>Embalagem</small><strong>${esc(product.package||'Unidade')}</strong></div><div class="fact"><small>Estoque</small><strong>${product.stock} unidades</strong></div><div class="fact"><small>Código</small><strong>${esc(product.codigo)}</strong></div></div><div class="detail-actions">${controlHtml(product,true)}</div></div></article>${section('Produtos relacionados','Outras opções da mesma categoria',related.length?`<div class="rail">${related.map(item=>productCard(item)).join('')}</div>`:'')}</div>`;
      setNav('home');updateProductJsonLd(product);updateMeta(`${product.name} — Dona Antônia`,product.description||`Compre ${product.name} com entrega local.`,`/#/produto/${productRoute(product)}`);
    }

