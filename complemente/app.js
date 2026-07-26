import { loadCatalog, searchProducts, findProductByReference } from '../app-next/src/catalog.js';
import { applyProductOffer, isAvailable } from '../app-next/src/commerce.js';
import { prepareProductOffer } from '../app-next/src/offer-engine.js';
import { escapeHtml, fmt, formatDateBR, norm } from '../app-next/src/core.js';

const WHATSAPP_NUMBER = '5565998150975';
const CART_KEY = 'da_complemente_cart_v2';
const CART_MAX_AGE = 24 * 60 * 60 * 1000;
const CAMPAIGNS_ENDPOINT = '../site/mini-catalogo-links.json';

const state = {
  products: [],
  productMap: new Map(),
  cart: {},
  cartOrder: [],
  campaigns: [],
  campaign: null,
  campaignStatus: 'none',
  campaignRef: '',
  route: { name: 'home', values: [], query: new URLSearchParams() }
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
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeCampaign(raw = {}) {
  return {
    id: String(raw.id || '').trim(),
    token: String(raw.token || '').trim(),
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
    const response = await fetch(`${CAMPAIGNS_ENDPOINT}?t=${Date.now()}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
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
  const aliases = { categorias: 'categories', categoria: 'category', ofertas: 'offers', busca: 'search', produto: 'product' };
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
  if (!validity.ok) return;
  state.campaign = campaign;
}

function campaignQuery() {
  return state.campaignRef ? `c=${encodeURIComponent(state.campaignRef)}` : '';
}

function routeHref(base) {
  const clean = String(base || '#/');
  const query = campaignQuery();
  if (!query) return clean;
  return `${clean}${clean.includes('?') ? '&' : '?'}${query}`;
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
  } catch {}
}

function persistCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify({ cart: state.cart, cartOrder: state.cartOrder, savedAt: Date.now() }));
  } catch {}
}

function cleanCart() {
  const nextOrder = [];
  const nextCart = {};
  state.cartOrder.forEach(id => {
    const product = state.productMap.get(String(id));
    const qty = Math.min(Number(product?.stock || 0), Math.max(0, Number(state.cart[id] || 0)));
    if (product && isAvailable(product) && qty > 0) {
      nextOrder.push(String(id));
      nextCart[String(id)] = qty;
    }
  });
  state.cartOrder = nextOrder;
  state.cart = nextCart;
  persistCart();
}

function productMatchesSearch(product, query) {
  const wanted = norm(query);
  if (!wanted) return false;
  const words = wanted.split(/\s+/).filter(Boolean);
  const haystack = norm([product.name, product.marca, product.categoria, product.subcategoria, product.subsubcategoria, product.codigo, product.gtin, product.ean].join(' '));
  return words.every(word => haystack.includes(word));
}

function campaignMatchesProduct(product) {
  const campaign = state.campaign;
  if (!campaign || !product) return false;
  if (campaign.scope === 'all') return true;

  const type = campaign.destination.type;
  const value = campaign.destination.value;
  if (type === 'offers') return Number(product.oldPrice || 0) > Number(product.price || 0);
  if (type === 'category') return norm(product.categoria) === norm(value);
  if (type === 'search') return productMatchesSearch(product, value);
  if (type === 'product') {
    const wanted = norm(value);
    return [product.id, product.firebaseKey, product.codigo, product.slug, product.name, product.gtin, product.ean].some(item => norm(item) === wanted);
  }
  return true;
}

function productPricing(product) {
  const current = Number(product.price || 0);
  const discount = campaignMatchesProduct(product) ? Number(state.campaign?.discountPercent || 0) : 0;
  const final = discount ? roundMoney(current * (1 - discount / 100)) : current;
  return { current, final, discount };
}

function cartPricing() {
  const items = state.cartOrder.map(id => {
    const product = state.productMap.get(String(id));
    const qty = Number(state.cart[id] || 0);
    if (!product || qty <= 0) return null;
    const pricing = productPricing(product);
    return { id: String(id), product, qty, unit: pricing.final, baseUnit: pricing.current, discountPercent: pricing.discount, total: roundMoney(pricing.final * qty) };
  }).filter(Boolean);
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.baseUnit * item.qty, 0));
  const total = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
  return { items, subtotal, discount: roundMoney(subtotal - total), total };
}

function setQty(id, qty) {
  const key = String(id);
  const product = state.productMap.get(key);
  if (!product) return;
  const next = Math.max(0, Math.min(Number(product.stock || 0), Number(qty || 0)));
  if (next <= 0) {
    delete state.cart[key];
    state.cartOrder = state.cartOrder.filter(item => item !== key);
  } else {
    state.cart[key] = next;
    if (!state.cartOrder.includes(key)) state.cartOrder.push(key);
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
  if (qty <= 0) return `<button class="qty-add" data-action="add" data-id="${escapeHtml(id)}" aria-label="Adicionar ${escapeHtml(product.name)}">+</button>`;
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
        <div class="product-price">${showOld ? `<s>${fmt(original)}</s>` : ''}<strong>${fmt(pricing.final)}</strong>${pricing.discount ? `<span class="link-discount-note">Campanha ${escapeHtml(state.campaign.code || state.campaign.name)}</span>` : ''}</div>
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
  return products.length ? `<div class="product-grid">${products.map(productCard).join('')}</div>` : emptyState('Nenhum produto disponível', 'Tente outra categoria ou faça uma nova busca.');
}

function availableCategories() {
  const map = new Map();
  state.products.filter(isAvailable).forEach(product => {
    const key = product.categoria || 'Outros';
    if (!map.has(key)) map.set(key, product);
  });
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
}

function categoryStrip(limit = 12) {
  return `<div class="quick-category-strip">${availableCategories().slice(0, limit).map(([name]) => `<a class="chip" href="${routeHref(`#/categoria/${encodeURIComponent(name)}`)}">${escapeHtml(name)}</a>`).join('')}</div>`;
}

function homePage() {
  const offers = state.products.filter(isAvailable).filter(product => Number(product.oldPrice || 0) > Number(product.price || 0)).sort((a, b) => Number(b.discountPercent || 0) - Number(a.discountPercent || 0)).slice(0, 24);
  const products = state.products.filter(isAvailable).slice(0, 48);
  return `<div class="page-container home-page">
    <section class="campaign-hero"><div><small>Pedido já realizado?</small><h1>Acrescente mais produtos em poucos cliques</h1><p>Escolha os itens, revise o complemento e envie direto no WhatsApp. Sem cadastro e sem refazer o pedido.</p></div><div class="campaign-hero-mark"><div><strong>+ itens</strong><span>no seu pedido</span></div></div></section>
    ${campaignBanner()}
    <section class="content-section"><div class="section-heading"><div><h2>Categorias</h2><p>Encontre rapidamente o que faltou.</p></div><a href="${routeHref('#/categorias')}">Ver todas</a></div>${categoryStrip()}</section>
    ${offers.length ? `<section class="content-section"><div class="section-heading"><div><h2>Ofertas para aproveitar</h2><p>Produtos disponíveis agora.</p></div><a href="${routeHref('#/ofertas')}">Ver todas</a></div>${productGrid(offers)}</section>` : ''}
    <section class="content-section"><div class="section-heading"><div><h2>Mais produtos</h2><p>Adicione ao pedido que você já fez.</p></div></div>${productGrid(products)}</section>
  </div>`;
}

function categoriesPage() {
  const cards = availableCategories().map(([name, product]) => `<a class="category-card" href="${routeHref(`#/categoria/${encodeURIComponent(name)}`)}"><img loading="lazy" src="${escapeHtml(product.img)}" alt=""><span><strong>${escapeHtml(name)}</strong><small>Ver produtos</small></span></a>`).join('');
  return `<div class="page-container">${pageHeader('Categorias', 'Escolha um setor para complementar o pedido.', '#/')}${campaignBanner()}<div class="category-grid">${cards}</div></div>`;
}

function categoryPage(name) {
  const wanted = norm(name);
  const products = state.products.filter(product => isAvailable(product) && norm(product.categoria) === wanted);
  const canonical = products[0]?.categoria || name;
  return `<div class="page-container">${pageHeader(canonical, `${products.length} produto(s) disponível(is)`, '#/categorias')}${campaignBanner()}${productGrid(products)}</div>`;
}

function offersPage() {
  const products = state.products.filter(isAvailable).filter(product => Number(product.oldPrice || 0) > Number(product.price || 0)).sort((a, b) => Number(b.discountPercent || 0) - Number(a.discountPercent || 0) || a.name.localeCompare(b.name, 'pt-BR'));
  return `<div class="page-container">${pageHeader('Ofertas', 'Aproveite para acrescentar ao seu pedido.', '#/')}${campaignBanner()}${productGrid(products)}</div>`;
}

function searchPage(query) {
  const products = searchProducts(state.products, query, isAvailable);
  return `<div class="page-container">${pageHeader(query ? `Busca: ${query}` : 'Busca', `${products.length} resultado(s)`, '#/')}${campaignBanner()}${productGrid(products)}</div>`;
}

function productPage(reference) {
  const product = findProductByReference(state, reference);
  if (!product || !isAvailable(product)) return `<div class="page-container">${pageHeader('Produto não encontrado', '', '#/')}${emptyState('Produto indisponível', 'Escolha outro produto disponível.')}</div>`;
  const pricing = productPricing(product);
  const related = state.products.filter(item => isAvailable(item) && item.id !== product.id && norm(item.categoria) === norm(product.categoria)).slice(0, 12);
  return `<div class="page-container">${pageHeader('Produto', '', '#/')}${campaignBanner()}<article class="product-detail"><div class="product-detail-media"><img id="product-main-image" src="${escapeHtml(product.img)}" data-fallback="${escapeHtml(product.images?.slice(1).join('|') || '')}" alt="${escapeHtml(product.name)}"></div><div class="product-detail-copy">${product.validade && formatDateBR(product.validade) ? `<div class="product-expiry">Validade: ${formatDateBR(product.validade)}</div>` : ''}<h1>${escapeHtml(product.name)}</h1><div class="detail-price">${pricing.current > pricing.final ? `<s>${fmt(pricing.current)}</s>` : ''}<strong>${fmt(pricing.final)}</strong></div>${pricing.discount ? `<div class="offer-note">Campanha ${escapeHtml(state.campaign.code || state.campaign.name)}: ${pricing.discount}% de desconto aplicado.</div>` : ''}<div data-control-slot="${escapeHtml(product.id)}">${quantityControl(product, true)}</div>${product.descricao ? `<p class="product-description">${escapeHtml(product.descricao)}</p>` : ''}<div class="detail-tags">${[product.categoria, product.subcategoria, product.marca].filter(Boolean).map(value => `<span>${escapeHtml(value)}</span>`).join('')}</div></div></article>${related.length ? `<section class="content-section"><div class="section-heading"><div><h2>Produtos relacionados</h2><p>Outras opções da mesma categoria.</p></div></div>${productGrid(related)}</section>` : ''}</div>`;
}

function renderRoute() {
  const route = parseRoute();
  state.route = route;
  resolveCampaign(route);
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
  document.querySelectorAll(`[data-control-slot="${CSS.escape(String(id))}"]`).forEach(slot => { slot.innerHTML = quantityControl(product, slot.closest('.product-detail') != null); });
}

function updateShell() {
  const pricing = cartPricing();
  const count = pricing.items.reduce((sum, item) => sum + item.qty, 0);
  document.querySelectorAll('[data-cart-count]').forEach(element => {
    element.textContent = String(count);
    element.hidden = count <= 0;
  });
  document.querySelectorAll('[data-cart-total]').forEach(element => { element.textContent = fmt(pricing.total); });
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
  checkoutContent.innerHTML = `<div class="complement-cart-list">${pricing.items.map(item => `<div class="complement-cart-row"><img src="${escapeHtml(item.product.img)}" alt=""><div class="complement-cart-copy"><strong>${escapeHtml(item.product.name)}</strong><small>${fmt(item.unit)} cada · ${fmt(item.total)}${item.discountPercent ? ` · ${item.discountPercent}% OFF` : ''}</small></div>${quantityControl(item.product)}</div>`).join('')}</div>
    <div class="checkout-summary-card"><div class="checkout-summary-row"><span>Subtotal</span><strong>${fmt(pricing.subtotal)}</strong></div>${pricing.discount > 0 ? `<div class="checkout-summary-row discount"><span>Desconto da campanha em ${discountedItems} item(ns)</span><strong>− ${fmt(pricing.discount)}</strong></div>` : ''}<div class="checkout-summary-row total"><span>Total do complemento</span><strong>${fmt(pricing.total)}</strong></div></div>
    <div class="complement-checkout-actions"><button class="whatsapp-button" data-action="send-whatsapp">Enviar complemento no WhatsApp</button><button class="clear-complement" data-action="clear-cart">Limpar seleção</button></div><p class="checkout-help">A campanha e os valores serão conferidos pela equipe antes da inclusão no pedido.</p>`;
}

function whatsappMessage() {
  const pricing = cartPricing();
  const lines = pricing.items.map(item => `• ${item.qty}x ${item.product.name} — ${fmt(item.total)}${item.discountPercent ? ` (${item.discountPercent}% OFF)` : ''}`);
  const message = [
    'Olá! Quero acrescentar estes produtos ao pedido que já fiz:',
    '',
    ...lines,
    '',
    `Subtotal: ${fmt(pricing.subtotal)}`,
    ...(pricing.discount > 0 ? [`Desconto da campanha: -${fmt(pricing.discount)}`] : []),
    `Total do complemento: ${fmt(pricing.total)}`,
    ...(state.campaign ? [`Campanha: ${state.campaign.name} [${state.campaign.id}]`] : []),
    '',
    'Por favor, confirme a inclusão no meu pedido.',
    `Link usado: ${location.href}`
  ].join('\n');
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function sendWhatsapp() {
  const pricing = cartPricing();
  if (!pricing.items.length) return;
  window.open(whatsappMessage(), '_blank', 'noopener');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function bindEvents() {
  window.addEventListener('hashchange', renderRoute);
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (button) {
      event.preventDefault();
      const id = button.dataset.id;
      if (button.dataset.action === 'add') addProduct(id);
      else if (button.dataset.action === 'inc') setQty(id, Number(state.cart[String(id)] || 0) + 1);
      else if (button.dataset.action === 'dec') setQty(id, Number(state.cart[String(id)] || 0) - 1);
      else if (button.dataset.action === 'clear-cart') { state.cart = {}; state.cartOrder = []; persistCart(); updateShell(); renderCheckout(); renderRoute(); }
      else if (button.dataset.action === 'send-whatsapp') sendWhatsapp();
      return;
    }
  });
  document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    const fallbacks = String(image.dataset.fallback || '').split('|').filter(Boolean);
    const next = fallbacks.shift();
    image.dataset.fallback = fallbacks.join('|');
    image.src = next || '../img/logoantonia5.png';
  }, true);
  document.getElementById('open-cart').addEventListener('click', openCheckout);
  document.getElementById('bottom-cart').addEventListener('click', openCheckout);
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
