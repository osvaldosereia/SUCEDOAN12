import { loadCatalog, classify } from './catalog.js';
import { loadCart, clearCart, ensureBasket, basketTotal, extrasTotal, grandTotal, totalUnits, changeBasketQty, changeExtraQty, whatsappUrl } from './cart.js';

const params = new URLSearchParams(location.search);
const section = String(params.get('secao') || 'categorias').toLowerCase();
const basketParam = String(params.get('cesta') || '').trim();
const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const $ = id => document.getElementById(id);

const sections = [
  { key: 'cestas', label: 'Cestas Básicas', icon: '🧺', tone: 'tone-orange' },
  { key: 'ofertas', label: 'Ofertas', icon: '🏷️', tone: 'tone-red' },
  { key: 'mercearia', label: 'Mercearia', icon: '🛒', tone: 'tone-green' },
  { key: 'limpeza', label: 'Lavanderia e Limpeza', icon: '🧼', tone: 'tone-blue' },
  { key: 'higiene', label: 'Higiene e Beleza', icon: '🧴', tone: 'tone-pink' },
  { key: 'utilidades', label: 'Utilidades e Pets', icon: '🐾', tone: 'tone-purple' }
];

const labels = Object.fromEntries(sections.map(item => [item.key, item.label]));
const state = { products: [], baskets: [], productByCode: new Map(), cart: loadCart(), basket: null, search: '' };

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function clean(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
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
  document.title = 'Atendimento | Dona Antônia';
  $('basketMode').hidden = true;
  $('offersMode').hidden = false;
  $('categoryTabs').innerHTML = '<a class="chip active" href="./">Início</a><strong class="section-name">Escolha uma categoria</strong>';
  const list = sections.filter(matchesSearch);
  $('offersList').className = 'offer-grid category-grid';
  $('offersList').innerHTML = list.length ? list.map(item => `
    <a class="catalog-card category-card ${esc(item.tone)}" href="?secao=${encodeURIComponent(item.key)}" aria-label="Abrir ${esc(item.label)}">
      <div class="category-icon-wrap"><span class="category-icon" aria-hidden="true">${esc(item.icon)}</span></div>
      <div class="catalog-body"><div class="catalog-name">${esc(item.label)}</div><div class="category-cta">Ver produtos</div></div>
    </a>`).join('') : '<div class="empty">Nada encontrado.</div>';
  renderSummary();
}

function renderBasketGrid() {
  document.title = 'Cestas Básicas | Dona Antônia';
  $('basketMode').hidden = true;
  $('offersMode').hidden = false;
  $('categoryTabs').innerHTML = '<a class="chip" href="./">Início</a><a class="chip active" href="?secao=cestas">Cestas Básicas</a>';
  const host = $('offersList');
  const list = state.baskets.filter(matchesSearch);
  host.className = 'offer-grid';
  host.innerHTML = list.length ? list.map(basket => `
    <a class="catalog-card" href="?cesta=${encodeURIComponent(basket.id)}">
      <div class="catalog-image-wrap"><img class="catalog-image" src="${esc(basket.image)}" alt="${esc(basket.name)}" loading="lazy"></div>
      <div class="catalog-body"><div class="catalog-name">${esc(basket.name)}</div><div class="catalog-price">${money(basket.price)}</div></div>
    </a>`).join('') : '<div class="empty">Nada encontrado.</div>';
  renderSummary();
}

function renderBasketDetail(basket) {
  state.basket = basket;
  ensureBasket(state.cart, basket, state.productByCode);
  document.title = `${basket.name} | Dona Antônia`;
  $('basketMode').hidden = false;
  $('offersMode').hidden = true;
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
  const startLinks = '<a class="chip" href="./">Início</a><a class="chip" href="?secao=cestas">Cestas Básicas</a>';
  $('categoryTabs').innerHTML = startLinks + sections
    .filter(item => item.key !== 'cestas')
    .map(item => `<a class="chip${item.key === current ? ' active' : ''}" href="?secao=${item.key}">${item.label}</a>`)
    .join('');
}

function productCard(product) {
  const item = state.cart.extras?.[product.code];
  const action = item?.qty > 0
    ? `<div class="qty qty-wide"><button data-extra-delta="-1" data-code="${esc(product.code)}">−</button><span>${item.qty}</span><button data-extra-delta="1" data-code="${esc(product.code)}">+</button></div>`
    : `<button class="offer-add" type="button" data-add="${esc(product.code)}">Adicionar</button>`;
  return `
    <article class="offer-card">
      <div class="offer-image-wrap"><img class="offer-image" src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy"></div>
      <div class="offer-body">
        <div class="offer-name">${esc(product.name)}</div>
        <div class="offer-price">${money(product.price)}</div>
        <div class="offer-actions">${action}</div>
      </div>
    </article>`;
}

function renderProductSection(sectionKey) {
  const current = labels[sectionKey] && sectionKey !== 'cestas' ? sectionKey : 'ofertas';
  document.title = `${labels[current]} | Dona Antônia`;
  $('basketMode').hidden = true;
  $('offersMode').hidden = false;
  renderTabs(current);
  const list = productList(current).filter(matchesSearch);
  $('offersList').className = 'offer-grid';
  $('offersList').innerHTML = list.length ? list.map(productCard).join('') : '<div class="empty">Nada encontrado.</div>';
  renderSummary();
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
    $('clearSearch').hidden = !state.search;
    rerender();
  });
  $('clearSearch').addEventListener('click', () => {
    state.search = '';
    $('searchInput').value = '';
    $('clearSearch').hidden = true;
    rerender();
  });
  document.addEventListener('click', event => {
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
      if (basket) return renderBasketDetail(basket);
    }
    if (!section || section === 'categorias') return renderCategoryGrid();
    if (section === 'cestas') return renderBasketGrid();
    renderProductSection(section);
  } catch (error) {
    console.error(error);
    $('basketMode').hidden = true;
    $('offersMode').hidden = false;
    $('offersList').innerHTML = '<div class="empty">Catálogo indisponível.</div>';
    renderSummary();
  }
}

init();
