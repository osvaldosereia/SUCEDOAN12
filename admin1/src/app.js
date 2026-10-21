import { adminApi } from './api.js';
import { filterProducts, getProductStockState, listProductCategories } from './products.js';

const $ = (selector, root = document) => root.querySelector(selector);
const state = { products: [], nextOffset: null, query: '', category: '', stock: '' };
const workspace = $('#workspace');
let searchTimer;
let requestVersion = 0;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function formatMoney(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatQuantity(quantity) {
  return Number(quantity || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function productImage(product) {
  if (product.image_url) {
    return `<img src="${escapeHtml(product.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  }
  return '<span class="product-placeholder" aria-hidden="true">▦</span>';
}

function stockBadge(product) {
  const status = getProductStockState(product.stock_quantity);
  const className = status.key === 'available' ? 'good' : status.key === 'low' ? 'attention' : 'muted';
  return `<span class="status-pill ${className}"><i aria-hidden="true"></i>${status.label}</span>`;
}

function productRow(product) {
  const secondary = [product.brand, product.packaging].filter(Boolean).join(' · ');
  return `<tr>
    <td><div class="product-cell">${productImage(product)}<span><strong>${escapeHtml(product.name || 'Produto sem nome')}</strong><small>${escapeHtml(secondary || '—')}</small></span></div></td>
    <td>${escapeHtml(product.category || 'Sem categoria')}</td>
    <td>${escapeHtml(product.sku || '—')}</td>
    <td class="money-cell">${formatMoney(product.sale_price_cents)}</td>
    <td><div class="stock-cell"><strong>${formatQuantity(product.stock_quantity)}</strong>${stockBadge(product)}</div></td>
  </tr>`;
}

function productCard(product) {
  const secondary = [product.brand, product.packaging].filter(Boolean).join(' · ');
  return `<article class="product-mobile-card">
    <div class="product-mobile-image">${productImage(product)}</div>
    <div class="product-mobile-main">
      <span class="product-mobile-category">${escapeHtml(product.category || 'Sem categoria')}</span>
      <strong>${escapeHtml(product.name || 'Produto sem nome')}</strong>
      <small>${escapeHtml(secondary || product.sku || '—')}</small>
      <div class="product-mobile-meta"><b>${formatMoney(product.sale_price_cents)}</b><span>Estoque ${formatQuantity(product.stock_quantity)}</span></div>
      ${stockBadge(product)}
    </div>
  </article>`;
}

function getVisibleProducts() {
  return filterProducts(state.products, { query: '', category: state.category, stock: state.stock });
}

function renderProducts() {
  const visibleProducts = getVisibleProducts();
  const categories = listProductCategories(state.products);
  const lowStock = state.products.filter(product => ['low', 'out'].includes(getProductStockState(product.stock_quantity).key)).length;
  const outOfStock = state.products.filter(product => getProductStockState(product.stock_quantity).key === 'out').length;
  const hasFilters = Boolean(state.category || state.stock);

  workspace.innerHTML = `
    <div class="page-heading">
      <div><span class="eyebrow">CATÁLOGO ATIVO</span><h1>Produtos</h1><p>Encontre e confira rapidamente os produtos disponíveis na loja.</p></div>
      <span class="readonly-badge"><i aria-hidden="true"></i>Catálogo conectado</span>
    </div>
    <section class="metric-row product-metrics" aria-label="Resumo dos produtos carregados">
      <article class="metric-card"><span>Carregados</span><strong>${state.products.length}</strong><small>Produtos nesta consulta</small></article>
      <article class="metric-card"><span>Estoque baixo</span><strong>${lowStock}</strong><small>Até 5 unidades</small></article>
      <article class="metric-card"><span>Sem estoque</span><strong>${outOfStock}</strong><small>Confira antes de vender</small></article>
    </section>
    <section class="panel products-panel" aria-label="Lista de produtos">
      <div class="panel-toolbar products-toolbar">
        <label class="search-wrap"><span aria-hidden="true">⌕</span><input id="productSearch" type="search" autocomplete="off" placeholder="Buscar nome, SKU, EAN ou marca" value="${escapeHtml(state.query)}" aria-label="Buscar produtos"></label>
        <label class="filter-field"><span>Categoria</span><select id="categoryFilter" aria-label="Filtrar por categoria"><option value="">Todas as categorias</option>${categories.map(category => `<option value="${escapeHtml(category)}" ${state.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select></label>
        <label class="filter-field"><span>Estoque</span><select id="stockFilter" aria-label="Filtrar por estoque"><option value="">Todos</option><option value="available" ${state.stock === 'available' ? 'selected' : ''}>Disponível</option><option value="low" ${state.stock === 'low' ? 'selected' : ''}>Estoque baixo</option><option value="out" ${state.stock === 'out' ? 'selected' : ''}>Sem estoque</option></select></label>
        <button class="button secondary refresh-button" id="refreshProducts" type="button"><span aria-hidden="true">↻</span> Atualizar</button>
      </div>
      <div class="list-summary"><span><strong>${visibleProducts.length}</strong> ${visibleProducts.length === 1 ? 'produto exibido' : 'produtos exibidos'}${hasFilters ? ' com os filtros atuais' : ''}</span>${hasFilters ? '<button class="text-button" id="clearFilters" type="button">Limpar filtros</button>' : ''}</div>
      ${visibleProducts.length ? `
        <div class="table-scroll"><table class="data-table products-table"><thead><tr><th scope="col">Produto</th><th scope="col">Categoria</th><th scope="col">SKU</th><th scope="col">Preço</th><th scope="col">Estoque</th></tr></thead><tbody>${visibleProducts.map(productRow).join('')}</tbody></table></div>
        <div class="products-mobile-list">${visibleProducts.map(productCard).join('')}</div>
      ` : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">⌕</span><strong>${state.products.length ? 'Nenhum produto encontrado' : 'Nenhum produto disponível'}</strong><span>${state.products.length ? 'Tente ajustar os filtros ou a busca.' : 'Atualize a lista para consultar novamente.'}</span></div>`}
      <div class="panel-foot products-footer"><span>${state.products.length} carregados nesta consulta</span>${state.nextOffset !== null ? '<button class="quiet-button" id="loadMore" type="button">Carregar mais produtos <span aria-hidden="true">→</span></button>' : ''}</div>
    </section>
    <p class="readonly-note">Esta tela consulta o catálogo da loja. Edição e cadastro serão liberados em uma próxima etapa.</p>`;

  $('#productSearch').addEventListener('input', event => {
    clearTimeout(searchTimer);
    const query = event.currentTarget.value.trim();
    searchTimer = setTimeout(() => {
      state.query = query;
      loadProducts();
    }, 250);
  });
  $('#categoryFilter').addEventListener('change', event => {
    state.category = event.currentTarget.value;
    renderProducts();
  });
  $('#stockFilter').addEventListener('change', event => {
    state.stock = event.currentTarget.value;
    renderProducts();
  });
  $('#refreshProducts').addEventListener('click', () => loadProducts());
  $('#clearFilters')?.addEventListener('click', () => {
    state.category = '';
    state.stock = '';
    state.query = '';
    loadProducts();
  });
  $('#loadMore')?.addEventListener('click', () => loadProducts({ append: true }));
}

function renderLoading() {
  workspace.innerHTML = '<div class="loading-card"><span class="spinner" aria-hidden="true"></span><strong>Carregando produtos…</strong><small>Consultando o catálogo da loja.</small></div>';
}

async function loadProducts({ append = false } = {}) {
  const currentVersion = ++requestVersion;
  if (!append) renderLoading();
  try {
    const result = await adminApi('products', {
      limit: 36,
      offset: append ? state.nextOffset : 0,
      q: state.query
    });
    if (currentVersion !== requestVersion) return;
    state.products = append ? [...state.products, ...result.products] : result.products;
    state.nextOffset = result.next_offset;
    renderProducts();
  } catch (error) {
    if (currentVersion !== requestVersion) return;
    workspace.innerHTML = `<div class="empty-state error-state"><strong>Não foi possível carregar os produtos</strong><span>${escapeHtml(error.message || 'Verifique a conexão e tente novamente.')}</span><button class="button secondary" id="retryProducts" type="button">Tentar novamente</button></div>`;
    $('#retryProducts').addEventListener('click', () => loadProducts());
  }
}

$('#sessionLabel').textContent = 'Somente leitura';
$('#currentSection').textContent = 'Produtos';
loadProducts();
