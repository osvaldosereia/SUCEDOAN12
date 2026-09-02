(function(){
'use strict';
var BUILD='20260902-product-v1';
if(window.__CF_PRODUCT_RUNTIME__===BUILD)return;
window.__CF_PRODUCT_RUNTIME__=BUILD;

function q(s,r){return (r||document).querySelector(s)}
function qa(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
function txt(n){return n?String(n.textContent||'').replace(/\s+/g,' ').trim():''}
function productPage(){return !!(document.body&&document.body.classList.contains('pagina-produto'))}
function cleanName(v){return String(v||'').replace(/^Caneca\s+de\s+Porcelana\s+/i,'').replace(/\s*-\s*350\s*ml\s*$/i,'').replace(/\s*-\s*350ml\s*$/i,'').trim()}
function mark(){if(document.body)document.body.classList.add('cf-product-page')}
function title(){var h=q('.pagina-produto h1.nome-produto');if(!h||h.dataset.cfClean==='1')return;var full=txt(h);h.dataset.cfClean='1';h.setAttribute('title',full);var short=cleanName(full);if(short)h.textContent=short}
function description(){var tabs=q('.pagina-produto .abas-custom');if(!tabs||q('.cf-desc-title'))return;var h=document.createElement('h3');h.className='cf-desc-title';h.textContent='Sobre esta caneca';tabs.parentNode.insertBefore(h,tabs)}
function relatedTitle(){var h=q('.pagina-produto .aproveite-tambem>h4');if(h&&!h.dataset.cfTitle){h.textContent='Mais como esse';h.dataset.cfTitle='1'}}
function related(){
  var cards=qa('.pagina-produto .aproveite-tambem .listagem-item');
  cards.forEach(function(card,i){
    if(card.dataset.cfProductDecorated==='1')return;card.dataset.cfProductDecorated='1';
    var name=q('.nome-produto',card);if(name){var full=txt(name);name.setAttribute('title',full);var short=cleanName(full);if(short)name.textContent=short}
    var img=q('.imagem-produto img.imagem-principal,.imagem-produto img',card);if(img){img.loading='lazy';img.decoding='async'}
    var li=card.closest?card.closest('li'):card.parentNode;if(li&&i>=8)li.classList.add('cf-related-hidden');
  });
}
function revealLimit(){var max=window.innerWidth<=767?4:8;qa('.pagina-produto .aproveite-tambem .listagem-item').forEach(function(card,i){var li=card.closest?card.closest('li'):card.parentNode;if(li)li.classList.toggle('cf-related-hidden',i>=max)})}
function init(){if(!productPage())return;mark();title();description();relatedTitle();related();revealLimit()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.addEventListener('resize',revealLimit,{passive:true});
if(window.MutationObserver){var root=q('.pagina-produto .aproveite-tambem')||document.body;if(root)new MutationObserver(function(){relatedTitle();related();revealLimit()}).observe(root,{childList:true,subtree:true})}
setTimeout(init,300);setTimeout(init,1000);
console.info('CanecaFácil · Product Runtime '+BUILD);
})();
