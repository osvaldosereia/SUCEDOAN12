import { loadCatalog, searchProducts, findProductByReference } from '../app-next/src/catalog.js';
import { applyProductOffer, isAvailable } from '../app-next/src/commerce.js';
import { prepareProductOffer } from '../app-next/src/offer-engine.js';
import { cleanCpf, escapeHtml, fmt, formatCpf, formatDateBR, norm } from '../app-next/src/core.js';
import {
  dispatchQueuedOrderToMake, enqueueOrder, lookupClientByCpf, openWhatsApp,
  persistQueuedOrder, processOrderQueue
} from '../app-next/src/integrations.js?v=20260811-1';
import { buildComplementPayload, buildComplementWhatsAppMessage } from './order-integration.js?v=20260810-2';

const CART_KEY = 'da_complemente_cart_v2';
const CART_MAX_AGE = 24 * 60 * 60 * 1000;
const CAMPAIGNS_ENDPOINT = '../site/mini-catalogo-links.json';
const OFFER_BATCH_SIZE = 24;

const state = {
  products: [],
  productMap: new Map(),
  cart: {},
  cartOrder: [],
  cartPromotions: {},
  campaigns: [],
  campaign: null,
  campaignStatus: 'none',
  campaignRef: '',
  route: { name: 'home', values: [], query: new URLSearchParams() },
  progressiveOffers: [],
  progressiveVisible: 0,
  progressiveObserver: null,
  cpf: '',
  submitting: false
};

const app = document.getElementById('app');
const checkoutDrawer = document.getElementById('checkout-drawer');
const checkoutContent = document.getElementById('checkout-content');
const overlay = document.getElementById('drawer-overlay');
const searchInput = document.getElementById('search-input');

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function safeDate(value, endOfDay = false) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function fallbackShortCode(token) {
  return String(token || '').replace(/[^a-z0-9]/gi, '').slice(0, 7).toUpperCase();
}

function normalizeCampaign(raw = {}) {
  const token = String(raw.token || '').trim();
  return {
    id: String(raw.id || '').trim(),
    token,
    shortCode: String(raw.shortCode || raw.short_code || fallbackShortCode(token)).trim().toUpperCase(),
    name: String(raw.name || raw.nome || 'Campanha').trim(),
    code: String(raw.code || raw.codigo || raw.id || '').trim().toUpperCase(),
    active: raw.active !== false && raw.ativo !== false,
    discountPercent: Math.max(0, Math.min(30, Number(raw.discountPercent ?? raw.desconto ?? 0) || 0)),
    scope: raw.scope === 'all' ? 'all' : 'destination',
    destination: {
      type: String(raw.destination?.type || raw.tipo || 'home').trim().toLowerCase(),
      value: String(raw.destination?.value || raw.destino || '').trim()
    },
    startsAt: String(raw.startsAt || raw.inicio || '').trim(),
    expiresAt: String(raw.expiresAt || raw.fim || '').trim(),
    note: String(raw.note || raw.observacao || '').trim()
  };
}

async function loadCampaigns() {
  try {
    const response = await fetch(`${CAMPAIGNS_ENDPOINT}?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const list = Array.isArray(data) ? data : Array.isArray(data.campaigns) ? data.campaigns : [];
    state.campaigns = list.map(normalizeCampaign).filter(item => item.id && item.token);
  } catch (error) {
    console.warn('Não foi possível carregar as campanhas do mini catálogo:', error);
    state.campaigns = [];
  }
}

function parseRoute() {
  const raw = (location.hash || '#/').replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean).map(part => decodeURIComponent(part));
  const first = norm(parts[0] || 'home');
  const aliases = {
    categorias: 'categories', categoria: 'category', ofertas: 'offers',
    busca: 'search', produto: 'product'
  };
  const name = aliases[first] || (first === 'home' ? 'home' : first) || 'home';
  return { name, values: parts.slice(1), query: new URLSearchParams(queryPart) };
}

function campaignIsActive(campaign, now = new Date()) {
  if (!campaign?.active) return { ok: false, status: 'inactive' };
  const start = safeDate(campaign.startsAt, false);
  const end = safeDate(campaign.expiresAt, true);
  if (start && now < start) return { ok: false, status: 'scheduled' };
  if (end && now > end) return { ok: false, status: 'expired' };
  return { ok: true, status: 'active' };
}

function resolveCampaign(route) {
  const reference = String(route.query.get('c') || '').trim();
  state.campaignRef = reference;
  state.campaign = null;
  state.campaignStatus = reference ? 'invalid' : 'none';
  if (!reference) return;
  const separator = reference.indexOf('.');
  if (separator <= 0) return;
  const id = reference.slice(0, separator);
  const token = reference.slice(separator + 1);
  const campaign = state.campaigns.find(item => item.id === id && item.token === token);
  if (!campaign) return;
  const validity = campaignIsActive(campaign);
  state.campaignStatus = validity.status;
  if (validity.ok) state.campaign = campaign;
}

function campaignQuery() {
  return state.campaignRef ? `c=${encodeURIComponent(state.campaignRef)}` : '';
}

function routeHref(base) {
  const clean = String(base || '#/');
  const query = campaignQuery();
  return query ? `${clean}${clean.includes('?') ? '&' : '?'}${query}` : clean;
}

function navigate(base) {
  location.hash = routeHref(base);
}

function readCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY) || 'null');
    if (!saved || Date.now() - Number(saved.savedAt || 0) > CART_MAX_AGE) return;
    state.cart = saved.cart && typeof saved.cart === 'object' ? saved.cart : {};
    state.cartOrder = Array.isArray(saved.cartOrder) ? saved.cartOrder.map(String) : [];
    state.cartPromotions = saved.cartPromotions && typeof saved.cartPromotions === 'object' ? saved.cartPromotions : {};
  } catch {}
}

function persistCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify({
      cart: state.cart,
      cartOrder: state.cartOrder,
      cartPromotions: state.cartPromotions,
      savedAt: Date.now()
    }));
  } catch {}
}

function cleanCart() {
  const nextOrder = [];
  const nextCart = {};
  const nextPromotions = {};
  state.cartOrder.forEach(id => {
    const key = String(id);
    const product = state.productMap.get(key);
    const qty = Math.min(Number(product?.stock || 0), Math.max(0, Number(state.cart[key] || 0)));
    if (product && isAvailable(product) && qty > 0) {
      nextOrder.push(key);
      nextCart[key] = qty;
      if (itemCampaign(key, product)) nextPromotions[key] = state.cartPromotions[key];
    }
  });
  state.cartOrder = nextOrder;
  state.cart = nextCart;
  state.cartPromotions = nextPromotions;
  persistCart();
}

function productMatchesSearch(product, query) {
  const wanted = norm(query);
  if (!wanted) return false;
  const terms = wanted.split(/\s+/).filter(Boolean);
  const haystack = norm([
    product.name, product.marca, product.categoria, product.subcategoria,
    product.subsubcategoria, product.codigo, product.gtin, product.ean
  ].join(' '));
  return terms.every(term => haystack.includes(term));
}

function campaignMatchesProductFor(campaign, product) {
  if (!campaign || !product) return false;
  if (campaign.scope === 'all') return true;
  const type = campaign.destination.type;
  const value = campaign.destination.value;
  if (type === 'offers') return Number(product.oldPrice || 0) > Number(product.price || 0);
  if (type === 'category') return norm(product.categoria) === norm(value);
  if (type === 'search') return productMatchesSearch(product, value);
  if (type === 'product') {
    const wanted = norm(value);
    return [product.id, product.firebaseKey, product.codigo, product.slug, product.name, product.gtin, product.ean]
      .some(item => norm(item) === wanted);
  }
  return true;
}

function activeCampaignForProduct(product) {
  return state.campaign && campaignMatchesProductFor(state.campaign, product) ? state.campaign : null;
}

function itemCampaign(id, product) {
  const stored = state.cartPromotions[String(id)];
  if (!stored?.id || !stored?.token) return null;
  const campaign = state.campaigns.find(item => item.id === stored.id && item.token === stored.token);
  return campaign && campaignIsActive(campaign).ok && campaignMatchesProductFor(campaign, product) ? campaign : null;
}

function productPricing(product, campaign = activeCampaignForProduct(product)) {
  const current = Number(product.price || 0);
  const discount = Number(campaign?.discountPercent || 0);
  const final = discount ? roundMoney(current * (1 - discount / 100)) : current;
  return {
    current,
    final,
    discount,
    code: campaign?.code || campaign?.name || '',
    campaignId: campaign?.id || ''
  };
}

function cartPricing() {
  const items = state.cartOrder.map(id => {
    const product = state.productMap.get(String(id));
    const qty = Number(state.cart[id] || 0);
    if (!product || qty <= 0) return null;
    const pricing = productPricing(product, itemCampaign(id, product));
    return {
      id: String(id), product, qty,
      unit: pricing.final,
      baseUnit: pricing.current,
      discountPercent: pricing.discount,
      discountCode: pricing.code,
      campaignId: pricing.campaignId,
      total: roundMoney(pricing.final * qty)
    };
  }).filter(Boolean);
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.baseUnit * item.qty, 0));
  const total = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
  return { items, subtotal, discount: roundMoney(subtotal - total), total };
}

function savePromotionForItem(id, product) {
  const campaign = activeCampaignForProduct(product);
  if (campaign) state.cartPromotions[String(id)] = { id: campaign.id, token: campaign.token };
}

function setQty(id, qty) {
  const key = String(id);
  const product = state.productMap.get(key);
  if (!product) return;
  const next = Math.max(0, Math.min(Number(product.stock || 0), Number(qty || 0)));
  if (next <= 0) {
    delete state.cart[key];
    delete state.cartPromotions[key];
    state.cartOrder = state.cartOrder.filter(item => item !== key);
  } else {
    state.cart[key] = next;
    if (!state.cartOrder.includes(key)) state.cartOrder.push(key);
    savePromotionForItem(key, product);
  }
  persistCart();
  updateShell();
  renderCurrentControls(key);
  if (checkoutDrawer.classList.contains('open')) renderCheckout();
}

function addProduct(id) {
  setQty(id, Number(state.cart[String(id)] || 0) + 1);
  showToast('Produto adicionado ao complemento.');
}

function quantityControl(product, detail = false) {
  const id = String(product.id);
  const qty = Number(state.cart[id] || 0);
  if (qty <= 0) {
    return `<button class="qty-add" data-action="add" data-id="${escapeHtml(id)}" aria-label="Adicionar ${escapeHtml(product.name)}">+</button>`;
  }
  return `<div class="qty-control ${detail ? 'qty-control-detail' : ''}"><button data-action="dec" data-id="${escapeHtml(id)}" aria-label="Diminuir">−</button><span>${qty}</span><button data-action="inc" data-id="${escapeHtml(id)}" aria-label="Aumentar">+</button></div>`;
}

function productRoute(product) {
  return encodeURIComponent(product.firebaseKey || product.id || product.codigo || product.slug);
}

function productCard(product) {
  const pricing = productPricing(product);
  const id = String(product.id);
  const original = pricing.discount ? pricing.current : Number(product.oldPrice || product.price || 0);
  const showOld = original > pricing.final;
  return `<article class="product-card" data-product-card="${escapeHtml(id)}">
    <div class="product-card-media">
      <a href="${routeHref(`#/produto/${productRoute(product)}`)}" aria-label="Ver ${escapeHtml(product.name)}"><img loading="lazy" decoding="async" width="300" height="300" src="${escapeHtml(product.img)}" data-fallback="${escapeHtml(product.images?.slice(1).join('|') || '')}" alt="${escapeHtml(product.name)}"></a>
      ${pricing.discount ? `<span class="discount-badge">-${pricing.discount}%</span>` : product.discountPercent > 0 ? `<span class="discount-badge">-${product.discountPercent}%</span>` : ''}
    </div>
    <div class="product-card-body">
      <div class="product-packaging">${escapeHtml(product.embalagem || 'Unidade')}</div>
      <a class="product-name" href="${routeHref(`#/produto/${productRoute(product)}`)}" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</a>
      <div class="product-expiry">${product.validade && formatDateBR(product.validade) ? `Val. ${formatDateBR(product.validade)}` : '&nbsp;'}</div>
      <div class="product-card-footer">
        <div class="product-price">${showOld ? `<s>${fmt(original)}</s>` : ''}<strong>${fmt(pricing.final)}</strong>${pricing.discount ? `<span class="link-discount-note">Campanha ${escapeHtml(pricing.code)}</span>` : ''}</div>
        <div data-control-slot="${escapeHtml(id)}">${quantityControl(product)}</div>
      </div>
    </div>
  </article>`;
}

function campaignBanner() {
  if (state.campaign) {
    const scopeText = state.campaign.scope === 'all' ? 'em todos os produtos' : 'somente nos produtos selecionados pela campanha';
    return `<div class="campaign-coupon"><div><strong>${escapeHtml(state.campaign.name)}</strong><span>${state.campaign.discountPercent}% de desconto ${scopeText}.${state.campaign.note ? ` ${escapeHtml(state.campaign.note)}` : ''}</span></div><b>${state.campaign.discountPercent}% OFF</b></div>`;
  }
  if (state.campaignStatus === 'none') return '';
  const messages = {
    invalid: 'Este link não é válido. Nenhum desconto foi aplicado.',
    inactive: 'Esta campanha foi desativada. Nenhum desconto foi aplicado.',
    scheduled: 'Esta campanha ainda não começou. Nenhum desconto foi aplicado.',
    expired: 'Esta campanha terminou. Nenhum desconto foi aplicado.'
  };
  return `<div class="campaign-coupon campaign-coupon-invalid"><div><strong>Campanha indisponível</strong><span>${escapeHtml(messages[state.campaignStatus] || messages.invalid)}</span></div><b>SEM DESCONTO</b></div>`;
}

function pageHeader(title, subtitle = '', back = '#/') {
  return `<header class="page-header">${back ? `<a class="back-button" href="${routeHref(back)}" aria-label="Voltar">←</a>` : ''}<div><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div></header>`;
}

function emptyState(title, text) {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span><a class="primary-button" href="${routeHref('#/categorias')}">Ver categorias</a></div>`;
}

function productGrid(products) {
  return products.length
    ? `<div class="product-grid">${products.map(productCard).join('')}</div>`
    : emptyState('Nenhum produto disponível', 'Tente outra categoria ou faça uma nova busca.');
}

function allOffers() {
  return state.products
    .filter(isAvailable)
    .filter(product => Number(product.oldPrice || 0) > Number(product.price || 0))
    .sort((a, b) => Number(b.discountPercent || 0) - Number(a.discountPercent || 0) || a.name.localeCompare(b.name, 'pt-BR'));
}

function progressiveOfferGrid(products) {
  state.progressiveOffers = products;
  state.progressiveVisible = Math.min(OFFER_BATCH_SIZE, products.length);
  if (!products.length) return emptyState('Nenhuma oferta disponível', 'As novas ofertas aparecerão aqui automaticamente.');
  const initial = products.slice(0, state.progressiveVisible);
  const remaining = Math.max(0, products.length - initial.length);
  return `<div class="product-grid" id="progressive-offer-grid">${initial.map(productCard).join('')}</div>
    <div class="offer-load-sentinel" id="offer-load-sentinel" ${remaining ? '' : 'hidden'}>
      <span class="offer-load-spinner" aria-hidden="true"></span>
      <strong>${remaining ? `Carregando mais ofertas · ${initial.length} de ${products.length}` : 'Todas as ofertas foram carregadas'}</strong>
    </div>`;
}

function loadNextOfferBatch() {
  const grid = document.getElementById('progressive-offer-grid');
  const sentinel = document.getElementById('offer-load-sentinel');
  if (!grid || !sentinel) return;
  const start = state.progressiveVisible;
  const end = Math.min(start + OFFER_BATCH_SIZE, state.progressiveOffers.length);
  if (end <= start) {
    sentinel.hidden = true;
    state.progressiveObserver?.disconnect();
    return;
  }
  grid.insertAdjacentHTML('beforeend', state.progressiveOffers.slice(start, end).map(productCard).join(''));
  state.progressiveVisible = end;
  const remaining = state.progressiveOffers.length - end;
  if (remaining <= 0) {
    sentinel.hidden = true;
    state.progressiveObserver?.disconnect();
  } else {
    sentinel.querySelector('strong').textContent = `Carregando mais ofertas · ${end} de ${state.progressiveOffers.length}`;
  }
}

function setupProgressiveOffers() {
  state.progressiveObserver?.disconnect();
  state.progressiveObserver = null;
  const sentinel = document.getElementById('offer-load-sentinel');
  if (!sentinel || sentinel.hidden) return;
  if (!('IntersectionObserver' in window)) {
    sentinel.innerHTML = '<button class="secondary-button" data-action="load-more-offers">Carregar mais ofertas</button>';
    return;
  }
  state.progressiveObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) loadNextOfferBatch();
  }, { rootMargin: '700px 0px' });
  state.progressiveObserver.observe(sentinel);
}

function availableCategories() {
  const map = new Map();
  state.products.filter(isAvailable).forEach(product => {
    const key = product.categoria || 'Outros';
    if (!map.has(key)) map.set(key, product);
  });
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
}

function homePage() {
  const offers = allOffers();
  return `<div class="page-container home-page offers-first-home">
    <section class="campaign-hero offers-hero">
      <div><small>Ofertas para completar seu pedido</small><h1>Aproveite as ofertas antes de finalizar</h1><p>Role a página para carregar todas as ofertas disponíveis. Escolha os itens e envie o complemento direto pelo WhatsApp.</p></div>
      <div class="campaign-hero-mark"><div><strong>${offers.length}</strong><span>ofertas agora</span></div></div>
    </section>
    ${campaignBanner()}
    <section class="content-section offers-main-section">
      <div class="section-heading"><div><h2>Todas as ofertas</h2><p>${offers.length} produto(s) em oferta, carregados aos poucos para abrir mais rápido.</p></div><a href="${routeHref('#/categorias')}">Ver categorias</a></div>
      ${progressiveOfferGrid(offers)}
    </section>
  </div>`;
}

function categoriesPage() {
  const cards = availableCategories().map(([name, product]) => `<a class="category-card" href="${routeHref(`#/categoria/${encodeURIComponent(name)}`)}"><img loading="lazy" src="${escapeHtml(product.img)}" alt=""><span><strong>${escapeHtml(name)}</strong><small>Ver produtos</small></span></a>`).join('');
  return `<div class="page-container">${pageHeader('Categorias', 'Escolha um setor para complementar o pedido.', '#/')}${campaignBanner()}<div class="category-grid">${cards}</div></div>`;
}

function categoryPage(name) {
  const products = state.products.filter(product => isAvailable(product) && norm(product.categoria) === norm(name));
  return `<div class="page-container">${pageHeader(products[0]?.categoria || name, `${products.length} produto(s) disponível(is)`, '#/categorias')}${campaignBanner()}${productGrid(products)}</div>`;
}

function offersPage() {
  const products = allOffers();
  return `<div class="page-container">${pageHeader('Todas as ofertas', `${products.length} produto(s) carregados conforme a rolagem.`, '#/')}${campaignBanner()}${progressiveOfferGrid(products)}</div>`;
}

function searchPage(query) {
  const products = searchProducts(state.products, query, isAvailable);
  return `<div class="page-container">${pageHeader(query ? `Busca: ${query}` : 'Busca', `${products.length} resultado(s)`, '#/')}${campaignBanner()}${productGrid(products)}</div>`;
}

function productPage(reference) {
  const product = findProductByReference(state, reference);
  if (!product || !isAvailable(product)) {
    return `<div class="page-container">${pageHeader('Produto não encontrado', '', '#/')}${emptyState('Produto indisponível', 'Escolha outro produto disponível.')}</div>`;
  }
  const pricing = productPricing(product);
  const related = state.products.filter(item => isAvailable(item) && item.id !== product.id && norm(item.categoria) === norm(product.categoria)).slice(0, 12);
  return `<div class="page-container">${pageHeader('Produto', '', '#/')}${campaignBanner()}<article class="product-detail"><div class="product-detail-media"><img id="product-main-image" src="${escapeHtml(product.img)}" data-fallback="${escapeHtml(product.images?.slice(1).join('|') || '')}" alt="${escapeHtml(product.name)}"></div><div class="product-detail-copy">${product.validade && formatDateBR(product.validade) ? `<div class="product-expiry">Validade: ${formatDateBR(product.validade)}</div>` : ''}<h1>${escapeHtml(product.name)}</h1><div class="detail-price">${pricing.current > pricing.final ? `<s>${fmt(pricing.current)}</s>` : ''}<strong>${fmt(pricing.final)}</strong></div>${pricing.discount ? `<div class="offer-note">Campanha ${escapeHtml(state.campaign.code || state.campaign.name)}: ${pricing.discount}% de desconto aplicado.</div>` : ''}<div data-control-slot="${escapeHtml(product.id)}">${quantityControl(product, true)}</div>${product.descricao ? `<p class="product-description">${escapeHtml(product.descricao)}</p>` : ''}<div class="detail-tags">${[product.categoria, product.subcategoria, product.marca].filter(Boolean).map(value => `<span>${escapeHtml(value)}</span>`).join('')}</div></div></article>${related.length ? `<section class="content-section"><div class="section-heading"><div><h2>Produtos relacionados</h2><p>Outras opções da mesma categoria.</p></div></div>${productGrid(related)}</section>` : ''}</div>`;
}

function renderRoute() {
  const route = parseRoute();
  state.route = route;
  resolveCampaign(route);
  state.progressiveObserver?.disconnect();
  let html = '';
  if (route.name === 'categories') html = categoriesPage();
  else if (route.name === 'category') html = categoryPage(route.values.join(' '));
  else if (route.name === 'offers') html = offersPage();
  else if (route.name === 'search') html = searchPage(route.values.join(' '));
  else if (route.name === 'product') html = productPage(route.values[0] || '');
  else html = homePage();
  app.innerHTML = html;
  searchInput.value = route.name === 'search' ? route.values.join(' ') : '';
  document.getElementById('search-clear').hidden = !searchInput.value;
  updateNavigation(route.name);
  updateShell();
  setupProgressiveOffers();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function updateNavigation(name) {
  const active = name === 'category' || name === 'categories' ? 'categories' : name === 'offers' ? 'offers' : 'home';
  document.querySelectorAll('[data-nav]').forEach(link => link.classList.toggle('active', link.dataset.nav === active));
  document.querySelectorAll('a[data-nav]').forEach(link => {
    const base = link.dataset.nav === 'categories' ? '#/categorias' : link.dataset.nav === 'offers' ? '#/ofertas' : '#/';
    link.setAttribute('href', routeHref(base));
  });
  document.querySelectorAll('.brand, .sidebar-brand').forEach(link => link.setAttribute('href', routeHref('#/')));
}

function renderCurrentControls(id) {
  const product = state.productMap.get(String(id));
  if (!product) return;
  document.querySelectorAll(`[data-control-slot="${CSS.escape(String(id))}"]`).forEach(slot => {
    slot.innerHTML = quantityControl(product, slot.closest('.product-detail') != null);
  });
}

function updateShell() {
  const pricing = cartPricing();
  const count = pricing.items.reduce((sum, item) => sum + item.qty, 0);
  document.querySelectorAll('[data-cart-count]').forEach(element => {
    element.textContent = String(count);
    element.hidden = count <= 0;
  });
  document.querySelectorAll('[data-cart-total]').forEach(element => { element.textContent = fmt(pricing.total); });
  document.querySelectorAll('[data-direct-whatsapp]').forEach(button => {
    button.disabled = count <= 0;
    button.setAttribute('aria-label', count > 0 ? `Revisar ${count} item(ns), total ${fmt(pricing.total)}` : 'Adicione produtos para finalizar');
  });
  const label = document.querySelector('[data-direct-label]');
  if (label) label.textContent = count > 0 ? 'Finalizar complemento' : 'Adicione produtos';
}

function openCheckout() {
  renderCheckout();
  checkoutDrawer.classList.add('open');
  checkoutDrawer.setAttribute('aria-hidden', 'false');
  overlay.classList.add('show');
  document.body.classList.add('drawer-open');
}

function closeCheckout() {
  checkoutDrawer.classList.remove('open');
  checkoutDrawer.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('show');
  document.body.classList.remove('drawer-open');
}

function renderCheckout() {
  const pricing = cartPricing();
  if (!pricing.items.length) {
    checkoutContent.innerHTML = `<div class="empty-state"><strong>Nenhum produto escolhido</strong><span>Adicione os itens que deseja incluir no pedido já realizado.</span></div>`;
    return;
  }
  const discountedItems = pricing.items.filter(item => item.discountPercent > 0).length;
  const codes = [...new Set(pricing.items.map(item => item.discountCode).filter(Boolean))];
  checkoutContent.innerHTML = `<div class="complement-cart-list">${pricing.items.map(item => `<div class="complement-cart-row"><img src="${escapeHtml(item.product.img)}" alt=""><div class="complement-cart-copy"><strong>${escapeHtml(item.product.name)}</strong><small>${fmt(item.unit)} cada · ${fmt(item.total)}${item.discountPercent ? ` · ${escapeHtml(item.discountCode)}: ${item.discountPercent}% OFF` : ''}</small></div>${quantityControl(item.product)}</div>`).join('')}</div><div class="checkout-summary-card"><div class="checkout-summary-row"><span>Subtotal</span><strong>${fmt(pricing.subtotal)}</strong></div>${pricing.discount > 0 ? `<div class="checkout-summary-row discount"><span>Desconto ${escapeHtml(codes.join(', '))} em ${discountedItems} item(ns)</span><strong>− ${fmt(pricing.discount)}</strong></div>` : ''}<div class="checkout-summary-row total"><span>Total do complemento</span><strong>${fmt(pricing.total)}</strong></div></div><section class="complement-cpf-card"><label for="complement-cpf"><strong>Informe somente seu CPF</strong><span>Usaremos o CPF para localizar o cadastro que você já possui.</span></label><input id="complement-cpf" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="000.000.000-00" value="${escapeHtml(formatCpf(state.cpf))}" aria-describedby="complement-status"><div id="complement-status" class="complement-status" role="status" aria-live="polite"></div></section><div class="complement-checkout-actions"><button class="whatsapp-button" data-action="send-whatsapp" ${state.submitting ? 'disabled' : ''}>${state.submitting ? 'Processando complemento...' : 'Enviar complemento no WhatsApp'}</button><button class="clear-complement" data-action="clear-cart" ${state.submitting ? 'disabled' : ''}>Limpar seleção</button></div><p class="checkout-help">Após localizar o CPF, abriremos o WhatsApp imediatamente. Firebase, Make, Bling e estoque continuarão em segundo plano.</p>`;
}

function updateComplementStatus(message, type = '') {
  const status = document.getElementById('complement-status');
  if (!status) return;
  status.textContent = message;
  status.className = `complement-status ${type}`.trim();
}

async function sendComplement(button) {
  if (state.submitting) return;
  const pricing = cartPricing();
  const cpf = cleanCpf(state.cpf);
  if (!pricing.items.length) {
    showToast('Adicione pelo menos um produto.');
    return;
  }
  if (cpf.length !== 11) {
    updateComplementStatus('Digite os 11 números do CPF.', 'error');
    document.getElementById('complement-cpf')?.focus();
    return;
  }

  const pendingWhatsApp = window.open('about:blank', '_blank');
  let whatsAppOpened = false;
  state.submitting = true;
  button.disabled = true;
  button.textContent = 'Consultando CPF...';
  updateComplementStatus('Consultando seu cadastro...', 'warning');

  try {
    const result = await lookupClientByCpf(cpf);
    if (!result?.encontrado || !result?.cliente) {
      throw new Error('CPF não encontrado. Use o CPF informado no pedido anterior.');
    }

    button.textContent = 'Registrando complemento...';
    updateComplementStatus('Cadastro encontrado. Registrando seu complemento...', 'ok');
    const payload = buildComplementPayload({
      pricing, cpf, customer: result.cliente,
      campaignReference: state.campaignRef,
      sourceUrl: location.href
    });
    try {
      enqueueOrder(payload);
      // A rota complementar do Make exige que o pedido já exista no Firebase.
      // O WhatsApp foi pré-aberto pelo clique, então podemos confirmar a gravação
      // e iniciar o webhook sem risco de o navegador suspender a segunda etapa.
      await persistQueuedOrder(payload.pedido.id);
      void dispatchQueuedOrderToMake(payload.pedido.id);
    } catch (queueError) {
      console.warn('Complemento não entrou na fila de integrações antes do WhatsApp:', queueError);
    }

    openWhatsApp(buildComplementWhatsAppMessage(payload), pendingWhatsApp);
    whatsAppOpened = true;

    state.cpf = '';
    clearCart();
    closeCheckout();
    showToast(`Complemento ${payload.pedido.numero} pronto no WhatsApp.`);
  } catch (error) {
    if (!whatsAppOpened && pendingWhatsApp && !pendingWhatsApp.closed) pendingWhatsApp.close();
    updateComplementStatus(error?.name === 'AbortError' ? 'A consulta demorou demais. Tente novamente.' : error.message || 'Não foi possível enviar o complemento.', 'error');
  } finally {
    state.submitting = false;
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = 'Enviar complemento no WhatsApp';
    }
  }
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function clearCart() {
  state.cart = {};
  state.cartOrder = [];
  state.cartPromotions = {};
  persistCart();
  updateShell();
  renderCheckout();
  renderRoute();
}

function bindEvents() {
  window.addEventListener('hashchange', renderRoute);
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    event.preventDefault();
    const id = button.dataset.id;
    if (button.dataset.action === 'add') addProduct(id);
    else if (button.dataset.action === 'inc') setQty(id, Number(state.cart[String(id)] || 0) + 1);
    else if (button.dataset.action === 'dec') setQty(id, Number(state.cart[String(id)] || 0) - 1);
    else if (button.dataset.action === 'clear-cart') clearCart();
    else if (button.dataset.action === 'send-whatsapp') await sendComplement(button);
    else if (button.dataset.action === 'open-checkout') openCheckout();
    else if (button.dataset.action === 'load-more-offers') loadNextOfferBatch();
  });
  document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    const fallbacks = String(image.dataset.fallback || '').split('|').filter(Boolean);
    const next = fallbacks.shift();
    image.dataset.fallback = fallbacks.join('|');
    image.src = next || '../img/logoantonia5.png';
  }, true);
  checkoutContent.addEventListener('input', event => {
    if (event.target.id !== 'complement-cpf') return;
    state.cpf = cleanCpf(event.target.value);
    event.target.value = formatCpf(state.cpf);
    updateComplementStatus('', '');
  });
  document.getElementById('open-cart').addEventListener('click', openCheckout);
  document.getElementById('bottom-cart')?.addEventListener('click', openCheckout);
  document.getElementById('open-menu').addEventListener('click', () => navigate('#/categorias'));
  document.querySelector('[data-close-drawer]').addEventListener('click', closeCheckout);
  overlay.addEventListener('click', closeCheckout);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeCheckout(); });

  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const query = searchInput.value.trim();
    document.getElementById('search-clear').hidden = !query;
    searchTimer = setTimeout(() => { if (query.length >= 2) navigate(`#/busca/${encodeURIComponent(query)}`); }, 450);
  });
  document.getElementById('search-form').addEventListener('submit', event => {
    event.preventDefault();
    const query = searchInput.value.trim();
    if (query) navigate(`#/busca/${encodeURIComponent(query)}`);
  });
  document.getElementById('search-clear').addEventListener('click', () => {
    searchInput.value = '';
    document.getElementById('search-clear').hidden = true;
    navigate('#/');
  });
}

async function init() {
  bindEvents();
  readCart();
  app.innerHTML = '<div class="loading-shell"><div></div><div></div><div></div></div>';
  try {
    const [catalog] = await Promise.all([loadCatalog(), loadCampaigns()]);
    state.products = catalog.products.map(product => applyProductOffer(prepareProductOffer(product)));
    state.productMap = new Map(state.products.map(product => [String(product.id), product]));
    cleanCart();
    renderRoute();
  } catch (error) {
    console.error(error);
    app.innerHTML = `<div class="page-container"><div class="empty-state"><strong>Não conseguimos carregar o catálogo.</strong><span>${escapeHtml(error.message || 'Tente novamente em alguns instantes.')}</span></div></div>`;
  } finally {
    document.documentElement.classList.remove('booting');
  }
}

init();
