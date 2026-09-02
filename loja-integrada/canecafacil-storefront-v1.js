(function(){
'use strict';

var BUILD='20260902-storefront-v1';
if(window.__CF_STOREFRONT__===BUILD)return;
window.__CF_STOREFRONT__=BUILD;

var BATCH=8;
var LISTING_BODY='pagina-inicial pagina-categoria pagina-busca';
var loadingNext=false;
var nextUrl='';
var progressiveReady=false;
var observer=null;
var seen={};

function q(s,r){return (r||document).querySelector(s)}
function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function text(n){return n?String(n.textContent||'').replace(/\s+/g,' ').trim():''}
function listingPage(){return LISTING_BODY.split(' ').some(function(c){return document.body&&document.body.classList.contains(c)})}
function svg(name){
  var icons={
    account:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0"/></svg>',
    heart:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
    cart:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20 8H7M10 20a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm8 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>',
    share:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.5-4.5M8.2 13.2l7.5 4.5"/></svg>',
    chevron:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>'
  };
  return icons[name]||'';
}

function addCss(){
  if(q('#cfStorefrontStyle')||q('link[data-cf-storefront-css]'))return;
  var l=document.createElement('link');l.rel='stylesheet';l.href='https://donaantonia.com.br/loja-integrada/canecafacil-storefront-v1.css?v=20260902-1';l.setAttribute('data-cf-storefront-css','1');document.head.appendChild(l);
}

function createHeaderActions(){
  if(q('#cfHeaderActions'))return;
  var search=q('#cabecalho .busca-mobile');
  if(!search)return;
  var wrap=document.createElement('div');
  wrap.id='cfHeaderActions';wrap.className='cf-header-actions';
  var defs=[
    ['cf-account','/conta/index','Minha conta','account'],
    ['cf-favorites-head','/conta/favorito/listar','Favoritos','heart'],
    ['cf-cart-head','/carrinho/index','Carrinho','cart']
  ];
  defs.forEach(function(d){
    var a=document.createElement('a');a.className='cf-head-action '+d[0];a.href=d[1];a.setAttribute('aria-label',d[2]);a.innerHTML=svg(d[3])+'<span>'+d[2]+'</span>';
    if(d[0]==='cf-cart-head'){
      var c=document.createElement('b');c.className='cf-head-count cf-zero';c.textContent='0';a.appendChild(c);
    }
    wrap.appendChild(a);
  });
  search.parentNode.appendChild(wrap);
  syncCartCount();
  var native=q('#cabecalho .qtd-carrinho');
  if(native&&window.MutationObserver){new MutationObserver(syncCartCount).observe(native,{childList:true,subtree:true,characterData:true,attributes:true})}
}
function syncCartCount(){
  var native=q('#cabecalho .qtd-carrinho'),dest=q('#cfHeaderActions .cf-head-count');if(!dest)return;
  var n=text(native)||'0';dest.textContent=n;dest.classList.toggle('cf-zero',!n||n==='0');
}

function createChips(){
  if(q('#cf-chip-nav'))return;
  var menu=q('#cabecalho .menu.superior');if(!menu)return;
  var sources=qa(':scope>.nivel-um>li>a',menu);
  if(!sources.length)sources=qa('.nivel-um>li>a',menu);
  if(!sources.length)return;
  var nav=document.createElement('nav');nav.id='cf-chip-nav';nav.setAttribute('aria-label','Categorias de canecas');
  sources.forEach(function(src){
    var label=text(src);if(!label)return;
    var a=document.createElement('a');a.href=src.href;a.textContent=label;
    try{var p=new URL(src.href,location.href).pathname.replace(/\/$/,'');if(p&&p===location.pathname.replace(/\/$/,''))a.className='cf-active'}catch(e){}
    nav.appendChild(a);
  });
  if(nav.children.length)menu.parentNode.insertBefore(nav,menu.nextSibling);
}

function createBenefits(){
  if(q('#cfBenefits')||!document.body.classList.contains('pagina-inicial'))return;
  var banner=q('.banner.mini-banner');var listing=q('#listagemProdutos');if(!listing)return;
  var box=document.createElement('section');box.id='cfBenefits';box.className='cf-benefits';box.setAttribute('aria-label','Vantagens da Caneca Fácil');
  var data=[['✎','Personalização fácil','Crie do seu jeito em poucos passos.'],['◉','Prévia antes de comprar','Veja sua arte antes de finalizar.'],['♡','Produção com carinho','Feita especialmente para você.']];
  data.forEach(function(v){var d=document.createElement('div');d.className='cf-benefit';d.innerHTML='<span class="cf-benefit-icon" aria-hidden="true">'+v[0]+'</span><div><strong>'+v[1]+'</strong><span>'+v[2]+'</span></div>';box.appendChild(d)});
  if(banner&&banner.parentNode)banner.parentNode.insertBefore(box,banner.nextSibling);else listing.parentNode.insertBefore(box,listing);
}

function cleanName(value){
  var s=String(value||'').replace(/^Caneca\s+de\s+Porcelana\s+/i,'Caneca ').replace(/\s*-\s*350\s*ml\s*$/i,'').replace(/\s*-\s*350ml\s*$/i,'');
  return s.trim();
}
function directPriceWrap(info,price){
  if(!info||!price)return null;var n=price;
  while(n&&n.parentNode!==info)n=n.parentNode;
  return n&&n.parentNode===info?n:null;
}
function galleryUrls(card){
  var main=q('.imagem-produto img.imagem-principal',card);if(!main)return[];
  var vals=[];
  function add(v){v=String(v||'').trim();if(!v||/^data:/i.test(v))return;try{v=new URL(v,location.href).href}catch(e){}if(vals.indexOf(v)<0)vals.push(v)}
  add(main.currentSrc||main.src);add(main.getAttribute('data-imagem-caminho'));
  qa('.imagem-produto img.imagem-zoom',card).forEach(function(i){add(i.currentSrc||i.src)});
  return vals;
}
function setGallery(card,index){
  var urls=card.__cfGallery||[];if(!urls.length)return;index=(index+urls.length)%urls.length;card.__cfGalleryIndex=index;
  var img=q('.imagem-produto img.imagem-principal',card);if(img){img.style.opacity='.45';window.setTimeout(function(){img.removeAttribute('srcset');img.src=urls[index];img.style.opacity='1'},60)}
  qa('.cf-gallery-dot',card).forEach(function(d,i){d.classList.toggle('cf-active',i===index);d.setAttribute('aria-current',i===index?'true':'false')});
}
function galleryControls(card){
  var box=q('.imagem-produto',card),urls=galleryUrls(card);if(!box)return;
  box.classList.remove('has-zoom');card.__cfGallery=urls;card.__cfGalleryIndex=0;
  if(urls.length<2)return;
  var prev=document.createElement('button'),next=document.createElement('button');
  prev.type=next.type='button';prev.className='cf-gallery-arrow cf-gallery-prev';next.className='cf-gallery-arrow cf-gallery-next';
  prev.setAttribute('aria-label','Imagem anterior');next.setAttribute('aria-label','Próxima imagem');prev.innerHTML=svg('chevron');next.innerHTML=svg('chevron');
  prev.onclick=function(e){e.preventDefault();e.stopPropagation();setGallery(card,(card.__cfGalleryIndex||0)-1)};
  next.onclick=function(e){e.preventDefault();e.stopPropagation();setGallery(card,(card.__cfGalleryIndex||0)+1)};
  box.appendChild(prev);box.appendChild(next);
  var dots=document.createElement('div');dots.className='cf-gallery-dots';
  urls.forEach(function(u,i){var b=document.createElement('button');b.type='button';b.className='cf-gallery-dot'+(i===0?' cf-active':'');b.setAttribute('aria-label','Ver imagem '+(i+1));b.setAttribute('aria-current',i===0?'true':'false');b.onclick=function(e){e.preventDefault();e.stopPropagation();setGallery(card,i)};dots.appendChild(b)});
  box.appendChild(dots);
  var x=0,y=0;
  box.addEventListener('touchstart',function(e){if(!e.touches||e.touches.length!==1)return;x=e.touches[0].clientX;y=e.touches[0].clientY},{passive:true});
  box.addEventListener('touchend',function(e){if(!e.changedTouches||!e.changedTouches.length)return;var dx=e.changedTouches[0].clientX-x,dy=e.changedTouches[0].clientY-y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.25)setGallery(card,(card.__cfGalleryIndex||0)+(dx<0?1:-1))},{passive:true});
}
function addFavorite(card){
  if(q('.cf-favorite',card))return;var id=card.getAttribute('data-id')||'';if(!/^\d+$/.test(id))return;
  var a=document.createElement('a');a.className='cf-favorite lista-favoritos adicionar-favorito';a.href='/conta/favorito/'+id+'/adicionar';a.rel='nofollow';a.setAttribute('aria-label','Adicionar aos favoritos');a.title='Adicionar aos favoritos';a.innerHTML=svg('heart');
  a.onclick=function(e){
    if(a.classList.contains('cf-favorited')){e.preventDefault();e.stopImmediatePropagation();location.href='/conta/favorito/listar';return}
    e.preventDefault();e.stopImmediatePropagation();var href=a.href;a.setAttribute('aria-busy','true');
    fetch(href,{credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest','Accept':'application/json,text/html;q=0.9,*/*;q=0.8'}}).then(function(r){
      if(r.redirected&&/\/conta\/(login|index)/i.test(r.url)){location.href=r.url;return null}
      if(!r.ok)throw new Error('HTTP '+r.status);return r.text().then(function(body){return{url:r.url,body:body}})
    }).then(function(result){
      if(!result)return;var body=String(result.body||'');
      if(/name=["']?email|id=["'](?:formulario)?login|\/conta\/login/i.test(body)&&!/Favorito adicionado|sucesso/i.test(body)){location.href='/conta/login?next='+encodeURIComponent(location.href);return}
      a.classList.add('cf-favorited');a.setAttribute('aria-label','Adicionado aos favoritos');a.title='Adicionado aos favoritos';toast('Adicionado aos favoritos');
      try{if(window.jQuery&&q('#AdicionarFavoritoSucessoModal'))window.jQuery('#AdicionarFavoritoSucessoModal').modal('show')}catch(_e){}
    }).catch(function(){location.href=href}).finally(function(){a.removeAttribute('aria-busy')});
  };
  var box=q('.imagem-produto',card);if(box)box.appendChild(a);else card.appendChild(a);
}
function shareProduct(card){
  var link=q('a.nome-produto',card)||q('a.produto-sobrepor',card);var title=text(q('.nome-produto',card))||document.title;var url=link?link.href:location.href;
  if(navigator.share){navigator.share({title:title,url:url}).catch(function(){})}
  else if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(url).then(function(){toast('Link copiado')}).catch(function(){fallbackCopy(url)})}
  else fallbackCopy(url);
}
function fallbackCopy(url){var t=document.createElement('textarea');t.value=url;t.setAttribute('readonly','');t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();try{document.execCommand('copy');toast('Link copiado')}catch(e){window.prompt('Copie o link:',url)}document.body.removeChild(t)}
function toast(msg){var n=q('#cfStorefrontToast');if(!n){n=document.createElement('div');n.id='cfStorefrontToast';n.style.cssText='position:fixed;left:50%;bottom:22px;z-index:1000020;transform:translate(-50%,10px);opacity:0;transition:.15s;background:#1b1b1b;color:#fff;padding:9px 14px;border-radius:999px;font:800 11px Arial,sans-serif;pointer-events:none';document.body.appendChild(n)}n.textContent=msg;n.style.opacity='1';n.style.transform='translate(-50%,0)';clearTimeout(window.__cfStoreToast);window.__cfStoreToast=setTimeout(function(){n.style.opacity='0';n.style.transform='translate(-50%,10px)'},1600)}
function addShare(card){
  var info=q('.info-produto',card);if(!info||q('.cf-share',card))return;
  var b=document.createElement('button');b.type='button';b.className='cf-share';b.setAttribute('aria-label','Compartilhar produto');b.title='Compartilhar';b.innerHTML=svg('share');b.onclick=function(e){e.preventDefault();e.stopPropagation();shareProduct(card)};info.appendChild(b);
}
function decorateCard(card){
  if(!card||card.dataset.cfDecorated==='1')return;card.dataset.cfDecorated='1';card.classList.add('cf-product-card');
  var title=q('.nome-produto',card);if(title){var original=text(title);title.setAttribute('title',original);title.textContent=cleanName(original)}
  var info=q('.info-produto',card),price=q('.preco-produto',card),wrap=directPriceWrap(info,price);if(wrap)wrap.classList.add('cf-price-wrap');
  var parent=card.parentElement;if(parent&&parent.tagName==='LI')parent.classList.add('cf-grid-item');
  galleryControls(card);addFavorite(card);addShare(card);
  var id=card.getAttribute('data-id');if(id)seen[id]=1;
}
function decorateAll(root){qa('.listagem-item',root||document).forEach(decorateCard)}
function gridItems(){return qa('#listagemProdutos .listagem-item').map(function(c){return c.parentElement}).filter(function(n,i,a){return n&&a.indexOf(n)===i})}
function revealBatch(){
  var hidden=gridItems().filter(function(n){return n.classList.contains('cf-deferred')});
  if(hidden.length){hidden.slice(0,BATCH).forEach(function(n){n.classList.remove('cf-deferred')});return Promise.resolve(true)}
  if(nextUrl)return fetchNextPage();
  return Promise.resolve(false);
}
function nextLink(root){var a=q('a[rel="next"],.paginacao .proximo a,.pagination .next a,.pagination li.next a,.paginacao li.proximo a',root||document);return a&&a.href?a.href:''}
function nativePagination(root){return q('.paginacao,.pagination',root||document)}
function fetchNextPage(){
  if(loadingNext||!nextUrl)return Promise.resolve(false);loadingNext=true;loadingState(true);var url=nextUrl;
  return fetch(url,{credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest'}}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(function(html){
    var doc=new DOMParser().parseFromString(html,'text/html'),cards=qa('#listagemProdutos .listagem-item',doc);nextUrl=nextLink(doc);
    var root=q('#listagemProdutos>ul');if(!root||!cards.length)return false;
    var line=document.createElement('li');line.className='listagem-linha cf-fetched-line';var ul=document.createElement('ul');line.appendChild(ul);var added=0;
    cards.forEach(function(c){var id=c.getAttribute('data-id')||'';if(id&&seen[id])return;var li=c.parentElement;if(!li||li.tagName!=='LI')return;var imported=document.importNode(li,true);imported.classList.add('cf-deferred','cf-grid-item');ul.appendChild(imported);if(id)seen[id]=1;added++});
    if(added){root.appendChild(line);decorateAll(line);var p=nativePagination(document);if(p)p.classList.add('cf-native-pagination-hidden');return revealBatch()}
    return false;
  }).catch(function(err){console.warn('[CanecaFácil] Paginação progressiva preservou fallback nativo:',err);nextUrl='';var p=nativePagination(document);if(p)p.classList.remove('cf-native-pagination-hidden');return false}).finally(function(){loadingNext=false;loadingState(false)});
}
function loadingState(on){var n=q('#cfProgressLoading');if(n)n.classList.toggle('cf-on',!!on)}
function setupProgressive(){
  if(progressiveReady)return;var list=q('#listagemProdutos');if(!list)return;progressiveReady=true;
  var items=gridItems();items.forEach(function(n,i){if(i>=BATCH)n.classList.add('cf-deferred')});nextUrl=nextLink(document);
  var p=nativePagination(document);if(nextUrl&&p)p.classList.add('cf-native-pagination-hidden');
  var sentinel=document.createElement('div');sentinel.id='cfLoadSentinel';sentinel.className='cf-load-sentinel';
  var loading=document.createElement('div');loading.id='cfProgressLoading';loading.className='cf-loading';loading.innerHTML='<span class="cf-spinner" aria-hidden="true"></span><span>Carregando mais canecas…</span>';
  var fallback=document.createElement('button');fallback.type='button';fallback.className='cf-load-fallback';fallback.textContent='Carregar mais canecas';fallback.onclick=function(){revealBatch()};
  list.parentNode.insertBefore(sentinel,list.nextSibling);sentinel.parentNode.insertBefore(loading,sentinel.nextSibling);loading.parentNode.insertBefore(fallback,loading.nextSibling);
  if('IntersectionObserver' in window){observer=new IntersectionObserver(function(entries){entries.forEach(function(en){if(en.isIntersecting)revealBatch()})},{rootMargin:'600px 0px'});observer.observe(sentinel)}else document.documentElement.classList.add('cf-no-io');
}
function observeChanges(){
  if(!window.MutationObserver)return;var root=q('#listagemProdutos');if(!root)return;var queued=false;
  new MutationObserver(function(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;decorateAll(root)})}).observe(root,{childList:true,subtree:true});
}
function init(){
  addCss();createHeaderActions();createChips();syncCartCount();
  if(!listingPage())return;
  document.body.classList.add('cf-storefront');decorateAll();createBenefits();setupProgressive();observeChanges();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
window.addEventListener('load',function(){init();decorateAll();syncCartCount()},{once:true});
setTimeout(init,450);setTimeout(function(){decorateAll();setupProgressive()},1200);
console.info('CanecaFácil · Storefront '+BUILD);
})();
