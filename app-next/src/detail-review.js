import { CONFIG } from './config.js';
import { indexProducts, loadCatalog } from './catalog.js';
import {
  applyProductOffer, kitDiscountPercent, kitOriginalPrice, resolveBundleRows
} from './commerce.js';
import { escapeHtml, fmt, formatDateBR, readStorage } from './core.js';
import {
  basketDefaultProductTotal,
  basketDraftTotal,
  basketFixedAdjustment
} from './basket-pricing.js';

const REVIEW_VERSION = '2026-07-24-detail-v3';
let catalogStatePromise;
let scheduled = false;

function productRoute(product) {
  return encodeURIComponent(product?.firebaseKey || product?.id || product?.codigo || '');
}

function getCatalogState() {
  if (!catalogStatePromise) {
    catalogStatePromise = loadCatalog().then(catalog => {
      const products = catalog.products.map(product => applyProductOffer(product));
      return { ...catalog, ...indexProducts(products), products };
    });
  }
  return catalogStatePromise;
}

function currentRoute() {
  const clean = String(location.hash || '').replace(/^#\/?/, '').split('?')[0];
  const parts = clean.split('/').filter(Boolean);
  return {
    name: parts[0] || '',
    id: decodeURIComponent(parts.slice(1).join('/'))
  };
}

function basketRouteId() {
  const route = currentRoute();
  return route.name === 'cesta' ? route.id : '';
}

function kitRouteId() {
  const route = currentRoute();
  return route.name === 'kit' ? route.id : '';
}

function imageFallbackValue(product) {
  return (product?.images || [])
    .map(value => String(value || '').trim())
    .filter(value => value && value !== product?.img)
    .join('|');
}

function bindDetailImageFallbacks(root) {
  root?.querySelectorAll?.('img[data-detail-fallback]:not([data-detail-fallback-bound])').forEach(image => {
    image.dataset.detailFallbackBound = 'true';
    image.addEventListener('error', () => {
      const candidates = String(image.dataset.detailFallback || '')
        .split('|')
        .map(value => value.trim())
        .filter(Boolean);
      const next = candidates.shift();
      image.dataset.detailFallback = candidates.join('|');
      image.src = next || '../img/logoantonia5.png';
    });
  });
}

function savedBasketDraft(basket, rows) {
  const saved = readStorage(CONFIG.STORAGE.CART, {}) || {};
  const stored = saved?.basketDrafts?.[`basket:${basket.id}`];
  return rows.reduce((draft, row) => {
    const id = String(row.product.id);
    draft[id] = Math.max(0, Number(stored?.[id] ?? row.qty) || 0);
    return draft;
  }, {});
}

function quantityMapsDiffer(rows, draft) {
  return rows.some(row => Number(draft[String(row.product.id)] || 0) !== Number(row.qty || 0));
}

function bundleProductCardHtml({ bundle, row, draft = null, type = 'basket' }) {
  const product = row.product;
  const id = String(product.id);
  const qty = type === 'basket' ? Number(draft?.[id] || 0) : Number(row.qty || 0);
  const expiry = product.validade && formatDateBR(product.validade)
    ? `<div class="product-expiry">Val. ${escapeHtml(formatDateBR(product.validade))}</div>`
    : '';
  const controls = type === 'basket'
    ? `<div class="qty-control bundle-product-qty">
        <button data-action="basket-dec" data-basket-id="${escapeHtml(bundle.id)}" data-id="${escapeHtml(id)}" aria-label="Diminuir ${escapeHtml(product.name)}">−</button>
        <span>${qty}</span>
        <button data-action="basket-inc" data-basket-id="${escapeHtml(bundle.id)}" data-id="${escapeHtml(id)}" aria-label="Aumentar ${escapeHtml(product.name)}">+</button>
      </div>`
    : `<button class="qty-add bundle-product-add" data-action="add" data-id="${escapeHtml(id)}" aria-label="Adicionar ${escapeHtml(product.name)} avulso">+</button>`;

  return `<article class="product-card bundle-product-card" data-bundle-product="${escapeHtml(id)}">
    <div class="product-card-media bundle-product-media">
      <a href="#/produto/${productRoute(product)}" aria-label="Abrir ${escapeHtml(product.name)}">
        <img loading="lazy" decoding="async" fetchpriority="low" width="300" height="300" src="${escapeHtml(product.img)}" data-detail-fallback="${escapeHtml(imageFallbackValue(product))}" alt="">
      </a>
    </div>
    <div class="product-card-body">
      ${product.embalagem ? `<div class="product-packaging">${escapeHtml(product.embalagem)}</div>` : '<div class="product-packaging">&nbsp;</div>'}
      <a class="product-name" href="#/produto/${productRoute(product)}" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</a>
      ${expiry}
      <div class="product-card-footer">
        <div class="product-price"><strong>${fmt(product.price)}</strong><small>cada</small></div>
        ${controls}
      </div>
    </div>
  </article>`;
}

async function reviewBasketPage() {
  const id = basketRouteId();
  if (!id) return;
  const page = document.querySelector('.page-container');
  if (!page || page.dataset.basketReview === REVIEW_VERSION || page.dataset.basketReviewPending === 'true') return;
  page.dataset.basketReviewPending = 'true';

  try {
    const state = await getCatalogState();
    if (!page.isConnected || basketRouteId() !== id) return;
    const basket = state.baskets.find(item => String(item.id) === String(id));
    if (!basket) return;
    const rows = resolveBundleRows(state, basket);
    if (!rows.length) return;
    const draft = savedBasketDraft(basket, rows);
    const defaultProductTotal = basketDefaultProductTotal(rows);
    const hiddenAdjustment = basketFixedAdjustment(basket, rows);
    const finalTotal = basketDraftTotal(state.productMap, basket, rows, draft);
    const changed = quantityMapsDiffer(rows, draft);
    const header = page.querySelector('.page-header')?.outerHTML || '';
    const banner = page.querySelector('.banner-zone')?.outerHTML || '';
    const officialPrice = Number(basket.preco || 0) || defaultProductTotal;

    page.innerHTML = `${header}${banner}
      <article class="basket-detail-hero">
        <div class="basket-detail-media"><img decoding="async" fetchpriority="high" width="520" height="520" src="${escapeHtml(basket.imagem)}" alt="${escapeHtml(basket.nome)}"></div>
        <div class="basket-detail-copy">
          <span class="basket-detail-kicker">Cesta básica</span>
          <h1>${escapeHtml(basket.nome)}</h1>
          <p>${escapeHtml(basket.descricao || 'Cesta pronta para facilitar sua compra.')}</p>
          <div class="basket-detail-price"><small>Valor da cesta</small><strong>${fmt(officialPrice)}</strong></div>
          <button class="primary-button basket-standard-button" data-action="add-basket" data-id="${escapeHtml(basket.id)}">Adicionar cesta padrão</button>
        </div>
      </article>
      <section class="content-section basket-products-section">
        <div class="section-heading"><div><h2>Produtos da cesta</h2><p>Ajuste as quantidades antes de adicionar.</p></div></div>
        <div class="bundle-products-grid basket-products-grid">${rows.map(row => bundleProductCardHtml({ bundle: basket, row, draft, type: 'basket' })).join('')}</div>
      </section>
      <section class="basket-total-card">
        <div class="basket-total-copy">
          <span class="basket-total-status">${changed ? 'Cesta alterada' : 'Cesta padrão'}</span>
          <h2>Valor final da cesta</h2>
          <p>O valor próprio da cesta é mantido internamente e acompanha as alterações feitas nos produtos.</p>
        </div>
        <div class="basket-total-action">
          <strong>${fmt(finalTotal)}</strong>
          <button class="primary-button" data-action="add-basket-custom" data-id="${escapeHtml(basket.id)}">Adicionar esta seleção</button>
        </div>
      </section>`;

    page.dataset.basketReview = REVIEW_VERSION;
    page.removeAttribute('data-basket-review-pending');
    page.dataset.basketDefaultProducts = String(defaultProductTotal);
    page.dataset.basketHiddenAdjustment = String(hiddenAdjustment);
    bindDetailImageFallbacks(page);
  } catch (error) {
    console.warn('Não foi possível aplicar a revisão visual da cesta:', error);
    page?.removeAttribute('data-basket-review-pending');
  }
}

async function reviewKitPage() {
  const id = kitRouteId();
  if (!id) return;
  const page = document.querySelector('.page-container');
  if (!page || page.dataset.kitReview === REVIEW_VERSION || page.dataset.kitReviewPending === 'true') return;
  page.dataset.kitReviewPending = 'true';

  try {
    const state = await getCatalogState();
    if (!page.isConnected || kitRouteId() !== id) return;
    const kit = state.kits.find(item => String(item.id) === String(id) || String(item.codigo) === String(id));
    if (!kit) return;
    const rows = resolveBundleRows(state, kit);
    if (!rows.length) return;
    const header = page.querySelector('.page-header')?.outerHTML || '';
    const banner = page.querySelector('.banner-zone')?.outerHTML || '';
    const original = kitOriginalPrice(state, kit);
    const discount = kitDiscountPercent(state, kit);

    page.innerHTML = `${header}${banner}
      <article class="basket-detail-hero kit-detail-review-hero">
        <div class="basket-detail-media"><img decoding="async" fetchpriority="high" width="520" height="520" src="${escapeHtml(kit.imagem)}" alt="${escapeHtml(kit.nome)}"></div>
        <div class="basket-detail-copy">
          <span class="basket-detail-kicker">Kit promocional</span>
          <h1>${escapeHtml(kit.nome)}</h1>
          <p>${escapeHtml(kit.descricao || 'Kit promocional com produtos selecionados.')}</p>
          <div class="kit-review-price">
            ${original > Number(kit.preco || 0) ? `<s>${fmt(original)}</s>` : ''}
            <strong>${fmt(kit.preco)}</strong>
            ${discount > 0 ? `<span>Economize ${discount}% neste kit</span>` : ''}
          </div>
          <button class="primary-button basket-standard-button" data-action="add-kit" data-id="${escapeHtml(kit.id)}">Adicionar kit promocional</button>
        </div>
      </article>
      <section class="content-section kit-products-section">
        <div class="section-heading"><div><h2>Produtos do kit</h2><p>Veja os itens incluídos no combo.</p></div></div>
        <div class="bundle-products-grid kit-products-grid">${rows.map(row => bundleProductCardHtml({ bundle: kit, row, type: 'kit' })).join('')}</div>
      </section>
      <section class="basket-total-card kit-total-card">
        <div class="basket-total-copy">
          <span class="basket-total-status">Kit promocional</span>
          <h2>Valor final do kit</h2>
          <p>Os produtos acima fazem parte do combo pelo valor promocional informado.</p>
        </div>
        <div class="basket-total-action">
          <strong>${fmt(kit.preco)}</strong>
          <button class="primary-button" data-action="add-kit" data-id="${escapeHtml(kit.id)}">Adicionar kit</button>
        </div>
      </section>`;

    page.dataset.kitReview = REVIEW_VERSION;
    page.removeAttribute('data-kit-review-pending');
    bindDetailImageFallbacks(page);
  } catch (error) {
    console.warn('Não foi possível aplicar a revisão visual do kit:', error);
    page?.removeAttribute('data-kit-review-pending');
  }
}

function reviewCheckout() {
  const content = document.getElementById('checkout-content');
  if (!content || !content.children.length) return;
  content.classList.add('checkout-reviewed');
  bindDetailImageFallbacks(content);
}

function scheduleReview() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    reviewBasketPage();
    reviewKitPage();
    reviewCheckout();
  });
}

const app = document.getElementById('app');
const checkoutContent = document.getElementById('checkout-content');
if (app) new MutationObserver(scheduleReview).observe(app, { childList: true });
if (checkoutContent) new MutationObserver(scheduleReview).observe(checkoutContent, { childList: true });
window.addEventListener('hashchange', scheduleReview);
window.addEventListener('DOMContentLoaded', scheduleReview);
scheduleReview();