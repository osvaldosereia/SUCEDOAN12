(function(){
'use strict';
if(window.__CF_BOOTSTRAP_V2__)return;
window.__CF_BOOTSTRAP_V2__='20260902-1';

var BASE='https://donaantonia.com.br/loja-integrada/canecafacil-site-runtime-v1.js?v=20260902-4';
var STOREFRONT='https://donaantonia.com.br/loja-integrada/canecafacil-storefront-v2.js?v=20260902-1';

/* Impede somente a vitrine V1. O restante do runtime V1 continua ativo. */
window.__CF_STOREFRONT__='20260902-storefront-v1';

function hasScript(pattern){return Array.prototype.some.call(document.scripts,function(s){return pattern.test(s.src||'')})}
function listingPage(){return !!(document.body&&/(?:^|\s)(pagina-inicial|pagina-categoria|pagina-busca)(?:\s|$)/.test(document.body.className))}
function loadStorefront(){
  if(!listingPage()||window.__CF_STOREFRONT_V2__==='20260902-storefront-v2'||hasScript(/canecafacil-storefront-v2\.js/i))return;
  var s=document.createElement('script');s.src=STOREFRONT;s.async=true;s.onerror=function(){console.error('[CanecaFácil] Falha ao carregar Storefront V2.');};document.head.appendChild(s);
}
function loadBase(){
  if(window.CFSITERUNTIME1){loadStorefront();return}
  if(hasScript(/canecafacil-site-runtime-v1\.js/i)){setTimeout(loadStorefront,250);return}
  var s=document.createElement('script');s.src=BASE;s.async=true;s.onload=loadStorefront;s.onerror=function(){console.error('[CanecaFácil] Falha ao carregar runtime base.');loadStorefront();};document.head.appendChild(s);
}
function init(){loadBase();setTimeout(loadStorefront,500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
console.info('CanecaFácil · Bootstrap V2 20260902-1');
})();