import { CONFIG } from './config.js';
import { createEventBus, createInitialState, createRouter, createStore, escapeHtml, fmt } from './core.js';
import { indexProducts, loadCatalog } from './catalog.js';
import { applyProductOffer, calculateCartPricing, CartService, resolveBundleRows } from './commerce.js';
import { basketDraftTotal } from './basket-pricing.js';
import { createPersonalization } from './personalization.js';
import { createUI } from './ui.js';
import { createCheckout } from './checkout.js';
import { processOrderQueue } from './integrations.js';

const events = createEventBus();
const store = createStore(createInitialState());
const cart = new CartService(store, events);
cart.load();
const personalization = createPersonalization(store, events);
const ui = createUI({ store, cart, events, personalization });
const checkout = createCheckout({ store, cart, events, ui, personalization });
const router = createRouter(route => {
  if (!store.getState().isReady) return;
  ui.renderRoute(route);
});

let lastBundleAddition = null;

function currentRoute() {
  return router.current();
}

function rerender() {
  ui.renderRoute(currentRoute());
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function cartSnapshot() {
  const state = store.getState();
  return {
    cart: { ...state.cart },
    cartOrder: [...state.cartOrder],
    basketCustomizations: clonePlain(state.basketCustomizations),
    virtualFees: clonePlain(state.virtualFees)
  };
}

function restoreCartSnapshot(snapshot) {
  if (!snapshot) return;
  store.mutate(state => {
    state.cart = { ...(snapshot.cart || {}) };
    state.cartOrder = [...(snapshot.cartOrder || [])];
    state.basketCustomizations = clonePlain(snapshot.basketCustomizations);
    state.virtualFees = clonePlain(snapshot.virtualFees);
  }, 'cart:bundle-undo');
  cart.persist();
  ui.updateShell();
  if (document.getElementById('checkout-drawer')?.classList.contains('open')) checkout.render();
}

function pulseCartTargets() {
  const targets = [document.getElementById('open-cart'), document.getElementById('bottom-cart')].filter(Boolean);
  targets.forEach(target => {
    target.classList.remove('bundle-added-pulse');
    void target.offsetWidth;
    target.classList.add('bundle-added-pulse');
  });
  setTimeout(() => targets.forEach(target => target.classList.remove('bundle-added-pulse')), 850);
}

function closeBundleConfirmation() {
  const overlay = document.getElementById('bundle-confirm-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('bundle-confirm-open');
}

function openBundleConfirmation({ type, bundle, quantities = null, snapshot, customized = false }) {
  if (!bundle) return;
  const state = store.getState();
  const rows = resolveBundleRows(state, bundle);
  const selected = quantities || Object.fromEntries(rows.map(row => [String(row.product.id), Number(row.qty || 0)]));
  const selectedEntries = Object.entries(selected).filter(([, qty]) => Number(qty || 0) > 0);
  const productCount = selectedEntries.length;
  const unitCount = selectedEntries.reduce((sum, [, qty]) => sum + Number(qty || 0), 0);
  const value = type === 'kit'
    ? Number(bundle.preco || 0)
    : basketDraftTotal(state.productMap, bundle, rows, selected);
  const pricing = calculateCartPricing(state);
  const missing = Math.max(Number(CONFIG.MIN_ORDER || 0) - Number(pricing.subtotalBefore || 0), 0);
  const kindLabel = type === 'kit' ? 'Kit promocional' : (customized ? 'Cesta personalizada' : 'Cesta básica');
  const title = type === 'kit' ? 'Kit adicionado à sua compra' : 'Cesta adicionada à sua compra';
  const unitText = `${productCount} ${productCount === 1 ? 'produto' : 'produtos'} · ${unitCount} ${unitCount === 1 ? 'unidade' : 'unidades'}`;
  const progressText = missing > 0
    ? `Faltam <strong>${fmt(missing)}</strong> para atingir o pedido mínimo.`
    : '<strong>Pedido mínimo atingido.</strong> Você já pode revisar e enviar a compra.';
  let overlay = document.getElementById('bundle-confirm-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'bundle-confirm-overlay';
    overlay.className = 'bundle-confirm-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `<section class="bundle-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="bundle-confirm-title">
    <button class="bundle-confirm-close" type="button" data-action="bundle-confirm-close" aria-label="Fechar">×</button>
    <div class="bundle-confirm-success" aria-hidden="true">✓</div>
    <div class="bundle-confirm-heading">
      <span>${escapeHtml(kindLabel)}</span>
      <h2 id="bundle-confirm-title">${escapeHtml(title)}</h2>
      <p>O item foi incluído corretamente. Escolha o próximo passo.</p>
    </div>
    <div class="bundle-confirm-summary">
      <div class="bundle-confirm-media"><img src="${escapeHtml(bundle.imagem || '../img/logoantonia5.png')}" alt=""></div>
      <div class="bundle-confirm-copy">
        <strong>${escapeHtml(bundle.nome || kindLabel)}</strong>
        <span>${escapeHtml(unitText)}</span>
        <div><small>Valor adicionado</small><b>${fmt(value)}</b></div>
      </div>
    </div>
    <div class="bundle-confirm-progress">${progressText}</div>
    <div class="bundle-confirm-actions">
      <button class="primary-button bundle-confirm-checkout" type="button" data-action="bundle-confirm-checkout">Ver minha compra</button>
      <button class="secondary-button" type="button" data-action="bundle-confirm-continue">Continuar comprando</button>
    </div>
    <button class="bundle-confirm-undo" type="button" data-action="bundle-confirm-undo">Desfazer adição</button>
  </section>`;

  const image = overlay.querySelector('.bundle-confirm-media img');
  image?.addEventListener('error', () => { image.src = '../img/logoantonia5.png'; }, { once: true });
  lastBundleAddition = { snapshot, name: bundle.nome || kindLabel };
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('bundle-confirm-open');
  pulseCartTargets();
  requestAnimationFrame(() => overlay.querySelector('[data-action="bundle-confirm-checkout"]')?.focus());
}

function showPersonalizationPanel() {
  let overlay = document.getElementById('personalization-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'personalization-overlay';
    overlay.className = 'personalization-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `<section class="personalization-panel" role="dialog" aria-modal="true" aria-labelledby="personalization-title"><header><div><h2 id="personalization-title">Privacidade e personalização</h2><p>Os dados ficam somente neste navegador.</p></div><button data-action="personalization-close" aria-label="Fechar">×</button></header><div class="personalization-status"><span>Personalização</span><strong>${personalization.enabled() ? 'Ativada' : 'Desativada'}</strong></div><p>Quando ativada, a loja usa produtos vistos, favoritos, carrinho e pedidos enviados para organizar sugestões. Nome, CPF, telefone, e-mail e endereço não entram nesse perfil.</p><div class="panel-actions">${personalization.enabled() ? '<button class="secondary-button" data-action="personalization-clear">Apagar histórico</button><button class="danger-button" data-action="personalization-disable">Desativar</button>' : '<button class="primary-button" data-action="personalization-enable">Ativar personalização</button>'}</div></section>`;
  overlay.classList.add('show');
}

function closePersonalizationPanel() {
  document.getElementById('personalization-overlay')?.classList.remove('show');
}

function showConsentIfNeeded() {
  if (personalization.consent() !== null || document.getElementById('personalization-consent')) return;
  const element = document.createElement('section');
  element.id = 'personalization-consent';
  element.className = 'personalization-consent';
  element.innerHTML = `<div><strong>Podemos te indicar produtos e ofertas?</strong><span>Usamos somente a navegação deste aparelho.</span></div><div><button class="secondary-button" data-action="personalization-decline">Agora não</button><button class="primary-button" data-action="personalization-accept">Sim, quero</button></div>`;
  document.body.appendChild(element);
}

function findBasket(id) {
  return store.getState().baskets.find(item => String(item.id) === String(id));
}

function findKit(id) {
  return store.getState().kits.find(item => String(item.id) === String(id) || String(item.codigo) === String(id));
}

function setBasketDraftQty(basketId, productId, delta) {
  const state = store.getState();
  const basket = findBasket(basketId);
  if (!basket) return;
  const key = `basket:${basket.id}`;
  const rows = resolveBundleRows(state, basket);
  const defaultMap = Object.fromEntries(rows.map(row => [String(row.product.id), Number(row.qty)]));
  store.mutate(current => {
    const draft = current.basketDrafts[key] || { ...defaultMap };
    const product = current.productMap.get(String(productId));
    const currentQty = Number(draft[String(productId)] || 0);
    draft[String(productId)] = Math.max(0, Math.min(Number(product?.stock || 0), currentQty + delta));
    current.basketDrafts[key] = draft;
  }, 'basket:draft');
  cart.persist();
  rerender();
}

async function handleAction(button) {
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (!action) return;
  if (['lookup-client', 'send-order', 'apply-coupon', 'remove-coupon'].includes(action)) {
    await checkout.handleAction(action, button);
    return;
  }
  if (action === 'bundle-confirm-close' || action === 'bundle-confirm-continue') {
    closeBundleConfirmation();
    return;
  }
  if (action === 'bundle-confirm-checkout') {
    closeBundleConfirmation();
    checkout.open();
    return;
  }
  if (action === 'bundle-confirm-undo') {
    restoreCartSnapshot(lastBundleAddition?.snapshot);
    const name = lastBundleAddition?.name || 'Item';
    lastBundleAddition = null;
    closeBundleConfirmation();
    ui.showToast(`${name}: adição desfeita.`);
    return;
  }
  if (action === 'add') { cart.add(id); ui.showToast('Produto adicionado.'); ui.updateShell(); return; }
  if (action === 'inc') { cart.add(id); ui.updateShell(); if (document.getElementById('checkout-drawer').classList.contains('open')) checkout.render(); return; }
  if (action === 'dec') { cart.setQty(id, Number(store.getState().cart[id] || 0) - 1); ui.updateShell(); if (document.getElementById('checkout-drawer').classList.contains('open')) checkout.render(); return; }
  if (action === 'favorite') { const active = cart.toggleFavorite(id, button.dataset.kind); ui.showToast(active ? 'Salvo nos favoritos.' : 'Removido dos favoritos.'); if (currentRoute().name === 'favorites') rerender(); return; }
  if (action === 'clear-cart') { cart.clear(); checkout.render(); ui.showToast('Compra limpa.'); return; }
  if (action === 'add-kit') {
    const kit = findKit(id);
    const snapshot = cartSnapshot();
    const result = cart.addKit(kit);
    if (!result.ok) { ui.showToast(result.message); return; }
    ui.updateShell();
    openBundleConfirmation({ type: 'kit', bundle: kit, snapshot });
    return;
  }
  if (action === 'add-basket') {
    const basket = findBasket(id);
    const snapshot = cartSnapshot();
    const result = cart.addBasket(basket);
    if (!result.ok) { ui.showToast(result.message); return; }
    ui.updateShell();
    openBundleConfirmation({ type: 'basket', bundle: basket, snapshot });
    return;
  }
  if (action === 'add-basket-custom') {
    const basket = findBasket(id);
    const rows = resolveBundleRows(store.getState(), basket);
    const defaultMap = Object.fromEntries(rows.map(row => [String(row.product.id), Number(row.qty || 0)]));
    const draft = store.getState().basketDrafts[`basket:${id}`] || defaultMap;
    const customized = rows.some(row => Number(draft[String(row.product.id)] || 0) !== Number(row.qty || 0));
    const snapshot = cartSnapshot();
    const result = cart.addBasket(basket, draft);
    if (!result.ok) { ui.showToast(result.message); return; }
    ui.updateShell();
    openBundleConfirmation({ type: 'basket', bundle: basket, quantities: draft, snapshot, customized });
    return;
  }
  if (action === 'basket-inc') { setBasketDraftQty(button.dataset.basketId, id, 1); return; }
  if (action === 'basket-dec') { setBasketDraftQty(button.dataset.basketId, id, -1); return; }
  if (action === 'image') { const main = document.getElementById('product-main-image'); if (main) main.src = button.dataset.src; return; }
  if (action === 'personalization-settings') { showPersonalizationPanel(); return; }
  if (action === 'personalization-close') { closePersonalizationPanel(); return; }
  if (action === 'personalization-enable' || action === 'personalization-accept') { personalization.setConsent(true); closePersonalizationPanel(); document.getElementById('personalization-consent')?.remove(); rerender(); ui.showToast('Personalização ativada.'); return; }
  if (action === 'personalization-disable' || action === 'personalization-decline') { personalization.setConsent(false); closePersonalizationPanel(); document.getElementById('personalization-consent')?.remove(); rerender(); ui.showToast('Personalização desativada.'); return; }
  if (action === 'personalization-clear') { personalization.clearHistory(); closePersonalizationPanel(); rerender(); ui.showToast('Histórico apagado.'); }
}

function updateActiveNavigation(route) {
  const routeName = route?.name || 'home';
  let active = routeName;
  if (['product', 'basket', 'baskets', 'kit', 'kits', 'routine', 'info'].includes(routeName)) active = 'home';
  if (['category', 'subcategory', 'brand', 'categories'].includes(routeName)) active = 'categories';
  document.querySelectorAll('[data-nav]').forEach(link => link.classList.toggle('active', link.dataset.nav === active));
}

function bindEvents() {
  document.addEventListener('click', async event => {
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
      event.preventDefault();
      await handleAction(actionButton);
      return;
    }
    if (event.target === document.getElementById('drawer-overlay')) ui.closeDrawers();
    if (event.target === document.getElementById('personalization-overlay')) closePersonalizationPanel();
    if (event.target === document.getElementById('bundle-confirm-overlay')) closeBundleConfirmation();
    if (event.target.closest('#menu-drawer a')) ui.closeDrawers();
  });
  document.addEventListener('input', event => checkout.handleInput(event));
  document.addEventListener('change', event => checkout.handleInput(event));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      ui.closeDrawers();
      closePersonalizationPanel();
      closeBundleConfirmation();
    }
  });
  document.getElementById('open-cart').addEventListener('click', checkout.open);
  document.getElementById('bottom-cart').addEventListener('click', checkout.open);
  document.getElementById('open-menu').addEventListener('click', ui.renderMenu);
  document.querySelectorAll('[data-close-drawer]').forEach(button => button.addEventListener('click', ui.closeDrawers));
  document.getElementById('drawer-overlay').addEventListener('click', ui.closeDrawers);

  const search = document.getElementById('search-input');
  let timer;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    const query = search.value.trim();
    document.getElementById('search-clear').hidden = !query;
    timer = setTimeout(() => {
      if (query) router.navigate(`#/busca/${encodeURIComponent(query)}`);
      else if (currentRoute().name === 'search') router.navigate('#/');
    }, 250);
  });
  document.getElementById('search-form').addEventListener('submit', event => {
    event.preventDefault();
    const query = search.value.trim();
    if (query) router.navigate(`#/busca/${encodeURIComponent(query)}`);
  });
  document.getElementById('search-clear').addEventListener('click', () => {
    search.value = '';
    document.getElementById('search-clear').hidden = true;
    router.navigate('#/');
  });

  events.on('route:rendered', ({ route }) => {
    if (route.name === 'search') search.value = route.params.segments.join(' ');
    updateActiveNavigation(route);
  });
}

async function checkPreviewVersion() {
  try {
    const response = await fetch(`${CONFIG.ENDPOINTS.APP_VERSION}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    document.documentElement.dataset.catalogAppVersion = String(data.version || data.build || '');
  } catch {}
}

async function init() {
  bindEvents();
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading-shell"><div></div><div></div><div></div></div>';
  try {
    const catalog = await loadCatalog();
    const products = catalog.products.map(product => applyProductOffer(product));
    const indexes = indexProducts(products);
    store.mutate(state => {
      Object.assign(state, catalog, indexes, { products, isReady: true });
    }, 'catalog:ready');
    cart.rebuildVirtualFees();
    ui.updateShell();
    router.start();
    setTimeout(showConsentIfNeeded, 900);
    setTimeout(processOrderQueue, 900);
    checkPreviewVersion();
  } catch (error) {
    console.error(error);
    app.innerHTML = `<div class="page-container"><div class="empty-state"><strong>Não conseguimos carregar o catálogo.</strong><span>${escapeHtml(error.message || 'Tente novamente em alguns instantes.')}</span></div></div>`;
  } finally {
    document.documentElement.classList.remove('booting');
  }
}

init();
