import { CONFIG } from './config.js?v=20260828-canecas-2mockups-v7';

const BUILD='20260828-mug-public-char-limit-v1';
const FIREBASE=String(CONFIG.ENDPOINTS?.FIREBASE_ORDERS||'https://cedar-chemist-310801-default-rtdb.firebaseio.com/pedidos').replace(/\/pedidos\/?$/,'');
const TEXT_TYPES=new Set(['texto','texto_longo']);
const cache=new Map();
let routeEpoch=0;

const text=value=>String(value??'').trim();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function routeKey(){const match=String(location.hash||'').match(/^#\/produto\/([^/?#]+)/i);return match?decodeURIComponent(match[1]):'';}
function defaultMax(tipo){return tipo==='texto_longo'?220:tipo==='texto'?120:0;}
function normalizeMax(value,tipo){if(!TEXT_TYPES.has(tipo))return 0;const parsed=Number.parseInt(String(value??''),10);return Number.isFinite(parsed)&&parsed>0?Math.min(1000,Math.max(1,parsed)):defaultMax(tipo);}
async function firebaseGet(path){const response=await fetch(`${FIREBASE}/${path}.json?_=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`Firebase ${response.status}`);return response.json();}

function ensureStyles(){
  if(document.getElementById('mugPublicCharLimitStylesV1'))return;
  const style=document.createElement('style');style.id='mugPublicCharLimitStylesV1';style.textContent=`
    .mug-public-char-counter{display:block;text-align:right;margin-top:1px;font-size:10px!important;color:#747b72!important;font-variant-numeric:tabular-nums}.mug-public-char-counter.near{color:#8a5a16!important}.mug-public-char-counter.full{color:#9c2f2f!important;font-weight:800}
  `;document.head.appendChild(style);
}

function updateCounter(control,counter,max){
  const count=String(control.value??'').length;
  counter.textContent=`${count} / ${max} caracteres`;
  counter.classList.toggle('near',count>=Math.ceil(max*.8)&&count<max);
  counter.classList.toggle('full',count>=max);
}

function bindControl(control,max){
  if(!control||!max)return;
  control.maxLength=max;
  if(String(control.value??'').length>max)control.value=String(control.value??'').slice(0,max);
  const label=control.closest('.mug-public-field')||control.parentElement;
  if(!label)return;
  let counter=label.querySelector(`[data-mug-char-counter="${CSS.escape(control.dataset.mugPublicField||'field')}"]`);
  if(!counter){counter=document.createElement('small');counter.className='mug-public-char-counter';counter.dataset.mugCharCounter=control.dataset.mugPublicField||'field';label.appendChild(counter);}
  if(control.dataset.mugCharBound!==BUILD){
    control.dataset.mugCharBound=BUILD;
    control.addEventListener('input',()=>{
      if(control.value.length>max)control.value=control.value.slice(0,max);
      updateCounter(control,counter,max);
    });
  }
  updateCounter(control,counter,max);
}

function applyFields(fields){
  ensureStyles();
  for(const field of fields){
    if(!TEXT_TYPES.has(field?.tipo))continue;
    const id=text(field.id);if(!id)continue;
    const control=document.querySelector(`[data-mug-public-field="${CSS.escape(id)}"]`);if(!control)continue;
    bindControl(control,normalizeMax(field.max_caracteres,field.tipo));
  }
}

async function scan(){
  const epoch=++routeEpoch,key=routeKey();if(!key)return;
  try{
    let fields=cache.get(key);
    if(!fields){const product=await firebaseGet(`produtos/${encodeURIComponent(key)}`);fields=Array.isArray(product?.personalizacao_config_publica?.campos)?product.personalizacao_config_publica.campos:[];cache.set(key,fields);}
    if(epoch!==routeEpoch||routeKey()!==key)return;
    for(let attempt=0;attempt<20;attempt++){
      if(document.querySelector('#mug-public-personalizer')){applyFields(fields);return;}
      await sleep(80);
    }
  }catch(error){console.warn('[Limite de caracteres público] Falha ao aplicar:',error);}
}

window.addEventListener('hashchange',()=>scan());
window.addEventListener('da:route-rendered',()=>scan());
window.addEventListener('da:catalog-ready',()=>scan());
window.addEventListener('mug-text-limit-saved',event=>{const key=text(event.detail?.key);if(key)cache.delete(key);scan();});
new MutationObserver(()=>{if(routeKey()&&document.querySelector('#mug-public-personalizer')){const fields=cache.get(routeKey());if(fields)applyFields(fields);}}).observe(document.documentElement,{childList:true,subtree:true});

scan();
document.documentElement.dataset.mugPublicCharLimit=BUILD;
console.info(`Canecas públicas · limite de caracteres · ${BUILD}`);

export { BUILD, scan, normalizeMax };
