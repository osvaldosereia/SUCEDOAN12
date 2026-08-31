import { FIREBASE_BASE, text, safeKey, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD = '20260831-admin-canecas-storefront-github-v2';
const MAKE_WEBHOOK = window.__CANECAS_ADMIN_CONFIG__?.makeWebhook || window.__CANECAS_ADMIN_CONFIG__?.mugGeneratorWebhook || '';
const PRODUCTS_NODE = 'produtos';
const ACTIONS_URL = 'https://github.com/osvaldosereia/SUCEDOAN12/actions/workflows/processar-vitrine-canecas.yml';
const WAIT_MS = 150000;
const POLL_MS = 2500;
const innerFetch = window.fetch.bind(window);
const $ = (selector, root = document) => root.querySelector(selector);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isHttp = value => /^https?:\/\//i.test(text(value));

function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, error ? 8000 : 4200);
}

async function fbGet(path) {
  const r = await innerFetch(`${FIREBASE_BASE}/${path}.json?_=${Date.now()}`, { cache:'no-store', headers:{Accept:'application/json'} });
  if (!r.ok) throw new Error(`Firebase ${r.status}`);
  return r.json();
}
async function fbPatch(path, data) {
  const r = await innerFetch(`${FIREBASE_BASE}/${path}.json`, { method:'PATCH', headers:{'Content-Type':'application/json',Accept:'application/json'}, body:JSON.stringify(data) });
  if (!r.ok) throw new Error(`Firebase ${r.status}`);
  return r.json().catch(() => null);
}
function artOf(p = {}) { return text(p.arte_horizontal || p.arte_personalizacao || p.arte_impressao?.url || p.arte_final_url); }
function cropUrlsOf(p = {}) { return { left:text(p.vitrine_recorte_esquerda || p.vitrine_recortes?.esquerda), center:text(p.vitrine_recorte_centro || p.vitrine_recortes?.centro), right:text(p.vitrine_recorte_direita || p.vitrine_recortes?.direita) }; }
function cropSetReady(p = {}) {
  const c=cropUrlsOf(p), source=artOf(p), saved=text(p.vitrine_recortes?.source_art || p.vitrine_recortes?.arte_origem);
  return Boolean(source && saved===source && isHttp(c.left) && isHttp(c.center) && isHttp(c.right));
}
function sourceReady(p = {}) { return isHttp(p.mockup_1) && isHttp(p.mockup_2) && isHttp(artOf(p)); }
function storefrontOrder(product = {}) {
  const crops = cropUrlsOf(product);
  return [text(product.mockup_2), text(product.mockup_1), crops.left, crops.right, crops.center];
}

async function waitForGitHub(productKey, sourceArt, timeout = WAIT_MS) {
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    const p=await fbGet(`${PRODUCTS_NODE}/${safeKey(productKey)}`).catch(()=>null);
    if(p && cropSetReady(p)) return p;
    const status=text(p?.vitrine_recortes_status || p?.vitrine_recortes?.status);
    if(status==='erro') throw new Error(`GitHub não conseguiu gerar os recortes: ${text(p?.vitrine_recortes_erro)||'erro não informado'}`);
    if(p && artOf(p) && artOf(p)!==sourceArt) throw new Error('A arte horizontal mudou enquanto o GitHub processava os recortes.');
    await sleep(POLL_MS);
  }
  throw new Error('Os 3 recortes ainda estão sendo preparados pelo GitHub. Aguarde alguns instantes e tente sincronizar novamente.');
}

async function ensureCrops(productKey, product = null) {
  let p=product || await fbGet(`${PRODUCTS_NODE}/${safeKey(productKey)}`);
  if(!p) throw new Error('Caneca não encontrada no Firebase.');
  if(cropSetReady(p)) return p;
  if(!sourceReady(p)) throw new Error('Para montar a vitrine são necessários os 2 mockups e a arte horizontal existentes.');
  const status=text(p.vitrine_recortes_status || p.vitrine_recortes?.status);
  if(!['processando','pronto'].includes(status)) {
    await fbPatch(`${PRODUCTS_NODE}/${safeKey(productKey)}`, { vitrine_recortes_status:'pendente_github', vitrine_recortes_erro:'', vitrine_recortes_solicitado_em:nowIso() }).catch(()=>{});
  }
  toast('GitHub Actions está preparando os 3 recortes da vitrine…');
  return waitForGitHub(productKey, artOf(p));
}

function decodeB64Json(value) {
  try { if(!value)return null; const binary=atob(value), bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)); return JSON.parse(new TextDecoder('utf-8').decode(bytes)); } catch { return null; }
}
async function callMake(payload) {
  if(!MAKE_WEBHOOK) throw new Error('Webhook Make não configurado.');
  const r=await innerFetch(MAKE_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({payload:JSON.stringify(payload)})});
  const raw=await r.text(); let data={}; try{data=raw?JSON.parse(raw):{}}catch{data={raw}};
  if(!r.ok||data.ok===false) throw new Error(data.error||data.error_message||`Make HTTP ${r.status}`);
  return data;
}
function imageIdsFrom(product={}) {
  const raw=product.loja_integrada?.image_ids || product.loja_integrada?.imagens_ids || [];
  if(Array.isArray(raw)) return raw.map(text).filter(Boolean).slice(0,5);
  if(raw&&typeof raw==='object') return Object.keys(raw).sort().map(k=>text(raw[k])).filter(Boolean).slice(0,5);
  return [];
}
async function ensureLiImageIds(productKey, product, payload) {
  let ids=imageIdsFrom(product);
  if(payload.action!=='loja_integrada_update_product'||ids.length>=5) return ids;
  const productId=text(payload.loja_integrada_product_id||product.loja_integrada?.produto_id);
  if(!productId) return ids;
  try{
    const result=await callMake({action:'loja_integrada_get_product',request_id:`LI-IMG-${Date.now().toString(36).toUpperCase()}`,loja_integrada_product_id:productId});
    const remote=decodeB64Json(result.produto_b64)||result.produto||{};
    ids=(Array.isArray(remote.imagens)?remote.imagens:[]).map(item=>text(item?.id)).filter(Boolean).slice(0,5);
    if(ids.length) await fbPatch(`${PRODUCTS_NODE}/${safeKey(productKey)}/loja_integrada`,{image_ids:ids,image_ids_at:nowIso()});
  }catch(error){console.warn('[CanecaFácil] não foi possível recuperar IDs antigos de imagens LI:',error);}
  return ids;
}

async function enrichLiPayload(payload) {
  const productKey=text(payload.product_key||payload.model_id);
  if(!productKey) return payload;
  const product=await ensureCrops(productKey), images=storefrontOrder(product), ids=await ensureLiImageIds(productKey,product,payload);
  if(!images.every(isHttp)) throw new Error('Vitrine incompleta: precisam existir mockup 2 + mockup 1 + esquerda + direita + quadrada.');

  // O cenário Make legado publica as posições nesta sequência de campos:
  // mockup_1, mockup_2, esquerda, centro, direita.
  // Mapeamos somente o payload para obter a ordem visual oficial sem alterar o cadastro real.
  const out={
    ...payload,
    mockup_1:images[0],
    mockup_2:images[1],
    vitrine_recorte_esquerda:images[2],
    vitrine_recorte_centro:images[3],
    vitrine_recorte_direita:images[4],
    storefront_images_json:JSON.stringify(images),
    storefront_images_version:BUILD,
  };
  for(let i=0;i<5;i+=1) out[`li_image_id_${i+1}`]=ids[i]||'';
  return out;
}

window.fetch=async function cfGitHubCropsFetch(input,init={}){
  if(typeof init?.body!=='string'||!MAKE_WEBHOOK||String(input)!==MAKE_WEBHOOK) return innerFetch(input,init);
  let wrapper,payload; try{wrapper=JSON.parse(init.body);payload=wrapper&&typeof wrapper.payload==='string'?JSON.parse(wrapper.payload):null;}catch{return innerFetch(input,init);}
  if(!payload) return innerFetch(input,init);
  if(['loja_integrada_create_product','loja_integrada_update_product'].includes(payload.action)){
    wrapper.payload=JSON.stringify(await enrichLiPayload(payload));
    return innerFetch(input,{...init,body:JSON.stringify(wrapper)});
  }
  return innerFetch(input,init);
};

async function renderDrawerCrops(){
  const content=$('#drawerContent'), key=text(content?.dataset.productKey);
  if(!key||$('#cfStorefrontCropsPreview',content)) return;
  const p=await fbGet(`${PRODUCTS_NODE}/${safeKey(key)}`).catch(()=>null); if(!p)return;
  const images=storefrontOrder(p), ready=cropSetReady(p), status=text(p.vitrine_recortes_status||p.vitrine_recortes?.status||'pendente'), anchor=$('.drawer-actions',content); if(!anchor)return;
  const section=document.createElement('div'); section.id='cfStorefrontCropsPreview'; section.className='form-section';
  section.innerHTML=`<h3>Imagens da vitrine</h3><div class="notice ${ready?'':'warn'}" style="margin-bottom:10px"><b>${ready?'5 imagens prontas':`Recortes: ${status}`}</b><br>Ordem: mockup 2 → mockup 1 → esquerda → direita → quadrada.</div>${ready?`<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">${images.map((url,i)=>`<img src="${url}" alt="Imagem ${i+1}" style="width:100%;object-fit:contain">`).join('')}</div>`:'<button type="button" class="secondary" id="cfRefreshGitHubCrops">Verificar novamente</button>'}`;
  anchor.insertAdjacentElement('beforebegin',section);
  $('#cfRefreshGitHubCrops',section)?.addEventListener('click',async e=>{const b=e.currentTarget;b.disabled=true;b.textContent='Verificando…';try{const fresh=await fbGet(`${PRODUCTS_NODE}/${safeKey(key)}`);section.remove();if(cropSetReady(fresh))toast('Recortes do GitHub estão prontos.');await renderDrawerCrops();}catch(err){toast(err?.message||err,true);b.disabled=false;b.textContent='Verificar novamente';}});
}
window.addEventListener('admin-canecas:drawer',e=>{if(e.detail?.kind==='mug')setTimeout(()=>renderDrawerCrops().catch(()=>{}),80);});
document.documentElement.dataset.cfStorefrontCrops=BUILD;
export { BUILD, ensureCrops, cropUrlsOf, cropSetReady, storefrontOrder };
