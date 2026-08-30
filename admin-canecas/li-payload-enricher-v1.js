import { FIREBASE_BASE, text, norm, nowIso } from '../shared/mug-commerce-v1.js?v=20260828-1';
import { getMug, patchMug } from './mug-store-v2.js?v=20260829-1';

const BUILD = '20260830-admin-canecas-li-payload-enricher-v1';
const MAKE_WEBHOOK = window.__CANECAS_ADMIN_CONFIG__?.makeWebhook || '';
const REFS_PATH = 'canecas/integracoes/loja_integrada/catalog_refs';
const STORE_BASE = 'https://canecafacil.com.br';
const PERSONALIZER_BASE = 'https://donaantonia.com.br/loja-integrada/personalizar/';
const BRAND_NAME = 'Caneca Fácil';
const CATEGORY_NAMES = Object.freeze({
  padronizadas: 'Canecas Padronizadas',
  personalizaveis: 'Canecas Personalizáveis',
  empresas: 'Canecas para Empresas',
});

const underlyingFetch = window.fetch.bind(window);
let refsCache = null;
let refsPromise = null;

function safeKey(value) { return text(value).replace(/[.#$\[\]/]/g, '_'); }
function slug(value) {
  return norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 130) || 'caneca';
}
function categoryType(product = {}) {
  return text(product.loja_integrada_categoria_tipo || product.loja_integrada?.categoria_tipo || product.canecafacil_categoria_tipo)
    || (product.loja_integrada_personalizavel === true || product.personalizavel === true ? 'personalizaveis' : 'padronizadas');
}
function categoryName(product = {}) { return CATEGORY_NAMES[categoryType(product)] || CATEGORY_NAMES.padronizadas; }
function artUrl(product = {}) {
  return text(product.arte_horizontal || product.arte_personalizacao || product.arte_impressao?.url || product.arte_final_url);
}
function decodeB64Json(value) {
  try {
    if (!value) return null;
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  } catch { return null; }
}
async function fetchJson(url, options = {}) {
  const response = await underlyingFetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
function refsFromCatalog(data = {}) {
  let brands = data.marcas;
  let categories = data.categorias;
  if (data.marcas_b64) brands = decodeB64Json(data.marcas_b64)?.objects || [];
  if (data.categorias_b64) categories = decodeB64Json(data.categorias_b64)?.objects || [];
  const marcas = {}, categorias = {};
  for (const item of Array.isArray(brands) ? brands : []) if (item?.nome && item?.resource_uri) marcas[item.nome] = item.resource_uri;
  for (const item of Array.isArray(categories) ? categories : []) if (item?.nome && item?.resource_uri) categorias[item.nome] = item.resource_uri;
  return { marcas, categorias, atualizado_em: nowIso() };
}
async function refreshRefs() {
  if (!MAKE_WEBHOOK) throw new Error('Webhook do Make não configurado.');
  const payload = { action: 'loja_integrada_catalog_refs', request_id: `LI-REF-${Date.now().toString(36).toUpperCase()}`, source: BUILD };
  const response = await underlyingFetch(MAKE_WEBHOOK, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ payload: JSON.stringify(payload) }),
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error('Make devolveu referências inválidas.'); }
  if (!response.ok || data.ok === false) throw new Error(data.error || `Make HTTP ${response.status}`);
  refsCache = refsFromCatalog(data);
  await underlyingFetch(`${FIREBASE_BASE}/${REFS_PATH}.json`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(refsCache),
  }).catch(() => null);
  return refsCache;
}
async function loadRefs(force = false) {
  if (!force && refsCache) return refsCache;
  if (!force && refsPromise) return refsPromise;
  refsPromise = (async () => {
    if (!force) {
      try {
        const data = await fetchJson(`${FIREBASE_BASE}/${REFS_PATH}.json?_=${Date.now()}`, { cache: 'no-store' });
        if (data?.marcas && data?.categorias) { refsCache = data; return data; }
      } catch {}
    }
    return refreshRefs();
  })();
  try { return await refsPromise; } finally { refsPromise = null; }
}
function findUri(bucket = {}, wanted = '') {
  const target = norm(wanted);
  for (const [name, uri] of Object.entries(bucket || {})) if (norm(name) === target) return text(uri);
  return '';
}
async function resolveRefs(product) {
  let refs = await loadRefs(false);
  let brandUri = findUri(refs.marcas, BRAND_NAME);
  let categoryUri = findUri(refs.categorias, categoryName(product));
  if (!brandUri || !categoryUri) {
    refs = await loadRefs(true);
    brandUri = findUri(refs.marcas, BRAND_NAME);
    categoryUri = findUri(refs.categorias, categoryName(product));
  }
  if (!brandUri) throw new Error(`A marca “${BRAND_NAME}” não foi localizada na Loja Integrada.`);
  if (!categoryUri) throw new Error(`A categoria “${categoryName(product)}” não foi localizada na Loja Integrada.`);
  return { brandUri, categoryUri };
}
function returnUrl(product = {}, body = {}) {
  const direct = text(product.loja_integrada?.url || product.loja_integrada_url);
  if (/^https:\/\/canecafacil\.com\.br\//i.test(direct)) return direct;
  const alias = text(body.apelido || product.loja_integrada_alias || product.loja_integrada?.alias) || slug(product.nome);
  return `${STORE_BASE}/${alias}`;
}
function canonicalDescription(html, product, body) {
  if (!(product.loja_integrada_personalizavel === true || product.canecafacil_personalizavel === true || product.personalizavel === true)) return html;
  const key = text(product.firebaseKey || product.__key || product.id);
  const href = `${PERSONALIZER_BASE}?model=${encodeURIComponent(key)}&return=${encodeURIComponent(returnUrl(product, body))}`;
  let out = text(html);
  if (/PERSONALIZAR ESTA CANECA/i.test(out)) {
    out = out.replace(/<a\s+(?:class="[^"]*"\s+)?href="[^"]+"/i, `<a class="cf-personalize-link" href="${href}"`);
    return out;
  }
  return `${out}\n<div class="cf-personalizer-box" style="margin:18px 0;padding:16px;border:1px solid #e8e8e3;border-radius:12px;text-align:center"><strong style="display:block;margin-bottom:8px">Personalize esta caneca</strong><a class="cf-personalize-link" href="${href}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:9px;font-weight:700">PERSONALIZAR ESTA CANECA</a></div>`;
}
async function enrichPayload(payload) {
  if (!['loja_integrada_create_product', 'loja_integrada_update_product'].includes(payload?.action)) return payload;
  const key = text(payload.product_key || payload.model_id);
  if (!key) return payload;
  const product = await getMug(key);
  if (!product) throw new Error('Caneca não encontrada no Firebase antes da sincronização.');
  const { brandUri, categoryUri } = await resolveRefs(product);
  let body = {};
  try { body = JSON.parse(payload.produto_json || '{}') || {}; } catch { throw new Error('produto_json inválido.'); }
  body.marca = brandUri;
  body.categorias = [categoryUri];
  body.descricao_completa = canonicalDescription(body.descricao_completa, product, body);
  const art = artUrl(product);
  const li = product.loja_integrada && typeof product.loja_integrada === 'object' ? product.loja_integrada : {};
  const type = categoryType(product);
  await patchMug(key, {
    loja_integrada_categoria_tipo: type,
    loja_integrada_categoria_nome: categoryName(product),
    loja_integrada_marca_uri: brandUri,
    loja_integrada_categoria_uri: categoryUri,
    loja_integrada: {
      ...li,
      marca_nome: BRAND_NAME,
      marca_uri: brandUri,
      categoria_tipo: type,
      categoria_nome: categoryName(product),
      categoria_uri: categoryUri,
      tipo_producao: 'revenda',
      origem_mercadoria: '0',
    },
    updated_at: nowIso(),
    last_update: Date.now(),
  });
  return {
    ...payload,
    produto_json: JSON.stringify(body),
    marca_nome: BRAND_NAME,
    marca_uri: brandUri,
    categoria_nome: categoryName(product),
    categoria_uri: categoryUri,
    tipo_producao: 'revenda',
    origem_mercadoria: '0',
    arte_horizontal: art,
    imagem_seo_slug: slug(product.nome),
    enviar_arte_horizontal: Boolean(art && text(li.synced_arte_horizontal) !== art),
    storefront_return_url: returnUrl(product, body),
    source_enricher: BUILD,
  };
}

window.fetch = async function cfLiPayloadEnricher(input, init = {}) {
  const target = String(input || '');
  if (!MAKE_WEBHOOK || !target.includes(MAKE_WEBHOOK) || typeof init?.body !== 'string') return underlyingFetch(input, init);
  try {
    const wrapper = JSON.parse(init.body);
    if (!wrapper || typeof wrapper.payload !== 'string') return underlyingFetch(input, init);
    const payload = JSON.parse(wrapper.payload);
    if (!['loja_integrada_create_product', 'loja_integrada_update_product'].includes(payload?.action)) return underlyingFetch(input, init);
    const enriched = await enrichPayload(payload);
    wrapper.payload = JSON.stringify(enriched);
    return underlyingFetch(input, { ...init, body: JSON.stringify(wrapper) });
  } catch (error) {
    console.error('[Admin Canecas] payload Loja Integrada bloqueado:', error);
    throw error;
  }
};

document.documentElement.dataset.cfLiPayloadEnricher = BUILD;
export { BUILD, enrichPayload, resolveRefs, categoryName, slug };
