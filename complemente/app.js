import { loadCatalog, searchProducts, findProductByReference } from '../app-next/src/catalog.js';
import { applyProductOffer, isAvailable } from '../app-next/src/commerce.js';
import { prepareProductOffer } from '../app-next/src/offer-engine.js';
import { escapeHtml, fmt, formatDateBR, norm } from '../app-next/src/core.js';

const WHATSAPP_NUMBER = '5565998150975';
const CART_KEY = 'da_complemente_cart_v2';
const CART_MAX_AGE = 24 * 60 * 60 * 1000;
const MAX_LINK_DISCOUNT = 30;

const state = {
  products: [],
  productMap: new Map(),
  cart: {},
  cartOrder: [],
  cartPromotions: {},
  coupon: null,
  scope: null,
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

function parseLinkCoupon(value) {
  const code = String(value || '').trim().toUpperCase();
  const match = code.match(/^(?=.*[A-ZÀ-Ý])([A-ZÀ-Ý0-9_-]{2,28}?)(\d{1,2})$/i);
  if (!match) return null;
  const percent = Number(match[2]);
  if (!Number.isInteger(percent) || percent < 1 || percent > MAX_LINK_DISCOUNT) return null;
  return { code, percent };
}

function parseRoute() {
  const raw = (location.hash || '#/').replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean).map(part => decodeURIComponent(part));
  const first = norm(parts[0] || 'home');
  const aliases = {
    categorias: 'categories',
    categoria: 'category',
    ofertas: 'offers',
    busca: 'search',
    produto: 'product'
  };
  const name = aliases[first] || (first === 'home' ? 'home' : first) || 'home';
  const minimumParts = ['offers', 'categories'].includes(name) ? 1 : ['category', 'search', 'product'].includes(name) ? 2 : 1;
  let coupon = null;
  if (parts.length > minimumParts) coupon = parseLinkCoupon(parts.at(-1));
  if (coupon) parts.pop();
  return {
    name,
    values: parts.slice(1),
    coupon,
    query: new URLSearchParams(queryPart)
  };
}

function baseHref(routeName, value = '') {
  if (routeName === 'category') return `#/categoria/${encodeURIComponent(value)}`;
  if (routeName === 'search') return `#/busca/${encodeURIComponent(value)}`;
  if (routeName === 'offers') return '#/ofertas';
  if (routeName === 'categories') return '#/categorias';
  return '#/';
}

function scopedRouteHref(routeName, value, coupon = state.coupon) {
  const base = baseHref(routeName, value);
  return coupon ? `${base}/${encodeURIComponent(coupon.code)}` : base;
}

function productHref(product) {
  const base = `#/produto/${encodeURIComponent(product.firebaseKey || product.id || product.codigo || product.slug)}`;
  if (!state.coupon || !state.scope || !productEligibleForPromotion(product, { coupon: state.coupon, scope: state.scope })) return base;
  const params = new URLSearchParams({ segment: state.scope.type });
  if (state.scope.value) params.set('value', state.scope.value);
  return `${base}/${encodeURIComponent(state.coupon.code)}?${params.toString()}`;
}

function navigate(hash) {
  location.hash = hash;
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
      if (state.cartPromotions[key]) nextPromotions[key] = state.cartPromotions[key];
    }
  });
  state.cartOrder = nextOrder;
  state.cart = nextCart;
  state.cartPromotions = nextPromotions;
  persistCart();
}

function scopeFromRoute(route) {
  if (!route.coupon) return null;
  if (route.name === 'category') return { type: 'category', value: route.values.join(' ') };
  if (route.name === 'search') return { type: 'search', value: route.values.join(' ') };
  if (route.name === 'offers') return { type: 'offers', value: '' };
  if (route.name === 'product') {
    const type = route.query.get('segment') || '';
    const value = route.query.get('value') || '';
    return ['category', 'search', 'offers'].includes(type) ? { type, value } : null;
  }
  return null;
}

function isOfferProduct(product) {
  return Number(product?.oldPrice || 0) > Number(product?.price || 0);
}

function productEligibleForPromotion(product, promotion) {
  const scope = promotion?.scope;
  if (!product || !promotion?.coupon || !scope) return false;
  if (scope.type === 'category') return norm(product.categoria) === norm(scope.value);
  if (scope.type === 'search') return searchProducts([product], scope.value, isAvailable).length > 0;
  if (scope.type === 'offers') return isOfferProduct(product);
  return false;
}

function activePromotionForProduct(product) {
  if (!state.coupon || !state.scope) return null;
  const promotion = { coupon: state.coupon, scope: state.scope };
  return productEligibleForPromotion(product, promotion) ? promotion : null;
}

function itemPromotion(id, product) {
  const stored = state.cartPromotions[String(id)];
  if (!stored) return null;
  const promotion = {
    coupon: { code: stored.code, percent: Number(stored.percent || 0) },
    scope: { type: stored.scopeType, value: stored.scopeValue || '' }
  };
  return productEligibleForPromotion(product, promotion) ? promotion : null;
}

function productPricing(product, promotion = activePromotionForProduct(product)) {
  const current = Number(product.price || 0);
  const discount = promotion?.coupon?.percent || 0;
  const final = discount ? roundMoney(current * (1 - discount / 100)) : current;
  return { current, final, discount, code: promotion?.coupon?.code || '' };
}

function cartPricing() {
  const items = state.cartOrder.map(id => {
    const product = state.productMap.get(String(id));
    const qty = Number(state.cart[id] || 0);
    if (!product || qty <= 0) return null;
    const promotion = itemPromotion(id, product);
    const pricing = productPricing(product, promotion);
    return {
      id: String(id), product, qty,
      unit: pricing.final,
      baseUnit: pricing.current,
      discountPercent: pricing.discount,
      discountCode: pricing.code,
      total: roundMoney(pricing.final * qty)
    };
  }).filter(Boolean);
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.baseUnit * item.qty, 0));
  const total = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
  return { items, subtotal, discount: roundMoney(subtotal - total), total };
}

function savePromotionForItem(id, product) {
  const promotion = activePromotionForProduct(product);
  if (!promotion) return;
  state.cartPromotions[String(id)] = {
    code: promotion.coupon.code,
    percent: promotion.coupon.percent,
    scopeType: promotion.scope.type,
    scopeValue: promotion.scope.value || ''
  };
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
  if (qty <= 0) return `<button class="qty-add" data-action="add" data-id="${escapeHtml(id)}" aria-label="Adicionar ${escapeHtml(product.name)}">+</button>`;
  return `<div class="qty-control ${detail ? 'qty-control-detail' : ''}"><button data-action="dec" data-id="${escapeHtml(id)}" aria-label="Diminuir">−</button><span>${qty}</span><button data-action="inc" data-id="${escapeHtml(id)}" aria-label="Aumentar">+</button></div>`;
}

function productCard(product) {
  const pricing = productPricing(product);
  const id = String(product.id);
  const original = pricing.discount ? pricing.current : Number(product.oldPrice || product.price || 0);
  const showOld = original > pricing.final;
  return `<article class="product-card" data-product-card="${escapeHtml(id)}">
    <div class="product-card-media">
      <a href="${productHref(product)}" aria-label="Ver ${escapeHtml(product.name)}"><img loading="lazy" decoding="async" width="300" height="300" src="${escapeHtml(product.img)}" data-fallback="${escapeHtml(product.images?.slice(1).join('|') || '')}" alt="${escapeHtml(product.name)}"></a>
      ${pricing.discount ? `<span class="discount-badge">-${pricing.discount}%</span>` : product.discountPercent > 0 ? `<span class="discount-badge">-${product.discountPercent}%</span>` : ''}
    </div>
    <div class="product-card-body">
      <div class="product-packaging">${escapeHtml(product.embalagem || 'Unidade')}</div>
      <a class="product-name" href="${productHref(product)}" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</a>
      <div class="product-expiry">${product.validade && formatDateBR(product.validade) ? `Val. ${formatDateBR(product.validade)}` : '&nbsp;'}</div>
      <div class="product-card-footer">
        <div class="product-price">${showOld ? `<s>${fmt(original)}</s>` : ''}<strong>${fmt(pricing.final)}</strong>${pricing.discount ? `<span class="link-discount-note">com ${escapeHtml(pricing.code)}</span>` : ''}</div>
        <div data-control-slot="${escapeHtml(id)}">${quantityControl(product)}</div>
      </div>
    </div>
  </article>`;
}

function couponBanner() {
  if (!state.coupon || !state.scope) return '';
  const segment = state.scope.type === 'category' ? `na categoria ${state.scope.value}` : state.scope.type === 'search' ? `na busca “${state.scope.value}”` : 'somente nas ofertas';
  return `<div class="campaign-coupon"><div><strong>Desconto restrito a esta seleção</strong><span>${escapeHtml(state.coupon.code)} aplica ${state.coupon.percent}% ${escapeHtml(segment)}.</span></div><b>${state.coupon.percent}% OFF</b></div>`;
}

function pageHeader(title, subtitle = '', back = '#/') {
  return `<header class="page-header">${back ? `<a class="back-button" href="${back}" aria-label="Voltar">←</a>` : ''}<div><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div></header>`;
}

function emptyState(title, text) {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span><a class="primary-button" href="#/categorias">Ver categorias</a></div>`;
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
  return `<div class="quick-category-strip">${availableCategories().slice(0, limit).map(([name]) => `<a class="chip" href="#/categoria/${encodeURIComponent(name)}">${escapeHtml(name)}</a>`).join('')}</div>`;
}

function homePage() {
  const offers = state.products.filter(isAvailable).filter(isOfferProduct).sort((a, b) => Number(b.discountPercent || 0) - Number(a.discountPercent || 0)).slice(0, 24);
  const products = state.products.filter(isAvailable).slice(0, 48);
  return `<div class="page-container home-page">
    <section class="campaign-hero"><div><small>Pedido já realizado?</small><h1>Acrescente mais produtos em poucos cliques</h1><p>Escolha os itens e envie direto no WhatsApp. Não precisa preencher cadastro novamente.</p></div><div class="campaign-hero-mark"><div><strong>+ itens</strong><span>no seu pedido</span></div></div></section>
    <section class="content-section"><div class="section-heading"><div><h2>Categorias</h2><p>Encontre rapidamente o que faltou.</p></div><a href="#/categorias">Ver todas</a></div>${categoryStrip()}</section>
    ${offers.length ? `<section class="content-section"><div class="section-heading"><div><h2>Ofertas para aproveitar</h2><p>Produtos disponíveis agora.</p></div><a href="#/ofertas">Ver todas</a></div>${productGrid(offers)}</section>` : ''}
    <section class="content-section"><div class="section-heading"><div><h2>Mais produtos</h2><p>Adicione ao pedido que você já fez.</p></div></div>${productGrid(products)}</section>
  </div>`;
}

function categoriesPage() {
  return `<div class="page-container">${pageHeader('Categorias', 'Escolha somente o setor que deseja enviar.', '#/')}
    <div class="category-grid">${availableCategories().map(([name, product]) => `<a class="category-card" href="#/categoria/${encodeURIComponent(name)}"><img loading="lazy" src="${escapeHtml(product.img)}" alt=""><span><strong>${escapeHtml(name)}</strong></span></a>`).join('')}</div>
  </div>`;
}

function categoryPage(name) {
  const wanted = norm(name);
  const products = state.products.filter(product => isAvailable(product) && norm(product.categoria) === wanted);
  const canonical = products[0]?.categoria || name;
  return `<div class="page-container">${pageHeader(canonical, `${products.length} produto(s) desta categoria`, '#/categorias')}${couponBanner()}${productGrid(products)}</div>`;
}

function offersPage() {
  const products = state.products.filter(isAvailable).filter(isOfferProduct).sort((a, b) => Number(b.discountPercent || 0) - Number(a.discountPercent || 0) || a.name.localeCompare(b.name, 'pt-BR'));
  return `<div class="page-container">${pageHeader('Ofertas', 'Somente produtos que já estão em oferta.', '#/')}${couponBanner()}${productGrid(products)}</div>`;
}

function searchPage(query) {
  const products = searchProducts(state.products, query, isAvailable);
  return `<div class="page-container">${pageHeader(query ? `Busca: ${query}` : 'Busca', `${products.length} resultado(s) somente para este termo`, '#/')}${couponBanner()}${productGrid(products)}</div>`;
}

function scopedBackHref() {
  if (!state.scope) return '#/';
  return scopedRouteHref(state.scope.type, state.scope.value, state.coupon);
}

function productPage(reference) {
  const product = findProductByReference(state, reference);
  if (!product || !isAvailable(product)) return `<div class="page-container">${pageHeader('Produto não encontrado', '', scopedBackHref())}${emptyState('Produto indisponível', 'Escolha outro produto disponível.')}</div>`;
  const pricing = productPricing(product);
  const related = state.products.filter(item => isAvailable(item) && item.id !== product.id && (!state.scope || productEligibleForPromotion(item, { coupon: state.coupon, scope: state.scope }))).slice(0, 12);
  return `<div class="page-container">${pageHeader('Produto', '', scopedBackHref())}${couponBanner()}<article class="product-detail"><div class="product-detail-media"><img id="product-main-image" src="${escapeHtml(product.img)}" data-fallback="${escapeHtml(product.images?.slice(1).join('|') || '')}" alt="${escapeHtml(product.name)}"></div><div class="product-detail-copy">${product.validade && formatDateBR(product.validade) ? `<div class="product-expiry">Validade: ${formatDateBR(product.validade)}</div>` : ''}<h1>${escapeHtml(product.name)}</h1><div class="detail-price">${pricing.current > pricing.final ? `<s>${fmt(pricing.current)}</s>` : ''}<strong>${fmt(pricing.final)}</strong></div>${pricing.discount ? `<div class="offer-note">${escapeHtml(pricing.code)}: ${pricing.discount}% aplicado somente a este segmento.</div>` : ''}<div data-control-slot="${escapeHtml(product.id)}">${quantityControl(product, true)}</div>${product.descricao ? `<p class="product-description">${escapeHtml(product.descricao)}</p>` : ''}<div class="detail-tags">${[product.categoria, product.subcategoria, product.marca].filter(Boolean).map(value => `<span>${escapeHtml(value)}</span>`).join('')}</div></div></article>${related.length ? `<section class="content-section"><div class="section-heading"><div><h2>Mais desta seleção</h2><p>Continuam dentro do mesmo segmento do link.</p></div></div>${productGrid(related)}</section>` : ''}</div>`;
}

function renderRoute() {
  const route = parseRoute();
  state.route = route;
  state.coupon = route.coupon;
  state.scope = scopeFromRoute(route);
  if (route.coupon && !state.scope) {
    state.coupon = null;
    showToast('O desconto precisa estar ligado a uma categoria, oferta ou busca.');
  }
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
    const href = link.dataset.nav === 'categories' ? '#/categorias' : link.dataset.nav === 'offers' ? '#/ofertas' : '#/';
    link.setAttribute('href', href);
  });
  document.querySelectorAll('.brand, .sidebar-brand').forEach(link => link.setAttribute('href', '#/'));
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
    button.setAttribute('aria-label', count > 0 ? `Enviar ${count} item(ns), total ${fmt(pricing.total)}, no WhatsApp` : 'Adicione produtos para enviar no WhatsApp');
  });
  const label = document.querySelector('[data-direct-label]');
  if (label) label.textContent = count > 0 ? 'Enviar no WhatsApp' : 'Adicione produtos';
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
  const codes = [...new Set(pricing.items.map(item => item.discountCode).filter(Boolean))];
  checkoutContent.innerHTML = `<div class="complement-cart-list">${pricing.items.map(item => `<div class="complement-cart-row"><img src="${escapeHtml(item.product.img)}" alt=""><div class="complement-cart-copy"><strong>${escapeHtml(item.product.name)}</strong><small>${fmt(item.unit)} cada · ${fmt(item.total)}${item.discountCode ? ` · ${escapeHtml(item.discountCode)}` : ''}</small></div>${quantityControl(item.product)}</div>`).join('')}</div>
    <div class="checkout-summary-card"><div class="checkout-summary-row"><span>Subtotal</span><strong>${fmt(pricing.subtotal)}</strong></div>${pricing.discount > 0 ? `<div class="checkout-summary-row discount"><span>Descontos ${escapeHtml(codes.join(', '))}</span><strong>− ${fmt(pricing.discount)}</strong></div>` : ''}<div class="checkout-summary-row total"><span>Total do complemento</span><strong>${fmt(pricing.total)}</strong></div></div>
    <div class="complement-checkout-actions"><button class="whatsapp-button" data-action="send-whatsapp">Enviar complemento no WhatsApp</button><button class="clear-complement" data-action="clear-cart">Limpar seleção</button></div><p class="checkout-help">Não é necessário preencher cadastro. A equipe identifica e confirma o complemento pelo WhatsApp.</p>`;
}

function whatsappMessage() {
  const pricing = cartPricing();
  const lines = pricing.items.map(item => {
    const promo = item.discountCode ? ` (${item.discountCode}: ${item.discountPercent}% OFF)` : '';
    return `• ${item.qty}x ${item.product.name}${promo} — ${fmt(item.total)}`;
  });
  const message = [
    'Olá! Quero acrescentar estes produtos ao pedido que já fiz:',
    '',
    ...lines,
    '',
    `Subtotal: ${fmt(pricing.subtotal)}`,
    ...(pricing.discount > 0 ? [`Descontos: -${fmt(pricing.discount)}`] : []),
    `Total do complemento: ${fmt(pricing.total)}`,
    '',
    'Por favor, confirme a inclusão no meu pedido.'
  ].join('\n');
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function sendWhatsapp() {
  const pricing = cartPricing();
  if (!pricing.items.length) {
    showToast('Adicione pelo menos um produto para enviar.');
    return;
  }
  window.open(whatsappMessage(), '_blank', 'noopener');
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
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    event.preventDefault();
    const id = button.dataset.id;
    if (button.dataset.action === 'add') addProduct(id);
    else if (button.dataset.action === 'inc') setQty(id, Number(state.cart[String(id)] || 0) + 1);
    else if (button.dataset.action === 'dec') setQty(id, Number(state.cart[String(id)] || 0) - 1);
    else if (button.dataset.action === 'clear-cart') clearCart();
    else if (button.dataset.action === 'send-whatsapp') sendWhatsapp();
    else if (button.dataset.action === 'open-checkout') openCheckout();
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
    const catalog = await loadCatalog();
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
