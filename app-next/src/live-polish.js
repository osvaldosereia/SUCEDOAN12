import { CONFIG } from './config.js';
import { indexProducts, loadCatalog } from './catalog.js';
import {
  applyProductOffer, isAvailable, kitDiscountPercent, kitIsVisible, kitOriginalPrice
} from './commerce.js';
import { escapeHtml, fmt, readStorage } from './core.js';

const POLISH_VERSION = '2026-07-24-live-polish-v1';
let catalogStatePromise;
let scheduled = false;
let homeExpansionPending = false;
let pendingBasketPosition = null;

function truncate(value, max = 88) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function productRoute(product) {
  return encodeURIComponent(product?.firebaseKey || product?.id || product?.codigo || '');
}

function getCatalogState() {
  if (!catalogStatePromise) {
    catalogStatePromise = loadCatalog().then(catalog => {
      const products = catalog.products.map(product => applyProductOffer(product)).filter(isAvailable);
      return { ...catalog, ...indexProducts(products), products };
    });
  }
  return catalogStatePromise;
}

function favoriteKeys() {
  const saved = readStorage(CONFIG.STORAGE.FAVORITES, []);
  return new Set(Array.isArray(saved) ? saved.map(String) : []);
}

function basketCardHtml(basket) {
  return `<article class="bundle-card">
    <a class="bundle-media" href="#/cesta/${encodeURIComponent(basket.id)}"><img loading="lazy" decoding="async" src="${escapeHtml(basket.imagem)}" alt="${escapeHtml(basket.nome)}"></a>
    <div>
      <a class="bundle-name" href="#/cesta/${encodeURIComponent(basket.id)}">${escapeHtml(basket.nome)}</a>
      <p>${escapeHtml(truncate(basket.descricao))}</p>
      <div class="bundle-price">${Number(basket.precoOriginal || 0) > Number(basket.preco || 0) ? `<s>${fmt(basket.precoOriginal)}</s>` : ''}<strong>${basket.preco ? fmt(basket.preco) : 'Ver itens'}</strong></div>
      <a class="secondary-button" href="#/cesta/${encodeURIComponent(basket.id)}">Ver produtos</a>
    </div>
  </article>`;
}

function kitCardHtml(state, kit, favorites) {
  const original = kitOriginalPrice(state, kit);
  const discount = kitDiscountPercent(state, kit);
  const favoriteKey = `kit:${kit.id}`;
  const active = favorites.has(favoriteKey);
  return `<article class="bundle-card">
    <div class="bundle-media-wrap">
      <a class="bundle-media" href="#/kit/${encodeURIComponent(kit.id)}"><img loading="lazy" decoding="async" src="${escapeHtml(kit.imagem)}" alt="${escapeHtml(kit.nome)}"></a>
      <button class="favorite-button ${active ? 'active' : ''}" data-action="favorite" data-id="${escapeHtml(kit.id)}" data-kind="kit" aria-label="${active ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}" aria-pressed="${active}">♡</button>
      ${discount ? `<span class="discount-badge">-${discount}%</span>` : ''}
    </div>
    <div>
      <a class="bundle-name" href="#/kit/${encodeURIComponent(kit.id)}">${escapeHtml(kit.nome)}</a>
      <p>${escapeHtml(truncate(kit.descricao))}</p>
      <div class="bundle-price">${original > Number(kit.preco || 0) ? `<s>${fmt(original)}</s>` : ''}<strong>${fmt(kit.preco)}</strong></div>
      <div class="bundle-actions"><a class="secondary-button" href="#/kit/${encodeURIComponent(kit.id)}">Ver produtos</a><button class="primary-button" data-action="add-kit" data-id="${escapeHtml(kit.id)}">Adicionar</button></div>
    </div>
  </article>`;
}

function sectionByTitle(page, fragment) {
  const normalized = fragment.toLowerCase();
  return [...page.querySelectorAll(':scope > .content-section')].find(section =>
    String(section.querySelector('.section-heading h2')?.textContent || '').trim().toLowerCase().includes(normalized)
  );
}

function bindBundleImageFallbacks(root) {
  root?.querySelectorAll?.('.home-bundle-carousel img:not([data-live-fallback-bound])').forEach(image => {
    image.dataset.liveFallbackBound = 'true';
    image.addEventListener('error', () => { image.src = '../img/logoantonia5.png'; }, { once: true });
  });
}

async function expandHomeBundles() {
  const page = document.querySelector('.home-page');
  if (!page || homeExpansionPending) return;
  homeExpansionPending = true;
  try {
    const state = await getCatalogState();
    if (!page.isConnected || !document.querySelector('.home-page')) return;
    const favorites = favoriteKeys();
    const baskets = (state.baskets || []).slice(0, 30);
    const kits = (state.kits || []).filter(kit => kitIsVisible(state, kit)).slice(0, 30);
    const targets = [
      { section: sectionByTitle(page, 'cestas básicas'), items: baskets, kind: 'baskets' },
      { section: sectionByTitle(page, 'kits promocionais'), items: kits, kind: 'kits' }
    ];

    targets.forEach(({ section, items, kind }) => {
      const grid = section?.querySelector('.bundle-grid');
      if (!grid || !items.length) return;
      const signature = `${POLISH_VERSION}:${kind}:${items.map(item => item.id).join('|')}`;
      if (grid.dataset.livePolishSignature === signature) return;
      grid.classList.add('home-bundle-carousel');
      grid.setAttribute('aria-label', kind === 'kits' ? 'Carrossel de kits promocionais' : 'Carrossel de cestas básicas');
      grid.innerHTML = kind === 'kits'
        ? items.map(kit => kitCardHtml(state, kit, favorites)).join('')
        : items.map(basketCardHtml).join('');
      grid.dataset.livePolishSignature = signature;
      bindBundleImageFallbacks(grid);
    });
  } catch (error) {
    console.warn('Não foi possível ampliar os carrosséis de cestas e kits:', error);
  } finally {
    homeExpansionPending = false;
  }
}

function removeBundleCardNoise(root = document) {
  root.querySelectorAll('.bundle-product-badge,.bundle-product-context').forEach(element => element.remove());
}

function hideEmptyFavoriteCounts(root = document) {
  root.querySelectorAll('[data-favorite-count]').forEach(element => {
    const count = Number(String(element.textContent || '').replace(/\D/g, '') || 0);
    element.hidden = count <= 0;
  });
}

function closeBundleConfirmationAndOpenOffers(event) {
  const button = event.target.closest('[data-action="bundle-confirm-continue"]');
  if (!button) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  const overlay = document.getElementById('bundle-confirm-overlay');
  overlay?.classList.remove('show');
  overlay?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('bundle-confirm-open');
  location.hash = '#/ofertas';
  return true;
}

function rememberBasketPosition(button) {
  const app = document.getElementById('app');
  if (!app) return;
  const productId = String(button.dataset.id || '');
  const card = button.closest('[data-bundle-product]');
  pendingBasketPosition = {
    productId,
    top: card?.getBoundingClientRect().top ?? null,
    scrollTop: app.scrollTop,
    expiresAt: Date.now() + 1400
  };
  [0, 40, 100, 180, 320, 520, 850].forEach(delay => setTimeout(restoreBasketPosition, delay));
}

function restoreBasketPosition() {
  if (!pendingBasketPosition) return;
  if (Date.now() > pendingBasketPosition.expiresAt) {
    pendingBasketPosition = null;
    return;
  }
  const app = document.getElementById('app');
  if (!app) return;
  const id = pendingBasketPosition.productId;
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
  const anchor = document.querySelector(`[data-bundle-product="${escaped}"]`);
  if (anchor && pendingBasketPosition.top !== null) {
    app.scrollTop += anchor.getBoundingClientRect().top - pendingBasketPosition.top;
  } else {
    app.scrollTop = pendingBasketPosition.scrollTop;
  }
}

function handleCaptureClick(event) {
  if (closeBundleConfirmationAndOpenOffers(event)) return;
  const button = event.target.closest('[data-action="basket-inc"],[data-action="basket-dec"]');
  if (button) rememberBasketPosition(button);
}

function applyPolish() {
  removeBundleCardNoise();
  hideEmptyFavoriteCounts();
  restoreBasketPosition();
  expandHomeBundles();
}

function schedulePolish() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    applyPolish();
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', handleCaptureClick, true);
  const observer = new MutationObserver(schedulePolish);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.addEventListener('hashchange', schedulePolish);
  window.addEventListener('DOMContentLoaded', schedulePolish);
  schedulePolish();
}
