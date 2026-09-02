(function(){
'use strict';

var BUILD='20260902-storefront-v2';
if(window.__CF_STOREFRONT_V2__===BUILD)return;
window.__CF_STOREFRONT_V2__=BUILD;

var BATCH=8;
var LISTING_CLASSES=['pagina-inicial','pagina-categoria','pagina-busca'];
var loadingNext=false;
var nextUrl='';
var progressiveReady=false;
var observer=null;
var seen={};
var hasIO='IntersectionObserver' in window;

function q(s,r){return (r||document).querySelector(s)}
function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function txt(n){return n?String(n.textContent||'').replace(/\s+/g,' ').trim():''}
function isListing(){return !!(document.body&&LISTING_CLASSES.some(function(c){return document.body.classList.contains(c)}))}
function isMobile(){return window.matchMedia?window.matchMedia('(max-width:767px)').matches:innerWidth<=767}
function svg(name){
  var icons={
    account:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>',
    heart:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
    cart:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20 8H7"/><circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></svg>',
    share:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.5-4.5M8.2 13.2l7.5 4.5"/></svg>',
    chevron:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8v10h-6v-6H9v6H3Z"/></svg>',
    grid:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/></svg>',
    box:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 8-4 8 4-8 4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></svg>',
    edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
    eye:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>'
  };
  return icons[name]||'';
}
function addCss(){
  if(q('link[data-cf-storefront-v2-css]'))return;
  var l=document.createElement('link');l.rel='stylesheet';l.href='https://donaantonia.com.br/loja-integrada/canecafacil-storefront-v2.css?v=20260902-1';l.setAttribute('data-cf-storefront-v2-css','1');document.head.appendChild(l);
}
function openDrawer(){document.body.classList.toggle('cf-drawer-open')}

function createHeaderActions(){
  if(q('#cfHeaderActions'))return;
  var search=q('#cabecalho .busca-mobile');if(!search)return;
  var wrap=document.createElement('div');wrap.id='cfHeaderActions';wrap.className='cf-header-actions';
  [['cf-account','/conta/index','Minha conta','account'],['cf-favorites-head','/conta/favorito/listar','Favoritos','heart'],['cf-cart-head','/carrinho/index','Carrinho','cart']].forEach(function(d){
    var a=document.createElement('a');a.className='cf-head-action '+d[0];a.href=d[1];a.setAttribute('aria-label',d[2]);a.innerHTML=svg(d[3])+'<span>'+d[2]+'</span>';
    if(d[0]==='cf-cart-head'){var c=document.createElement('b');c.className='cf-head-count cf-zero';c.textContent='0';a.appendChild(c)}
    wrap.appendChild(a);
  });
  search.parentNode.appendChild(wrap);syncCartCount();
  var native=q('#cabecalho .qtd-carrinho');if(native&&window.MutationObserver)new MutationObserver(syncCartCount).observe(native,{childList:true,subtree:true,characterData:true,attributes:true});
}
function syncCartCount(){var native=q('#cabecalho .qtd-carrinho'),dest=q('#cfHeaderActions .cf-head-count');if(!dest)return;var n=txt(native)||'0';dest.textContent=n;dest.classList.toggle('cf-zero',!n||n==='0')}

function createChips(){
  if(q('#cf-chip-nav'))return;
  var menu=q('#cabecalho .menu.superior');if(!menu)return;
  var sources=qa('.nivel-um>li>a',menu);if(!sources.length)return;
  var nav=document.createElement('nav');nav.id='cf-chip-nav';nav.setAttribute('aria-label','Categorias');
  var used={};
  sources.forEach(function(src){var label=txt(src);if(!label||used[label])return;used[label]=1;var a=document.createElement('a');a.href=src.href;a.textContent=label;try{var p=new URL(src.href,location.href).pathname.replace(/\/$/,'');if(p&&p===location.pathname.replace(/\/$/,''))a.className='cf-active'}catch(e){}nav.appendChild(a)});
  var more=document.createElement('button');more.type='button';more.className='cf-chip-more';more.innerHTML=svg('grid')+'<span>Mais</span>';more.setAttribute('aria-label','Abrir todas as categorias');more.onclick=openDrawer;nav.appendChild(more);
  menu.parentNode.insertBefore(nav,menu.nextSibling);
}

function benefitMarkup(){
  return '<div class="cf-benefit"><span class="cf-benefit-icon">'+svg('edit')+'</span><div><strong>Personalização fácil</strong><span>Crie do seu jeito em poucos passos.</span></div></div>'+
    '<div class="cf-benefit"><span class="cf-benefit-icon">'+svg('eye')+'</span><div><strong>Prévia antes de comprar</strong><span>Veja como vai ficar antes de finalizar.</span></div></div>'+
    '<div class="cf-benefit"><span class="cf-benefit-icon">'+svg('heart')+'</span><div><strong>Produção com carinho</strong><span>Feita especialmente para você.</span></div></div>';
}
function createBenefits(){
  if(!document.body.classList.contains('pagina-inicial'))return;
  var listing=q('#listagemProdutos');if(!listing)return;
  if(!q('#cfBenefitsMobile')){var mobile=document.createElement('section');mobile.id='cfBenefitsMobile';mobile.className='cf-benefits cf-benefits-mobile';mobile.setAttribute('aria-label','Vantagens da Caneca Fácil');mobile.innerHTML=benefitMarkup();listing.parentNode.insertBefore(mobile,listing)}
  if(!q('#cfBenefitsSlot')){
    var root=q('#listagemProdutos>ul');if(!root)return;
    var slot=document.createElement('li');slot.id='cfBenefitsSlot';slot.className='cf-benefits-slot';slot.innerHTML='<section class="cf-benefits" aria-label="Vantagens da Caneca Fácil">'+benefitMarkup()+'</section>';
    var lines=qa(':scope>li.listagem-linha',root);if(!lines.length)lines=qa('li.listagem-linha',root);
    var anchor=lines[Math.min(1,Math.max(0,lines.length-1))];if(anchor&&anchor.parentNode===root)root.insertBefore(slot,anchor.nextSibling);else root.appendChild(slot);
  }
}

function createMobileBottomNav(){
  if(q('#cfMobileBottomNav'))return;
  var nav=document.createElement('nav');nav.id='cfMobileBottomNav';nav.setAttribute('aria-label','Navegação principal');
  var items=[['Início','/','home','home'],['Categorias','#','grid','categories'],['Criar','/canecas-personalizaveis','plus','create'],['Conta','/conta/index','account','account'],['Pedidos','/conta/pedido/listar','box','orders']];
  items.forEach(function(v){var el;if(v[3]==='categories'){el=document.createElement('button');el.type='button';el.onclick=function(e){e.preventDefault();openDrawer()}}else{el=document.createElement('a');el.href=v[1]}el.className='cf-bottom-item cf-bottom-'+v[3];el.innerHTML=svg(v[2])+'<span>'+v[0]+'</span>';if(v[3]==='home'&&location.pathname.replace(/\/+$/,'')==='')el.classList.add('cf-active');nav.appendChild(el)});
  document.body.appendChild(nav);
}

function cleanName(value){return String(value||'').replace(/^Caneca\s+de\s+Porcelana\s+/i,'Caneca ').replace(/\s*-\s*350\s*ml\s*$/i,'').replace(/\s*-\s*350ml\s*$/i,'').trim()}
function directPriceWrap(info,price){if(!info||!price)return null;var n=price;while(n&&n.parentNode!==info)n=n.parentNode;return n&&n.parentNode===info?n:null}
function galleryUrls(card){
  var main=q('.imagem-produto img.imagem-principal',card);if(!main)return[];var vals=[];
  function add(v){v=String(v||'').trim();if(!v||/^data:/i.test(v))return;try{v=new URL(v,location.href).href}catch(e){}if(vals.indexOf(v)<0)vals.push(v)}
  add(main.currentSrc||main.src);add(main.getAttribute('data-imagem-caminho'));qa('.imagem-produto img.imagem-zoom',card).forEach(function(i){add(i.currentSrc||i.src)});return vals;
}
function setGallery(card,index){var urls=card.__cfGallery||[];if(!urls.length)return;index=(index+urls.length)%urls.length;card.__cfGalleryIndex=index;var img=q('.imagem-produto img.imagem-principal',card);if(img){img.style.opacity='.5';setTimeout(function(){img.removeAttribute('srcset');img.src=urls[index];img.style.opacity='1'},55)}qa('.cf-gallery-dot',card).forEach(function(d,i){d.classList.toggle('cf-active',i===index);d.setAttribute('aria-current',i===index?'true':'false')})}
function galleryControls(card){
  var box=q('.imagem-produto',card),urls=galleryUrls(card);if(!box)return;box.classList.remove('has-zoom');card.__cfGallery=urls;card.__cfGalleryIndex=0;if(urls.length<2)return;
  var prev=document.createElement('button'),next=document.createElement('button');prev.type=next.type='button';prev.className='cf-gallery-arrow cf-gallery-prev';next.className='cf-gallery-arrow cf-gallery-next';prev.setAttribute('aria-label','Imagem anterior');next.setAttribute('aria-label','Próxima imagem');prev.innerHTML=svg('chevron');next.innerHTML=svg('chevron');
  prev.onclick=function(e){e.preventDefault();e.stopPropagation();setGallery(card,(card.__cfGalleryIndex||0)-1)};next.onclick=function(e){e.preventDefault();e.stopPropagation();setGallery(card,(card.__cfGalleryIndex||0)+1)};box.appendChild(prev);box.appendChild(next);
  var dots=document.createElement('div');dots.className='cf-gallery-dots';urls.forEach(function(u,i){var b=document.createElement('button');b.type='button';b.className='cf-gallery-dot'+(i===0?' cf-active':'');b.setAttribute('aria-label','Ver imagem '+(i+1));b.setAttribute('aria-current',i===0?'true':'false');b.onclick=function(e){e.preventDefault();e.stopPropagation();setGallery(card,i)};dots.appendChild(b)});box.appendChild(dots);
  var sx=0,sy=0;box.addEventListener('touchstart',function(e){if(!e.touches||e.touches.length!==1)return;sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});box.addEventListener('touchend',function(e){if(!e.changedTouches||!e.changedTouches.length)return;var dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.25)setGallery(card,(card.__cfGalleryIndex||0)+(dx<0?1:-1))},{passive:true});
}
function addFavorite(card){
  if(q('.cf-favorite',card))return;var id=card.getAttribute('data-id')||'';if(!/^\d+$/.test(id))return;
  var a=document.createElement('a');a.className='cf-favorite lista-favoritos adicionar-favorito';a.href='/conta/favorito/'+id+'/adicionar';a.rel='nofollow';a.setAttribute('aria-label','Adicionar aos favoritos');a.title='Adicionar aos favoritos';a.innerHTML=svg('heart');
  a.addEventListener('click',function(e){
    if(a.classList.contains('cf-favorited'))return;
    e.preventDefault();e.stopPropagation();var href=a.href;a.setAttribute('aria-busy','true');
    fetch(href,{credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest','Accept':'text/html,application/json;q=0.9,*/*;q=0.8'}}).then(function(r){if(r.redirected&&/\/conta\/(login|index)/i.test(r.url)){location.href=r.url;return null}if(!r.ok)throw new Error('HTTP '+r.status);return r.text().then(function(body){return{url:r.url,body:body}})}).then(function(result){if(!result)return;var body=String(result.body||'');if(/name=["']?email|id=["'](?:formulario)?login|\/conta\/login/i.test(body)&&!/Favorito adicionado|sucesso/i.test(body)){location.href='/conta/login?next='+encodeURIComponent(location.href);return}a.classList.add('cf-favorited');a.setAttribute('aria-label','Adicionado aos favoritos');a.title='Adicionado aos favoritos';toast('Adicionado aos favoritos')}).catch(function(){location.href=href}).finally(function(){a.removeAttribute('aria-busy')});
  });
  var box=q('.imagem-produto',card);if(box)box.appendChild(a);else card.appendChild(a);
}
function shareProduct(card){var link=q('a.nome-produto',card)||q('a.produto-sobrepor',card),title=txt(q('.nome-produto',card))||document.title,url=link?link.href:location.href;if(navigator.share)navigator.share({title:title,url:url}).catch(function(){});else if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(function(){toast('Link copiado')}).catch(function(){fallbackCopy(url)});else fallbackCopy(url)}
function fallbackCopy(url){var t=document.createElement('textarea');t.value=url;t.setAttribute('readonly','');t.style.cssText='position:fixed;opacity:0;left:-9999px';document.body.appendChild(t);t.select();try{document.execCommand('copy');toast('Link copiado')}catch(e){window.prompt('Copie o link:',url)}document.body.removeChild(t)}
function toast(msg){var n=q('#cfStorefrontToast');if(!n){n=document.createElement('div');n.id='cfStorefrontToast';document.body.appendChild(n)}n.textContent=msg;n.classList.add('cf-on');clearTimeout(window.__cfStoreToast);window.__cfStoreToast=setTimeout(function(){n.classList.remove('cf-on')},1600)}
function addShare(card){var info=q('.info-produto',card);if(!info||q('.cf-share',card))return;var b=document.createElement('button');b.type='button';b.className='cf-share';b.setAttribute('aria-label','Compartilhar produto');b.title='Compartilhar';b.innerHTML=svg('share');b.onclick=function(e){e.preventDefault();e.stopPropagation();shareProduct(card)};info.appendChild(b)}
function decorateCard(card){
  if(!card||card.dataset.cfDecoratedV2==='1')return;card.dataset.cfDecoratedV2='1';card.classList.add('cf-product-card');
  var title=q('.nome-produto',card);if(title){var original=txt(title);title.setAttribute('title',original);title.textContent=cleanName(original)}
  var info=q('.info-produto',card),price=q('.preco-produto',card),wrap=directPriceWrap(info,price);if(wrap)wrap.classList.add('cf-price-wrap');var parent=card.parentElement;if(parent&&parent.tagName==='LI')parent.classList.add('cf-grid-item');galleryControls(card);addFavorite(card);addShare(card);var id=card.getAttribute('data-id');if(id)seen[id]=1;
}
function decorateAll(root){qa('.listagem-item',root||document).forEach(decorateCard)}
function gridItems(){return qa('#listagemProdutos .listagem-item').map(function(c){return c.parentElement}).filter(function(n,i,a){return n&&a.indexOf(n)===i})}
function deferredItems(){return gridItems().filter(function(n){return n.classList.contains('cf-deferred')})}
function nextLink(root){var a=q('a[rel="next"],.paginacao .proximo a,.pagination .next a,.pagination li.next a,.paginacao li.proximo a',root||document);return a&&a.href?a.href:''}
function nativePagination(root){return q('.paginacao,.pagination',root||document)}
function updateProgressUI(){
  var more=deferredItems().length>0||!!nextUrl;var sent=q('#cfLoadSentinel'),fallback=q('#cfLoadFallback'),p=nativePagination(document);
  if(sent)sent.hidden=!more;if(fallback){fallback.hidden=!more;fallback.classList.toggle('cf-visible',more&&!hasIO)}
  if(p){if(nextUrl)p.classList.add('cf-native-pagination-hidden');else p.classList.remove('cf-native-pagination-hidden')}
}
function loadingState(on){var n=q('#cfProgressLoading');if(n)n.classList.toggle('cf-on',!!on)}
function revealBatch(){
  var hidden=deferredItems();if(hidden.length){hidden.slice(0,BATCH).forEach(function(n){n.classList.remove('cf-deferred')});updateProgressUI();return Promise.resolve(true)}
  if(nextUrl)return fetchNextPage();updateProgressUI();return Promise.resolve(false);
}
function fetchNextPage(){
  if(loadingNext||!nextUrl)return Promise.resolve(false);loadingNext=true;loadingState(true);var url=nextUrl;
  return fetch(url,{credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest'}}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(function(html){
    var doc=new DOMParser().parseFromString(html,'text/html'),cards=qa('#listagemProdutos .listagem-item',doc);nextUrl=nextLink(doc);var root=q('#listagemProdutos>ul');if(!root||!cards.length){updateProgressUI();return false}
    var line=document.createElement('li');line.className='listagem-linha cf-fetched-line';var ul=document.createElement('ul');line.appendChild(ul);var added=0;
    cards.forEach(function(c){var id=c.getAttribute('data-id')||'';if(id&&seen[id])return;var li=c.parentElement;if(!li||li.tagName!=='LI')return;var imported=document.importNode(li,true);imported.classList.add('cf-deferred','cf-grid-item');ul.appendChild(imported);if(id)seen[id]=1;added++});
    if(added){root.appendChild(line);decorateAll(line);updateProgressUI();return revealBatch()}updateProgressUI();return false;
  }).catch(function(err){console.warn('[CanecaFácil] Paginação progressiva: usando fallback nativo.',err);nextUrl='';var p=nativePagination(document);if(p)p.classList.remove('cf-native-pagination-hidden');updateProgressUI();return false}).finally(function(){loadingNext=false;loadingState(false)});
}
function setupProgressive(){
  if(progressiveReady)return;var list=q('#listagemProdutos');if(!list)return;progressiveReady=true;gridItems().forEach(function(n,i){if(i>=BATCH)n.classList.add('cf-deferred')});nextUrl=nextLink(document);
  var sentinel=document.createElement('div');sentinel.id='cfLoadSentinel';sentinel.className='cf-load-sentinel';sentinel.setAttribute('aria-hidden','true');
  var loading=document.createElement('div');loading.id='cfProgressLoading';loading.className='cf-loading';loading.setAttribute('aria-live','polite');loading.innerHTML='<span class="cf-spinner" aria-hidden="true"></span><span>Carregando mais canecas…</span>';
  var fallback=document.createElement('button');fallback.id='cfLoadFallback';fallback.type='button';fallback.className='cf-load-fallback';fallback.textContent='Carregar mais canecas';fallback.onclick=function(){revealBatch()};
  var parent=list.parentNode;parent.insertBefore(sentinel,list.nextSibling);parent.insertBefore(loading,sentinel.nextSibling);parent.insertBefore(fallback,loading.nextSibling);
  if(hasIO){observer=new IntersectionObserver(function(entries){entries.forEach(function(en){if(en.isIntersecting)revealBatch()})},{rootMargin:'650px 0px'});observer.observe(sentinel)}
  updateProgressUI();
}
function observeChanges(){if(!window.MutationObserver)return;var root=q('#listagemProdutos');if(!root)return;var queued=false;new MutationObserver(function(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;decorateAll(root);updateProgressUI()})}).observe(root,{childList:true,subtree:true})}
function init(){
  if(!isListing())return;document.body.classList.add('cf-storefront','cf-storefront-v2');addCss();createHeaderActions();createChips();createBenefits();createMobileBottomNav();syncCartCount();decorateAll();setupProgressive();observeChanges();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
window.addEventListener('load',function(){init();decorateAll();syncCartCount();updateProgressUI()},{once:true});
window.addEventListener('resize',function(){syncCartCount()},{passive:true});
setTimeout(init,350);setTimeout(function(){decorateAll();setupProgressive();updateProgressUI()},1100);
console.info('CanecaFácil · Storefront '+BUILD);
})();