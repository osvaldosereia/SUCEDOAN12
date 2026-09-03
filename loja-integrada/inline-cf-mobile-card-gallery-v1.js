(function(){'use strict';
if(window.__CF_MOBILE_CARDS_V1__)return;
window.__CF_MOBILE_CARDS_V1__='20260903-1';

var M=window.matchMedia('(max-width:767px)');

function mobile(){return M.matches}
function pageOk(){return !!(document.body&&(document.body.classList.contains('pagina-inicial')||document.body.classList.contains('pagina-categoria')))}
function add(arr,u){u=String(u||'').trim();if(!u)return;try{u=new URL(u,location.href).href}catch(e){}var k;try{k=new URL(u).pathname.split('/').pop().toLowerCase()}catch(e){k=u}for(var i=0;i<arr.length;i++){if(arr[i].k===k)return}arr.push({u:u,k:k})}
function urlCard(card){var a=card.querySelector('a.nome-produto[href],a.produto-sobrepor[href]');return a?a.href:''}
function imgCard(card){return card.querySelector('.imagem-produto img.imagem-principal,.imagem-produto img')}
function installStyle(){
if(document.getElementById('cfMobileCardsV1Style'))return;
var s=document.createElement('style');s.id='cfMobileCardsV1Style';
s.textContent='@media(max-width:767px){body.pagina-categoria .secao-principal>.conteudo{width:100%!important;float:none!important;margin-left:0!important}body.pagina-categoria #listagemProdutos{width:100%!important}body.pagina-categoria #listagemProdutos .listagem-linha>ul{display:block!important;width:100%!important;margin:0!important;padding:0!important}body.pagina-categoria #listagemProdutos .listagem-linha>ul>li,body.pagina-categoria #listagemProdutos .listagem-linha>ul>li[class*="span"]{display:block!important;width:100%!important;max-width:100%!important;float:none!important;margin:0 0 18px!important;padding:0!important;box-sizing:border-box!important}body.pagina-categoria #listagemProdutos .listagem-item{width:100%!important;margin:0!important;border:1px solid #eee7e1!important;border-radius:16px!important;overflow:hidden!important;background:#fff!important;box-shadow:0 5px 18px rgba(44,34,27,.05)!important}body.pagina-categoria #listagemProdutos .imagem-produto{width:100%!important;height:auto!important;aspect-ratio:1/1!important;margin:0!important;padding:0!important;background:#f7f5f2!important;overflow:hidden!important}body.pagina-categoria #listagemProdutos .imagem-produto img.imagem-principal{display:block!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;object-fit:contain!important;object-position:center!important;background:#f7f5f2!important;transition:opacity .12s ease!important}body.pagina-categoria #listagemProdutos .info-produto{min-height:82px!important;padding:12px 14px 10px!important;background:#fff!important;text-align:left!important;box-sizing:border-box!important}body.pagina-categoria #listagemProdutos .nome-produto{display:block!important;height:auto!important;min-height:20px!important;margin:0 0 8px!important;font-size:14px!important;line-height:1.35!important;color:#3d4147!important;text-align:left!important}body.pagina-categoria #listagemProdutos .preco-produto{margin:0!important;text-align:left!important}body.pagina-categoria #listagemProdutos .preco-promocional,body.pagina-categoria #listagemProdutos .preco-produto strong{font-size:20px!important;line-height:1.1!important;color:#20242a!important}.cf-card-mobile-gallery{touch-action:pan-y!important}.cf-card-dots{position:absolute!important;left:50%!important;bottom:8px!important;transform:translateX(-50%)!important;z-index:9!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:5px!important;padding:4px 6px!important;border-radius:999px!important;background:rgba(255,255,255,.78)!important;box-shadow:0 1px 5px rgba(0,0,0,.06)!important;pointer-events:none!important}.cf-card-dot{display:block!important;width:6px!important;height:6px!important;border:1px solid #747474!important;border-radius:50%!important;background:#fff!important}.cf-card-dot.cf-on{background:#f47621!important;border-color:#f47621!important}body.pagina-inicial .listagem-item .imagem-produto,body.pagina-categoria .listagem-item .imagem-produto{position:relative!important}}';
document.head.appendChild(s)
}

function dots(card){
var box=card.querySelector('.imagem-produto'),urls=card.__cfUrls||[];if(!box||urls.length<2)return;
var old=box.querySelector('.cf-card-dots');if(old)old.remove();
var d=document.createElement('div');d.className='cf-card-dots';
for(var i=0;i<urls.length;i++){var b=document.createElement('span');b.className='cf-card-dot'+(i===0?' cf-on':'');d.appendChild(b)}
box.appendChild(d)
}
function set(card,n){
var a=card.__cfUrls||[];if(a.length<2)return;n=(n+a.length)%a.length;card.__cfIndex=n;
var img=imgCard(card);if(!img)return;img.style.opacity='.55';
setTimeout(function(){img.removeAttribute('srcset');img.src=a[n];img.style.opacity='1'},45);
var ds=card.querySelectorAll('.cf-card-dot');for(var i=0;i<ds.length;i++)ds[i].classList.toggle('cf-on',i===n)
}
async function load(card){
if(card.__cfLoad)return card.__cfLoad;
card.__cfLoad=(async function(){
var vals=[],img=imgCard(card);if(img)add(vals,img.currentSrc||img.src);
var href=urlCard(card);if(!href)return[];
try{
var r=await fetch(href,{credentials:'same-origin',cache:'force-cache'});if(!r.ok)throw Error();
var html=await r.text(),doc=new DOMParser().parseFromString(html,'text/html');
var links=[].slice.call(doc.querySelectorAll('.produto-thumbs a[data-imagem-grande],.miniaturas a[data-imagem-grande]'));
for(var i=0;i<links.length;i++){var x=links[i],im=x.querySelector('img');add(vals,im&&im.getAttribute('data-mediumimg'));add(vals,x.getAttribute('data-imagem-grande'));add(vals,im&&im.getAttribute('data-largeimg'))}
if(!links.length){var main=doc.querySelector('#imagemProduto');if(main)add(vals,main.getAttribute('src'))}
}catch(e){}
card.__cfUrls=vals.map(function(x){return x.u});card.__cfIndex=0;if(card.__cfUrls.length>1)dots(card);return card.__cfUrls
})();
return card.__cfLoad
}
function bind(card){
if(card.dataset.cfMobileSwipe==='1')return;card.dataset.cfMobileSwipe='1';
var box=card.querySelector('.imagem-produto');if(!box)return;box.classList.add('cf-card-mobile-gallery');
var sx=0,sy=0,inImg=false;
card.addEventListener('touchstart',function(e){if(!mobile()||!e.touches||e.touches.length!==1)return;var p=e.touches[0],r=box.getBoundingClientRect();inImg=p.clientX>=r.left&&p.clientX<=r.right&&p.clientY>=r.top&&p.clientY<=r.bottom;if(!inImg)return;sx=p.clientX;sy=p.clientY;load(card)},{passive:true});
card.addEventListener('touchend',function(e){if(!mobile()||!inImg||!e.changedTouches||!e.changedTouches.length)return;inImg=false;var dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)<42||Math.abs(dx)<=Math.abs(dy)*1.2)return;card.__cfSwipeAt=Date.now();var dir=dx<0?1:-1;load(card).then(function(a){if(a.length>1)set(card,(card.__cfIndex||0)+dir)})},{passive:true});
card.addEventListener('click',function(e){if(card.__cfSwipeAt&&Date.now()-card.__cfSwipeAt<650){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation()}},true)
}
function scan(){
if(!mobile()||!pageOk())return;installStyle();
var cards=[].slice.call(document.querySelectorAll('#listagemProdutos .listagem-item'));for(var i=0;i<cards.length;i++)bind(cards[i]);
if('IntersectionObserver'in window){var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){load(x.target);io.unobserve(x.target)}})},{rootMargin:'220px 0px'});for(var j=0;j<cards.length;j++){if(!cards[j].__cfLoad)io.observe(cards[j])}}else{for(var k=0;k<Math.min(cards.length,6);k++)load(cards[k])}
}
function start(){scan();setTimeout(scan,700);setTimeout(scan,1800)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();