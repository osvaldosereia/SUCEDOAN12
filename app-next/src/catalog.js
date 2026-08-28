import { CONFIG } from './config.js?v=20260727-7';
import {
  assetUrl, codeVariants, formatName, norm, parseMoney, readStorage,
  slug, words, writeStorage
} from './core.js?v=20260727-7';

const REFRESH_EVENT = 'da:catalog-refreshed';
let backgroundRefreshPromise = null;

export async function fetchJson(url, { timeoutMs = CONFIG.REQUEST_TIMEOUT_MS, cache = 'default' } = {}) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(url, {
      cache,
      headers: { Accept: 'application/json' },
      signal: controller?.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
    return await response.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function extractVolume(textValue) {
  const match = String(textValue ?? '').match(/(\d+[\.,]?\d*)\s?(kg|g|ml|l|lt|un|und|pct|cx)\b/i);
  return match ? match[0].replace(',', '.') : '';
}

function productExpiry(raw) {
  const candidates = [
    raw.validade, raw.vencimento, raw.data_validade, raw.validade_produto,
    raw.dataValidade, raw.expiry, raw.expiry_date, raw.expiration_date
  ];
  [raw.lotes, raw.lotes_estoque, raw.estoque_lotes, raw.batches].forEach(collection => {
    if (Array.isArray(collection)) {
      collection.forEach(lot => candidates.push(lot?.validade, lot?.vencimento, lot?.data_validade, lot?.expiry_date));
    } else if (collection && typeof collection === 'object') {
      Object.values(collection).forEach(lot => candidates.push(lot?.validade, lot?.vencimento, lot?.data_validade, lot?.expiry_date));
    }
  });
  return candidates.find(value => String(value ?? '').trim()) || '';
}

function truthy(value) {
  return value === true || value === 1 || ['1', 'true', 'sim', 'yes'].includes(String(value ?? '').trim().toLowerCase());
}

function isPublicMugModel(raw = {}) {
  const category = String(raw.categoria || raw.category || '').toLowerCase();
  return truthy(raw.modelo_publico) && (truthy(raw.modelo_caneca) || truthy(raw.produto_sob_encomenda) || category.includes('caneca'));
}

function mediaUrl(value) {
  const path = String(value ?? '').trim();
  if (!path || /^data:/i.test(path) || /site\/tmp\/ia-referencias\//i.test(path)) return '';
  return assetUrl(path) || '';
}

function mugMedia(raw = {}) {
  const print = raw.arte_impressao;
  return {
    thumbnail: mediaUrl(raw.thumbnail || raw.thumb || raw.miniatura || raw.mug_thumbnail),
    previewLeft: mediaUrl(raw.preview_esquerda || raw.preview_left || raw.mug_preview_left),
    previewRight: mediaUrl(raw.preview_direita || raw.preview_right || raw.mug_preview_right),
    art: mediaUrl(raw.arte_horizontal || raw.arte_personalizacao || (print && typeof print === 'object' ? print.url : print) || raw.art_url || raw.arte_url),
    model3d: mediaUrl(raw.modelo_3d_url || raw.model_3d_url || raw.glb_url),
    renderVersion: String(raw.render_3d_version || raw.render_version || '').trim(),
    renderStatus: String(raw.render_status || '').trim()
  };
}

function productImages(raw, product) {
  const images = [];
  const push = value => {
    const url = mediaUrl(value);
    if (url && !images.includes(url)) images.push(url);
  };
  const mug = isPublicMugModel(raw) || truthy(raw.modelo_caneca) || String(raw.categoria || '').toLowerCase().includes('caneca');
  const media = mugMedia(raw);
  if (mug) {
    push(media.thumbnail);
    push(media.previewLeft);
    push(media.previewRight);
  }
  push(raw.url_imagem);
  push(raw.imagem_url || raw.urlImagem);
  push(raw.imagem || raw.image || raw.img || raw.foto || raw.foto_url);
  if (!mug) {
    push(raw.mockup_1);
    push(raw.mockup_2);
    push(raw.mockup_3);
  }
  if (Array.isArray(raw.imagens)) raw.imagens.forEach(push);
  if (Array.isArray(raw.imagens_site)) raw.imagens_site.forEach(push);
  if (Array.isArray(raw.images)) raw.images.forEach(push);
  if (Array.isArray(raw.midias_admin)) raw.midias_admin.forEach(push);
  if (!images.length && raw.imagem_path) push(raw.imagem_path);
  if (!images.length && mug) push(media.art);
  const code = String(product.codigo || product.id || '').trim();
  if (!images.length && code) {
    push(`img/produtos_2/${encodeURIComponent(code)}.webp`);
    push(`img/produtos/${encodeURIComponent(code)}.webp`);
  }
  if (!images.length) push('img/logoantonia5.png');
  return images;
}

export function buildSearchTokens(product) {
  const core = [
    product.name, product.marca, product.embalagem, product.categoria,
    product.subcategoria, product.subsubcategoria, product.codigo,
    product.gtin, product.ean
  ].join(' ');
  return {
    text: norm(core),
    tokens: words(core),
    code: norm([product.codigo, product.gtin, product.ean].join(' '))
  };
}

export function normalizeProduct(raw = {}, key = '', index = 0) {
  const name = formatName(raw.nome || raw.name || raw.descricao || 'Produto');
  const firebaseKey = String(raw.firebaseKey || raw.id || key || raw.codigo || index || slug(name)).trim();
  const oldPrice = parseMoney(raw.preco || raw.price || raw.valor || 0);
  const product = {
    id: firebaseKey,
    firebaseKey,
    codigo: String(raw.codigo || raw.sku || firebaseKey),
    name,
    slug: String(raw.slug || slug(name)),
    price: oldPrice,
    oldPrice,
    stock: Math.max(0, parseInt(raw.estoque, 10) || 0),
    situacao: String(raw.situacao || '').trim(),
    categoria: String(raw.categoria || raw.category || 'Outros').trim() || 'Outros',
    subcategoria: String(raw.subcategoria || '').trim(),
    subsubcategoria: String(raw.subsubcategoria || '').trim(),
    marca: String(raw.marca || '').trim(),
    embalagem: String(raw.embalagem || extractVolume(raw.nome || name)).trim(),
    descricao: String(raw.descricao || raw.descricao_curta || raw.description || '').trim(),
    gtin: String(raw.gtin || raw.ean || '').trim(),
    ean: String(raw.ean || raw.gtin || '').trim(),
    gondola: String(raw.gondola || raw['gôndola'] || '').trim(),
    prateleira: String(raw.prateleira || '').trim(),
    localizacao: String(raw.localizacao || '').trim(),
    preco_oferta: parseMoney(raw.preco_oferta || raw.precoOferta || 0),
    validade_oferta: raw.validade_oferta || raw.validadeOferta || '',
    validade: productExpiry(raw),
    raw
  };
  product.mugMedia = mugMedia(raw);
  product.images = productImages(raw, product);
  product.img = product.images[0];
  product.url_imagem = product.img;
  product.searchTokens = buildSearchTokens(product);
  return product;
}

export function normalizeProducts(raw) {
  const entries = Array.isArray(raw)
    ? raw.map((value, index) => [String(index), value]).filter(([, value]) => value)
    : Object.entries(raw || {});
  return entries
    .map(([key, value], index) => normalizeProduct(value || {}, key, index))
    .filter(product => String(product.situacao).toUpperCase() !== 'I' || isPublicMugModel(product.raw))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function indexProducts(products) {
  const productMap = new Map();
  const productExactMap = new Map();
  const productCodeMap = new Map();
  products.forEach(product => {
    productMap.set(String(product.id), product);
    [product.id, product.firebaseKey, product.codigo, product.gtin, product.ean].forEach(value => {
      const exact = String(value ?? '').trim().toLowerCase();
      if (exact && !productExactMap.has(exact)) productExactMap.set(exact, product);
      codeVariants(value).forEach(variant => {
        if (variant && !productCodeMap.has(variant)) productCodeMap.set(variant, product);
      });
    });
  });
  return { productMap, productExactMap, productCodeMap };
}

export function normalizeBaskets(data) {
  const list = Array.isArray(data) ? data : Object.values(data || {});
  return list.filter(item => item && item.id && item.nome && Array.isArray(item.produtos)).map(item => ({
    id: String(item.id),
    codigo: String(item.codigo || item.id),
    nome: String(item.nome || 'Cesta básica'),
    descricao: String(item.descricao || item.description || 'Cesta básica com produtos selecionados.'),
    imagem: assetUrl(item.imagem || item.img || item.url_imagem || 'img/logoantonia5.png'),
    preco: parseMoney(item.preco || item.price || 0),
    precoOriginal: parseMoney(item.precoOriginal || item.preco_original || 0),
    produtos: item.produtos || [],
    validade: item.validade || '',
    limiteIlimitado: item.limite_ilimitado !== false && item.limiteIlimitado !== false,
    limiteCestas: Math.max(0, Math.floor(parseMoney(item.limite_cestas || item.limiteCestas || 0))),
    estoqueDisponivel: Math.max(0, Math.floor(parseMoney(item.estoque_disponivel || item.estoqueDisponivel || 0))),
    ativo: item.ativo !== false
  }));
}

export function normalizeKits(data) {
  const list = Array.isArray(data) ? data : Object.values(data || {});
  return list.filter(item => item && (item.id || item.codigo) && item.nome && Array.isArray(item.produtos)).map(item => ({
    id: String(item.id || item.codigo),
    codigo: String(item.codigo || item.id || ''),
    nome: String(item.nome || 'Kit promocional'),
    descricao: String(item.descricao || item.description || item.descricao_oferta || item.detalhes || 'Kit promocional por tempo limitado.'),
    imagem: assetUrl(item.imagem || item.img || item.url_imagem || 'img/logoantonia5.png'),
    preco: parseMoney(item.preco || item.preco_novo || item.price || item.preco_promocional || 0),
    precoOriginal: parseMoney(item.precoOriginal || item.preco_original || item.preco_anterior || item.soma_avulsa || item.valor_original || 0),
    produtos: item.produtos || [],
    limiteKits: Math.max(0, Math.floor(parseMoney(item.limite_kits || item.limiteKits || 0))),
    estoqueDisponivel: Math.max(0, Math.floor(parseMoney(item.estoque_disponivel || item.estoqueDisponivel || 0))),
    descontoPercentual: parseMoney(item.desconto_percentual || item.descontoPercentual || 0),
    dataInicio: String(item.data_inicio || item.dataInicio || ''),
    dataFim: String(item.data_fim || item.dataFim || ''),
    ativo: item.ativo !== false
  }));
}

export function normalizeCoupons(data) {
  return (Array.isArray(data) ? data : Object.values(data || {}))
    .filter(coupon => coupon && coupon.codigo)
    .sort((a, b) => Number(a.posicao || 99) - Number(b.posicao || 99));
}

function cachedResource(storageName, normalize, optional = false) {
  const cached = readStorage(storageName, null);
  if (!cached?.data) return optional ? { data: [], version: '', source: 'empty' } : null;
  try {
    return {
      data: normalize(cached.data),
      version: String(cached.version || ''),
      source: 'cache'
    };
  } catch {
    return optional ? { data: [], version: '', source: 'empty' } : null;
  }
}

async function latestCatalogVersion() {
  try {
    const data = await fetchJson(`${CONFIG.ENDPOINTS.CATALOG_VERSION}?t=${Date.now()}`, {
      timeoutMs: 3000,
      cache: 'no-store'
    });
    return String(data?.version || data?.catalogVersion || data?.build || CONFIG.APP_VERSION);
  } catch {
    return CONFIG.APP_VERSION;
  }
}

async function networkResource({ endpoint, storageName, normalize, version, timeoutMs = CONFIG.REQUEST_TIMEOUT_MS, optional = false }) {
  try {
    const separator = endpoint.includes('?') ? '&' : '?';
    const data = await fetchJson(`${endpoint}${separator}v=${encodeURIComponent(version)}`, { timeoutMs });
    writeStorage(storageName, { savedAt: Date.now(), version, data });
    return { data: normalize(data), version, source: 'network' };
  } catch (error) {
    const cached = cachedResource(storageName, normalize, optional);
    if (cached) return { ...cached, error };
    if (optional) return { data: [], version, source: 'empty', error };
    throw error;
  }
}

function assembleCatalog(productsResult, basketsResult, kitsResult, couponsResult) {
  const indexes = indexProducts(productsResult.data);
  return {
    products: productsResult.data,
    ...indexes,
    baskets: basketsResult.data,
    kits: kitsResult.data,
    coupons: couponsResult.data,
    catalogVersion: productsResult.version,
    catalogSource: productsResult.source,
    catalogLoadedAt: Date.now()
  };
}

function cachedCatalog() {
  const products = cachedResource(CONFIG.STORAGE.PRODUCTS, normalizeProducts);
  if (!products?.data?.length) return null;
  return assembleCatalog(
    products,
    cachedResource(CONFIG.STORAGE.BASKETS, normalizeBaskets, true),
    cachedResource(CONFIG.STORAGE.KITS, normalizeKits, true),
    cachedResource(CONFIG.STORAGE.COUPONS, normalizeCoupons, true)
  );
}

async function fetchCatalogFromNetwork() {
  const version = await latestCatalogVersion();
  const [products, baskets, kits, coupons] = await Promise.all([
    networkResource({
      endpoint: CONFIG.ENDPOINTS.PRODUCTS,
      storageName: CONFIG.STORAGE.PRODUCTS,
      normalize: normalizeProducts,
      version,
      timeoutMs: 9000
    }),
    networkResource({
      endpoint: CONFIG.ENDPOINTS.BASKETS,
      storageName: CONFIG.STORAGE.BASKETS,
      normalize: normalizeBaskets,
      version,
      optional: true
    }),
    networkResource({
      endpoint: CONFIG.ENDPOINTS.KITS,
      storageName: CONFIG.STORAGE.KITS,
      normalize: normalizeKits,
      version,
      optional: true
    }),
    networkResource({
      endpoint: CONFIG.ENDPOINTS.COUPONS,
      storageName: CONFIG.STORAGE.COUPONS,
      normalize: normalizeCoupons,
      version,
      optional: true,
      timeoutMs: 5000
    })
  ]);
  return assembleCatalog(products, baskets, kits, coupons);
}

function refreshInBackground(currentVersion = '') {
  if (backgroundRefreshPromise) return backgroundRefreshPromise;
  backgroundRefreshPromise = fetchCatalogFromNetwork()
    .then(catalog => {
      if (typeof window !== 'undefined' && String(catalog.catalogVersion) !== String(currentVersion)) {
        window.dispatchEvent(new CustomEvent(REFRESH_EVENT, { detail: catalog }));
      }
      return catalog;
    })
    .catch(error => {
      console.warn('Atualização do catálogo em segundo plano falhou:', error);
      return null;
    })
    .finally(() => { backgroundRefreshPromise = null; });
  return backgroundRefreshPromise;
}

export async function loadCatalog() {
  const cached = cachedCatalog();
  if (cached) {
    refreshInBackground(cached.catalogVersion);
    return cached;
  }
  return fetchCatalogFromNetwork();
}

export function findProductByReference(state, reference) {
  const raw = String(reference ?? '').trim();
  if (!raw) return null;
  const exact = raw.toLowerCase();
  if (state.productMap?.has(raw)) return state.productMap.get(raw);
  if (state.productExactMap?.has(exact)) return state.productExactMap.get(exact);
  for (const variant of codeVariants(raw)) {
    if (state.productCodeMap?.has(variant)) return state.productCodeMap.get(variant);
  }
  const normalized = norm(raw);
  return state.products.find(product => product.slug === normalized || product.slug === slug(raw) || norm(product.name) === normalized) || null;
}

export function searchProducts(products, query, isAvailable = () => true) {
  const normalized = norm(query);
  if (!normalized) return [];
  const queryWords = words(normalized);
  return products.filter(isAvailable).map(product => {
    const productText = product.searchTokens?.text || '';
    const exactCode = [product.id, product.codigo, product.gtin, product.ean].some(value => norm(value) === normalized);
    const prefixCode = product.searchTokens?.code?.includes(normalized);
    const allWords = queryWords.every(word => productText.includes(word));
    const nameStarts = norm(product.name).startsWith(normalized);
    const score = exactCode ? 1000 : nameStarts ? 500 : prefixCode ? 300 : allWords ? 100 : 0;
    return { product, score };
  }).filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name, 'pt-BR'))
    .map(item => item.product);
}
