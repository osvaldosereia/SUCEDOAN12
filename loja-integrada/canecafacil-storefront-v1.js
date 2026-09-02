(function(){
'use strict';

var BUILD='20260902-storefront-v4';
if(window.__CF_STOREFRONT__===BUILD)return;
window.__CF_STOREFRONT__=BUILD;
window.CFSOCIAL9=1;

var BATCH=8;
var LISTING_CLASSES=['pagina-inicial','pagina-categoria','pagina-busca'];
var nextUrl='';
var loadingNext=false;
var progressiveReady=false;
var observer=null;
var seen={};
var visitedPages={};

function q(s,r){return (r||document).querySelector(s)}
function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function txt(n){return n?String(n.textContent||'').replace(/\s+/g,' ').trim():''}
function isListing(){return !!(document.body&&LISTING_CLASSES.some(function(c){return document.body.classList.contains(c)}))}
function isHome(){return !!(document.body&&document.body.classList.contains('pagina-inicial'))}
function svg(name){
  var i={
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
  return i[name]||'';
}

function addCss(){
  if(q('link[data-cf-storefront-css="v4"]'))return;
  qa('link[data-cf-storefront-css],link[data-cf-storefront-v2-css]').forEach(function(n){if(n.parentNode)n.parentNode.removeChild(n)});
  var l=document.createElement('link');
  l.rel='stylesheet';
  l.href='https://donaantonia.com.br/loja-integrada/canecafacil-storefront-v1.css?v=20260902-4';
  l.setAttribute('data-cf-storefront-css','v4');
  document.head.appendChild(l);
}
function neutralizeLegacy(){
  var old=q('#cf-social-root');
  if(old&&old.parentNode)old.parentNode.removeChild(old);
  document.body.classList.remove('cf-social-list');
}
function openDrawer(){
  if(q('#cf-mobile-drawer'))document.body.classList.toggle('cf-drawer-open');
  else{var native=q('#cabecalho .atalho-menu');if(native)native.click()}
}
function syncCartCount(){
  var native=q('#cabecalho .qtd-carrinho'),dest=q('#cfHeaderActions .cf-head-count');
  if(!dest)return;
  var n=txt(native)||'0';
  dest.textContent=n;
  dest.classList.toggle('cf-zero',!n||n==='0');
}
function createHeaderActions(){
  if(q('#cfHeaderActions')){syncCartCount();return}
  var search=q('#cabecalho .busca-mobile')||q('#cabecalho .busca');
  if(!search)return;
  var host=search.parentNode,wrap=document.createElement('div');
  wrap.id='cfHeaderActions';
  wrap.className='cf-header-actions';
  [['cf-account','/conta/index','Minha conta','account'],['cf-favorites-head','/conta/favorito/listar','Favoritos','heart'],['cf-cart-head','/carrinho/index','Carrinho','cart']].forEach(function(d){
    var a=document.createElement('a');
    a.className='cf-head-action '+d[0];
    a.href=d[1];
    a.setAttribute('aria-label',d[2]);
    a.innerHTML=svg(d[3])+'<span>'+d[2]+'</span>';
    if(d[0]==='cf-cart-head'){
      var c=document.createElement('b');
      c.className='cf-head-count cf-zero';
      c.textContent='0';
      a.appendChild(c);
    }
    wrap.appendChild(a);
  });
  host.appendChild(wrap);
  syncCartCount();
  var native=q('#cabecalho .qtd-carrinho');
  if(native&&window.MutationObserver&&!native.__cfCountObs){
    native.__cfCountObs=1;
    new MutationObserver(syncCartCount).observe(native,{childList:true,subtree:true,characterData:true,attributes:true});
  }
}
function createChips(){
  if(q('#cf-chip-nav'))return;
  var menu=q('#cabecalho .menu.superior');
  if(!menu)return;
  var sources=qa('.nivel-um>li>a',menu);
  if(!sources.length)return;
  var nav=document.createElement('nav'),used={};
  nav.id='cf-chip-nav';
  nav.setAttribute('aria-label','Categorias de canecas');
  sources.forEach(function(src){
    var label=txt(src);
    if(!label||used[label])return;
    used[label]=1;
    var a=document.createElement('a');
    a.href=src.href;
    a.textContent=label;
    try{
      var p=new URL(src.href,location.href).pathname.replace(/\/$/,'');
      if(p&&p===location.pathname.replace(/\/$/,''))a.className='cf-active';
    }catch(e){}
    nav.appendChild(a);
  });
  var more=document.createElement('button');
  more.type='button';
  more.className='cf-chip-more';
  more.innerHTML=svg('grid')+'<span>Mais</span>';
  more.setAttribute('aria-label','Abrir todas as categorias');
  more.onclick=openDrawer;
  nav.appendChild(more);
  menu.parentNode.insertBefore(nav,menu.nextSibling);
}
function benefitMarkup(){
  return '<div class="cf-benefit"><span class="cf-benefit-icon">'+svg('edit')+'</span><div><strong>Personalização fácil</strong><span>Crie do seu jeito em poucos passos.</span></div></div>'+
    '<div class="cf-benefit"><span class="cf-benefit-icon">'+svg('eye')+'</span><div><strong>Prévia antes de comprar</strong><span>Veja como vai ficar antes de finalizar.</span></div></div>'+
    '<div class="cf-benefit"><span class="cf-benefit-icon">'+svg('heart')+'</span><div><strong>Produção com carinho</strong><span>Feita especialmente para você.</span></div></div>';
}
function createMobileBottomNav(){
  if(q('#cfMobileBottomNav'))return;
  var nav=document.createElement('nav');
  nav.id='cfMobileBottomNav';
  nav.setAttribute('aria-label','Navegação principal');
  [['Início','/','home','home'],['Categorias','#','grid','categories'],['Criar','/canecas-personalizaveis','plus','create'],['Conta','/conta/index','account','account'],['Pedidos','/conta/pedido/listar','box','orders']].forEach(function(v){
    var el;
    if(v[3]==='categories'){
      el=document.createElement('button');
      el.type='button';
      el.onclick=function(e){e.preventDefault();openDrawer()};
    }else{
      el=document.createElement('a');
      el.href=v[1];
    }
    el.className='cf-bottom-item cf-bottom-'+v[3];
    el.innerHTML=svg(v[2])+'<span>'+v[0]+'</span>';
    if(v[3]==='home'&&(location.pathname==='/'||location.pathname===''))el.classList.add('cf-active');
    nav.appendChild(el);
  });
  document.body.appendChild(nav);
}

function cleanName(v){
  return String(v||'')
    .replace(/^Caneca\s+de\s+Porcelana\s+/i,'Caneca ')
    .replace(/\s*-\s*350\s*ml\s*$/i,'')
    .replace(/\s*-\s*350ml\s*$/i,'')
    .trim();
}
function productLi(card){
  var n=card&&card.parentElement;
  while(n&&n.tagName!=='LI'&&n.id!=='listagemProdutos')n=n.parentElement;
  return n&&n.tagName==='LI'?n:null;
}
function nativeRoot(){
  var listing=q('#listagemProdutos');
  if(!listing)return null;
  for(var i=0;i<listing.children.length;i++){
    var n=listing.children[i];
    if(n.tagName==='UL'&&n.id!=='cfProductGrid')return n;
  }
  return null;
}
function listingRoot(){
  return q('#cfProductGrid')||flattenGrid();
}
function flattenGrid(){
  var listing=q('#listagemProdutos');
  if(!listing)return null;
  var grid=q('#cfProductGrid');
  var native=nativeRoot();
  if(!grid){
    if(!native)return null;
    var cards=qa('.listagem-item',native);
    if(!cards.length)return null;
    grid=document.createElement('ul');
    grid.id='cfProductGrid';
    grid.className=((native.className||'')+' cf-product-grid').trim();
    native.parentNode.insertBefore(grid,native);
  }
  if(native){
    var pagination=q('.paginacao,.pagination',native);
    if(pagination&&pagination.parentNode){
      native.parentNode.insertBefore(pagination,native.nextSibling);
    }
    var moved=[];
    qa('.listagem-item',native).forEach(function(card){
      var li=productLi(card);
      if(li&&moved.indexOf(li)<0){moved.push(li);grid.appendChild(li)}
    });
    if(native.parentNode)native.parentNode.removeChild(native);
  }
  return grid;
}
function productUrl(card){
  var a=q('a.nome-produto',card)||q('a.produto-sobrepor',card)||q('.imagem-produto a',card);
  if(!a)return'';
  var href=a.getAttribute('href')||a.href||'';
  if(!href)return'';
  try{
    var u=new URL(href,location.href);
    return (u.origin+u.pathname.replace(/\/+$/,'')).toLowerCase();
  }catch(e){return String(href).split('#')[0].split('?')[0].replace(/\/+$/,'').toLowerCase()}
}
function cardKeys(card){
  var keys=[],id=String(card&&card.getAttribute('data-id')||'').trim(),url=productUrl(card);
  if(id)keys.push('id:'+id);
  if(url)keys.push('url:'+url);
  return keys;
}
function isSeen(card){
  var keys=cardKeys(card);
  return keys.some(function(k){return !!seen[k]});
}
function markSeen(card){
  cardKeys(card).forEach(function(k){seen[k]=1});
}
function resetAndDedupe(){
  seen={};
  var grid=listingRoot();
  if(!grid)return;
  qa('.listagem-item',grid).forEach(function(card){
    if(isSeen(card)){
      var li=productLi(card);
      if(li&&li.parentNode)li.parentNode.removeChild(li);
      return;
    }
    markSeen(card);
  });
}
function pageKey(url){
  if(!url)return'';
  try{
    var u=new URL(url,location.href);
    u.hash='';
    return u.origin+u.pathname+u.search;
  }catch(e){return String(url)}
}
function directPriceWrap(info,price){
  if(!info||!price)return null;
  var n=price;
  while(n&&n.parentNode!==info)n=n.parentNode;
  return n&&n.parentNode===info?n:null;
}
function addUrl(arr,v){
  v=String(v||'').trim();
  if(!v||/^data:/i.test(v))return;
  try{v=new URL(v,location.href).href}catch(e){}
  if(arr.indexOf(v)<0)arr.push(v);
}
function galleryUrls(card){
  var main=q('.imagem-produto img.imagem-principal',card);
  if(!main)return[];
  var vals=[];
  addUrl(vals,main.currentSrc||main.src);
  addUrl(vals,main.getAttribute('data-imagem-caminho'));
  addUrl(vals,main.getAttribute('data-src'));
  qa('.imagem-produto img.imagem-zoom,.imagem-produto img[data-imagem-caminho]',card).forEach(function(i){
    addUrl(vals,i.currentSrc||i.src);
    addUrl(vals,i.getAttribute('data-imagem-caminho'));
    addUrl(vals,i.getAttribute('data-src'));
  });
  return vals;
}
function setGallery(card,index){
  var urls=card.__cfGallery||[];
  if(!urls.length)return;
  index=(index+urls.length)%urls.length;
  card.__cfGalleryIndex=index;
  var img=q('.imagem-produto img.imagem-principal',card);
  if(img){
    img.style.opacity='.5';
    setTimeout(function(){
      img.removeAttribute('srcset');
      img.src=urls[index];
      img.style.opacity='1';
    },55);
  }
  qa('.cf-gallery-dot',card).forEach(function(d,i){
    d.classList.toggle('cf-active',i===index);
    d.setAttribute('aria-current',i===index?'true':'false');
  });
}
function galleryControls(card){
  var box=q('.imagem-produto',card),urls=galleryUrls(card);
  if(!box)return;
  box.classList.remove('has-zoom');
  card.__cfGallery=urls;
  card.__cfGalleryIndex=0;
  if(urls.length<2)return;
  var prev=document.createElement('button'),next=document.createElement('button');
  prev.type=next.type='button';
  prev.className='cf-gallery-arrow cf-gallery-prev';
  next.className='cf-gallery-arrow cf-gallery-next';
  prev.setAttribute('aria-label','Imagem anterior');
  next.setAttribute('aria-label','Próxima imagem');
  prev.innerHTML=svg('chevron');
  next.innerHTML=svg('chevron');
  prev.onclick=function(e){e.preventDefault();e.stopPropagation();setGallery(card,(card.__cfGalleryIndex||0)-1)};
  next.onclick=function(e){e.preventDefault();e.stopPropagation();setGallery(card,(card.__cfGalleryIndex||0)+1)};
  box.appendChild(prev);
  box.appendChild(next);
  var dots=document.createElement('div');
  dots.className='cf-gallery-dots';
  urls.forEach(function(u,i){
    var b=document.createElement('button');
    b.type='button';
    b.className='cf-gallery-dot'+(i===0?' cf-active':'');
    b.setAttribute('aria-label','Ver imagem '+(i+1));
    b.setAttribute('aria-current',i===0?'true':'false');
    b.onclick=function(e){e.preventDefault();e.stopPropagation();setGallery(card,i)};
    dots.appendChild(b);
  });
  box.appendChild(dots);
  var sx=0,sy=0;
  box.addEventListener('touchstart',function(e){
    if(!e.touches||e.touches.length!==1)return;
    sx=e.touches[0].clientX;sy=e.touches[0].clientY;
  },{passive:true});
  box.addEventListener('touchend',function(e){
    if(!e.changedTouches||!e.changedTouches.length)return;
    var dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;
    if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.25)setGallery(card,(card.__cfGalleryIndex||0)+(dx<0?1:-1));
  },{passive:true});
}
function addFavorite(card){
  if(q('.cf-favorite',card))return;
  var id=card.getAttribute('data-id')||'';
  if(!/^\d+$/.test(id))return;
  var a=document.createElement('a');
  a.className='cf-favorite lista-favoritos adicionar-favorito';
  a.href='/conta/favorito/'+id+'/adicionar';
  a.rel='nofollow';
  a.setAttribute('aria-label','Adicionar aos favoritos');
  a.title='Adicionar aos favoritos';
  a.innerHTML=svg('heart');
  var box=q('.imagem-produto',card);
  if(box)box.appendChild(a);else card.appendChild(a);
}
function fallbackCopy(url){
  var t=document.createElement('textarea');
  t.value=url;t.setAttribute('readonly','');
  t.style.cssText='position:fixed;opacity:0;pointer-events:none';
  document.body.appendChild(t);t.select();
  try{document.execCommand('copy');toast('Link copiado')}
  catch(e){window.prompt('Copie o link:',url)}
  document.body.removeChild(t);
}
function toast(msg){
  var n=q('#cfStorefrontToast');
  if(!n){
    n=document.createElement('div');
    n.id='cfStorefrontToast';
    n.className='cf-storefront-toast';
    document.body.appendChild(n);
  }
  n.textContent=msg;n.classList.add('cf-on');
  clearTimeout(window.__cfStoreToast);
  window.__cfStoreToast=setTimeout(function(){n.classList.remove('cf-on')},1500);
}
function shareProduct(card){
  var link=q('a.nome-produto',card)||q('a.produto-sobrepor',card),title=txt(q('.nome-produto',card))||document.title,url=link?link.href:location.href;
  if(navigator.share)navigator.share({title:title,url:url}).catch(function(){});
  else if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(function(){toast('Link copiado')}).catch(function(){fallbackCopy(url)});
  else fallbackCopy(url);
}
function addShare(card){
  var info=q('.info-produto',card);
  if(!info||q('.cf-share',card))return;
  var b=document.createElement('button');
  b.type='button';b.className='cf-share';
  b.setAttribute('aria-label','Compartilhar produto');b.title='Compartilhar';
  b.innerHTML=svg('share');
  b.onclick=function(e){e.preventDefault();e.stopPropagation();shareProduct(card)};
  info.appendChild(b);
}
function optimizeImage(card,index){
  var img=q('.imagem-produto img.imagem-principal',card);
  if(!img)return;
  img.decoding='async';
  if(index>3)img.loading='lazy';else img.removeAttribute('loading');
}
function decorateCard(card,index){
  if(!card)return;
  var parent=productLi(card);
  if(parent){
    parent.classList.add('cf-grid-item');
    parent.style.order=String((index+1)*10);
  }
  if(card.dataset.cfDecorated==='1'){
    optimizeImage(card,index);
    return;
  }
  card.dataset.cfDecorated='1';
  card.classList.add('cf-product-card');
  var title=q('.nome-produto',card);
  if(title){
    var original=txt(title);
    title.setAttribute('title',original);
    title.setAttribute('aria-label',original);
    title.textContent=cleanName(original);
  }
  var info=q('.info-produto',card),price=q('.preco-produto',card),wrap=directPriceWrap(info,price);
  if(wrap)wrap.classList.add('cf-price-wrap');
  galleryControls(card);
  addFavorite(card);
  addShare(card);
  optimizeImage(card,index);
}
function allCards(root){
  var r=root||listingRoot();
  return r?qa('.listagem-item',r):[];
}
function decorateAll(){
  allCards().forEach(function(card,i){decorateCard(card,i)});
}
function gridItems(){
  var grid=listingRoot();
  if(!grid)return[];
  return Array.prototype.slice.call(grid.children).filter(function(n){return !!q('.listagem-item',n)});
}
function createBenefits(){
  if(!isHome())return;
  var listing=q('#listagemProdutos'),root=listingRoot();
  if(!listing||!root)return;
  if(!q('#cfBenefitsMobile')){
    var mobile=document.createElement('section');
    mobile.id='cfBenefitsMobile';
    mobile.className='cf-benefits cf-benefits-mobile';
    mobile.setAttribute('aria-label','Vantagens da Caneca Fácil');
    mobile.innerHTML=benefitMarkup();
    listing.parentNode.insertBefore(mobile,listing);
  }
  if(!q('#cfBenefitsSlot')){
    var slot=document.createElement('li');
    slot.id='cfBenefitsSlot';
    slot.className='cf-benefits-slot';
    slot.style.order='85';
    slot.innerHTML='<section class="cf-benefits" aria-label="Vantagens da Caneca Fácil">'+benefitMarkup()+'</section>';
    root.appendChild(slot);
  }
}
function nextLink(root){
  var a=q('a[rel="next"],.paginacao .proximo a,.pagination .next a,.pagination li.next a,.paginacao li.proximo a',root||document);
  if(a&&a.href)return a.href;
  var links=qa('.paginacao a,.pagination a',root||document);
  for(var i=0;i<links.length;i++){
    if(/pr[oó]xim|next|›|»/i.test(txt(links[i])))return links[i].href||'';
  }
  return '';
}
function nativePagination(root){return q('.paginacao,.pagination',root||document)}
function loadingState(on){
  var n=q('#cfProgressLoading');
  if(n)n.classList.toggle('cf-on',!!on);
}
function finishProgressive(){
  if(observer){try{observer.disconnect()}catch(e){}observer=null}
  ['#cfLoadSentinel','#cfProgressLoading','#cfLoadFallback'].forEach(function(s){
    var n=q(s);if(n&&n.parentNode)n.parentNode.removeChild(n);
  });
}
function revealBatch(){
  var hidden=gridItems().filter(function(n){return n.classList.contains('cf-deferred')});
  if(hidden.length){
    hidden.slice(0,BATCH).forEach(function(n){n.classList.remove('cf-deferred')});
    if(hidden.length<=BATCH&&!nextUrl)setTimeout(finishProgressive,50);
    return Promise.resolve(true);
  }
  if(nextUrl)return fetchNextPage();
  finishProgressive();
  return Promise.resolve(false);
}
function sourceProductLi(card){
  var n=card&&card.parentElement;
  while(n&&n.tagName!=='LI')n=n.parentElement;
  return n&&n.tagName==='LI'?n:null;
}
function fetchNextPage(){
  if(loadingNext||!nextUrl)return Promise.resolve(false);
  loadingNext=true;
  loadingState(true);

  function step(url,depth){
    var key=pageKey(url);
    if(!key||visitedPages[key]||depth>4){nextUrl='';return Promise.resolve(false)}
    visitedPages[key]=1;
    return fetch(url,{credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest'}})
      .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text()})
      .then(function(html){
        var doc=new DOMParser().parseFromString(html,'text/html');
        var candidate=nextLink(doc);
        if(candidate&&visitedPages[pageKey(candidate)])candidate='';
        nextUrl=candidate||'';
        var cards=qa('#listagemProdutos .listagem-item',doc),root=listingRoot();
        if(!root||!cards.length){
          if(nextUrl)return step(nextUrl,depth+1);
          return false;
        }
        var added=0;
        cards.forEach(function(c){
          if(isSeen(c))return;
          var li=sourceProductLi(c);
          if(!li)return;
          var imported=document.importNode(li,true);
          imported.classList.add('cf-deferred','cf-grid-item');
          root.appendChild(imported);
          markSeen(c);
          added++;
        });
        if(added){
          decorateAll();
          createBenefits();
          var p=nativePagination(document);
          if(p)p.classList.add('cf-native-pagination-hidden');
          return revealBatch();
        }
        if(nextUrl)return step(nextUrl,depth+1);
        return false;
      });
  }

  var start=nextUrl;
  return step(start,0)
    .catch(function(err){
      console.warn('[CanecaFácil] Paginação progressiva: usando fallback nativo.',err);
      nextUrl='';
      var p=nativePagination(document);
      if(p)p.classList.remove('cf-native-pagination-hidden');
      finishProgressive();
      return false;
    })
    .finally(function(){loadingNext=false;loadingState(false)});
}
function setupProgressive(){
  if(progressiveReady)return;
  var list=q('#listagemProdutos'),root=listingRoot();
  if(!list||!root)return;
  progressiveReady=true;
  var items=gridItems();
  items.forEach(function(n,i){n.classList.toggle('cf-deferred',i>=BATCH)});
  visitedPages[pageKey(location.href)]=1;
  nextUrl=nextLink(document);
  if(nextUrl&&visitedPages[pageKey(nextUrl)])nextUrl='';
  var p=nativePagination(document);
  if(nextUrl&&p)p.classList.add('cf-native-pagination-hidden');
  if(items.length<=BATCH&&!nextUrl)return;
  var sentinel=document.createElement('div');
  sentinel.id='cfLoadSentinel';sentinel.className='cf-load-sentinel';
  var loading=document.createElement('div');
  loading.id='cfProgressLoading';loading.className='cf-loading';
  loading.innerHTML='<span class="cf-spinner" aria-hidden="true"></span><span>Carregando mais canecas…</span>';
  var fallback=document.createElement('button');
  fallback.id='cfLoadFallback';fallback.type='button';fallback.className='cf-load-fallback';fallback.textContent='Carregar mais canecas';
  fallback.onclick=function(){revealBatch()};
  list.insertAdjacentElement('afterend',sentinel);
  sentinel.insertAdjacentElement('afterend',loading);
  loading.insertAdjacentElement('afterend',fallback);
  if('IntersectionObserver' in window){
    observer=new IntersectionObserver(function(entries){
      entries.forEach(function(en){if(en.isIntersecting)revealBatch()});
    },{rootMargin:'650px 0px'});
    observer.observe(sentinel);
  }else fallback.classList.add('cf-show');
}
function observeChanges(){
  if(!window.MutationObserver)return;
  var listing=q('#listagemProdutos');
  if(!listing||listing.__cfStoreObs)return;
  listing.__cfStoreObs=1;
  var queued=false;
  new MutationObserver(function(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(function(){
      queued=false;
      flattenGrid();
      resetAndDedupe();
      decorateAll();
      createBenefits();
    });
  }).observe(listing,{childList:true,subtree:true});
}
function init(){
  if(!isListing())return;
  addCss();
  neutralizeLegacy();
  document.body.classList.add('cf-storefront');
  flattenGrid();
  resetAndDedupe();
  createHeaderActions();
  createChips();
  createMobileBottomNav();
  decorateAll();
  createBenefits();
  setupProgressive();
  observeChanges();
  syncCartCount();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();
window.addEventListener('load',init,{once:true});
window.addEventListener('resize',function(){if(isListing()){createHeaderActions();syncCartCount()}},{passive:true});
setTimeout(init,300);
setTimeout(init,900);
console.info('CanecaFácil · Storefront '+BUILD);
})();