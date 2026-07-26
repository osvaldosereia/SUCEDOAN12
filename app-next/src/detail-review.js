import { CONFIG } from './config.js';
import { indexProducts, loadCatalog } from './catalog.js';
import {
  applyProductOffer, kitDiscountPercent, kitOriginalPrice, resolveBundleRows
} from './commerce.js';
import { escapeHtml, fmt, formatDateBR, parseMoney, readStorage, roundMoney } from './core.js';
import {
  basketDefaultProductTotal,
  basketDraftTotal,
  basketFixedAdjustment
} from './basket-pricing.js';

const REVIEW_VERSION = '2026-07-26-detail-v6';
let catalogStatePromise;
let scheduled = false;

function productRoute(product) {
  return encodeURIComponent(product?.firebaseKey || product?.id || product?.codigo || '');
}

function getCatalogState() {
  if (window.__DA_CATALOG_STATE__?.isReady) {
    return Promise.resolve(window.__DA_CATALOG_STATE__);
  }
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

function ensureKitRuleStyles() {
  if (document.getElementById('kit-commercial-rules-v6')) return;
  const style = document.createElement('style');
  style.id = 'kit-commercial-rules-v6';
  style.textContent = `
    .kit-product-price-comparison{display:grid;gap:6px;margin-top:2px;padding:9px;border:1px solid var(--line);border-radius:13px;background:#f8faf8}
    .kit-product-price-row{display:flex;align-items:flex-end;justify-content:space-between;gap:8px}
    .kit-product-price-row small{color:var(--muted);font-size:9.5px;font-weight:700;line-height:1.2}
    .kit-product-price-row s{color:var(--muted);font-size:12px;font-weight:600}
    .kit-product-price-row strong{color:var(--brand);font-size:18px;line-height:1;font-weight:800;letter-spacing:-.025em}
    .kit-product-price-total{color:var(--muted);font-size:9.5px;line-height:1.3}
    .kit-rule-alert{margin-top:10px;padding:12px 13px;border:1px solid #f5d58b;border-radius:14px;background:#fff8e8;color:#7a4b00;font-size:11.5px;line-height:1.5;font-weight:650}
    .checkout-kit-notices{display:grid;gap:8px;margin:10px 0 13px}
    .checkout-kit-notice{padding:11px 12px;border-radius:14px;font-size:11.5px;line-height:1.45}
    .checkout-kit-notice strong{display:block;margin-bottom:3px;font-size:12.5px}
    .checkout-kit-notice.complete{border:1px solid #a7dfb6;background:#eefaf1;color:#176534}
    .checkout-kit-notice.broken{border:1px solid #f0c36b;background:#fff8e8;color:#7a4b00}
    @media(max-width:767px){
      .kit-product-price-comparison{padding:8px}
      .kit-product-price-row{align-items:center}
      .kit-product-price-row strong{font-size:16px}
      .kit-rule-alert{font-size:10.5px}
    }
  `;
  document.head.appendChild(style);
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

function firstMoney(...values) {
  for (const value of values) {
    const parsed = parseMoney(value);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function kitLinePriceInfo({ bundle, row, sourceLine, kitRatio }) {
  const qty = Math.max(1, Number(row.qty || 1));
  const normalUnit = Number(row.product.price || row.product.oldPrice || 0);
  const explicitKitUnit = firstMoney(
    sourceLine?.preco_novo_unitario_kit,
    sourceLine?.precoNovoUnitarioKit,
    sourceLine?.preco_unitario_kit,
    sourceLine?.precoUnitarioKit
  );
  const kitUnit = explicitKitUnit || roundMoney(normalUnit * kitRatio);
  const explicitKitTotal = firstMoney(
    sourceLine?.preco_novo_total_kit,
    sourceLine?.precoNovoTotalKit,
    sourceLine?.preco_total_kit,
    sourceLine?.precoTotalKit
  );
  const kitTotal = explicitKitTotal || roundMoney(kitUnit * qty);
  const normalTotal = roundMoney(normalUnit * qty);
  const savings = Math.max(0, roundMoney(normalTotal - kitTotal));

  return {
    normalUnit,
    kitUnit,
    kitTotal,
    savings,
    bundlePrice: Number(bundle?.preco || 0)
  };
}

function bundleProductCardHtml({ bundle, row, draft = null, type = 'basket', sourceLine = null, kitRatio = 1 }) {
  const product = row.product;
  const id = String(product.id);
  const qty = type === 'basket' ? Number(draft?.[id] || 0) : Number(row.qty || 0);
  const unitLabel = qty === 1 ? 'unidade' : 'unidades';
  const quantityBadge = type === 'basket'
    ? `${qty} ${unitLabel} na cesta`
    : `${qty} ${unitLabel} no kit`;
  const quantityContext = type === 'basket'
    ? `Esta cesta inclui ${qty} ${unitLabel}`
    : `Incluído no kit: ${qty} ${unitLabel}`;
  const expiry = product.validade && formatDateBR(product.validade)
    ? `<div class="product-expiry">Val. ${escapeHtml(formatDateBR(product.validade))}</div>`
    : '';

  const basketControls = `<div class="bundle-product-quantity-control" style="display:grid;justify-items:end;gap:4px">
    <small style="color:var(--muted);font-size:9px;font-weight:700;line-height:1.1;text-align:right">Quantidade na cesta</small>
    <div class="qty-control bundle-product-qty">
      <button data-action="basket-dec" data-basket-id="${escapeHtml(bundle.id)}" data-id="${escapeHtml(id)}" aria-label="Diminuir ${escapeHtml(product.name)}">−</button>
      <span>${qty}</span>
      <button data-action="basket-inc" data-basket-id="${escapeHtml(bundle.id)}" data-id="${escapeHtml(id)}" aria-label="Aumentar ${escapeHtml(product.name)}">+</button>
    </div>
  </div>`;

  const kitPricing = kitLinePriceInfo({ bundle, row, sourceLine, kitRatio });
  const priceHtml = type === 'kit'
    ? `<div class="kit-product-price-comparison" aria-label="Comparação de preço deste produto">
        <div class="kit-product-price-row"><small>Preço avulso no site</small><s>${fmt(kitPricing.normalUnit)}</s></div>
        <div class="kit-product-price-row"><small>Preço por unidade no kit</small><strong>${fmt(kitPricing.kitUnit)}</strong></div>
        ${qty > 1 ? `<div class="kit-product-price-total">${qty} unidades no kit: <strong>${fmt(kitPricing.kitTotal)}</strong></div>` : ''}
        ${kitPricing.savings > 0 ? `<div class="kit-product-price-total">Economia neste produto: ${fmt(kitPricing.savings)}</div>` : ''}
      </div>`
    : `<div class="product-card-footer">
        <div class="product-price"><strong>${fmt(product.price)}</strong><small>cada</small></div>
        ${basketControls}
      </div>`;

  return `<article class="product-card bundle-product-card" data-bundle-product="${escapeHtml(id)}">
    <div class="product-card-media bundle-product-media">
      <a href="#/produto/${productRoute(product)}" aria-label="Abrir ${escapeHtml(product.name)}">
        <img loading="lazy" decoding="async" fetchpriority="low" width="300" height="300" src="${escapeHtml(product.img)}" data-detail-fallback="${escapeHtml(imageFallbackValue(product))}" alt="">
      </a>
      <span class="bundle-product-badge">${escapeHtml(quantityBadge)}</span>
    </div>
    <div class="product-card-body">
      ${product.embalagem ? `<div class="product-packaging">${escapeHtml(product.embalagem)}</div>` : '<div class="product-packaging">&nbsp;</div>'}
      <a class="product-name" href="#/produto/${productRoute(product)}" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</a>
      <div class="bundle-product-context">${escapeHtml(quantityContext)}</div>
      ${expiry}
      ${priceHtml}
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
        <div class="section-heading"><div><h2>Produtos da cesta</h2><p>Confira quantas unidades de cada produto estão incluídas e ajuste se precisar.</p></div></div>
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
    const retailTotal = rows.reduce((sum, row) => sum + Number(row.product.price || 0) * Number(row.qty || 0), 0);
    const kitRatio = retailTotal > 0 ? Math.min(1, Number(kit.preco || 0) / retailTotal) : 1;

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
          <div class="kit-rule-alert"><strong>Desconto exclusivo do kit completo.</strong><br>Os preços promocionais dos produtos só valem ao comprar este kit. Se qualquer produto ou quantidade for removido no checkout, todo o desconto do kit será cancelado e os itens restantes voltarão ao preço avulso do site.</div>
          <button class="primary-button basket-standard-button" data-action="add-kit" data-id="${escapeHtml(kit.id)}">Adicionar kit promocional</button>
        </div>
      </article>
      <section class="content-section kit-products-section">
        <div class="section-heading"><div><h2>Produtos do kit</h2><p>Compare o preço avulso com o valor exclusivo de cada produto dentro do kit completo.</p></div></div>
        <div class="bundle-products-grid kit-products-grid">${rows.map((row, index) => bundleProductCardHtml({ bundle: kit, row, type: 'kit', sourceLine: kit.produtos[index] || null, kitRatio })).join('')}</div>
      </section>
      <section class="basket-total-card kit-total-card">
        <div class="basket-total-copy">
          <span class="basket-total-status">Kit promocional completo</span>
          <h2>Valor final do kit</h2>
          <p>O desconto depende da composição completa. Alterar ou retirar qualquer item no checkout cancela todo o desconto do kit.</p>
        </div>
        <div class="basket-total-action">
          <strong>${fmt(kit.preco)}</strong>
          <button class="primary-button" data-action="add-kit" data-id="${escapeHtml(kit.id)}">Adicionar kit completo</button>
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

function checkoutKitStatuses() {
  const saved = readStorage(CONFIG.STORAGE.CART, {}) || {};
  const cart = saved.cart || {};
  return Object.entries(saved.basketCustomizations || {}).flatMap(([key, info]) => {
    const isKit = String(key).startsWith('kit:') || String(info?.label || '').toUpperCase().includes('KIT');
    if (!isKit) return [];
    const required = Object.entries(info?.originalItems || {});
    if (!required.length) return [];
    const intact = required.every(([productId, qty]) => Number(cart[productId] || 0) >= Number(qty || 0));
    return [{
      name: String(info?.name || 'Kit promocional'),
      intact,
      discount: Math.abs(Number(info?.fee || 0))
    }];
  });
}

function reviewCheckout() {
  const content = document.getElementById('checkout-content');
  if (!content || !content.children.length) return;
  content.classList.add('checkout-reviewed');
  bindDetailImageFallbacks(content);

  const reviewSection = content.querySelector('.checkout-review-section');
  if (!reviewSection) return;
  reviewSection.querySelector('.checkout-kit-notices')?.remove();
  const statuses = checkoutKitStatuses();
  if (!statuses.length) return;

  const notices = document.createElement('div');
  notices.className = 'checkout-kit-notices';
  notices.setAttribute('aria-live', 'polite');
  notices.innerHTML = statuses.map(status => status.intact
    ? `<div class="checkout-kit-notice complete"><strong>${escapeHtml(status.name)} completo</strong>Desconto de ${fmt(status.discount)} aplicado. Ele só permanece enquanto todos os produtos e quantidades do kit estiverem na compra.</div>`
    : `<div class="checkout-kit-notice broken"><strong>${escapeHtml(status.name)} incompleto</strong>O desconto de ${fmt(status.discount)} foi removido. Os produtos restantes estão sendo cobrados pelo preço avulso do site.</div>`
  ).join('');
  reviewSection.querySelector('h2')?.insertAdjacentElement('afterend', notices);
}

function scheduleReview() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    ensureKitRuleStyles();
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
window.addEventListener('da:catalog-ready', scheduleReview);
scheduleReview();