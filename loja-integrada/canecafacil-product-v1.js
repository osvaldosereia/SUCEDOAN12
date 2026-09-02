(function(){
'use strict';
var BUILD='20260902-product-v2';
if(window.__CF_PRODUCT_RUNTIME__===BUILD)return;
window.__CF_PRODUCT_RUNTIME__=BUILD;

function q(s,r){return (r||document).querySelector(s)}
function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function txt(n){return n?String(n.textContent||'').replace(/\s+/g,' ').trim():''}
function norm(v){return String(v||'').normalize?String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim():String(v||'').toLowerCase().replace(/\s+/g,' ').trim()}
function productPage(){return !!(document.body&&document.body.classList.contains('pagina-produto'))}
function cleanName(v){return String(v||'').replace(/^Caneca\s+de\s+Porcelana\s+/i,'').replace(/\s*-\s*350\s*ml\s*$/i,'').replace(/\s*-\s*350ml\s*$/i,'').trim()}
function mark(){if(document.body)document.body.classList.add('cf-product-page')}

function title(){
  var h=q('.pagina-produto h1.nome-produto');
  if(!h||h.dataset.cfClean==='1')return;
  var full=txt(h);
  h.dataset.cfClean='1';
  h.setAttribute('title',full);
  var short=cleanName(full);
  if(short)h.textContent=short;
}
function description(){
  var tabs=q('.pagina-produto .abas-custom');
  if(!tabs||q('.cf-desc-title'))return;
  var h=document.createElement('h3');
  h.className='cf-desc-title';
  h.textContent='Sobre esta caneca';
  tabs.parentNode.insertBefore(h,tabs);
}
function cleanupPersonalizerLabel(){
  qa('.pagina-produto .cf-personalizer-box').forEach(function(box){
    var prev=box.previousElementSibling;
    if(!prev)return;
    var t=norm(txt(prev));
    if(t==='personalize esta caneca'||t==='personalize sua caneca'||t==='personalize esta caneca:'){
      if(prev.parentNode)prev.parentNode.removeChild(prev);
    }
  });
}
function relatedTitle(){
  var box=q('.pagina-produto .aproveite-tambem');
  if(!box)return;
  var headings=Array.prototype.slice.call(box.children).filter(function(n){return /^H[1-6]$/.test(n.tagName)});
  var primary=null;
  headings.forEach(function(h){
    var t=norm(txt(h));
    if(/mais como esse|aproveite tambem|produtos relacionados/.test(t)){
      if(!primary){primary=h;primary.textContent='Mais como esse';primary.dataset.cfTitle='1'}
      else if(h.parentNode)h.parentNode.removeChild(h);
    }
  });
  if(!primary){
    primary=document.createElement('h4');
    primary.textContent='Mais como esse';
    primary.dataset.cfTitle='1';
    box.insertBefore(primary,box.firstChild);
  }
  Array.prototype.slice.call(box.childNodes).forEach(function(n){
    if(n.nodeType!==3)return;
    var t=norm(n.nodeValue);
    if(t==='mais como esse'||t==='mais como essemais como esse')n.nodeValue='';
  });
}
function related(){
  var cards=qa('.pagina-produto .aproveite-tambem .listagem-item');
  cards.forEach(function(card,i){
    if(card.dataset.cfProductDecorated!=='1'){
      card.dataset.cfProductDecorated='1';
      var name=q('.nome-produto',card);
      if(name){
        var full=txt(name);
        name.setAttribute('title',full);
        var short=cleanName(full);
        if(short)name.textContent=short;
      }
      var img=q('.imagem-produto img.imagem-principal,.imagem-produto img',card);
      if(img){img.loading='lazy';img.decoding='async'}
    }
    var li=card.closest?card.closest('li'):card.parentNode;
    if(li&&i>=8)li.classList.add('cf-related-hidden');
  });
}
function revealLimit(){
  var max=window.innerWidth<=767?4:8;
  qa('.pagina-produto .aproveite-tambem .listagem-item').forEach(function(card,i){
    var li=card.closest?card.closest('li'):card.parentNode;
    if(li)li.classList.toggle('cf-related-hidden',i>=max);
  });
}
function init(){
  if(!productPage())return;
  mark();
  title();
  description();
  cleanupPersonalizerLabel();
  relatedTitle();
  related();
  revealLimit();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
window.addEventListener('resize',revealLimit,{passive:true});
if(window.MutationObserver){
  var root=q('.pagina-produto')||document.body;
  if(root)new MutationObserver(function(){
    cleanupPersonalizerLabel();
    relatedTitle();
    related();
    revealLimit();
  }).observe(root,{childList:true,subtree:true});
}
setTimeout(init,300);
setTimeout(init,1000);
setTimeout(init,2200);
console.info('CanecaFácil · Product Runtime '+BUILD);
})();