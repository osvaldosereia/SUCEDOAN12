import fs from 'node:fs/promises';

const FILE = 'index.html';
const VERSION = '2026-07-17-banners-pos-quarto-cache-v10';
let html = await fs.readFile(FILE, 'utf8');

function replaceRequired(pattern, replacement, label) {
  const before = html;
  html = html.replace(pattern, replacement);
  if (html === before) throw new Error(`Não foi possível aplicar: ${label}`);
}

html = html.replace(/<meta name="da-build-version" content="[^"]+">/, `<meta name="da-build-version" content="${VERSION}">`);

// A home não deve mais possuir qualquer slot de banner.
html = html.replace(/\s*\$\{bannerSlotHtml\('home\.hero',[\s\S]*?\}\)\}/g, '');

// Impede futuras gerações da home rápida de recolocarem o hero.
try {
  let generator = await fs.readFile('scripts/build-fast-home-test.mjs', 'utf8');
  generator = generator.replace(/\s*required\(\/bannerSlotHtml\\\('home\\\.hero'[\s\S]*?'4 banners no desktop'\);/g, '');
  generator = generator.replace(/\s*\$\{bannerSlotHtml\('home\.hero',[\s\S]*?\}\)\}/g, '');
  generator = generator.replace(/slot\.innerHTML=\\`\\\$\{daHomeHereTemHtml\(\)\}\\\$\{categoryButtonsHtml\(\)\}\\`;/g, "slot.innerHTML=\\`\\${daHomeHereTemHtml()}\\${categoryButtonsHtml()}\\`;");
  await fs.writeFile('scripts/build-fast-home-test.mjs', generator, 'utf8');
} catch (_) {}

const css = `
<style id="da-banners-after-four-v10">
/* Banners comerciais estáticos: 4 no desktop e 2 no mobile. */
.da-inline-banner-zone{grid-column:1/-1;margin:18px 0 22px;content-visibility:auto;contain-intrinsic-size:260px}
.da-inline-banner-zone .da-banner-zone-head{margin-bottom:10px}
.da-inline-banner-zone .da-banner-zone-head span,.da-inline-banner-zone .da-banner-page-counter,.da-inline-banner-zone .da-banner-controls{display:none!important}
.da-inline-banner-zone .da-banner-track{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:12px!important;overflow:visible!important;transform:none!important;scroll-behavior:auto!important}
.da-inline-banner-zone .banner-card,.da-inline-banner-zone .da-banner-card{width:auto!important;min-width:0!important;aspect-ratio:4/5!important;animation:none!important;transition:none!important;transform:none!important}
.da-inline-banner-zone img{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important}
/* Aqui Tem: menos fotos, porém maiores e visualmente úteis. */
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
html = html.replace('</head>', `${css}\n</head>`);

const runtime = `
<script id="da-storefront-banners-cache-v10">
(function(){
  'use strict';
  const RAW='https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/main/';
  const CDN='https://cdn.jsdelivr.net/gh/osvaldosereia/SUCEDOAN12@main/';

  function cdnUrl(value){
    const text=String(value||'');
    return text.startsWith(RAW) ? CDN + text.slice(RAW.length) : text;
  }
  function rewriteDeep(value,seen){
    if(typeof value==='string') return cdnUrl(value);
    if(!value || typeof value!=='object') return value;
    seen=seen||new WeakSet();
    if(seen.has(value)) return value;
    seen.add(value);
    if(Array.isArray(value)){value.forEach((item,index)=>{value[index]=rewriteDeep(item,seen);});return value;}
    Object.keys(value).forEach(key=>{value[key]=rewriteDeep(value[key],seen);});
    return value;
  }

  // Reescreve URLs já na leitura dos JSONs, antes da primeira renderização.
  try{
    const originalFetchJson=fetchJson;
    fetchJson=async function(){return rewriteDeep(await originalFetchJson.apply(this,arguments));};
  }catch(error){console.warn('CDN de imagens: fetchJson não pôde ser interceptado.',error);}

  // Fallback imediato para a origem original caso o CDN não encontre algum arquivo novo.
  const previousFallback=window.__daFallbackImg;
  window.__daFallbackImg=function(img){
    const current=String(img && (img.currentSrc||img.src)||'');
    if(current.startsWith(CDN) && !img.dataset.daRawFallback){
      img.dataset.daRawFallback='1';
      img.src=RAW+current.slice(CDN.length);
      return;
    }
    if(typeof previousFallback==='function') previousFallback(img);
  };

  function uniqueBanners(items){
    const seen=new Set();
    return (items||[]).filter(item=>item&&item.id&&!seen.has(item.id)&&seen.add(item.id));
  }
  function staticBannerHtml(position,banners,label){
    const list=uniqueBanners((banners||[]).filter(bannerIsCurrent)).slice(0,4);
    if(!list.length) return '';
    return '<section class="da-banner-zone da-inline-banner-zone" data-banner-position="'+escapeHtml(position)+'" aria-label="'+escapeHtml(label||'Destaques relacionados')+'"><div class="da-banner-zone-head"><div><strong>'+escapeHtml(label||'Destaques relacionados')+'</strong></div></div><div class="da-banner-track">'+list.map((banner,index)=>bannerCardHtml(banner,index,index<2,false)).join('')+'</div></section>';
  }
  function bannersForFirstProduct(products,position,label,direct){
    const first=(products||[])[0];
    const list=[...(direct||[])];
    if(first){
      if(first.categoria) list.push(...getBanners('categoria',first.categoria));
      if(first.subcategoria) list.push(...getBanners('subcategoria',[first.subcategoria,first.categoria?first.categoria+'::'+first.subcategoria:first.subcategoria]));
      if(first.marca) list.push(...getBanners('marca',first.marca));
    }
    return staticBannerHtml(position,list,label);
  }
  function productsWithBanner(products,banner,mode){
    const items=products||[];
    if(!items.length) return '';
    const cls=mode==='list'?'product-list':'product-grid';
    const cardMode=mode==='list'?'list':undefined;
    const first=items.slice(0,4).map(product=>productCard(product,cardMode)).join('');
    const rest=items.slice(4).map(product=>productCard(product,cardMode)).join('');
    return '<div class="'+cls+'">'+first+'</div>'+banner+(rest?'<div class="'+cls+'">'+rest+'</div>':'');
  }
  function cardsWithBanner(items,banner,renderer,cls){
    const first=(items||[]).slice(0,4).map(renderer).join('');
    const rest=(items||[]).slice(4).map(renderer).join('');
    return '<div class="'+cls+'">'+first+'</div>'+banner+(rest?'<div class="'+cls+'">'+rest+'</div>':'');
  }

  // Página inicial: sem banners.
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
    const banner=bannersForFirstProduct(filtered,'categoria-pos-4',currentSub==='Todos'?'Destaques de '+canonical:'Destaques de '+currentSub,direct);
    app.innerHTML='<div class="container">'+pageHeader(canonical,filtered.length+' produtos encontrados','#/categorias')+chips+productsWithBanner(filtered,banner,'grid')+'</div>';
    setActiveNav('categorias');updateMeta(canonical+' - Dona Antônia','Compre '+canonical.toLowerCase()+' com entrega em Cuiabá e Várzea Grande.','/?categoria='+encodeURIComponent(canonical));
  };

  renderSubcategory=function(subcategory){
    const decoded=decodeURIComponent(subcategory||'');
    const products=state.products.filter(product=>isAvailable(product)&&norm(product.subcategoria)===norm(decoded));
    const canonical=products[0]?.subcategoria||decoded;
    const targets=[canonical,...new Set(products.map(product=>product.categoria).filter(Boolean))].map((v,i)=>i===0?v:v+'::'+canonical);
    const banner=bannersForFirstProduct(products,'subcategoria-pos-4','Destaques de '+canonical,getBanners('subcategoria',targets));
    app.innerHTML='<div class="container">'+pageHeader(canonical,products.length+' produtos encontrados','#/categorias')+(products.length?productsWithBanner(products,banner,'grid'):'<div class="empty"><strong>Nenhum produto disponível</strong>Esta subcategoria não possui itens disponíveis agora.</div>')+'</div>';
    setActiveNav('categorias');
  };

  renderBrand=function(brand){
    const decoded=decodeURIComponent(brand||'');
    const products=state.products.filter(product=>isAvailable(product)&&norm(product.marca)===norm(decoded));
    const canonical=products[0]?.marca||decoded;
    const banner=bannersForFirstProduct(products,'marca-pos-4','Destaques da marca '+canonical,getBanners('marca',canonical));
    app.innerHTML='<div class="container">'+pageHeader(canonical,products.length+' produtos encontrados','#/')+(products.length?productsWithBanner(products,banner,'grid'):'<div class="empty"><strong>Nenhum produto disponível</strong>Esta marca não possui itens disponíveis agora.</div>')+'</div>';
    setActiveNav('home');
  };

  renderOffers=function(){
    const products=getTopOffers(200);
    const banner=bannersForFirstProduct(products,'ofertas-pos-4','Destaques relacionados às ofertas',getBanners('ofertas.topo'));
    app.innerHTML='<div class="container">'+pageHeader('Ofertas','Produtos com desconto disponíveis agora.','#/')+(products.length?productsWithBanner(products,banner,'grid'):'<div class="empty"><strong>Sem ofertas no momento</strong>Volte mais tarde ou navegue pelas categorias.</div>')+'</div>';
    setActiveNav('ofertas');updateMeta('Ofertas - Dona Antônia','Ofertas de supermercado com entrega em Cuiabá e Várzea Grande.','/?secao=ofertas');
  };

  renderRoutine=function(key){
    const routine=ROUTINES[key]||ROUTINES['compra-mes'];
    let products=productsByRoutine(key,240);
    if(key==='higiene'){const coupon=getCouponByCode('BELEZA20');products=products.filter(product=>couponMatchesProduct(coupon,product));}
    const banner=bannersForFirstProduct(products,'rotina-'+key+'-pos-4','Destaques de '+routine.title,getBanners('rotina.'+key+'.topo'));
    app.innerHTML='<div class="container">'+pageHeader(routine.title,'','#/')+(products.length?productsWithBanner(products,banner,'grid'):'<div class="empty"><strong>Nenhum produto encontrado</strong>Use a busca para encontrar o que precisa.</div>')+'</div>';
    setActiveNav('home');
  };

  renderSearch=function(query){
    const q=String(query||'').trim();state.searchQuery=q;
    const input=$('search-input');if(input&&document.activeElement!==input&&input.value!==q)input.value=q;updateSearchButtons();
    const products=searchProducts(q);
    const first=products[0];
    const direct=first?[...getBanners('categoria',first.categoria),...getBanners('subcategoria',[first.subcategoria,first.categoria&&first.subcategoria?first.categoria+'::'+first.subcategoria:''].filter(Boolean))]:[];
    const banner=staticBannerHtml('busca-pos-4',direct,'Destaques de '+(first?.subcategoria||first?.categoria||'sua busca'));
    app.innerHTML='<div class="container search-results-page">'+pageHeader(q?'Busca: '+q:'Busca',q?products.length+' resultado(s)':'Digite o produto na busca acima.','#/')+(q?(products.length?productsWithBanner(products,banner,'list'):'<div class="empty"><strong>Nenhum produto encontrado</strong>Não achamos nada para "'+escapeHtml(q)+'".</div>'):'')+'</div>';
    setActiveNav('home');
  };

  renderCestas=function(){
    const items=state.cestas||[];
    const banner=staticBannerHtml('cestas-pos-4',getBanners('cestas.topo'),'Destaques de cestas básicas');
    app.innerHTML='<div class="container">'+pageHeader('Cestas básicas','Escolha uma cesta pronta e envie pelo WhatsApp.','#/')+(items.length?cardsWithBanner(items,banner,item=>basketCard(item,'wide'),'basket-list'):'<div class="empty"><strong>Nenhuma cesta carregada</strong></div>')+'</div>';setActiveNav('home');
  };
  renderKits=function(){
    const items=getActiveKits();
    const banner=staticBannerHtml('kits-pos-4',getBanners('kits.topo'),'Destaques de kits promocionais');
    app.innerHTML='<div class="container">'+pageHeader('Kits promocionais','Escolha um combo com desconto e envie pelo WhatsApp.','#/')+(items.length?cardsWithBanner(items,banner,item=>kitCard(item,'wide'),'basket-list'):'<div class="empty"><strong>Nenhum kit promocional ativo</strong></div>')+'</div>';setActiveNav('home');updateOfferCountdowns();
  };
})();
</script>`;
html = html.replace('</body>', `${runtime}\n<!-- DA_STOREFRONT_BANNERS_CACHE_V10 -->\n</body>`);

await fs.writeFile(FILE, html, 'utf8');
console.log(`Atualizado ${FILE}: ${Buffer.byteLength(html)} bytes`);
