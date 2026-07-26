import { CONFIG } from './config.js';
import { loadCatalog } from './catalog.js';
import { kitIsVisible, kitOriginalPrice, kitStockCapacity, resolveBundleRows } from './commerce.js';

const CLEAN_SECTION_PATHS = Object.freeze({ baskets: '/cestas/', kits: '/kits/' });

const SEO_VERSION = '2026-07-26-combos-delivery-v2';
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

function slug(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'combo';
}

function absoluteUrl(value) {
  try {
    const url = new URL(String(value || ''), `${CONFIG.SITE_BASE_URL}/`);
    if (url.hostname === 'www.donaantonia.com.br') url.hostname = 'donaantonia.com.br';
    return url.href;
  } catch {
    return `${CONFIG.SITE_BASE_URL}/img/logoantonia5.png`;
  }
}

function comboSeoPath(bundle, type) {
  const name = slug(bundle?.nome || (type === 'kit' ? 'kit-promocional' : 'cesta-basica'));
  const reference = slug(bundle?.codigo || bundle?.id || name);
  return `/${type === 'kit' ? 'kits' : 'cestas'}/${name}-${reference}/`;
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
  const normalized = value?.['@type'] === 'Product'
    ? {
        '@context': value['@context'] || 'https://schema.org',
        '@graph': [
          { ...value, '@context': undefined },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Início', item: CONFIG.SITE_BASE_URL + '/' },
              {
                '@type': 'ListItem',
                position: 2,
                name: value.category || 'Cestas e kits',
                item: CONFIG.SITE_BASE_URL + (value.category === 'Kits promocionais' ? CLEAN_SECTION_PATHS.kits : CLEAN_SECTION_PATHS.baskets),
              },
              { '@type': 'ListItem', position: 3, name: value.name || document.title, item: value.url || location.href },
            ],
          },
        ],
      }
    : value;
  node.textContent = JSON.stringify(normalized);
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
    ? 'Kits Promocionais com Delivery em Cuiabá e Várzea Grande | Dona Antônia'
    : isBaskets
      ? 'Cestas Básicas com Delivery em Cuiabá e Várzea Grande | Dona Antônia'
      : 'Cestas Básicas e Kits com Delivery em Cuiabá e Várzea Grande | Dona Antônia';
  const description = isKits
    ? 'Kits promocionais com produtos selecionados, preço especial e delivery em Cuiabá e Várzea Grande.'
    : isBaskets
      ? 'Cestas básicas econômicas e completas com delivery em Cuiabá e Várzea Grande. Confira a composição e escolha sua cesta.'
      : 'Cestas básicas e kits promocionais com delivery em Cuiabá e Várzea Grande. Confira produtos, preços e disponibilidade.';
  const canonical = isKits
    ? `${CONFIG.SITE_BASE_URL}/kits/`
    : isBaskets
      ? `${CONFIG.SITE_BASE_URL}/cestas/`
      : `${CONFIG.SITE_BASE_URL}/`;
  document.title = title;
  setCanonical(canonical);
  setMeta('meta[name="description"]', { name: 'description' }, description);
  setMeta('meta[name="robots"]', { name: 'robots' }, 'index,follow,max-image-preview:large,max-snippet:-1');
  setMeta('meta[property="og:type"]', { property: 'og:type' }, 'website');
  setMeta('meta[property="og:title"]', { property: 'og:title' }, title);
  setMeta('meta[property="og:description"]', { property: 'og:description' }, description);
  setMeta('meta[property="og:url"]', { property: 'og:url' }, canonical);
  setMeta('meta[property="og:image"]', { property: 'og:image' }, `${CONFIG.SITE_BASE_URL}/img/logoantonia5.png`);
  setJsonLd(null);
}

function basketCapacity(data, bundle) {
  const rows = resolveBundleRows(data, bundle);
  if (!bundle?.produtos?.length || rows.length !== bundle.produtos.length) return 0;
  return Math.min(...rows.map(row => Math.floor(Math.max(0, Number(row.product.stock || 0)) / Math.max(1, Number(row.qty || 1)))));
}

function comboAvailability(data, bundle, type) {
  if (type === 'kit') return kitIsVisible(data, bundle) && kitStockCapacity(data, bundle) > 0;
  return basketCapacity(data, bundle) > 0;
}

function comboMeta(data, bundle, type) {
  const kind = type === 'kit' ? 'Kit Promocional' : 'Cesta Básica';
  const name = clean(bundle.nome || kind);
  const titleBase = /\b(cesta|kit)\b/i.test(name) ? name : `${kind} ${name}`;
  const title = `${titleBase} com Delivery | Dona Antônia`;
  const description = clean(bundle.descricao || bundle.description || `${kind} com produtos selecionados e delivery em Cuiabá e Várzea Grande.`).slice(0, 300);
  const reference = String(bundle.id || bundle.codigo || '').trim();
  const canonical = `${CONFIG.SITE_BASE_URL}${comboSeoPath(bundle, type)}`;
  const image = absoluteUrl(bundle.imagem || bundle.img || bundle.url_imagem || 'img/logoantonia5.png');
  const price = Number(bundle.preco || bundle.preco_novo || 0);
  const available = comboAvailability(data, bundle, type);
  const oldPrice = type === 'kit' ? Number(kitOriginalPrice(data, bundle) || 0) : Number(bundle.precoOriginal || 0);

  document.title = title;
  setCanonical(canonical);
  setMeta('meta[name="description"]', { name: 'description' }, description);
  setMeta('meta[name="robots"]', { name: 'robots' }, available ? 'index,follow,max-image-preview:large,max-snippet:-1' : 'noindex,follow');
  setMeta('meta[property="og:type"]', { property: 'og:type' }, 'product');
  setMeta('meta[property="og:title"]', { property: 'og:title' }, title);
  setMeta('meta[property="og:description"]', { property: 'og:description' }, description);
  setMeta('meta[property="og:url"]', { property: 'og:url' }, canonical);
  setMeta('meta[property="og:image"]', { property: 'og:image' }, image);
  if (price > 0) {
    setMeta('meta[property="product:price:amount"]', { property: 'product:price:amount' }, price.toFixed(2));
    setMeta('meta[property="product:price:currency"]', { property: 'product:price:currency' }, 'BRL');
  }

  const offer = {
    '@type': 'Offer',
    url: canonical,
    priceCurrency: 'BRL',
    price: price.toFixed(2),
    availability: available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@id': `${CONFIG.SITE_BASE_URL}/#organization` },
  };
  const end = bundle.dataFim || bundle.data_fim || '';
  if (type === 'kit' && end) offer.priceValidUntil = end;

  setJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${canonical}#product`,
    name,
    description,
    image: [image],
    url: canonical,
    sku: String(bundle.codigo || bundle.id || reference),
    mpn: String(bundle.codigo || bundle.id || reference),
    category: type === 'kit' ? 'Kits promocionais' : 'Cestas básicas',
    brand: { '@type': 'Brand', name: 'Dona Antônia' },
    offers: offer,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Modalidade', value: 'Somente delivery' },
      { '@type': 'PropertyValue', name: 'Área de entrega', value: 'Cuiabá e Várzea Grande' },
      ...(oldPrice > price ? [{ '@type': 'PropertyValue', name: 'Preço anterior', value: oldPrice.toFixed(2) }] : []),
    ],
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
    const bundle = (list || []).find(item =>
      String(item.id) === String(target.id)
      || String(item.codigo || '') === String(target.id)
    );
    if (bundle) comboMeta(data, bundle, target.type);
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

export { applyComboSeo, comboSeoPath };
