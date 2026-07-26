import { CONFIG } from './config.js';
import { loadCatalog } from './catalog.js';

const SEO_VERSION = '2026-07-26-combos-v1';
let catalogPromise;
let scheduled = false;

function catalog() {
  if (window.__DA_CATALOG_STATE__?.isReady) return Promise.resolve(window.__DA_CATALOG_STATE__);
  if (!catalogPromise) catalogPromise = loadCatalog();
  return catalogPromise;
}

function clean(value) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function absoluteUrl(value) {
  try { return new URL(String(value || ''), location.href).href; } catch { return `${CONFIG.SITE_BASE_URL}/img/logoantonia5.png`; }
}

function setMeta(selector, attributes, content) {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement('meta');
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    document.head.appendChild(node);
  }
  node.setAttribute('content', content);
}

function setCanonical(url) {
  let node = document.head.querySelector('link[rel="canonical"]');
  if (!node) {
    node = document.createElement('link');
    node.rel = 'canonical';
    document.head.appendChild(node);
  }
  node.href = url;
}

function setJsonLd(value) {
  let node = document.getElementById('combo-product-jsonld');
  if (!value) {
    node?.remove();
    return;
  }
  if (!node) {
    node = document.createElement('script');
    node.id = 'combo-product-jsonld';
    node.type = 'application/ld+json';
    document.head.appendChild(node);
  }
  node.textContent = JSON.stringify(value);
}

function routeTarget() {
  const params = new URLSearchParams(location.search);
  const hash = String(location.hash || '').replace(/^#\/?/, '').split('?')[0];
  const parts = hash.split('/').filter(Boolean).map(decodeURIComponent);
  if (params.get('cesta')) return { type: 'basket', id: params.get('cesta') };
  if (params.get('kit')) return { type: 'kit', id: params.get('kit') };
  if (parts[0] === 'cesta' && parts[1]) return { type: 'basket', id: parts[1] };
  if (parts[0] === 'kit' && parts[1]) return { type: 'kit', id: parts[1] };
  const section = params.get('secao') || parts[0] || '';
  return { type: 'section', id: section };
}

function homeMeta(section = '') {
  const isKits = section === 'kits';
  const isBaskets = section === 'cestas';
  const title = isKits
    ? 'Kits Promocionais em Cuiabá e Várzea Grande | Dona Antônia'
    : isBaskets
      ? 'Cestas Básicas em Cuiabá e Várzea Grande | Dona Antônia'
      : 'Cestas Básicas e Kits em Cuiabá e Várzea Grande | Dona Antônia';
  const description = isKits
    ? 'Kits promocionais com produtos selecionados, preço especial e entrega em Cuiabá e Várzea Grande.'
    : isBaskets
      ? 'Cestas básicas econômicas e completas com entrega em Cuiabá e Várzea Grande. Confira os produtos e escolha sua cesta.'
      : 'Cestas básicas e kits promocionais com entrega em Cuiabá e Várzea Grande. Escolha uma opção pronta e confira todos os produtos.';
  const canonical = isKits || isBaskets
    ? `${CONFIG.SITE_BASE_URL}/?secao=${isKits ? 'kits' : 'cestas'}`
    : `${CONFIG.SITE_BASE_URL}/`;
  document.title = title;
  setCanonical(canonical);
  setMeta('meta[name="description"]', { name: 'description' }, description);
  setMeta('meta[property="og:type"]', { property: 'og:type' }, 'website');
  setMeta('meta[property="og:title"]', { property: 'og:title' }, title);
  setMeta('meta[property="og:description"]', { property: 'og:description' }, description);
  setMeta('meta[property="og:url"]', { property: 'og:url' }, canonical);
  setMeta('meta[property="og:image"]', { property: 'og:image' }, `${CONFIG.SITE_BASE_URL}/img/logoantonia5.png`);
  setJsonLd(null);
}

function comboMeta(bundle, type) {
  const kind = type === 'kit' ? 'Kit Promocional' : 'Cesta Básica';
  const name = clean(bundle.nome || kind);
  const title = `${/\b(cesta|kit)\b/i.test(name) ? name : `${kind} ${name}`} | Dona Antônia`;
  const description = clean(bundle.descricao || bundle.description || `${kind} com produtos selecionados e entrega em Cuiabá e Várzea Grande.`).slice(0, 300);
  const reference = String(bundle.id || bundle.codigo || '').trim();
  const canonical = `${CONFIG.SITE_BASE_URL}/?${type === 'kit' ? 'kit' : 'cesta'}=${encodeURIComponent(reference)}`;
  const image = absoluteUrl(bundle.imagem || bundle.img || bundle.url_imagem || '../img/logoantonia5.png');
  const price = Number(bundle.preco || bundle.preco_novo || 0);
  const stock = type === 'kit' ? Number(bundle.estoqueDisponivel || bundle.estoque_disponivel || bundle.limiteKits || bundle.limite_kits || 0) : 1;
  const available = type === 'basket' || (bundle.ativo !== false && stock > 0);

  document.title = title;
  setCanonical(canonical);
  setMeta('meta[name="description"]', { name: 'description' }, description);
  setMeta('meta[property="og:type"]', { property: 'og:type' }, 'product');
  setMeta('meta[property="og:title"]', { property: 'og:title' }, title);
  setMeta('meta[property="og:description"]', { property: 'og:description' }, description);
  setMeta('meta[property="og:url"]', { property: 'og:url' }, canonical);
  setMeta('meta[property="og:image"]', { property: 'og:image' }, image);
  if (price > 0) {
    setMeta('meta[property="product:price:amount"]', { property: 'product:price:amount' }, price.toFixed(2));
    setMeta('meta[property="product:price:currency"]', { property: 'product:price:currency' }, 'BRL');
  }

  setJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    image: [image],
    sku: String(bundle.codigo || bundle.id || reference),
    category: type === 'kit' ? 'Kits promocionais' : 'Cestas básicas',
    brand: { '@type': 'Brand', name: 'Dona Antônia' },
    offers: {
      '@type': 'Offer',
      url: canonical,
      priceCurrency: 'BRL',
      price: price.toFixed(2),
      availability: available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'Super Cestas Básicas Dona Antônia' },
    },
  });
}

async function applyComboSeo() {
  const target = routeTarget();
  if (target.type === 'section') {
    homeMeta(target.id);
    document.documentElement.dataset.comboSeo = SEO_VERSION;
    return;
  }
  try {
    const data = await catalog();
    const list = target.type === 'kit' ? data.kits : data.baskets;
    const bundle = (list || []).find(item => String(item.id) === String(target.id) || String(item.codigo || '') === String(target.id));
    if (bundle) comboMeta(bundle, target.type);
    else homeMeta(target.type === 'kit' ? 'kits' : 'cestas');
  } catch (error) {
    console.warn('Não foi possível atualizar os metadados de cestas e kits:', error);
  }
  document.documentElement.dataset.comboSeo = SEO_VERSION;
}

function scheduleComboSeo() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    applyComboSeo();
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', scheduleComboSeo);
  window.addEventListener('popstate', scheduleComboSeo);
  window.addEventListener('da:catalog-ready', scheduleComboSeo);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleComboSeo, { once: true });
  else scheduleComboSeo();
}

export { applyComboSeo };
