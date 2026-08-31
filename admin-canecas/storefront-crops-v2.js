import { FIREBASE_BASE, text, norm, safeKey, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD = '20260830-admin-canecas-storefront-crops-v2';
const MAKE_WEBHOOK = window.__CANECAS_ADMIN_CONFIG__?.makeWebhook || window.__CANECAS_ADMIN_CONFIG__?.mugGeneratorWebhook || '';
const PRODUCTS_NODE = 'produtos';
const WEBP_QUALITY = 0.84;
const FINAL_WAIT_MS = 180000;
const SAVE_WAIT_MS = 150000;
const POLL_MS = 1800;
const innerFetch = window.fetch.bind(window);

const $ = (selector, root = document) => root.querySelector(selector);
const isHttpUrl = value => /^https?:\/\//i.test(text(value));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const slug = value => norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'caneca';

function toast(message, error = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast${error ? ' error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, error ? 7000 : 3600);
}

async function fbGet(path) {
  const response = await innerFetch(`${FIREBASE_BASE}/${path}.json?_=${Date.now()}`, { cache:'no-store', headers:{ Accept:'application/json' } });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json();
}

async function fbPatch(path, data) {
  const response = await innerFetch(`${FIREBASE_BASE}/${path}.json`, {
    method:'PATCH', headers:{ 'Content-Type':'application/json', Accept:'application/json' }, body:JSON.stringify(data)
  });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json().catch(() => null);
}

function decodeB64Json(value) {
  try {
    if (!value) return null;
    const binary = atob(value), bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  } catch { return null; }
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível carregar a arte horizontal para gerar os recortes.'));
    image.src = source;
  });
}

function cropDataUrl(image, sx, sy, sw, sh) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  const ctx = canvas.getContext('2d', { alpha:false });
  if (!ctx) throw new Error('Canvas indisponível para criar os recortes.');
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', WEBP_QUALITY);
}

async function generateCrops(source) {
  const image = await loadImage(source);
  const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('A arte horizontal não possui dimensões válidas.');
  const half = width / 2, square = Math.min(height, width), centerX = Math.max(0, (width - square) / 2);
  return {
    left: cropDataUrl(image, 0, 0, half, height),
    center: cropDataUrl(image, centerX, 0, square, square),
    right: cropDataUrl(image, half, 0, width - half, height),
    meta: { source_width:width, source_height:height, center_x:Math.round(centerX) }
  };
}

function artOf(p = {}) { return text(p.arte_horizontal || p.arte_personalizacao || p.arte_impressao?.url || p.arte_final_url); }
function cropUrlsOf(p = {}) {
  return {
    left:text(p.vitrine_recorte_esquerda || p.vitrine_recortes?.esquerda),
    center:text(p.vitrine_recorte_centro || p.vitrine_recortes?.centro),
    right:text(p.vitrine_recorte_direita || p.vitrine_recortes?.direita)
  };
}
function cropSetReady(p = {}) {
  const c = cropUrlsOf(p), source = artOf(p), saved = text(p.vitrine_recortes?.source_art || p.vitrine_recortes?.arte_origem);
  return Boolean(source && saved === source && isHttpUrl(c.left) && isHttpUrl(c.center) && isHttpUrl(c.right));
}

async function callMake(payload) {
  if (!MAKE_WEBHOOK) throw new Error('Webhook Make não configurado.');
  const response = await innerFetch(MAKE_WEBHOOK, {
    method:'POST', headers:{ 'Content-Type':'application/json', Accept:'application/json' },
    body:JSON.stringify({ payload:JSON.stringify(payload) })
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  if (!response.ok || data.ok === false) throw new Error(data.error || data.error_message || `Make HTTP ${response.status}`);
  return data;
}

async function waitCrops(productKey, sourceArt, requestId, timeout = SAVE_WAIT_MS) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const product = await fbGet(`${PRODUCTS_NODE}/${safeKey(productKey)}`).catch(() => null);
    if (product && cropSetReady(product)) return product;
    const status = text(product?.vitrine_recortes_status || product?.vitrine_recortes?.status);
    const remoteRequest = text(product?.vitrine_recortes_request_id || product?.vitrine_recortes?.request_id);
    if (status === 'erro' && (!remoteRequest || remoteRequest === requestId)) throw new Error(text(product?.vitrine_recortes_erro) || 'Falha ao salvar recortes da vitrine.');
    if (product && artOf(product) && artOf(product) !== sourceArt) throw new Error('A arte horizontal mudou durante a geração dos recortes. Tente novamente.');
    await sleep(POLL_MS);
  }
  throw new Error('O Make aceitou os recortes, mas eles não ficaram prontos no Firebase dentro do tempo esperado.');
}

async function saveCrops(productKey, product, crops) {
  const requestId = `CROP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
  const sourceArt = artOf(product);
  await fbPatch(`${PRODUCTS_NODE}/${safeKey(productKey)}`, {
    vitrine_recortes_status:'enviando', vitrine_recortes_request_id:requestId, vitrine_recortes_erro:'', updated_at:nowIso()
  });
  const result = await callMake({
    action:'save_mug_storefront_crops', request_id:requestId, product_key:productKey,
    seo_slug:slug(product.nome || product.codigo || productKey),
    crop_left_base64:crops.left, crop_center_base64:crops.center, crop_right_base64:crops.right,
    source_art:sourceArt, source_width:crops.meta.source_width, source_height:crops.meta.source_height,
    mockup_1:text(product.mockup_1), mockup_2:text(product.mockup_2),
    firebase_url:FIREBASE_BASE, products_node:PRODUCTS_NODE, crop_version:BUILD
  });
  const urls = {
    left:text(result.crop_left_url || result.left_url), center:text(result.crop_center_url || result.center_url), right:text(result.crop_right_url || result.right_url)
  };
  if ([urls.left, urls.center, urls.right].every(isHttpUrl)) return urls;
  const ready = await waitCrops(productKey, sourceArt, requestId);
  return cropUrlsOf(ready);
}

async function ensureCrops(productKey, product = null) {
  let current = product || await fbGet(`${PRODUCTS_NODE}/${safeKey(productKey)}`);
  if (!current) throw new Error('Caneca não encontrada no Firebase.');
  if (cropSetReady(current)) return current;
  const source = artOf(current);
  if (!isHttpUrl(source) && !/^data:image\//i.test(source)) throw new Error('Caneca sem arte horizontal válida.');
  if (!isHttpUrl(current.mockup_1) || !isHttpUrl(current.mockup_2)) throw new Error('Caneca sem os 2 mockups necessários para montar a vitrine.');
  toast('Gerando apenas os 3 recortes que faltam…');
  const crops = await generateCrops(source);
  await saveCrops(productKey, current, crops);
  current = await fbGet(`${PRODUCTS_NODE}/${safeKey(productKey)}`);
  if (!cropSetReady(current || {})) throw new Error('Firebase não confirmou os três recortes.');
  return current;
}

async function persistFinalizationCrops(payload) {
  const productKey = text(payload.request_id || payload.product_key);
  if (!productKey || !payload.image_base64) return;
  const cropPromise = generateCrops(payload.image_base64);
  const deadline = Date.now() + FINAL_WAIT_MS;
  let product = null;
  while (Date.now() < deadline) {
    product = await fbGet(`${PRODUCTS_NODE}/${safeKey(productKey)}`).catch(() => null);
    if (product && isHttpUrl(artOf(product)) && isHttpUrl(product.mockup_1) && isHttpUrl(product.mockup_2)) break;
    await sleep(POLL_MS);
  }
  if (!product || !isHttpUrl(artOf(product)) || cropSetReady(product)) return;
  await saveCrops(productKey, product, await cropPromise);
}

function imageIdsFrom(product = {}) {
  const raw = product.loja_integrada?.image_ids || product.loja_integrada?.imagens_ids || [];
  if (Array.isArray(raw)) return raw.map(text).filter(Boolean).slice(0,5);
  if (raw && typeof raw === 'object') return Object.keys(raw).sort().map(k => text(raw[k])).filter(Boolean).slice(0,5);
  return [];
}

async function ensureLiImageIds(productKey, product, payload) {
  let ids = imageIdsFrom(product);
  if (payload.action !== 'loja_integrada_update_product' || ids.length >= 5) return ids;
  const productId = text(payload.loja_integrada_product_id || product.loja_integrada?.produto_id);
  if (!productId) return ids;
  try {
    const result = await callMake({ action:'loja_integrada_get_product', request_id:`LI-IMG-${Date.now().toString(36).toUpperCase()}`, loja_integrada_product_id:productId });
    const remote = decodeB64Json(result.produto_b64) || result.produto || {};
    ids = (Array.isArray(remote.imagens) ? remote.imagens : []).map(item => text(item?.id)).filter(Boolean).slice(0,5);
    if (ids.length) await fbPatch(`${PRODUCTS_NODE}/${safeKey(productKey)}/loja_integrada`, { image_ids:ids, image_ids_at:nowIso() });
  } catch (error) { console.warn('[CanecaFácil] IDs de imagens antigas não recuperados:', error); }
  return ids;
}

async function enrichLiPayload(payload) {
  const productKey = text(payload.product_key || payload.model_id);
  if (!productKey) return payload;
  const product = await ensureCrops(productKey), crops = cropUrlsOf(product), ids = await ensureLiImageIds(productKey, product, payload);
  const images = [text(product.mockup_1), text(product.mockup_2), crops.left, crops.center, crops.right];
  if (!images.every(isHttpUrl)) throw new Error('Vitrine incompleta: precisam existir 2 mockups + esquerda + centro + direita.');
  const out = { ...payload, mockup_1:images[0], mockup_2:images[1], vitrine_recorte_esquerda:images[2], vitrine_recorte_centro:images[3], vitrine_recorte_direita:images[4], storefront_images_json:JSON.stringify(images), storefront_images_version:BUILD };
  for (let i=0;i<5;i+=1) out[`li_image_id_${i+1}`] = ids[i] || '';
  return out;
}

window.fetch = async function cfStorefrontCropsV2Fetch(input, init = {}) {
  if (typeof init?.body !== 'string' || !MAKE_WEBHOOK || String(input) !== MAKE_WEBHOOK) return innerFetch(input, init);
  let wrapper, payload;
  try { wrapper = JSON.parse(init.body); payload = wrapper && typeof wrapper.payload === 'string' ? JSON.parse(wrapper.payload) : null; }
  catch { return innerFetch(input, init); }
  if (!payload) return innerFetch(input, init);
  if (payload.action === 'finalize_mug_product' && payload.image_base64) {
    const response = await innerFetch(input, init);
    void persistFinalizationCrops(payload).catch(error => console.warn('[CanecaFácil] recortes pós-geração:', error));
    return response;
  }
  if (['loja_integrada_create_product','loja_integrada_update_product'].includes(payload.action)) {
    wrapper.payload = JSON.stringify(await enrichLiPayload(payload));
    return innerFetch(input, { ...init, body:JSON.stringify(wrapper) });
  }
  return innerFetch(input, init);
};

async function renderDrawerCrops() {
  const content = $('#drawerContent'), key = text(content?.dataset.productKey);
  if (!key || $('#cfStorefrontCropsPreview', content)) return;
  const product = await fbGet(`${PRODUCTS_NODE}/${safeKey(key)}`).catch(() => null);
  if (!product) return;
  const crops = cropUrlsOf(product), ready = cropSetReady(product), anchor = $('.drawer-actions', content);
  if (!anchor) return;
  const section = document.createElement('div');
  section.id = 'cfStorefrontCropsPreview'; section.className = 'form-section';
  section.innerHTML = `<h3>Vitrine CanecaFácil · 5 imagens</h3><div class="notice ${ready?'':'warn'}" style="margin-bottom:10px"><b>${ready?'Recortes prontos':'Faltam os 3 recortes'}</b><br>A horizontal inteira fica somente no Admin/Impressão. Na loja: 2 mockups + esquerda + centro + direita.</div>${ready?`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px"><img src="${crops.left}" style="width:100%;object-fit:contain"><img src="${crops.center}" style="width:100%;object-fit:contain"><img src="${crops.right}" style="width:100%;object-fit:contain"></div>`:'<button type="button" class="secondary" id="cfGenerateStorefrontCrops">Gerar somente os 3 recortes</button>'}`;
  anchor.insertAdjacentElement('beforebegin', section);
  $('#cfGenerateStorefrontCrops', section)?.addEventListener('click', async e => {
    const b=e.currentTarget; b.disabled=true; b.textContent='Gerando…';
    try { await ensureCrops(key, product); section.remove(); await renderDrawerCrops(); toast('3 recortes gerados e salvos.'); }
    catch(error){ toast(error?.message||error,true); b.disabled=false; b.textContent='Tentar novamente'; }
  });
}

window.addEventListener('admin-canecas:drawer', e => { if (e.detail?.kind === 'mug') setTimeout(() => renderDrawerCrops().catch(()=>{}),80); });
document.documentElement.dataset.cfStorefrontCrops = BUILD;
export { BUILD, generateCrops, ensureCrops, cropUrlsOf, cropSetReady };
