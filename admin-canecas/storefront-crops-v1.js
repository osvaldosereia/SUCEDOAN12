import { FIREBASE_BASE, text, norm, safeKey, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD = '20260830-admin-canecas-storefront-crops-v1';
const MAKE_WEBHOOK = window.__CANECAS_ADMIN_CONFIG__?.makeWebhook || window.__CANECAS_ADMIN_CONFIG__?.mugGeneratorWebhook || '';
const PRODUCTS_NODE = 'produtos';
const MASTER_WIDTH = 2400;
const MASTER_HEIGHT = 960;
const WEBP_QUALITY = 0.9;
const innerFetch = window.fetch.bind(window);

const $ = (selector, root = document) => root.querySelector(selector);
const isHttpUrl = value => /^https?:\/\//i.test(text(value));
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
  const response = await innerFetch(`${FIREBASE_BASE}/${path}.json?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json();
}

async function fbPatch(path, data) {
  const response = await innerFetch(`${FIREBASE_BASE}/${path}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`Firebase ${response.status}`);
  return response.json().catch(() => null);
}

function decodeB64Json(value) {
  try {
    if (!value) return null;
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  } catch { return null; }
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível carregar a arte horizontal para gerar os recortes da vitrine.'));
    image.src = source;
  });
}

function cropToDataUrl(image, sx, sy, sw, sh) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('O navegador não disponibilizou o canvas necessário para criar os recortes.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', WEBP_QUALITY);
}

async function generateCrops(source) {
  const image = await loadImage(source);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('A arte horizontal não possui dimensões válidas.');
  const half = width / 2;
  const square = Math.min(height, width);
  const centerX = Math.max(0, (width - square) / 2);
  return {
    left: cropToDataUrl(image, 0, 0, half, height),
    center: cropToDataUrl(image, centerX, 0, square, square),
    right: cropToDataUrl(image, half, 0, width - half, height),
    meta: {
      source_width: width,
      source_height: height,
      left_width: Math.round(half),
      left_height: height,
      center_width: Math.round(square),
      center_height: Math.round(square),
      center_x: Math.round(centerX),
      right_width: Math.round(width - half),
      right_height: height,
    },
  };
}

function artOf(product = {}) {
  return text(product.arte_horizontal || product.arte_personalizacao || product.arte_impressao?.url || product.arte_final_url);
}

function cropUrlsOf(product = {}) {
  return {
    left: text(product.vitrine_recorte_esquerda || product.vitrine_recortes?.esquerda),
    center: text(product.vitrine_recorte_centro || product.vitrine_recortes?.centro),
    right: text(product.vitrine_recorte_direita || product.vitrine_recortes?.direita),
  };
}

function cropSetReady(product = {}) {
  const crops = cropUrlsOf(product);
  const source = artOf(product);
  const sourceSaved = text(product.vitrine_recortes?.source_art || product.vitrine_recortes?.arte_origem);
  return Boolean(isHttpUrl(crops.left) && isHttpUrl(crops.center) && isHttpUrl(crops.right) && source && sourceSaved === source);
}

async function callMake(payload) {
  if (!MAKE_WEBHOOK) throw new Error('Webhook Make não configurado no Admin Canecas.');
  const response = await innerFetch(MAKE_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ payload: JSON.stringify(payload) }),
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { data = { raw }; }
  if (!response.ok || data.ok === false) throw new Error(data.error || data.error_message || `Make HTTP ${response.status}`);
  return data;
}

async function saveCrops(productKey, product, crops) {
  const result = await callMake({
    action: 'save_mug_storefront_crops',
    request_id: `CROP-${Date.now().toString(36).toUpperCase()}`,
    product_key: productKey,
    seo_slug: slug(product.nome || product.codigo || productKey),
    crop_left_base64: crops.left,
    crop_center_base64: crops.center,
    crop_right_base64: crops.right,
    source_art: artOf(product),
    source_width: crops.meta.source_width,
    source_height: crops.meta.source_height,
    firebase_url: FIREBASE_BASE,
    products_node: PRODUCTS_NODE,
    crop_version: BUILD,
  });
  const urls = {
    left: text(result.crop_left_url || result.left_url),
    center: text(result.crop_center_url || result.center_url),
    right: text(result.crop_right_url || result.right_url),
  };
  if (![urls.left, urls.center, urls.right].every(isHttpUrl)) throw new Error('O Make salvou os recortes, mas não devolveu as três URLs públicas.');
  return urls;
}

async function ensureCrops(productKey, product = null) {
  let current = product || await fbGet(`${PRODUCTS_NODE}/${safeKey(productKey)}`);
  if (!current) throw new Error('Caneca não encontrada no Firebase para preparar a vitrine.');
  if (cropSetReady(current)) return current;
  const source = artOf(current);
  if (!isHttpUrl(source) && !/^data:image\//i.test(source)) throw new Error('Esta caneca ainda não possui uma arte horizontal válida para gerar os recortes da vitrine.');
  toast('Preparando recortes da vitrine CanecaFácil…');
  const crops = await generateCrops(source);
  await saveCrops(productKey, current, crops);
  current = await fbGet(`${PRODUCTS_NODE}/${safeKey(productKey)}`);
  if (!cropSetReady(current || {})) throw new Error('Os recortes foram gerados, mas o Firebase não confirmou as três imagens da vitrine.');
  return current;
}

function patchFinalizePayload(payload) {
  return generateCrops(payload.image_base64).then(crops => {
    let template = {};
    try { template = JSON.parse(payload.firebase_template_json || '{}') || {}; } catch { template = {}; }
    template.vitrine_recorte_esquerda = '__MUG_CROP_LEFT__';
    template.vitrine_recorte_centro = '__MUG_CROP_CENTER__';
    template.vitrine_recorte_direita = '__MUG_CROP_RIGHT__';
    template.imagens_canecafacil = ['__MUG_MOCKUP_1__', '__MUG_MOCKUP_2__', '__MUG_CROP_LEFT__', '__MUG_CROP_CENTER__', '__MUG_CROP_RIGHT__'];
    template.vitrine_recortes = {
      versao: BUILD,
      source_art: '__MUG_ART__',
      esquerda: '__MUG_CROP_LEFT__',
      centro: '__MUG_CROP_CENTER__',
      direita: '__MUG_CROP_RIGHT__',
      source_width: crops.meta.source_width,
      source_height: crops.meta.source_height,
      left_width: crops.meta.left_width,
      left_height: crops.meta.left_height,
      center_width: crops.meta.center_width,
      center_height: crops.meta.center_height,
      center_x: crops.meta.center_x,
      right_width: crops.meta.right_width,
      right_height: crops.meta.right_height,
      atualizado_em: nowIso(),
    };
    return {
      ...payload,
      crop_left_base64: crops.left,
      crop_center_base64: crops.center,
      crop_right_base64: crops.right,
      crop_source_width: crops.meta.source_width,
      crop_source_height: crops.meta.source_height,
      crop_version: BUILD,
      firebase_template_json: JSON.stringify(template),
    };
  });
}

function imageIdsFrom(product = {}) {
  const raw = product.loja_integrada?.image_ids || product.loja_integrada?.imagens_ids || [];
  if (Array.isArray(raw)) return raw.map(value => text(value)).filter(Boolean).slice(0, 5);
  if (raw && typeof raw === 'object') return Object.keys(raw).sort().map(key => text(raw[key])).filter(Boolean).slice(0, 5);
  return [];
}

async function ensureLiImageIds(productKey, product, payload) {
  let ids = imageIdsFrom(product);
  if (payload.action !== 'loja_integrada_update_product' || ids.length >= 5) return ids;
  const productId = text(payload.loja_integrada_product_id || product.loja_integrada?.produto_id);
  if (!productId) return ids;
  try {
    const result = await callMake({ action: 'loja_integrada_get_product', request_id: `LI-IMG-${Date.now().toString(36).toUpperCase()}`, loja_integrada_product_id: productId });
    const remote = decodeB64Json(result.produto_b64) || result.produto || {};
    ids = (Array.isArray(remote.imagens) ? remote.imagens : []).map(item => text(item?.id)).filter(Boolean).slice(0, 5);
    if (ids.length) {
      await fbPatch(`${PRODUCTS_NODE}/${safeKey(productKey)}/loja_integrada`, { image_ids: ids, image_ids_at: nowIso() });
    }
  } catch (error) {
    console.warn('[Admin Canecas] não foi possível recuperar IDs antigos das imagens LI:', error);
  }
  return ids;
}

async function enrichLiPayload(payload) {
  const productKey = text(payload.product_key || payload.model_id);
  if (!productKey) return payload;
  const product = await ensureCrops(productKey);
  const crops = cropUrlsOf(product);
  const ids = await ensureLiImageIds(productKey, product, payload);
  const images = [text(product.mockup_1), text(product.mockup_2), crops.left, crops.center, crops.right];
  if (!images.every(isHttpUrl)) throw new Error('A vitrine CanecaFácil precisa das 5 imagens: 2 mockups + esquerda + centro + direita.');
  const out = {
    ...payload,
    mockup_1: images[0],
    mockup_2: images[1],
    vitrine_recorte_esquerda: images[2],
    vitrine_recorte_centro: images[3],
    vitrine_recorte_direita: images[4],
    storefront_images_json: JSON.stringify(images),
    storefront_images_version: BUILD,
  };
  for (let i = 0; i < 5; i += 1) out[`li_image_id_${i + 1}`] = ids[i] || '';
  return out;
}

window.fetch = async function cfStorefrontCropsFetch(input, init = {}) {
  if (typeof init?.body !== 'string' || !MAKE_WEBHOOK || String(input) !== MAKE_WEBHOOK) return innerFetch(input, init);
  let wrapper;
  try { wrapper = JSON.parse(init.body); } catch { return innerFetch(input, init); }
  if (!wrapper || typeof wrapper.payload !== 'string') return innerFetch(input, init);
  let payload;
  try { payload = JSON.parse(wrapper.payload); } catch { return innerFetch(input, init); }
  if (payload?.action === 'finalize_mug_product' && payload.image_base64) {
    payload = await patchFinalizePayload(payload);
  } else if (['loja_integrada_create_product', 'loja_integrada_update_product'].includes(payload?.action)) {
    payload = await enrichLiPayload(payload);
  }
  wrapper.payload = JSON.stringify(payload);
  return innerFetch(input, { ...init, body: JSON.stringify(wrapper) });
};

async function renderDrawerCrops() {
  const content = $('#drawerContent');
  const key = text(content?.dataset.productKey);
  if (!key || $('#cfStorefrontCropsPreview', content)) return;
  const product = await fbGet(`${PRODUCTS_NODE}/${safeKey(key)}`).catch(() => null);
  if (!product) return;
  const crops = cropUrlsOf(product);
  const ready = [crops.left, crops.center, crops.right].every(isHttpUrl);
  const anchor = $('.drawer-actions', content);
  if (!anchor) return;
  const section = document.createElement('div');
  section.id = 'cfStorefrontCropsPreview';
  section.className = 'form-section';
  section.innerHTML = `<h3>Vitrine CanecaFácil · recortes automáticos</h3><div class="notice ${ready ? '' : 'warn'}" style="margin-bottom:10px"><b>${ready ? '3 recortes prontos' : 'Recortes ainda não preparados'}</b><br>A arte horizontal inteira permanece somente no Admin/Impressão. Na loja entram 2 mockups + esquerda + centro + direita.</div>${ready ? `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px"><figure style="margin:0"><img src="${crops.left}" alt="Recorte esquerdo" style="width:100%;aspect-ratio:1.25/1;object-fit:contain;background:#f5f5f2;border-radius:8px"><figcaption style="font-size:11px">Esquerda</figcaption></figure><figure style="margin:0"><img src="${crops.center}" alt="Recorte central" style="width:100%;aspect-ratio:1/1;object-fit:contain;background:#f5f5f2;border-radius:8px"><figcaption style="font-size:11px">Centro</figcaption></figure><figure style="margin:0"><img src="${crops.right}" alt="Recorte direito" style="width:100%;aspect-ratio:1.25/1;object-fit:contain;background:#f5f5f2;border-radius:8px"><figcaption style="font-size:11px">Direita</figcaption></figure></div>` : `<button type="button" class="secondary" id="cfGenerateStorefrontCrops">Gerar recortes agora</button>`}`;
  anchor.insertAdjacentElement('beforebegin', section);
  $('#cfGenerateStorefrontCrops', section)?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Gerando…';
    try { await ensureCrops(key, product); section.remove(); await renderDrawerCrops(); toast('Recortes da vitrine gerados.'); }
    catch (error) { toast(error?.message || error, true); button.disabled = false; button.textContent = 'Gerar recortes agora'; }
  });
}

window.addEventListener('admin-canecas:drawer', event => {
  if (event.detail?.kind === 'mug') setTimeout(() => renderDrawerCrops().catch(() => {}), 80);
});

document.documentElement.dataset.cfStorefrontCrops = BUILD;
export { BUILD, generateCrops, ensureCrops, cropUrlsOf, cropSetReady };
