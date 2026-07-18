import { loadCatalog } from '../shared/catalog.js';

const state = { products: [], filtered: [] };
const elements = {
  status: document.getElementById('catalog-status'),
  count: document.getElementById('product-count'),
  resultCount: document.getElementById('result-count'),
  search: document.getElementById('search'),
  category: document.getElementById('category'),
  products: document.getElementById('products'),
  template: document.getElementById('product-template')
};

const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function productPrice(product) {
  return product.precoOferta > 0 && product.precoOferta < product.preco ? product.precoOferta : product.preco;
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
    fragment.appendChild(card);
  }

  elements.products.appendChild(fragment);
  elements.resultCount.textContent = `${state.filtered.length} resultado${state.filtered.length === 1 ? '' : 's'}`;
  if (!state.filtered.length) elements.products.innerHTML = '<div class="empty">Nenhum produto encontrado.</div>';
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

elements.search.addEventListener('input', applyFilters);
elements.category.addEventListener('change', applyFilters);

try {
  const result = await loadCatalog({
    onStatus(event) {
      if (event.phase === 'cache') setStatus(`Exibindo cache com ${event.products.length} produtos enquanto atualiza…`, 'warning');
    }
  });
  state.products = result.products;
  state.filtered = [...state.products];
  elements.count.textContent = String(state.products.length);
  renderCategories();
  renderProducts();
  setStatus(`${state.products.length} produtos carregados via ${result.source}${result.stale ? ' · cache' : ''}`, result.stale ? 'warning' : 'success');
} catch (error) {
  console.error(error);
  setStatus('Não foi possível carregar um catálogo seguro.', 'error');
  elements.products.innerHTML = `<div class="empty"><strong>Catálogo indisponível</strong><span>${String(error.message || error)}</span></div>`;
}
