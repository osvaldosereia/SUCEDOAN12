import fs from 'node:fs/promises';

const FILE='index.html';
const VERSION='2026-07-17-runtime-unico-imagens-v11';
let html=await fs.readFile(FILE,'utf8');

html=html.replace(/<meta name="da-build-version" content="[^"]+">/,`<meta name="da-build-version" content="${VERSION}">`);

// Remove patches tardios e conflitantes das versões anteriores.
html=html.replace(/\s*<style id="da-banners-after-four-v10">[\s\S]*?<\/style>/g,'');
html=html.replace(/\s*<script id="da-storefront-banners-cache-v10">[\s\S]*?<\/script>/g,'');
html=html.replace(/\s*<script id="da-fast-home-runtime">[\s\S]*?<\/script>/g,'');
html=html.replace(/\s*<!-- DA_STOREFRONT_BANNERS_CACHE_V10 -->/g,'');
html=html.replace(/\s*<!-- DA_FAST_HOME_TEST_V8 -->/g,'');

const css=`
<style id="da-storefront-runtime-v11-css">
.da-inline-banner-zone{grid-column:1/-1;margin:18px 0 22px;content-visibility:auto;contain-intrinsic-size:260px}
.da-inline-banner-zone .da-banner-zone-head{margin-bottom:10px}
.da-inline-banner-zone .da-banner-zone-head span,.da-inline-banner-zone .da-banner-page-counter,.da-inline-banner-zone .da-banner-controls{display:none!important}
.da-inline-banner-zone .da-banner-track{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:12px!important;overflow:visible!important;transform:none!important;scroll-behavior:auto!important}
.da-inline-banner-zone .banner-card,.da-inline-banner-zone .da-banner-card{width:auto!important;min-width:0!important;aspect-ratio:4/5!important;animation:none!important;transition:none!important;transform:none!important}
.da-inline-banner-zone img{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important}
.da-home-here-grid{display:grid!important;grid-template-columns:repeat(6,minmax(0,1fr))!important;gap:14px!important}
.da-home-here-item{display:block!important;aspect-ratio:1/1!important;border-radius:18px!important;overflow:hidden!important;background:#fff!important}
.da-home-here-item img{width:100%!important;height:100%!important;object-fit:contain!important;padding:6px!important;box-sizing:border-box!important}
.da-home-here-item:nth-child(n+13){display:none!important}
@media(max-width:767px){
 .da-inline-banner-zone .da-banner-track{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}
 .da-inline-banner-zone .banner-card:nth-child(n+3),.da-inline-banner-zone .da-banner-card:nth-child(n+3){display:none!important}
 .da-home-here-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:10px!important}
 .da-home-here-item{border-radius:16px!important}
 .da-home-here-item img{padding:4px!important}
 .da-home-here-item:nth-child(n+7){display:none!important}
}
</style>`;
if(!html.includes('da-storefront-runtime-v11-css')) html=html.replace('</head>',`${css}\n</head>`);

const runtime=`
    /* DA_RUNTIME_UNICO_V11: deve existir antes do init() para controlar também o primeiro carregamento. */
    (()=>{
      'use strict';
      const daOriginalApplyBannersDataV11=applyBannersData;
      applyBannersData=function(data){
        daOriginalApplyBannersDataV11(data);
        state.bannerConfig.autoplay=false;
        state.bannerConfig.loop=false;
        state.bannerConfig.show_arrows=false;
        state.bannerConfig.show_dots=false;
        state.bannerConfig.visible_limit=4;
        state.bannerConfig.queue_capacity=4;
      };

      function daUniqueV11(items){
        const seen=new Set();
        return (items||[]).filter(item=>item&&item.id&&!seen.has(item.id)&&seen.add(item.id));
      }
      function daStaticBannerV11(position,banners,label){
        const list=daUniqueV11((banners||[]).filter(bannerIsCurrent)).slice(0,4);
        if(!list.length) return '';
        return '<section class="da-banner-zone da-inline-banner-zone" data-banner-position="'+escapeHtml(position)+'" aria-label="'+escapeHtml(label||'Destaques relacionados')+'"><div class="da-banner-zone-head"><div><strong>'+escapeHtml(label||'Destaques relacionados')+'</strong></div></div><div class="da-banner-track">'+list.map((banner,index)=>bannerCardHtml(banner,index,index<2,false)).join('')+'</div></section>';
      }
      function daBannerForFirstV11(products,position,label,direct){
        const first=(products||[])[0];
        const list=[...(direct||[])];
        if(first){
          if(first.categoria) list.push(...getBanners('categoria',first.categoria));
          if(first.subcategoria) list.push(...getBanners('subcategoria',[first.subcategoria,first.categoria?first.categoria+'::'+first.subcategoria:first.subcategoria]));
          if(first.marca) list.push(...getBanners('marca',first.marca));
        }
        return daStaticBannerV11(position,list,label);
      }
      function daProductsAfterFourV11(products,banner,mode){
        const items=products||[];
        if(!items.length) return '';
        const cls=mode==='list'?'product-list':'product-grid';
        const cardMode=mode==='list'?'list':undefined;
        const first=items.slice(0,4).map(product=>productCard(product,cardMode)).join('');
        const rest=items.slice(4).map(product=>productCard(product,cardMode)).join('');
        return '<div class="'+cls+'">'+first+'</div>'+banner+(rest?'<div class="'+cls+'">'+rest+'</div>':'');
      }
      function daCardsAfterFourV11(items,banner,renderer,cls){
        const first=(items||[]).slice(0,4).map(renderer).join('');
        const rest=(items||[]).slice(4).map(renderer).join('');
        return '<div class="'+cls+'">'+first+'</div>'+banner+(rest?'<div class="'+cls+'">'+rest+'</div>':'');
      }

      // A home é mantida sem banners.
      renderHome=function(){
        const offers=getTopOffers(20),kits=getActiveKits();
        app.innerHTML='<div class="container home-clean da-home-modular da-home-funnel da-home-profit"><h1 class="sr-only">Dona Antônia - Supermercado e Cestas</h1>'+homeQuickLinksHtml()+daHomeOfferShelfHtml(offers)+daHomePurchaseJourneyHtml()+daHomeBasketShelfHtml(state.cestas)+daHomeKitShelfHtml(kits)+'<div data-home-secondary-slot aria-busy="true">'+daProgressiveLoadingHtml('Carregando nossa variedade…')+'</div><div class="da-home-bottom-safe" aria-hidden="true"></div></div>';
        daSetupHomeSecondary();updateOfferCountdowns();updateMeta('Dona Antônia - Supermercado e Cestas','Supermercado online, cestas básicas, ofertas e entrega em Cuiabá e Várzea Grande.','/');setActiveNav('home');
      };

      renderCategory=function(cat){
        const decoded=decodeURIComponent(cat||'');
        const products=state.products.filter(product=>isAvailable(product)&&norm(product.categoria)===norm(decoded));
        const canonical=products[0]?.categoria||decoded;
        const subs=Array.from(new Set(products.map(product=>product.subcategoria).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'pt-BR'));
        const currentSub=new URLSearchParams(location.hash.split('?')[1]||'').get('sub')||'Todos';
        const filtered=currentSub==='Todos'?products:products.filter(product=>norm(product.subcategoria)===norm(currentSub));
        const chips='<div class="chips"><a class="chip '+(currentSub==='Todos'?'active':'')+'" href="#/categoria/'+encodeURIComponent(canonical)+'">Todos</a>'+subs.map(sub=>'<a class="chip '+(currentSub===sub?'active':'')+'" href="#/categoria/'+encodeURIComponent(canonical)+'?sub='+encodeURIComponent(sub)+'">'+escapeHtml(sub)+'</a>').join('')+'</div>';
        const direct=[...getBanners('categoria',canonical),...(currentSub!=='Todos'?getBanners('subcategoria',[currentSub,canonical+'::'+currentSub]):[])];
        const banner=daBannerForFirstV11(filtered,'categoria-pos-4',currentSub==='Todos'?'Destaques de '+canonical:'Destaques de '+currentSub,direct);
        app.innerHTML='<div class="container">'+pageHeader(canonical,filtered.length+' produtos encontrados','#/categorias')+chips+(filtered.length?daProductsAfterFourV11(filtered,banner,'grid'):'<div class="empty"><strong>Nenhum produto disponível</strong>Esta seção não possui itens disponíveis agora.</div>')+'</div>';
        setActiveNav('categorias');updateMeta(canonical+' - Dona Antônia','Compre '+canonical.toLowerCase()+' com entrega em Cuiabá e Várzea Grande.','/?categoria='+encodeURIComponent(canonical));
      };

      renderSubcategory=function(subcategory){
        const decoded=decodeURIComponent(subcategory||'');
        const products=state.products.filter(product=>isAvailable(product)&&norm(product.subcategoria)===norm(decoded));
        const canonical=products[0]?.subcategoria||decoded;
        const targets=[canonical,...new Set(products.map(product=>product.categoria).filter(Boolean))].map((value,index)=>index===0?value:value+'::'+canonical);
        const banner=daBannerForFirstV11(products,'subcategoria-pos-4','Destaques de '+canonical,getBanners('subcategoria',targets));
        app.innerHTML='<div class="container">'+pageHeader(canonical,products.length+' produtos encontrados','#/categorias')+(products.length?daProductsAfterFourV11(products,banner,'grid'):'<div class="empty"><strong>Nenhum produto disponível</strong>Esta subcategoria não possui itens disponíveis agora.</div>')+'</div>';
        setActiveNav('categorias');
      };

      renderBrand=function(brand){
        const decoded=decodeURIComponent(brand||'');
        const products=state.products.filter(product=>isAvailable(product)&&norm(product.marca)===norm(decoded));
        const canonical=products[0]?.marca||decoded;
        const banner=daBannerForFirstV11(products,'marca-pos-4','Destaques da marca '+canonical,getBanners('marca',canonical));
        app.innerHTML='<div class="container">'+pageHeader(canonical,products.length+' produtos encontrados','#/')+(products.length?daProductsAfterFourV11(products,banner,'grid'):'<div class="empty"><strong>Nenhum produto disponível</strong>Esta marca não possui itens disponíveis agora.</div>')+'</div>';
        setActiveNav('home');
      };

      renderOffers=function(){
        const products=getTopOffers(200);
        const banner=daBannerForFirstV11(products,'ofertas-pos-4','Destaques relacionados às ofertas',getBanners('ofertas.topo'));
        app.innerHTML='<div class="container">'+pageHeader('Ofertas','Produtos com desconto disponíveis agora.','#/')+(products.length?daProductsAfterFourV11(products,banner,'grid'):'<div class="empty"><strong>Sem ofertas no momento</strong>Volte mais tarde ou navegue pelas categorias.</div>')+'</div>';
        setActiveNav('ofertas');updateMeta('Ofertas - Dona Antônia','Ofertas de supermercado com entrega em Cuiabá e Várzea Grande.','/?secao=ofertas');
      };

      renderRoutine=function(key){
        const routine=ROUTINES[key]||ROUTINES['compra-mes'];
        let products=productsByRoutine(key,240);
        if(key==='higiene'){const coupon=getCouponByCode('BELEZA20');products=products.filter(product=>couponMatchesProduct(coupon,product));}
        const banner=daBannerForFirstV11(products,'rotina-'+key+'-pos-4','Destaques de '+routine.title,getBanners('rotina.'+key+'.topo'));
        app.innerHTML='<div class="container">'+pageHeader(routine.title,'','#/')+(products.length?daProductsAfterFourV11(products,banner,'grid'):'<div class="empty"><strong>Nenhum produto encontrado</strong>Use a busca para encontrar o que precisa.</div>')+'</div>';
        setActiveNav('home');
      };

      renderSearch=function(query){
        const q=String(query||'').trim();state.searchQuery=q;
        const input=$('search-input');if(input&&document.activeElement!==input&&input.value!==q) input.value=q;updateSearchButtons();
        const products=searchProducts(q);
        const first=products[0];
        const direct=first?[...getBanners('categoria',first.categoria),...getBanners('subcategoria',[first.subcategoria,first.categoria&&first.subcategoria?first.categoria+'::'+first.subcategoria:''].filter(Boolean))]:[];
        const banner=daStaticBannerV11('busca-pos-4',direct,'Destaques de '+(first?.subcategoria||first?.categoria||'sua busca'));
        app.innerHTML='<div class="container search-results-page">'+pageHeader(q?'Busca: '+q:'Busca',q?products.length+' resultado(s)':'Digite o produto na busca acima.','#/')+(q?(products.length?daProductsAfterFourV11(products,banner,'list'):'<div class="empty"><strong>Nenhum produto encontrado</strong>Não achamos nada para "'+escapeHtml(q)+'".</div>'):'')+'</div>';
        setActiveNav('home');
      };

      renderCestas=function(){
        const items=state.cestas||[];
        const banner=daBannerForFirstV11([], 'cestas-pos-4','Destaques de cestas',getBanners('cestas.topo'));
        app.innerHTML='<div class="container">'+pageHeader('Cestas básicas','Escolha uma cesta pronta e envie pelo WhatsApp.','#/')+(items.length?daCardsAfterFourV11(items,banner,item=>basketCard(item,'wide'),'basket-list'):'<div class="empty"><strong>Nenhuma cesta carregada</strong>Tente novamente em instantes.</div>')+'</div>';
        setActiveNav('home');
      };

      renderKits=function(){
        const items=getActiveKits();
        const banner=daBannerForFirstV11([], 'kits-pos-4','Destaques de kits',getBanners('kits.topo'));
        app.innerHTML='<div class="container">'+pageHeader('Kits promocionais','Combos com desconto disponíveis agora.','#/')+(items.length?daCardsAfterFourV11(items,banner,item=>kitCard(item,'wide'),'basket-list'):'<div class="empty"><strong>Nenhum kit promocional ativo</strong>Volte mais tarde.</div>')+'</div>';
        setActiveNav('home');updateOfferCountdowns();
      };
    })();
`;

const initIndex=html.lastIndexOf('    init();');
if(initIndex<0) throw new Error('Ponto de inicialização não encontrado.');
if(!html.includes('DA_RUNTIME_UNICO_V11')) html=html.slice(0,initIndex)+runtime+html.slice(initIndex);

// Garante que nenhuma reescrita de imagem para jsDelivr permaneça ativa.
html=html.replaceAll('https://cdn.jsdelivr.net/gh/osvaldosereia/SUCEDOAN12@main/','https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/main/');
html=html.replace(/\s*<!-- DA_PRODUCTION_FAST_HOME_V2 -->/g,'');
html=html.replace('</body>','\n<!-- DA_RUNTIME_UNICO_IMAGENS_ESTAVEIS_V11 -->\n</body>');

await fs.writeFile(FILE,html,'utf8');
console.log(`Atualizado ${FILE} (${Buffer.byteLength(html)} bytes)`);
