import { loadCatalog, classify } from './catalog.js';
import { loadCart, clearCart, ensureBasket, basketTotal, extrasTotal, grandTotal, totalUnits, changeBasketQty, changeExtraQty, whatsappUrl } from './cart.js';

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const params = new URLSearchParams(location.search);
const section = String(params.get('secao') || 'categorias').toLowerCase();
const basketParam = String(params.get('cesta') || '').trim();
const PAGE_SIZE = 10;
const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const $ = id => document.getElementById(id);

const sections = [
  { key: 'cestas', label: 'Cestas Básicas', icon: '🧺', tone: 'tone-orange' },
  { key: 'ofertas', label: 'Ofertas', icon: '%', tone: 'tone-red' },
  { key: 'mercearia', label: 'Mercearia', icon: '🛒', tone: 'tone-green' },
  { key: 'limpeza', label: 'Lavanderia e Limpeza', icon: '✦', tone: 'tone-blue' },
  { key: 'higiene', label: 'Higiene e Beleza', icon: '●', tone: 'tone-pink' },
  { key: 'utilidades', label: 'Utilidades e Pets', icon: '🐾', tone: 'tone-purple' }
];

const labels = Object.fromEntries(sections.map(item => [item.key, item.label]));
const state = {
  products: [],
  baskets: [],
  productByCode: new Map(),
  cart: loadCart(),
  basket: null,
  search: '',
  visibleCount: PAGE_SIZE,
  listKey: ''
};
let loadObserver = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function clean(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function scrollToTop() {
  requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
}

function disconnectInfiniteScroll() {
  if (loadObserver) loadObserver.disconnect();
  loadObserver = null;
}

function resetListIfNeeded(key) {
  if (state.listKey !== key) {
    state.listKey = key;
    state.visibleCount = PAGE_SIZE;
  }
}

function loadMoreMarkup(total) {
  if (total <= state.visibleCount) return '';
  const remaining = total - state.visibleCount;
  const next = Math.min(PAGE_SIZE, remaining);
  return `<button class="load-more" type="button" data-load-more>Carregar mais ${next}</button><div class="scroll-sentinel" data-scroll-sentinel aria-hidden="true"></div>`;
}

function setupInfiniteScroll(total) {
  disconnectInfiniteScroll();
  if (total <= state.visibleCount) return;
  const sentinel = document.querySelector('[data-scroll-sentinel]');
  if (!sentinel || !('IntersectionObserver' in window)) return;
  loadObserver = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    state.visibleCount = Math.min(state.visibleCount + PAGE_SIZE, total);
    rerender();
  }, { rootMargin: '420px 0px' });
  loadObserver.observe(sentinel);
}

function matchesSearch(item) {
  const term = clean(state.search);
  if (!term) return true;
  return clean([item.name, item.label, item.key, item.code, item.categoryText].filter(Boolean).join(' ')).includes(term);
}

function basketByParam(value) {
  const key = String(value).toLowerCase();
  return state.baskets.find(item => [item.id, item.code].some(v => String(v).toLowerCase() === key));
}

function backButton(url) {
  return `<button class="back-link" type="button" data-back-url="${esc(url)}">‹ Voltar</button>`;
}

function hideDetailNav() {
  const nav = $('detailNav');
  if (!nav) return;
  nav.hidden = true;
  nav.innerHTML = '';
}

function renderSummary() {
  const host = $('summaryItems');
  host.innerHTML = '';
  if (state.cart.basket) {
    host.insertAdjacentHTML('beforeend', `<div class="summary-line"><span>${esc(state.cart.basket.name)}</span><strong>${money(basketTotal(state.cart))}</strong></div>`);
  }
  const extras = Object.values(state.cart.extras || {}).filter(item => item.qty > 0);
  if (extras.length) {
    host.insertAdjacentHTML('beforeend', `<div class="summary-line"><span>Produtos avulsos (${extras.reduce((s, i) => s + i.qty, 0)})</span><strong>${money(extrasTotal(state.cart))}</strong></div>`);
  }
  $('grandTotal').textContent = money(grandTotal(state.cart));
  $('bottomTotal').textContent = money(grandTotal(state.cart));
  $('sendWhatsapp').disabled = totalUnits(state.cart) === 0;
  $('sendWhatsapp').textContent = basketParam ? 'Enviar cesta' : 'Finalizar pedido';
}

function renderCategoryGrid() {
  disconnectInfiniteScroll();
  hideDetailNav();
  document.title = 'Atendimento | Dona Antônia';
  $('basketMode').hidden = true;
  $('offersMode').hidden = false;
  $('categoryTabs').innerHTML = '<strong class="section-name">Escolha uma seção</strong>';
  const list = sections.filter(matchesSearch);
  $('offersList').className = 'category-menu';
  $('offersList').innerHTML = list.length ? list.map(item => `
    <a class="menu-button ${esc(item.tone)}" href="?secao=${encodeURIComponent(item.key)}" data-section-link aria-label="Abrir ${esc(item.label)}">
      <span class="menu-icon" aria-hidden="true">${esc(item.icon)}</span>
      <span class="menu-label">${esc(item.label)}</span>
      <span class="menu-arrow" aria-hidden="true">›</span>
    </a>`).join('') : '<div class="empty">Nada encontrado.</div>';
  renderSummary();
}

function renderBasketGrid() {
  hideDetailNav();
  document.title = 'Cestas Básicas | Dona Antônia';
  $('basketMode').hidden = true;
  $('offersMode').hidden = false;
  $('categoryTabs').innerHTML = `${backButton('./')}<a class="chip" href="./" data-section-link>Início</a><a class="chip active" href="?secao=cestas" data-section-link>Cestas Básicas</a>`;
  const host = $('offersList');
  const key = `cestas|${clean(state.search)}`;
  resetListIfNeeded(key);
  const list = state.baskets.filter(matchesSearch);
  const visible = list.slice(0, state.visibleCount);
  host.className = 'offer-grid basket-grid';
  host.innerHTML = list.length ? visible.map(basket => `
    <a class="catalog-card" href="?cesta=${encodeURIComponent(basket.id)}" data-section-link>
      <div class="catalog-image-wrap"><img class="catalog-image" src="${esc(basket.image)}" alt="${esc(basket.name)}" loading="lazy" decoding="async"></div>
      <div class="catalog-body"><div class="catalog-name">${esc(basket.name)}</div><div class="catalog-price">${money(basket.price)}</div></div>
    </a>`).join('') + loadMoreMarkup(list.length) : '<div class="empty">Nada encontrado.</div>';
  renderSummary();
  setupInfiniteScroll(list.length);
}

function renderBasketDetail(basket) {
  disconnectInfiniteScroll();
  state.basket = basket;
  ensureBasket(state.cart, basket, state.productByCode);
  document.title = `${basket.name} | Dona Antônia`;
  $('basketMode').hidden = false;
  $('offersMode').hidden = true;
  $('detailNav').hidden = false;
  $('detailNav').innerHTML = `${backButton('?secao=cestas')}<a class="chip" href="./" data-section-link>Início</a>`;
  $('basketImage').src = basket.image;
  $('basketImage').alt = basket.name;
  $('basketTitle').textContent = basket.name;
  $('basketPrice').textContent = money(basketTotal(state.cart));
  const items = state.cart.basket.items.filter(matchesSearch);
  $('basketItems').innerHTML = items.length ? items.map(item => {
    const index = state.cart.basket.items.indexOf(item);
    return `
      <div class="basket-item">
        <span class="basket-item-name">${esc(item.name)}</span>
        <div class="qty">
          <button type="button" data-basket-delta="-1" data-index="${index}" aria-label="Diminuir">−</button>
          <span>${item.qty}</span>
          <button type="button" data-basket-delta="1" data-index="${index}" aria-label="Aumentar">+</button>
        </div>
      </div>`;
  }).join('') : '<div class="empty">Nada encontrado.</div>';
  renderSummary();
}

function productList(sectionKey) {
  if (sectionKey === 'ofertas') return state.products.filter(product => product.offer);
  return state.products.filter(product => classify(product) === sectionKey);
}

function renderTabs(current) {
  const chips = [
    backButton('./'),
    '<a class="chip" href="./" data-section-link>Início</a>',
    '<a class="chip" href="?secao=cestas" data-section-link>Cestas Básicas</a>',
    ...sections
      .filter(item => item.key !== 'cestas')
      .map(item => `<a class="chip${item.key === current ? ' active' : ''}" href="?secao=${item.key}" data-section-link>${item.label}</a>`)
  ];
  $('categoryTabs').innerHTML = chips.join('');
}

function productCard(product) {
  const item = state.cart.extras?.[product.code];
  const action = item?.qty > 0
    ? `<div class="qty qty-wide"><button data-extra-delta="-1" data-code="${esc(product.code)}">−</button><span>${item.qty}</span><button data-extra-delta="1" data-code="${esc(product.code)}">+</button></div>`
    : `<button class="offer-add" type="button" data-add="${esc(product.code)}">Adicionar</button>`;
  return `
    <article class="offer-card">
      <div class="offer-image-wrap"><img class="offer-image" src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy" decoding="async"></div>
      <div class="offer-body">
        <div class="offer-name">${esc(product.name)}</div>
        <div class="offer-price">${money(product.price)}</div>
        <div class="offer-actions">${action}</div>
      </div>
    </article>`;
}

function renderProductSection(sectionKey) {
  hideDetailNav();
  const current = labels[sectionKey] && sectionKey !== 'cestas' ? sectionKey : 'ofertas';
  document.title = `${labels[current]} | Dona Antônia`;
  $('basketMode').hidden = true;
  $('offersMode').hidden = false;
  renderTabs(current);
  const key = `${current}|${clean(state.search)}`;
  resetListIfNeeded(key);
  const list = productList(current).filter(matchesSearch);
  const visible = list.slice(0, state.visibleCount);
  $('offersList').className = 'offer-grid';
  $('offersList').innerHTML = list.length ? visible.map(productCard).join('') + loadMoreMarkup(list.length) : '<div class="empty">Nada encontrado.</div>';
  renderSummary();
  setupInfiniteScroll(list.length);
}

function rerender() {
  if (basketParam && state.basket) renderBasketDetail(state.basket);
  else if (!section || section === 'categorias') renderCategoryGrid();
  else if (section === 'cestas') renderBasketGrid();
  else renderProductSection(section);
}

function addExtra(code, delta) {
  const product = state.productByCode.get(String(code).toLowerCase());
  if (!product) return;
  changeExtraQty(state.cart, product, delta);
  rerender();
}

function bind() {
  $('resetCart').addEventListener('click', () => {
    state.cart = clearCart();
    location.reload();
  });
  $('sendWhatsapp').addEventListener('click', () => {
    location.href = whatsappUrl(state.cart, money, !basketParam);
  });
  $('searchInput').closest('form')?.addEventListener('submit', event => event.preventDefault());
  $('searchInput').addEventListener('input', event => {
    state.search = event.target.value;
    state.listKey = '';
    state.visibleCount = PAGE_SIZE;
    $('clearSearch').hidden = !state.search;
    rerender();
    scrollToTop();
  });
  $('clearSearch').addEventListener('click', () => {
    state.search = '';
    state.listKey = '';
    state.visibleCount = PAGE_SIZE;
    $('searchInput').value = '';
    $('clearSearch').hidden = true;
    rerender();
    scrollToTop();
  });
  document.addEventListener('click', event => {
    const loadMore = event.target.closest('[data-load-more]');
    if (loadMore) {
      state.visibleCount += PAGE_SIZE;
      rerender();
      return;
    }
    const back = event.target.closest('[data-back-url]');
    if (back) {
      sessionStorage.setItem('da_force_top', '1');
      location.href = back.dataset.backUrl || './';
      return;
    }
    const navLink = event.target.closest('a[data-section-link]');
    if (navLink) sessionStorage.setItem('da_force_top', '1');

    const basket = event.target.closest('[data-basket-delta]');
    if (basket) {
      changeBasketQty(state.cart, Number(basket.dataset.index), Number(basket.dataset.basketDelta));
      return rerender();
    }
    const add = event.target.closest('[data-add]');
    if (add) return addExtra(add.dataset.add, 1);
    const extra = event.target.closest('[data-extra-delta]');
    if (extra) return addExtra(extra.dataset.code, Number(extra.dataset.extraDelta));
  });
}

async function init() {
  bind();
  try {
    const catalog = await loadCatalog();
    Object.assign(state, catalog);
    if (basketParam) {
      const basket = basketByParam(basketParam);
      if (basket) renderBasketDetail(basket);
      else rerender();
    } else {
      rerender();
    }
    scrollToTop();
    sessionStorage.removeItem('da_force_top');
  } catch (error) {
    console.error(error);
    $('basketMode').hidden = true;
    $('offersMode').hidden = false;
    $('offersList').innerHTML = '<div class="empty">Catálogo indisponível.</div>';
    renderSummary();
    scrollToTop();
  }
}

init();
