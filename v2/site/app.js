import { loadCatalog } from '../shared/catalog.js';
import { cartSummary, clearCart, decrement, getQuantity, increment, subscribeCart } from '../shared/cart.js';

const state = { products: [], filtered: [], productMap: new Map() };
const elements = {
  status: document.getElementById('catalog-status'),
  count: document.getElementById('product-count'),
  resultCount: document.getElementById('result-count'),
  search: document.getElementById('search'),
  category: document.getElementById('category'),
  products: document.getElementById('products'),
  template: document.getElementById('product-template'),
  cartButton: document.getElementById('cart-button'),
  cartCount: document.getElementById('cart-count'),
  cartDrawer: document.getElementById('cart-drawer'),
  cartOverlay: document.getElementById('cart-overlay'),
  cartClose: document.getElementById('cart-close'),
  cartItems: document.getElementById('cart-items'),
  cartTotal: document.getElementById('cart-total'),
  cartClear: document.getElementById('cart-clear')
};

const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function productPrice(product) {
  return product.precoOferta > 0 && product.precoOferta < product.preco ? product.precoOferta : product.preco;
}

function cartControls(product) {
  const quantity = getQuantity(product.id);
  if (quantity <= 0) return `<button class="add-button" type="button" data-cart-action="add" data-product-id="${product.id}">Adicionar</button>`;
  return `<div class="quantity-control"><button type="button" data-cart-action="decrement" data-product-id="${product.id}" aria-label="Diminuir">−</button><strong>${quantity}</strong><button type="button" data-cart-action="increment" data-product-id="${product.id}" aria-label="Aumentar">+</button></div>`;
}

function renderCategories() {
  const categories = Array.from(new Set(state.products.map(product => product.categoria).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  elements.category.innerHTML = '<option value="">Todas</option>' + categories.map(category => `<option value="${category.replace(/"/g, '&quot;')}">${category}</option>`).join('');
}

function renderProducts() {
  const fragment = document.createDocumentFragment();
  elements.products.innerHTML = '';

  for (const product of state.filtered.slice(0, 120)) {
    const card = elements.template.content.firstElementChild.cloneNode(true);
    const image = card.querySelector('img');
    image.src = product.imagem || '../../img/logoantonia5.png';
    image.alt = product.nome;
    image.onerror = () => { image.onerror = null; image.src = '../../img/logoantonia5.png'; };
    card.querySelector('.product-category').textContent = product.categoria || 'Produto';
    card.querySelector('h3').textContent = product.nome;
    card.querySelector('.product-meta').textContent = [product.marca, product.embalagem].filter(Boolean).join(' · ');
    card.querySelector('.product-price').textContent = money(productPrice(product));
    card.querySelector('.product-stock').textContent = `${product.estoque} em estoque`;
    card.querySelector('.product-actions').innerHTML = cartControls(product);
    fragment.appendChild(card);
  }

  elements.products.appendChild(fragment);
  elements.resultCount.textContent = `${state.filtered.length} resultado${state.filtered.length === 1 ? '' : 's'}`;
  if (!state.filtered.length) elements.products.innerHTML = '<div class="empty">Nenhum produto encontrado.</div>';
}

function renderCart() {
  const summary = cartSummary(state.productMap);
  elements.cartCount.textContent = String(summary.units);
  elements.cartTotal.textContent = money(summary.total);
  elements.cartItems.innerHTML = summary.rows.length ? summary.rows.map(({ product, quantity, subtotal }) => `
    <article class="cart-row">
      <img src="${product.imagem || '../../img/logoantonia5.png'}" alt="${product.nome}" loading="lazy" decoding="async">
      <div><strong>${product.nome}</strong><span>${money(subtotal)}</span></div>
      <div class="quantity-control"><button type="button" data-cart-action="decrement" data-product-id="${product.id}">−</button><strong>${quantity}</strong><button type="button" data-cart-action="increment" data-product-id="${product.id}">+</button></div>
    </article>`).join('') : '<div class="empty">Sua compra está vazia.</div>';
  renderProducts();
}

function applyFilters() {
  const query = normalize(elements.search.value);
  const category = elements.category.value;
  state.filtered = state.products.filter(product => {
    const haystack = normalize([product.nome, product.marca, product.categoria, product.subcategoria, product.codigo, product.gtin].join(' '));
    return (!query || haystack.includes(query)) && (!category || product.categoria === category);
  });
  renderProducts();
}

function setStatus(message, type = '') {
  elements.status.textContent = message;
  elements.status.dataset.type = type;
}

function openCart() {
  elements.cartDrawer.setAttribute('aria-hidden', 'false');
  elements.cartButton.setAttribute('aria-expanded', 'true');
  elements.cartOverlay.hidden = false;
}

function closeCart() {
  elements.cartDrawer.setAttribute('aria-hidden', 'true');
  elements.cartButton.setAttribute('aria-expanded', 'false');
  elements.cartOverlay.hidden = true;
}

elements.search.addEventListener('input', applyFilters);
elements.category.addEventListener('change', applyFilters);
elements.cartButton.addEventListener('click', openCart);
elements.cartClose.addEventListener('click', closeCart);
elements.cartOverlay.addEventListener('click', closeCart);
elements.cartClear.addEventListener('click', clearCart);
document.addEventListener('click', event => {
  const button = event.target.closest('[data-cart-action]');
  if (!button) return;
  const product = state.productMap.get(String(button.dataset.productId));
  if (!product) return;
  if (button.dataset.cartAction === 'add' || button.dataset.cartAction === 'increment') increment(product.id, product.estoque);
  if (button.dataset.cartAction === 'decrement') decrement(product.id);
});
subscribeCart(renderCart);

try {
  const result = await loadCatalog({
    onStatus(event) {
      if (event.phase === 'cache') setStatus(`Exibindo cache com ${event.products.length} produtos enquanto atualiza…`, 'warning');
    }
  });
  state.products = result.products;
  state.filtered = [...state.products];
  state.productMap = new Map(state.products.map(product => [String(product.id), product]));
  elements.count.textContent = String(state.products.length);
  renderCategories();
  renderProducts();
  renderCart();
  setStatus(`${state.products.length} produtos carregados via ${result.source}${result.stale ? ' · cache' : ''}`, result.stale ? 'warning' : 'success');
} catch (error) {
  console.error(error);
  setStatus('Não foi possível carregar um catálogo seguro.', 'error');
  elements.products.innerHTML = `<div class="empty"><strong>Catálogo indisponível</strong><span>${String(error.message || error)}</span></div>`;
}