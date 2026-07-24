import { CONFIG } from './config.js';
import { indexProducts, loadCatalog } from './catalog.js';
import {
  applyProductOffer, isAvailable, kitDiscountPercent, kitIsVisible, kitOriginalPrice
} from './commerce.js';
import { escapeHtml, fmt, readStorage } from './core.js';

const POLISH_VERSION = '2026-07-24-live-polish-v2';
const carouselState = new WeakMap();
let catalogStatePromise;
let scheduled = false;
let homePreparing = false;
let pendingBasketPosition = null;
let homeObserver = null;

function truncate(value, max = 88) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
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

function optimizedImage(src, alt) {
  return `<img loading="lazy" decoding="async" fetchpriority="low" width="320" height="320" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`;
}

function basketCardHtml(basket) {
  return `<article class="bundle-card">
    <a class="bundle-media" href="#/cesta/${encodeURIComponent(basket.id)}">${optimizedImage(basket.imagem, basket.nome)}</a>
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
      <a class="bundle-media" href="#/kit/${encodeURIComponent(kit.id)}">${optimizedImage(kit.imagem, kit.nome)}</a>
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
  root?.querySelectorAll?.('img:not([data-live-fallback-bound])').forEach(image => {
    image.dataset.liveFallbackBound = 'true';
    image.addEventListener('error', () => { image.src = '../img/logoantonia5.png'; }, { once: true });
  });
}

function cardsPerBatch() {
  return matchMedia('(max-width:767px)').matches ? 6 : 8;
}

function appendCarouselBatch(grid) {
  const info = carouselState.get(grid);
  if (!info || info.rendered >= info.items.length || info.appending) return;
  info.appending = true;
  const amount = cardsPerBatch();
  const next = info.items.slice(info.rendered, info.rendered + amount);
  const html = info.kind === 'kits'
    ? next.map(item => kitCardHtml(info.catalog, item, info.favorites)).join('')
    : next.map(basketCardHtml).join('');
  grid.insertAdjacentHTML('beforeend', html);
  info.rendered += next.length;
  grid.dataset.renderedItems = String(info.rendered);
  grid.dataset.totalItems = String(info.items.length);
  bindBundleImageFallbacks(grid);
  info.appending = false;
}

function onCarouselScroll(event) {
  const grid = event.currentTarget;
  if (grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - Math.max(220, grid.clientWidth * .65)) {
    appendCarouselBatch(grid);
  }
}

function initializeCarousel(section, items, kind, catalog, favorites) {
  const grid = section?.querySelector('.bundle-grid');
  if (!grid || !items.length || grid.dataset.progressiveCarousel === POLISH_VERSION) return;
  grid.classList.add('home-bundle-carousel');
  grid.setAttribute('aria-label', kind === 'kits' ? 'Carrossel de kits promocionais' : 'Carrossel de cestas básicas');
  grid.dataset.progressiveCarousel = POLISH_VERSION;
  grid.innerHTML = '';
  carouselState.set(grid, { items, kind, catalog, favorites, rendered: 0, appending: false });
  appendCarouselBatch(grid);
  grid.addEventListener('scroll', onCarouselScroll, { passive: true });
}

async function initializeHomeSection(section, kind) {
  if (!section || section.dataset.progressiveReady === 'true') return;
  section.dataset.progressiveReady = 'true';
  try {
    const catalog = await getCatalogState();
    if (!section.isConnected || !document.querySelector('.home-page')) return;
    const favorites = favoriteKeys();
    const items = kind === 'kits'
      ? (catalog.kits || []).filter(kit => kitIsVisible(catalog, kit)).slice(0, 30)
      : (catalog.baskets || []).slice(0, 30);
    initializeCarousel(section, items, kind, catalog, favorites);
  } catch (error) {
    console.warn(`Não foi possível preparar o carrossel de ${kind}:`, error);
    section.removeAttribute('data-progressive-ready');
  }
}

function observeHomeSection(section, kind) {
  if (!section || section.dataset.progressiveObserved === 'true') return;
  section.dataset.progressiveObserved = 'true';
  section.dataset.progressiveKind = kind;
  if ('IntersectionObserver' in window) {
    if (!homeObserver) {
      homeObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          homeObserver.unobserve(entry.target);
          initializeHomeSection(entry.target, entry.target.dataset.progressiveKind);
        });
      }, { root: document.getElementById('app'), rootMargin: '700px 0px', threshold: .01 });
    }
    homeObserver.observe(section);
  } else {
    setTimeout(() => initializeHomeSection(section, kind), kind === 'baskets' ? 500 : 1200);
  }
}

function prepareHomeBundles() {
  const page = document.querySelector('.home-page');
  if (!page || homePreparing) return;
  homePreparing = true;
  try {
    observeHomeSection(sectionByTitle(page, 'cestas básicas'), 'baskets');
    observeHomeSection(sectionByTitle(page, 'kits promocionais'), 'kits');
  } finally {
    homePreparing = false;
  }
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
    expiresAt: Date.now() + 1500
  };
  [0, 50, 120, 240, 420, 700, 1050].forEach(delay => setTimeout(restoreBasketPosition, delay));
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
  hideEmptyFavoriteCounts();
  restoreBasketPosition();
  prepareHomeBundles();
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
  const app = document.getElementById('app');
  if (app) new MutationObserver(schedulePolish).observe(app, { childList: true });
  window.addEventListener('hashchange', schedulePolish);
  window.addEventListener('DOMContentLoaded', schedulePolish);
  schedulePolish();
}