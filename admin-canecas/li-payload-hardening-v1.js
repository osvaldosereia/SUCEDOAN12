import { FIREBASE_BASE, text, norm, safeKey, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';

const BUILD = '20260830-admin-canecas-li-payload-hardening-v1.1';
const MAKE_WEBHOOK = window.__CANECAS_ADMIN_CONFIG__?.makeWebhook || 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
const REF_PATH = 'canecas/integracoes/loja_integrada/catalog_refs';
const BRAND_NAME = 'Caneca Fácil';
const baseFetch = window.fetch.bind(window);
let refsCache = null;
let refsAt = 0;
let refreshPromise = null;

function decodeB64Json(value) {
  try {
    if (!value) return null;
    const bin = atob(value);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  } catch { return null; }
}
function slug(value) {
  return norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'caneca';
}
function byName(bucket, name) {
  if (!bucket || typeof bucket !== 'object') return '';
  if (text(bucket[name])) return text(bucket[name]);
  const target = norm(name);
  for (const [key, value] of Object.entries(bucket)) if (norm(key) === target) return text(value);
  return '';
}
async function firebaseGet(path) {
  const r = await baseFetch(`${FIREBASE_BASE}/${path}.json?_=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}
async function firebasePatch(path, patch) {
  const r = await baseFetch(`${FIREBASE_BASE}/${path}.json`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(patch)
  });
  if (!r.ok) throw new Error(`Firebase ${r.status} ao salvar referências da Loja Integrada.`);
  return r.json().catch(() => null);
}
async function loadRefs(force = false) {
  if (!force && refsCache && Date.now() - refsAt < 5 * 60 * 1000) return refsCache;
  refsCache = (await firebaseGet(REF_PATH)) || {};
  refsAt = Date.now();
  return refsCache;
}
async function refreshRefs() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const response = await baseFetch(MAKE_WEBHOOK, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ payload: JSON.stringify({ action: 'loja_integrada_catalog_refs', request_id: `LI-REF-${Date.now().toString(36).toUpperCase()}`, source: BUILD }) })
    });
    const raw = await response.text();
    let data = raw ? JSON.parse(raw) : {};
    if (!response.ok || data.ok === false) throw new Error(data.error || `Make HTTP ${response.status} ao consultar marca/categorias.`);
    const brandsRaw = decodeB64Json(data.marcas_b64);
    const catsRaw = decodeB64Json(data.categorias_b64);
    const brands = Array.isArray(data.marcas) ? data.marcas : (Array.isArray(brandsRaw?.objects) ? brandsRaw.objects : []);
    const cats = Array.isArray(data.categorias) ? data.categorias : (Array.isArray(catsRaw?.objects) ? catsRaw.objects : []);
    const marcas = {}, categorias = {};
    for (const item of brands) if (item?.nome && item?.resource_uri) marcas[item.nome] = item.resource_uri;
    for (const item of cats) if (item?.nome && item?.resource_uri) categorias[item.nome] = item.resource_uri;
    refsCache = { marcas, categorias, atualizado_em: nowIso() };
    refsAt = Date.now();
    await firebasePatch(REF_PATH, refsCache);
    return refsCache;
  })();
  try { return await refreshPromise; }
  finally { refreshPromise = null; }
}
async function requiredRefs(categoryName) {
  let refs = await loadRefs();
  let brandUri = byName(refs.marcas, BRAND_NAME);
  let categoryUri = byName(refs.categorias, categoryName);
  if (!brandUri || !categoryUri) {
    refs = await refreshRefs();
    brandUri = byName(refs.marcas, BRAND_NAME);
    categoryUri = byName(refs.categorias, categoryName);
  }
  if (!brandUri) throw new Error(`A marca "${BRAND_NAME}" não foi localizada na Loja Integrada. A publicação foi bloqueada para não cadastrar sem marca.`);
  if (!categoryUri) throw new Error(`A categoria "${categoryName}" não foi localizada na Loja Integrada. A publicação foi bloqueada para não cadastrar sem categoria.`);
  return { brandUri, categoryUri };
}
function artOf(product = {}) {
  return text(product.arte_horizontal || product.arte_personalizacao || product.arte_impressao?.url || product.arte_final_url);
}
function canonicalStoreUrl(product = {}, productBody = {}) {
  const stored = text(product?.loja_integrada?.url);
  if (stored) {
    try {
      const url = new URL(stored);
      return `https://canecafacil.com.br${url.pathname}${url.search}`;
    } catch {}
  }
  const alias = text(productBody.apelido || product.loja_integrada_alias || product?.loja_integrada?.alias);
  return alias ? `https://canecafacil.com.br/${alias}` : 'https://canecafacil.com.br/';
}
function fixPersonalizerDescription(html, payload, returnUrl) {
  let out = String(html || '');
  if (!payload.personalizavel) return out;
  out = out.replace(/<a\s+(?![^>]*class=)(href=["'][^"']*\/loja-integrada\/personalizar\/[^"']*["'])/i, '<a class="cf-personalize-link" $1');
  out = out.replace(/class=["']([^"']*)["']([^>]*href=["'][^"']*\/loja-integrada\/personalizar\/)/i, (m, classes, rest) => classes.includes('cf-personalize-link') ? m : `class="${classes} cf-personalize-link"${rest}`);
  out = out.replace(/href=["']([^"']*\/loja-integrada\/personalizar\/\?model=[^&"']+)(?:&amp;return=[^"']*|&return=[^"']*)?["']/i, (_, base) => `href="${base}&return=${encodeURIComponent(returnUrl)}"`);
  return out;
}
async function harden(payload) {
  if (!['loja_integrada_create_product', 'loja_integrada_update_product'].includes(payload?.action)) return payload;
  const categoryName = text(payload.categoria_nome);
  if (!categoryName) throw new Error('Categoria CanecaFácil ausente no payload. Escolha Padronizadas, Personalizáveis ou Empresas antes de sincronizar.');
  const { brandUri, categoryUri } = await requiredRefs(categoryName);
  let productBody = {};
  try { productBody = JSON.parse(payload.produto_json || '{}') || {}; }
  catch { throw new Error('produto_json inválido antes da sincronização com a Loja Integrada.'); }
  const product = payload.product_key ? ((await firebaseGet(`produtos/${safeKey(payload.product_key)}`)) || {}) : {};
  const returnUrl = canonicalStoreUrl(product, productBody);
  productBody.marca = brandUri;
  productBody.categorias = [categoryUri];
  productBody.descricao_completa = fixPersonalizerDescription(productBody.descricao_completa, payload, returnUrl);
  const art = artOf(product);
  const alreadySyncedArt = text(product?.loja_integrada?.synced_arte_horizontal || product?.loja_integrada?.synced_art_horizontal);
  const sendHorizontal = Boolean(art && art !== alreadySyncedArt);
  const seoBase = slug(product.nome || productBody.nome || payload.sku || payload.product_key);
  if (payload.product_key) {
    await firebasePatch(`produtos/${safeKey(payload.product_key)}/loja_integrada`, {
      marca_nome: BRAND_NAME,
      marca_uri: brandUri,
      categoria_nome: categoryName,
      categoria_uri: categoryUri,
      tipo_producao: 'revenda',
      origem_mercadoria: '0',
      preflight_at: nowIso(),
    });
    await firebasePatch(`produtos/${safeKey(payload.product_key)}`, {
      loja_integrada_marca_uri: brandUri,
      loja_integrada_categoria_uri: categoryUri,
      loja_integrada_categoria_nome: categoryName,
    });
  }
  return {
    ...payload,
    produto_json: JSON.stringify(productBody),
    marca_nome: BRAND_NAME,
    marca_uri: brandUri,
    categoria_nome: categoryName,
    categoria_uri: categoryUri,
    tipo_producao: 'revenda',
    origem_mercadoria: '0',
    produto_nacional: true,
    arte_horizontal: art,
    enviar_arte_horizontal: sendHorizontal,
    image_seo_base: seoBase,
    return_url: returnUrl,
    source_hardening: BUILD,
  };
}

window.fetch = async function cfLiPayloadHardening(input, init = {}) {
  if (typeof init?.body !== 'string' || !/hook\.eu1\.make\.com/i.test(String(input))) return baseFetch(input, init);
  let wrapper;
  try { wrapper = JSON.parse(init.body); }
  catch { return baseFetch(input, init); }
  if (!wrapper || typeof wrapper.payload !== 'string') return baseFetch(input, init);
  let payload;
  try { payload = JSON.parse(wrapper.payload); }
  catch { return baseFetch(input, init); }
  if (!['loja_integrada_create_product', 'loja_integrada_update_product'].includes(payload?.action)) return baseFetch(input, init);
  const hardened = await harden(payload);
  wrapper.payload = JSON.stringify(hardened);
  return baseFetch(input, { ...init, body: JSON.stringify(wrapper) });
};

document.documentElement.dataset.cfLiPayloadHardening = BUILD;
export { BUILD, harden, requiredRefs };
