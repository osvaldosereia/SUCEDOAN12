import { loadCatalog, classify } from './catalog.js';
import { loadCart, clearCart, saveCart, ensureBasket, basketTotal, extrasTotal, grandTotal, totalUnits, changeBasketQty, changeExtraQty, whatsappUrl } from './cart.js';

const params = new URLSearchParams(location.search);
const section = String(params.get('secao') || '').toLowerCase();
const basketParam = String(params.get('cesta') || '').trim();
const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const $ = id => document.getElementById(id);

const sections = [
  { key: 'cestas', label: 'Cestas Básicas', image: '/site/img/produtos/CESTA-MEDIA-BONINI.webp' },
  { key: 'ofertas', label: 'Ofertas', image: '/site/img/produtos/COMBO-LIMPEZA1.webp' },
  { key: 'mercearia', label: 'Mercearia', image: '/site/img/produtos/CESTA-PEQUENA-BONINI.webp' },
  { key: 'limpeza', label: 'Lavanderia e Limpeza', image: '/site/img/produtos/COMBO-LIMPEZA1.webp' },
  { key: 'higiene', label: 'Higiene e Beleza', image: '/site/img/produtos/COMBO-PARA-ELAS.webp' },
  { key: 'utilidades', label: 'Utilidades e Pets', image: '/img/logoantonia5.png' }
];

const labels = Object.fromEntries(sections.map(item => [item.key, item.label]));
const state = { products: [], baskets: [], productByCode: new Map(), cart: loadCart(), basket: null };

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
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
  document.title = 'Categorias | Dona Antônia';
  $('basketMode').hidden = true;
  $('offersMode').hidden = false;
  $('categoryTabs').innerHTML = '<strong class="section-name">Categorias</strong>';
  $('offersList').className = 'offer-grid category-grid';
  $('offersList').innerHTML = sections.map(item => `
    <a class="catalog-card category-card" href="?secao=${encodeURIComponent(item.key)}">
      <div class="catalog-image-wrap"><img class="catalog-image" src="${esc(categoryImage(item))}" alt="${esc(item.label)}" loading="lazy"></div>
      <div class="catalog-body"><div class="catalog-name">${esc(item.label)}</div></div>
    </a>`).join('');
  renderSummary();
}

function categoryImage(item) {
  if (item.key === 'cestas') return state.baskets[0]?.image || item.image;
  if (item.key === 'ofertas') return state.products.find(product => product.offer)?.image || item.image;
  return state.products.find(product => classify(product) === item.key)?.image || item.image;
}

function renderBasketGrid() {
  document.title = 'Cestas Básicas | Dona Antônia';
  $('basketMode').hidden = true;
  $('offersMode').hidden = false;
  $('categoryTabs').innerHTML = '<a class="chip" href="?secao=categorias">Categorias</a><strong class="section-name">Cestas Básicas</strong>';
  const host = $('offersList');
  host.className = 'offer-grid';
  host.innerHTML = state.baskets.length ? state.baskets.map(basket => `
    <a class="catalog-card" href="?cesta=${encodeURIComponent(basket.id)}">
      <div class="catalog-image-wrap"><img class="catalog-image" src="${esc(basket.image)}" alt="${esc(basket.name)}" loading="lazy"></div>
      <div class="catalog-body"><div class="catalog-name">${esc(basket.name)}</div><div class="catalog-price">${money(basket.price)}</div></div>
    </a>`).join('') : '<div class="empty">Nenhuma cesta.</div>';
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
  $('basketItems').innerHTML = state.cart.basket.items.map((item, index) => `
    <div class="basket-item">
      <span class="basket-item-name">${esc(item.name)}</span>
      <div class="qty">
        <button type="button" data-basket-delta="-1" data-index="${index}" aria-label="Diminuir">−</button>
        <span>${item.qty}</span>
        <button type="button" data-basket-delta="1" data-index="${index}" aria-label="Aumentar">+</button>
      </div>
    </div>`).join('');
  renderSummary();
}

function productList(sectionKey) {
  if (sectionKey === 'ofertas') return state.products.filter(product => product.offer);
  return state.products.filter(product => classify(product) === sectionKey);
}

function renderTabs(current) {
  const categoryLink = '<a class="chip" href="?secao=categorias">Categorias</a>';
  $('categoryTabs').innerHTML = categoryLink + sections
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
  const list = productList(current);
  $('offersList').className = 'offer-grid';
  $('offersList').innerHTML = list.length ? list.map(productCard).join('') : '<div class="empty">Nenhum produto.</div>';
  renderSummary();
}

function rerender() {
  if (basketParam && state.basket) renderBasketDetail(state.basket);
  else if (section === 'categorias') renderCategoryGrid();
  else if (!section || section === 'cestas') renderBasketGrid();
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
    if (section === 'categorias') return renderCategoryGrid();
    if (!section || section === 'cestas') return renderBasketGrid();
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
