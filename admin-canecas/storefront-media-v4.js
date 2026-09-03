import { FIREBASE_BASE, text, safeKey, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD='20260903-admin-canecas-storefront-li-v5-three-images';
const MAKE_WEBHOOK=window.__CANECAS_ADMIN_CONFIG__?.makeWebhook||window.__CANECAS_ADMIN_CONFIG__?.mugGeneratorWebhook||'';
const PRODUCTS_NODE='produtos';
const WAIT_MS=180000;
const POLL_MS=2500;
const innerFetch=window.fetch.bind(window);
const $=(s,r=document)=>r.querySelector(s);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const isHttp=v=>/^https?:\/\//i.test(text(v));

function toast(message,error=false){const el=$('#toast');if(!el)return;el.textContent=message;el.className=`toast${error?' error':''}`;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>{el.hidden=true;},error?8000:4200);}
async function fbGet(path){const r=await innerFetch(`${FIREBASE_BASE}/${path}.json?_=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`Firebase ${r.status}`);return r.json();}
async function fbPatch(path,data){const r=await innerFetch(`${FIREBASE_BASE}/${path}.json`,{method:'PATCH',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(data)});if(!r.ok)throw new Error(`Firebase ${r.status}`);return r.json().catch(()=>null);}
function artOf(p={}){return text(p.arte_horizontal||p.arte_personalizacao||p.arte_impressao?.url||p.arte_final_url);}
function mediaOf(p={}){return text(p.vitrine_horizontal_quadrada||p.vitrine_loja_integrada?.url||p.loja_integrada?.horizontal_quadrada||p.loja_integrada_horizontal_quadrada);}
function mocksOf(p={}){return{m1:text(p.mockup_1||p.imagens_site?.[0]||p.imagens?.[0]),m2:text(p.mockup_2||p.imagens_site?.[1]||p.imagens?.[1])};}
function ready(p={}){const source=artOf(p),saved=text(p.vitrine_loja_integrada?.source_art);return Boolean(source&&saved===source&&isHttp(mediaOf(p)));}
function storefrontOrder(p={}){const m=mocksOf(p);return[m.m1,m.m2,mediaOf(p)];}

async function callMake(payload){
  if(!MAKE_WEBHOOK)throw new Error('Webhook Make não configurado.');
  const r=await innerFetch(MAKE_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({payload:JSON.stringify(payload)})});
  const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{};}catch{data={raw};}
  if(!r.ok||data.ok===false)throw new Error(data.error||data.error_message||`Make HTTP ${r.status}`);
  return data;
}
async function requestMedia(key){
  try{
    await callMake({action:'prepare_mug_storefront_media',request_id:`LI-MEDIA-${Date.now().toString(36).toUpperCase()}`,product_key:key});
    return true;
  }catch(error){
    console.warn('[CanecaFácil] não foi possível disparar mídia LI pelo Make:',error);
    return false;
  }
}
async function waitForMedia(key,source){
  const deadline=Date.now()+WAIT_MS;
  while(Date.now()<deadline){
    const p=await fbGet(`${PRODUCTS_NODE}/${safeKey(key)}`).catch(()=>null);
    if(p&&ready(p))return p;
    const status=text(p?.vitrine_loja_integrada_status||p?.vitrine_loja_integrada?.status);
    if(status==='erro')throw new Error(`GitHub não conseguiu preparar a imagem da Loja Integrada: ${text(p?.vitrine_loja_integrada_erro)||'erro não informado'}`);
    if(p&&artOf(p)&&artOf(p)!==source)throw new Error('A arte horizontal mudou durante o processamento.');
    await sleep(POLL_MS);
  }
  throw new Error('A horizontal quadrada da Loja Integrada ainda está sendo preparada. Tente novamente em instantes.');
}
async function ensureMedia(key,product=null){
  let p=product||await fbGet(`${PRODUCTS_NODE}/${safeKey(key)}`);
  if(!p)throw new Error('Caneca não encontrada no Firebase.');
  if(ready(p))return p;
  if(!isHttp(artOf(p)))throw new Error('A caneca precisa da arte horizontal mestre para preparar a imagem da loja.');
  const m=mocksOf(p);if(!isHttp(m.m1)||!isHttp(m.m2))throw new Error('A caneca precisa dos dois mockups antes de sincronizar a Loja Integrada.');
  await fbPatch(`${PRODUCTS_NODE}/${safeKey(key)}`,{vitrine_loja_integrada_status:'pendente_github',vitrine_loja_integrada_erro:'',vitrine_loja_integrada_solicitado_em:nowIso()}).catch(()=>{});
  toast('Preparando a horizontal quadrada compactada para a Loja Integrada…');
  await requestMedia(key);
  return waitForMedia(key,artOf(p));
}

function imageIdsFrom(product={}){
  const raw=product.loja_integrada?.image_ids||product.loja_integrada?.imagens_ids||[];
  if(Array.isArray(raw))return raw.map(text).filter(Boolean).slice(0,5);
  if(raw&&typeof raw==='object')return Object.keys(raw).sort().map(k=>text(raw[k])).filter(Boolean).slice(0,5);
  return[];
}
function decodeB64Json(value){try{if(!value)return null;const binary=atob(value),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return JSON.parse(new TextDecoder('utf-8').decode(bytes));}catch{return null;}}
async function ensureImageIds(key,product,payload){
  let ids=imageIdsFrom(product);
  if(payload.action!=='loja_integrada_update_product')return ids;
  const productId=text(payload.loja_integrada_product_id||product.loja_integrada?.produto_id);
  if(!productId)return ids;
  try{
    const result=await callMake({action:'loja_integrada_get_product',request_id:`LI-IMG-${Date.now().toString(36).toUpperCase()}`,loja_integrada_product_id:productId});
    const remote=decodeB64Json(result.produto_b64)||result.produto||{};
    ids=(Array.isArray(remote.imagens)?remote.imagens:[]).map(i=>text(i?.id)).filter(Boolean).slice(0,5);
    await fbPatch(`${PRODUCTS_NODE}/${safeKey(key)}/loja_integrada`,{image_ids:ids,image_ids_at:nowIso()}).catch(()=>{});
  }catch(error){console.warn('[CanecaFácil] não foi possível recuperar IDs antigos:',error);}
  return ids;
}
async function enrich(payload){
  const key=text(payload.product_key||payload.model_id);if(!key)return payload;
  const p=await ensureMedia(key),images=storefrontOrder(p),ids=await ensureImageIds(key,p,payload);
  if(images.length!==3||!images.every(isHttp))throw new Error('Vitrine incompleta: o modelo precisa de Mockup 1 + Mockup 2 + horizontal quadrada da loja.');
  const out={...payload,mockup_1:images[0],mockup_2:images[1],mockup_3:'',vitrine_horizontal_quadrada:images[2],loja_integrada_horizontal_quadrada:images[2],vitrine_recorte_esquerda:'',vitrine_recorte_centro:'',vitrine_recorte_direita:'',storefront_images_json:JSON.stringify(images),storefront_images_version:BUILD};
  for(let i=0;i<5;i++)out[`li_image_id_${i+1}`]=ids[i]||'';
  return out;
}

window.fetch=async function cfStorefrontThreeImagesFetch(input,init={}){
  if(typeof init?.body!=='string'||!MAKE_WEBHOOK||String(input)!==MAKE_WEBHOOK)return innerFetch(input,init);
  let wrapper,payload;try{wrapper=JSON.parse(init.body);payload=wrapper&&typeof wrapper.payload==='string'?JSON.parse(wrapper.payload):null;}catch{return innerFetch(input,init);}
  if(!payload)return innerFetch(input,init);
  if(['loja_integrada_create_product','loja_integrada_update_product'].includes(payload.action)){
    wrapper.payload=JSON.stringify(await enrich(payload));
    return innerFetch(input,{...init,body:JSON.stringify(wrapper)});
  }
  return innerFetch(input,init);
};

async function renderDrawer(){
  const content=$('#drawerContent'),key=text(content?.dataset.productKey);if(!key||$('#cfStorefrontCropsPreview',content))return;
  const p=await fbGet(`${PRODUCTS_NODE}/${safeKey(key)}`).catch(()=>null);if(!p)return;
  const images=storefrontOrder(p),isReady=ready(p)&&images.length===3&&images.every(isHttp),status=text(p.vitrine_loja_integrada_status||p.vitrine_loja_integrada?.status||'pendente'),anchor=$('.drawer-actions',content);if(!anchor)return;
  const labels=['Mockup 1','Mockup 2','Arte horizontal · versão quadrada da loja'];
  const section=document.createElement('div');section.id='cfStorefrontCropsPreview';section.className='form-section';
  section.innerHTML=`<h3>Imagens da Loja Integrada</h3><div class="notice ${isReady?'':'warn'}" style="margin-bottom:10px"><b>${isReady?'Galeria pronta: 3 imagens':`Mídia da loja: ${status}`}</b><br>Enviamos 2 mockups + 1 versão quadrada compactada da arte horizontal. A arte mestre de impressão permanece intacta e não é enviada para a galeria.</div>${isReady?`<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">${images.map((url,i)=>`<figure style="margin:0"><img src="${url}" alt="${labels[i]}" style="width:100%;aspect-ratio:1/1;object-fit:contain;background:#fff;border:1px solid #eee;border-radius:8px"><figcaption style="font-size:11px">${labels[i]}</figcaption></figure>`).join('')}</div>`:'<button type="button" class="secondary" id="cfRefreshCropsV13">Preparar/verificar novamente</button>'}`;
  anchor.insertAdjacentElement('beforebegin',section);
  $('#cfRefreshCropsV13',section)?.addEventListener('click',async e=>{const b=e.currentTarget;b.disabled=true;b.textContent='Preparando…';try{const fresh=await ensureMedia(key);section.remove();if(ready(fresh)&&storefrontOrder(fresh).every(isHttp))toast('As 3 imagens da Loja Integrada estão prontas.');await renderDrawer();}catch(err){toast(err?.message||err,true);b.disabled=false;b.textContent='Preparar/verificar novamente';}});
}
window.addEventListener('admin-canecas:drawer',e=>{if(e.detail?.kind==='mug')setTimeout(()=>renderDrawer().catch(()=>{}),80);});
document.documentElement.dataset.cfStorefrontCrops=BUILD;
export{BUILD,ensureMedia,mediaOf,ready as mediaReady,storefrontOrder,ensureMedia as ensureCrops,mediaOf as cropUrlsOf,ready as cropSetReady};
