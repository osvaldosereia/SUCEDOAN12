const BUILD='20260828-mug-personalizable-badge-v1-red';
let observer=null;
let timer=0;

function injectStyles(){
  if(document.getElementById('mugPersonalizableBadgeV1'))return;
  const style=document.createElement('style');
  style.id='mugPersonalizableBadgeV1';
  style.textContent=`
[data-product-card].mug-card-polish .mug-card-badge{display:none!important}
[data-product-card][data-mug-personalizable="1"].mug-card-polish .mug-card-badge{
  display:inline-flex!important;
  left:9px!important;
  top:9px!important;
  bottom:auto!important;
  padding:7px 10px!important;
  border:1px solid rgba(255,255,255,.8)!important;
  background:linear-gradient(180deg,#e33b35 0%,#b91f1a 100%)!important;
  color:#fff!important;
  font-size:10px!important;
  font-weight:900!important;
  letter-spacing:.025em!important;
  box-shadow:0 6px 18px rgba(151,25,21,.28)!important;
  backdrop-filter:blur(6px);
}
[data-product-card][data-mug-personalizable="1"].mug-card-polish .mug-card-badge::before{
  width:7px!important;
  height:7px!important;
  background:#fff!important;
  box-shadow:0 0 0 2px rgba(255,255,255,.22)!important;
}
@media(max-width:700px){
  [data-product-card][data-mug-personalizable="1"].mug-card-polish .mug-card-badge{
    left:6px!important;
    top:6px!important;
    bottom:auto!important;
    padding:6px 8px!important;
    font-size:9px!important;
  }
}
`;
  document.head.appendChild(style);
}

function sync(root=document){
  root.querySelectorAll?.('[data-product-card]').forEach(card=>{
    const badge=card.querySelector('.mug-card-badge');
    if(!badge)return;
    const active=card.dataset.mugPersonalizable==='1';
    badge.hidden=!active;
    badge.setAttribute('aria-hidden',active?'false':'true');
  });
}
function schedule(root=document){
  clearTimeout(timer);
  timer=setTimeout(()=>sync(root),25);
}
function init(){
  injectStyles();
  sync(document);
  const target=document.getElementById('app')||document.body;
  observer=new MutationObserver(()=>schedule(document));
  observer.observe(target,{subtree:true,childList:true,attributes:true,attributeFilter:['data-mug-personalizable','data-mug-thumb','class']});
  ['da:route-rendered','da:catalog-ready','da:catalog-refreshed'].forEach(name=>window.addEventListener(name,()=>schedule(document)));
  document.documentElement.dataset.mugPersonalizableBadge=BUILD;
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();

export{BUILD,sync};