import { CONFIG } from './config.js';
import {
  assetUrl, codeVariants, formatName, norm, parseMoney, readStorage,
  slug, words, writeStorage
} from './core.js';

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

function extractVolume(text) {
  const match = String(text ?? '').match(/(\d+[\.,]?\d*)\s?(kg|g|ml|l|lt|un|und|pct|cx)\b/i);
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

function productImages(raw, product) {
  const images = [];
  const push = value => {
    const path = String(value ?? '').trim();
    if (!path || /site\/tmp\/ia-referencias\//i.test(path)) return;
    const url = assetUrl(path);
    if (url && !images.includes(url)) images.push(url);
  };
  push(raw.url_imagem);
  push(raw.imagem_url || raw.urlImagem);
  push(raw.imagem || raw.image || raw.img || raw.foto || raw.foto_url);
  if (Array.isArray(raw.imagens)) raw.imagens.forEach(push);
  if (Array.isArray(raw.images)) raw.images.forEach(push);
  if (!images.length && raw.imagem_path) push(raw.imagem_path);
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
    slug: slug(name),
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
    .filter(product => String(product.situacao).toUpperCase() !== 'I')
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
    nome: String(item.nome || 'Cesta básica'),
    descricao: String(item.descricao || item.description || 'Kit de produtos selecionados.'),
    imagem: assetUrl(item.imagem || item.img || item.url_imagem || 'img/logoantonia5.png'),
    preco: parseMoney(item.preco || item.price || 0),
    precoOriginal: parseMoney(item.precoOriginal || item.preco_original || 0),
    produtos: item.produtos || [],
    validade: item.validade || ''
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

function looksLikeBanner(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && (value.id || value.banner_id || value.imagem || value.image || value.img || value.arquivo || value.titulo || value.title || value.link);
}

function normalizeBannerLink(raw) {
  const source = raw?.link ?? raw?.destino ?? raw?.href ?? raw?.link_url ?? raw?.url_destino ?? '';
  if (source && typeof source === 'object') {
    const type = norm(source.tipo || source.type || 'rota');
    const value = String(source.valor || source.value || source.href || source.url || '').trim();
    if (!value) return '';
    if (type === 'produto') return `#/produto/${encodeURIComponent(value)}`;
    return value;
  }
  const value = String(source || '').trim();
  if (value) return value;
  const product = raw?.produto_codigo || raw?.produto_id || raw?.firebaseKey || raw?.produto?.codigo || raw?.produto?.firebaseKey || '';
  return product ? `#/produto/${encodeURIComponent(String(product))}` : '';
}

export function normalizeBanners(data) {
  const source = data && typeof data === 'object' ? data : {};
  const candidates = [source.banners, source.items, source.lista, source.ativos, source.data?.banners, source.catalogo?.banners];
  let selected = candidates.find(item => Array.isArray(item) || (item && typeof item === 'object' && Object.values(item).some(looksLikeBanner)));
  if (!selected && Array.isArray(data)) selected = data;
  if (!selected) selected = source;
  const entries = Array.isArray(selected) ? selected.map((raw, index) => [String(index), raw]) : Object.entries(selected || {}).filter(([, raw]) => looksLikeBanner(raw));
  const seen = new Set();
  return entries.map(([key, raw], index) => {
    const image = raw.imagem || raw.imagem_url || raw.image || raw.img || raw.arquivo || raw.arquivo_imagem || raw.mobile || raw.desktop || raw.arquivos?.principal || raw.imagens?.principal;
    const exhibition = raw.exibicao && typeof raw.exibicao === 'object' ? raw.exibicao : {};
    const period = raw.periodo && typeof raw.periodo === 'object' ? raw.periodo : {};
    const id = String(raw.id || raw.banner_id || raw.slug || key || `banner-${index + 1}`);
    return {
      id,
      active: raw.ativo !== false && raw.active !== false && norm(raw.status) !== 'inativo',
      position: String(exhibition.local || raw.posicao || raw.position || raw.local || raw.slot || 'home.hero').trim(),
      target: String(exhibition.alvo || raw.alvo || raw.target || '').trim(),
      order: Number(exhibition.ordem ?? raw.ordem ?? raw.order ?? index + 1),
      image: assetUrl(image),
      title: String(raw.titulo || raw.title || raw.nome || ''),
      alt: String(raw.alt || raw.titulo || raw.title || raw.nome || 'Destaque Dona Antônia'),
      link: normalizeBannerLink(raw),
      start: period.inicio || raw.inicio || raw.data_inicio || null,
      end: period.fim || raw.fim || raw.data_fim || raw.validade_oferta || null,
      raw
    };
  }).filter(banner => banner.id && banner.image && !seen.has(banner.id) && seen.add(banner.id))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id, 'pt-BR'));
}

async function latestCatalogVersion() {
  try {
    const data = await fetchJson(`${CONFIG.ENDPOINTS.CATALOG_VERSION}?t=${Date.now()}`, { timeoutMs: 3000, cache: 'no-store' });
    return String(data?.version || data?.catalogVersion || data?.build || data?.updatedAt || CONFIG.APP_VERSION);
  } catch {
    return CONFIG.APP_VERSION;
  }
}

async function loadResource({ endpoint, storageName, normalize, version, timeoutMs = CONFIG.REQUEST_TIMEOUT_MS, optional = false }) {
  const cached = readStorage(storageName, null);
  let cachedValue = null;
  if (cached?.data) {
    try { cachedValue = normalize(cached.data); } catch {}
  }
  const resolvedVersion = version || await latestCatalogVersion();
  try {
    const separator = endpoint.includes('?') ? '&' : '?';
    const data = await fetchJson(`${endpoint}${separator}v=${encodeURIComponent(resolvedVersion)}`, { timeoutMs });
    writeStorage(storageName, { savedAt: Date.now(), version: resolvedVersion, data });
    return { data: normalize(data), version: resolvedVersion, source: 'network', changed: cached?.version !== resolvedVersion };
  } catch (error) {
    if (cachedValue) return { data: cachedValue, version: cached?.version || resolvedVersion, source: 'cache', changed: false, error };
    if (optional) return { data: [], version: resolvedVersion, source: 'empty', changed: false, error };
    throw error;
  }
}

export async function loadCatalog() {
  const version = await latestCatalogVersion();
  const productsPromise = loadResource({ endpoint: CONFIG.ENDPOINTS.PRODUCTS, storageName: CONFIG.STORAGE.PRODUCTS, normalize: normalizeProducts, version, timeoutMs: 9000 });
  const auxiliary = await Promise.all([
    loadResource({ endpoint: CONFIG.ENDPOINTS.BASKETS, storageName: CONFIG.STORAGE.BASKETS, normalize: normalizeBaskets, version, optional: true }),
    loadResource({ endpoint: CONFIG.ENDPOINTS.KITS, storageName: CONFIG.STORAGE.KITS, normalize: normalizeKits, version, optional: true }),
    loadResource({ endpoint: CONFIG.ENDPOINTS.COUPONS, storageName: CONFIG.STORAGE.COUPONS, normalize: normalizeCoupons, version, optional: true, timeoutMs: 5000 }),
    loadResource({ endpoint: CONFIG.ENDPOINTS.BANNERS, storageName: CONFIG.STORAGE.BANNERS, normalize: normalizeBanners, version, optional: true, timeoutMs: 5000 })
  ]);
  const productsResult = await productsPromise;
  const indexes = indexProducts(productsResult.data);
  return {
    products: productsResult.data,
    ...indexes,
    baskets: auxiliary[0].data,
    kits: auxiliary[1].data,
    coupons: auxiliary[2].data,
    banners: auxiliary[3].data,
    catalogVersion: productsResult.version,
    catalogSource: productsResult.source,
    catalogLoadedAt: Date.now()
  };
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
    const text = product.searchTokens?.text || '';
    const exactCode = [product.id, product.codigo, product.gtin, product.ean].some(value => norm(value) === normalized);
    const prefixCode = product.searchTokens?.code?.includes(normalized);
    const allWords = queryWords.every(word => text.includes(word));
    const nameStarts = norm(product.name).startsWith(normalized);
    const score = exactCode ? 1000 : nameStarts ? 500 : prefixCode ? 300 : allWords ? 100 : 0;
    return { product, score };
  }).filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name, 'pt-BR'))
    .map(item => item.product);
}
