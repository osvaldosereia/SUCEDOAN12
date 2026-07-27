const OFFER_BATCH_SIZE = 32;
let currentOffers = [];
let visibleCount = 0;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function productReference(product) {
  return encodeURIComponent(product.firebaseKey || product.id || product.codigo || product.slug || 'produto');
}

function productCard(product, state, index) {
  const id = String(product.id || product.firebaseKey || product.codigo || '');
  const qty = Number(state.cart?.[id] || 0);
  const oldPrice = Number(product.oldPrice || product.preco || product.price || 0);
  const price = Number(product.price || product.preco_oferta || oldPrice || 0);
  const discount = oldPrice > price ? Math.round(((oldPrice - price) / Math.max(oldPrice, .01)) * 100) : 0;
  const image = String(product.img || product.url_imagem || '/img/logoantonia5.png');
  const fallbacks = Array.isArray(product.images) ? product.images.slice(1).join('|') : '';
  const control = qty > 0
    ? `<div class="qty-control"><button data-action="dec" data-id="${escapeHtml(id)}" aria-label="Diminuir">−</button><span>${qty}</span><button data-action="inc" data-id="${escapeHtml(id)}" aria-label="Aumentar">+</button></div>`
    : `<button class="qty-add" data-action="add" data-id="${escapeHtml(id)}" aria-label="Adicionar ${escapeHtml(product.name)}">+</button>`;

  return `<article class="product-card" data-product-card="${escapeHtml(id)}">
    <div class="product-card-media">
      <a href="#/produto/${productReference(product)}" aria-label="Ver ${escapeHtml(product.name)}">
        <img ${index < 8 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy" fetchpriority="low"'} decoding="async" width="300" height="300" src="${escapeHtml(image)}" data-fallback="${escapeHtml(fallbacks)}" alt="${escapeHtml(product.name)}">
      </a>
      <button class="favorite-button" data-action="favorite" data-id="${escapeHtml(id)}" data-kind="product" aria-label="Adicionar aos favoritos">♡</button>
      ${discount > 0 ? `<span class="discount-badge">-${discount}%</span>` : ''}
    </div>
    <div class="product-card-body">
      <div class="product-packaging">${escapeHtml(product.embalagem || 'Unidade')}</div>
      <a class="product-name" href="#/produto/${productReference(product)}" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</a>
      <div class="product-expiry">&nbsp;</div>
      <div class="product-card-footer">
        <div class="product-price">${oldPrice > price ? `<s>${money(oldPrice)}</s>` : ''}<strong>${money(price)}</strong></div>
        <div data-control-slot="${escapeHtml(id)}">${control}</div>
      </div>
    </div>
  </article>`;
}

function closeTransientPanels() {
  const confirmation = document.getElementById('bundle-confirm-overlay');
  if (confirmation) {
    confirmation.classList.remove('show');
    confirmation.setAttribute('aria-hidden', 'true');
    confirmation.setAttribute('inert', '');
  }
  document.body.classList.remove('bundle-confirm-open', 'drawer-open');
  document.getElementById('drawer-overlay')?.classList.remove('show');
  document.querySelectorAll('.drawer.open').forEach(drawer => {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('inert', '');
  });
}

function updateMoreButton() {
  const button = document.querySelector('[data-fast-offers-more]');
  if (!button) return;
  const remaining = Math.max(currentOffers.length - visibleCount, 0);
  if (!remaining) {
    button.closest('.fast-offers-more-wrap')?.remove();
    return;
  }
  button.textContent = `Carregar mais ofertas (${remaining})`;
}

function appendNextBatch() {
  const state = window.__DA_CATALOG_STATE__;
  const grid = document.getElementById('fast-offers-grid');
  if (!state || !grid) return;
  const next = currentOffers.slice(visibleCount, visibleCount + OFFER_BATCH_SIZE);
  if (!next.length) return;
  grid.insertAdjacentHTML('beforeend', next.map((product, index) => productCard(product, state, visibleCount + index)).join(''));
  visibleCount += next.length;
  updateMoreButton();
  window.dispatchEvent(new CustomEvent('da:route-rendered', { detail: { route: { name: 'offers' }, root: document.getElementById('app') } }));
}

function renderFastOffers() {
  const state = window.__DA_CATALOG_STATE__;
  const app = document.getElementById('app');
  if (!state?.products?.length || !app) return false;

  currentOffers = state.products
    .filter(product => Number(product.stock || 0) > 0 && Number(product.oldPrice || 0) > Number(product.price || 0))
    .sort((a, b) => Number(b.discountPercent || 0) - Number(a.discountPercent || 0) || String(a.name).localeCompare(String(b.name), 'pt-BR'));
  visibleCount = 0;

  closeTransientPanels();
  history.pushState({}, '', '/#/ofertas');
  document.querySelectorAll('[data-nav]').forEach(item => item.classList.toggle('active', item.dataset.nav === 'offers'));
  document.title = 'Ofertas - Dona Antônia';

  app.innerHTML = `<div class="page-container">
    <header class="page-header"><a class="back-button" href="#/" aria-label="Voltar">←</a><div><h1>Ofertas</h1><p>${currentOffers.length} produtos em oferta. Carregamento rápido em blocos.</p></div></header>
    <p class="fast-offers-status">As primeiras ofertas já estão disponíveis. Role a página e carregue mais quando precisar.</p>
    <div class="product-grid" id="fast-offers-grid"></div>
    ${currentOffers.length ? '<div class="fast-offers-more-wrap"><button class="primary-button fast-offers-more" type="button" data-fast-offers-more>Carregar mais ofertas</button></div>' : '<div class="empty-state"><strong>Nenhuma oferta disponível agora.</strong></div>'}
  </div>`;
  app.scrollTop = 0;
  appendNextBatch();
  return true;
}

document.addEventListener('click', event => {
  const moreButton = event.target.closest('[data-fast-offers-more]');
  if (moreButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    appendNextBatch();
    return;
  }

  const continueButton = event.target.closest('[data-action="bundle-confirm-continue"]');
  const link = event.target.closest('a[href]');
  let isOffersLink = false;
  if (link) {
    try {
      const url = new URL(link.getAttribute('href'), location.href);
      isOffersLink = url.origin === location.origin && url.hash.startsWith('#/ofertas');
    } catch {}
  }
  if (!continueButton && !isOffersLink) return;
  if (!window.__DA_CATALOG_STATE__?.products?.length) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  renderFastOffers();
}, true);
