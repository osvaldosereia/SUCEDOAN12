const BUILD='20260828-mug-thumbnails-v5-personalizable-flag';
const FIREBASE_PRODUCTS='https://cedar-chemist-310801-default-rtdb.firebaseio.com/produtos';
const checked=new Set();
const rawCache=new Map();
let observer=null;

const text=v=>String(v??'').trim();
const truthy=v=>v===true||v===1||['1','true','sim','yes'].includes(text(v).toLowerCase());
const isUrl=v=>/^https?:\/\//i.test(text(v));
const isMug=raw=>truthy(raw?.modelo_caneca)||truthy(raw?.produto_sob_encomenda)||text(raw?.categoria).toLowerCase().includes('caneca');

function firstUrl(values=[]){return values.flat(Infinity).map(text).find(isUrl)||'';}
function mockupUrl(raw={}){
  return firstUrl([
    raw.mockup_1,
    Array.isArray(raw.imagens_site)?raw.imagens_site.slice(0,1):[],
    Array.isArray(raw.imagens)?raw.imagens.slice(0,1):[],
    raw.url_imagem,
    raw.imagem_url,
    raw.imagem,
    raw.thumbnail,
    raw.mug_thumbnail,
    raw.thumb,
    raw.miniatura
  ]);
}
function hasPublicCustomization(raw={}){
  const cfg=raw.personalizacao_config_publica&&typeof raw.personalizacao_config_publica==='object'?raw.personalizacao_config_publica:{};
  const fields=Array.isArray(cfg.campos)?cfg.campos:[];
  const hasActiveField=fields.some(field=>field&&field.publico!==false);
  return truthy(raw.personalizacao_publica)&&cfg.ativo!==false&&hasActiveField;
}

async function fetchRaw(id){
  if(rawCache.has(id))return rawCache.get(id);
  const promise=fetch(`${FIREBASE_PRODUCTS}/${encodeURIComponent(id)}.json?_=${Date.now()}`,{
    cache:'no-store',
    headers:{Accept:'application/json'}
  }).then(r=>r.ok?r.json():null).catch(()=>null);
  rawCache.set(id,promise);
  return promise;
}

async function processCard(card){
  const id=text(card.dataset.productCard);
  if(!id||checked.has(id))return;
  const img=card.querySelector('.product-card-media img');
  if(!img)return;
  checked.add(id);
  try{
    const raw=await fetchRaw(id);
    if(!raw||!isMug(raw))return;
    card.dataset.mugPersonalizable=hasPublicCustomization(raw)?'1':'0';
    const source=mockupUrl(raw);
    if(!source)return;
    img.src=source;
    img.dataset.mugThumb=BUILD;
    img.style.objectFit='contain';
  }catch(error){
    checked.delete(id);
    console.debug('[Caneca grid] mantendo imagem atual:',error?.message||error);
  }
}

function scan(){
  document.querySelectorAll('[data-product-card]').forEach(card=>{
    if(card.dataset.mugThumbObserved)return;
    card.dataset.mugThumbObserved='1';
    observer?.observe(card);
  });
}

function resetAndScan(){
  checked.clear();
  rawCache.clear();
  document.querySelectorAll('[data-product-card]').forEach(card=>{
    delete card.dataset.mugThumbObserved;
    delete card.dataset.mugPersonalizable;
  });
  scan();
}

function init(){
  observer=new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(entry.isIntersecting){
      observer.unobserve(entry.target);
      processCard(entry.target);
    }
  }),{rootMargin:'240px'});
  scan();
  window.addEventListener('da:route-rendered',()=>setTimeout(scan,0));
  window.addEventListener('da:catalog-ready',()=>setTimeout(resetAndScan,0));
  window.addEventListener('da:catalog-refreshed',()=>setTimeout(resetAndScan,0));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
document.documentElement.dataset.mugThumbs=BUILD;

export{BUILD,scan,mockupUrl,hasPublicCustomization};