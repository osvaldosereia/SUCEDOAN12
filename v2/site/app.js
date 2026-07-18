import { loadCatalog, createProductIndex } from '../shared/catalog.js';
import { cartSummary, clearCart, decrement, getQuantity, increment, subscribeCart } from '../shared/cart.js';
import { getFavorites, isFavorite, subscribeFavorites, toggleFavorite } from '../shared/favorites.js';
import { currentRoute, productRoute, subscribeRoute } from '../shared/router.js';

const state = { products: [], productMap: new Map(), query: '', category: '' };
const app = document.getElementById('app');
const status = document.getElementById('catalog-status');
const cartButton = document.getElementById('cart-button');
const cartCount = document.getElementById('cart-count');
const cartDrawer = document.getElementById('cart-drawer');
const cartOverlay = document.getElementById('cart-overlay');
const cartClose = document.getElementById('cart-close');
const cartItems = document.getElementById('cart-items');
const cartTotal = document.getElementById('cart-total');
const cartClear = document.getElementById('cart-clear');
const favoritesCount = document.getElementById('favorites-count');

const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const image = product => product.imagem || '../../img/logoantonia5.png';
const price = product => product.precoOferta > 0 && product.precoOferta < product.preco ? product.precoOferta : product.preco;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char]));

function controls(product) {
  const quantity = getQuantity(product.id);
  if (!quantity) return `<button class="add-button" type="button" data-cart-action="add" data-product-id="${escapeHtml(product.id)}">Adicionar</button>`;
  return `<div class="quantity-control"><button type="button" data-cart-action="decrement" data-product-id="${escapeHtml(product.id)}">−</button><strong>${quantity}</strong><button type="button" data-cart-action="increment" data-product-id="${escapeHtml(product.id)}">+</button></div>`;
}

function productCard(product) {
  return `<article class="product-card">
    <div class="product-image"><a href="${productRoute(product.id)}"><img width="320" height="320" loading="lazy" decoding="async" src="${escapeHtml(image(product))}" alt="${escapeHtml(product.nome)}" onerror="this.onerror=null;this.src='../../img/logoantonia5.png'"></a><button class="favorite-button${isFavorite(product.id) ? ' active' : ''}" type="button" data-favorite-id="${escapeHtml(product.id)}" aria-label="Favoritar">♡</button></div>
    <div class="product-copy"><span class="product-category">${escapeHtml(product.categoria || 'Produto')}</span><h3><a href="${productRoute(product.id)}">${escapeHtml(product.nome)}</a></h3><p class="product-meta">${escapeHtml([product.marca, product.embalagem].filter(Boolean).join(' · '))}</p><div class="product-bottom"><strong class="product-price">${money(price(product))}</strong><span class="product-stock">${product.estoque} em estoque</span></div><div class="product-actions">${controls(product)}</div></div>
  </article>`;
}

function filteredProducts() {
  const query = normalize(state.query);
  return state.products.filter(product => {
    const haystack = normalize([product.nome, product.marca, product.categoria, product.subcategoria, product.codigo, product.gtin].join(' '));
    return (!query || haystack.includes(query)) && (!state.category || product.categoria === state.category);
  });
}

function renderHome() {
  const products = filteredProducts();
  const categories = Array.from(new Set(state.products.map(product => product.categoria).filter(Boolean))).sort((a,b) => a.localeCompare(b,'pt-BR'));
  app.innerHTML = `<section class="hero"><div><span class="eyebrow">AMBIENTE SEPARADO</span><h1>Catálogo rápido, seguro e preparado para crescer.</h1><p>Esta versão utiliza uma camada central de dados e não altera o site atual.</p></div><div class="hero-card"><strong>${state.products.length}</strong><span>produtos disponíveis</span></div></section>
  <section class="toolbar"><label><span>Buscar produto</span><input id="search" type="search" value="${escapeHtml(state.query)}" placeholder="Ex.: arroz, café, Omo"></label><label><span>Categoria</span><select id="category"><option value="">Todas</option>${categories.map(category => `<option${category===state.category?' selected':''}>${escapeHtml(category)}</option>`).join('')}</select></label></section>
  <section><div class="section-head"><div><span class="eyebrow">CATÁLOGO</span><h2>Produtos</h2></div><span class="result-count">${products.length} resultados</span></div><div class="products-grid">${products.slice(0,120).map(productCard).join('') || '<div class="empty">Nenhum produto encontrado.</div>'}</div></section>`;
  document.getElementById('search').addEventListener('input', event => { state.query = event.target.value; renderHome(); document.getElementById('search')?.focus(); });
  document.getElementById('category').addEventListener('change', event => { state.category = event.target.value; renderHome(); });
}

function renderFavorites() {
  const ids = new Set(getFavorites());
  const products = state.products.filter(product => ids.has(product.id));
  app.innerHTML = `<section class="simple-page"><div class="section-head"><div><span class="eyebrow">SALVOS NESTE DISPOSITIVO</span><h1>Favoritos</h1></div><span class="result-count">${products.length} produtos</span></div><div class="products-grid">${products.map(productCard).join('') || '<div class="empty">Você ainda não favoritou produtos.</div>'}</div></section>`;
}

function renderProduct(id) {
  const product = state.productMap.get(String(id || '').toLowerCase());
  if (!product) { app.innerHTML = '<div class="empty">Produto não encontrado.</div>'; return; }
  app.innerHTML = `<section class="product-detail"><a class="back-link" href="#/">← Voltar</a><div class="detail-grid"><div class="detail-image"><img src="${escapeHtml(image(product))}" alt="${escapeHtml(product.nome)}" onerror="this.onerror=null;this.src='../../img/logoantonia5.png'"></div><div class="detail-copy"><span class="eyebrow">${escapeHtml(product.categoria || 'PRODUTO')}</span><h1>${escapeHtml(product.nome)}</h1><p>${escapeHtml(product.descricao || [product.marca, product.embalagem].filter(Boolean).join(' · '))}</p><div class="detail-price">${money(price(product))}</div><small>${product.estoque} unidades disponíveis</small><button class="detail-favorite${isFavorite(product.id)?' active':''}" type="button" data-favorite-id="${escapeHtml(product.id)}">${isFavorite(product.id)?'Remover dos favoritos':'Adicionar aos favoritos'}</button><div class="detail-cart">${controls(product)}</div></div></div></section>`;
}

function renderRoute() {
  const route = currentRoute();
  if (route.name === 'produto') return renderProduct(route.segments[1]);
  if (route.name === 'favoritos') return renderFavorites();
  renderHome();
}

function renderCart() {
  const summary = cartSummary(state.productMap);
  cartCount.textContent = String(summary.units);
  cartTotal.textContent = money(summary.total);
  cartItems.innerHTML = summary.rows.length ? summary.rows.map(({ product, quantity, subtotal }) => `<article class="cart-row"><img src="${escapeHtml(image(product))}" alt="${escapeHtml(product.nome)}"><div><strong>${escapeHtml(product.nome)}</strong><span>${money(subtotal)}</span></div><div class="quantity-control"><button data-cart-action="decrement" data-product-id="${escapeHtml(product.id)}">−</button><strong>${quantity}</strong><button data-cart-action="increment" data-product-id="${escapeHtml(product.id)}">+</button></div></article>`).join('') : '<div class="empty">Sua compra está vazia.</div>';
  renderRoute();
}

function renderFavoritesCount() { favoritesCount.textContent = String(getFavorites().length); renderRoute(); }
function setStatus(message, type='') { status.textContent = message; status.dataset.type = type; }
function openCart() { cartDrawer.setAttribute('aria-hidden','false'); cartButton.setAttribute('aria-expanded','true'); cartOverlay.hidden=false; }
function closeCart() { cartDrawer.setAttribute('aria-hidden','true'); cartButton.setAttribute('aria-expanded','false'); cartOverlay.hidden=true; }

cartButton.addEventListener('click', openCart);
cartClose.addEventListener('click', closeCart);
cartOverlay.addEventListener('click', closeCart);
cartClear.addEventListener('click', clearCart);
document.addEventListener('click', event => {
  const favorite = event.target.closest('[data-favorite-id]');
  if (favorite) { toggleFavorite(favorite.dataset.favoriteId); return; }
  const button = event.target.closest('[data-cart-action]');
  if (!button) return;
  const product = state.productMap.get(String(button.dataset.productId).toLowerCase());
  if (!product) return;
  if (button.dataset.cartAction === 'add' || button.dataset.cartAction === 'increment') increment(product.id, product.estoque);
  if (button.dataset.cartAction === 'decrement') decrement(product.id);
});
subscribeCart(renderCart);
subscribeFavorites(renderFavoritesCount);
subscribeRoute(renderRoute);

try {
  const result = await loadCatalog({ onStatus(event) { if (event.phase === 'cache') setStatus(`Exibindo cache com ${event.products.length} produtos enquanto atualiza…`,'warning'); } });
  state.products = result.products;
  state.productMap = createProductIndex(state.products);
  renderFavoritesCount();
  renderCart();
  setStatus(`${state.products.length} produtos carregados via ${result.source}${result.stale?' · cache':''}`, result.stale?'warning':'success');
} catch (error) {
  console.error(error);
  setStatus('Não foi possível carregar um catálogo seguro.','error');
  app.innerHTML = `<div class="empty"><strong>Catálogo indisponível</strong><span>${escapeHtml(error.message || error)}</span></div>`;
}
