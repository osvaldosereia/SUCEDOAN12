const BUILD='20260828-customer-mug-media-v28';
const FIREBASE_PRODUCTS='https://cedar-chemist-310801-default-rtdb.firebaseio.com/produtos';
const cache=new Map();
let observer=null;
let scanTimer=0;

const text=v=>String(v??'').trim();
const isUrl=v=>/^https?:\/\//i.test(text(v));
function favoritesRoute(){return /^#\/(?:favoritos|favorites)(?:[/?#]|$)/i.test(String(location.hash||''));}
function mediaFromProduct(product={}){
 const print=product.arte_impressao;
 return [
  product.thumbnail,product.mug_thumbnail,product.thumb,product.miniatura,
  product.preview_esquerda,product.preview_left,product.mug_preview_left,
  product.preview_direita,product.preview_right,product.mug_preview_right,
  product.mockup_1,
  product.arte_horizontal,product.arte_personalizacao,print&&typeof print==='object'?print.url:print,
  product.url_imagem,product.imagem_url,product.imagem
 ].map(text).find(value=>isUrl(value))||'';
}
async function product(id){
 if(cache.has(id))return cache.get(id);
 const promise=fetch(`${FIREBASE_PRODUCTS}/${encodeURIComponent(id)}.json`,{cache:'force-cache',headers:{Accept:'application/json'}})
  .then(response=>response.ok?response.json():null).catch(()=>null);
 cache.set(id,promise);
 return promise;
}
async function upgradeCard(card){
 if(!card||card.dataset.mugMediaV28==='1')return;
 const id=text(card.dataset.customerMug);if(!id)return;
 card.dataset.mugMediaV28='1';
 const img=card.querySelector('.customer-mug-media img');if(!img)return;
 try{
  const data=await product(id),media=mediaFromProduct(data||{});
  if(media){img.src=media;img.dataset.customerMugMedia=BUILD;img.style.objectFit='cover';}
 }catch(error){console.debug('[Minhas canecas] mantendo mídia atual:',error?.message||error);}
}
function scan(){
 clearTimeout(scanTimer);
 scanTimer=setTimeout(()=>{
  if(!favoritesRoute())return;
  document.querySelectorAll('.customer-mug-card[data-customer-mug]').forEach(card=>{
   if(card.dataset.mugMediaObserved==='1')return;
   card.dataset.mugMediaObserved='1';
   if(observer)observer.observe(card);else upgradeCard(card);
  });
 },20);
}
function init(){
 observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
  if(!entry.isIntersecting)return;
  observer.unobserve(entry.target);upgradeCard(entry.target);
 }),{rootMargin:'220px'});
 scan();
 const app=document.getElementById('app')||document.body;
 new MutationObserver(scan).observe(app,{subtree:true,childList:true});
 window.addEventListener('hashchange',scan);
 window.addEventListener('da:customer-favorites-updated',scan);
 window.addEventListener('da:mug-personalized-added',()=>{cache.clear();scan();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
document.documentElement.dataset.customerMugMedia=BUILD;
export{BUILD,mediaFromProduct,scan};