import type { CatalogSection, Product } from './types.ts';

export interface CatalogViewModel {
  products: Product[];
  section: CatalogSection;
  categories: string[];
  subcategories: string[];
  selectedCategory: string | null;
  selectedSubcategory: string | null;
  query: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100).replace(/\u00a0/g, ' ');
}

function sectionChip(
  id: CatalogSection,
  label: string,
  active: boolean,
): string {
  return `
    <button
      type="button"
      class="catalog-chip${active ? ' is-active' : ''}"
      data-catalog-section="${id}"
      aria-pressed="${active}"
    >${label}</button>
  `.trim();
}

function filterChip(
  value: string,
  kind: 'category' | 'subcategory',
  active: boolean,
): string {
  return `
    <button
      type="button"
      class="catalog-chip catalog-chip-secondary${active ? ' is-active' : ''}"
      data-catalog-${kind}="${escapeHtml(value)}"
      aria-pressed="${active}"
    >${escapeHtml(value)}</button>
  `.trim();
}

export function renderProductCard(product: Product): string {
  const promo = product.promoPriceCents !== null
    && product.promoPriceCents < product.priceCents;

  return `
    <article class="product-card" data-product-id="${escapeHtml(product.id)}">
      <button
        type="button"
        class="product-card-open"
        data-product-detail-target="${escapeHtml(product.id)}"
        aria-label="Ver ${escapeHtml(product.name)}"
      >
        <span class="product-placeholder" aria-hidden="true">
          <span>${escapeHtml(product.category.slice(0, 2).toUpperCase())}</span>
        </span>
        <span class="product-card-body">
          ${promo ? '<span class="offer-badge">Oferta</span>' : ''}
          <strong>${escapeHtml(product.name)}</strong>
          <small>${escapeHtml(product.unit)}</small>
          <span class="product-price">
            ${promo ? `<del>${money(product.priceCents)}</del>` : ''}
            <b>${money(promo ? product.promoPriceCents! : product.priceCents)}</b>
          </span>
        </span>
      </button>
    </article>
  `.trim();
}

export function renderCatalog(model: CatalogViewModel): string {
  const allCategories = ['Todos', ...model.categories];
  const allSubcategories = ['Todos', ...model.subcategories];

  return `
    <div class="catalog-view" data-catalog-view>
      <div class="catalog-heading">
        <div>
          <small>Catálogo de homologação</small>
          <h2>Escolha seus produtos</h2>
        </div>
        <span>${model.products.length} itens</span>
      </div>

      <form class="catalog-search" data-catalog-search role="search">
        <label for="catalog-search-input">Buscar produto</label>
        <div>
          <input
            id="catalog-search-input"
            name="query"
            type="search"
            value="${escapeHtml(model.query)}"
            placeholder="Ex.: arroz, shampoo, limpeza"
            autocomplete="off"
          />
          <button type="submit">Buscar</button>
        </div>
      </form>

      <div class="catalog-filter-group" aria-label="Seções">
        ${sectionChip('all', 'Todos', model.section === 'all')}
        ${sectionChip('offers', 'Ofertas', model.section === 'offers')}
        ${sectionChip('for-you', 'Para Você', model.section === 'for-you')}
        ${sectionChip('for-home', 'Para Casa', model.section === 'for-home')}
      </div>

      <div class="catalog-filter-stack">
        <div class="catalog-filter-group" aria-label="Categorias">
          ${allCategories.map((category) =>
            category === 'Todos'
              ? filterChip('', 'category', model.selectedCategory === null)
              : filterChip(category, 'category', model.selectedCategory === category)
          ).join('')}
        </div>

        ${model.selectedCategory && model.subcategories.length > 0 ? `
          <div class="catalog-filter-group" aria-label="Subcategorias">
            ${allSubcategories.map((subcategory) =>
              subcategory === 'Todos'
                ? filterChip('', 'subcategory', model.selectedSubcategory === null)
                : filterChip(subcategory, 'subcategory', model.selectedSubcategory === subcategory)
            ).join('')}
          </div>
        ` : ''}
      </div>

      <div class="product-grid">
        ${model.products.length > 0
          ? model.products.map(renderProductCard).join('')
          : '<div class="catalog-empty"><strong>Nenhum produto encontrado</strong><p>Tente outra busca ou escolha outro filtro.</p></div>'}
      </div>
    </div>
  `.trim();
}

export function renderProductDetail(product: Product): string {
  const promo = product.promoPriceCents !== null
    && product.promoPriceCents < product.priceCents;

  return `
    <article class="product-detail" data-product-detail="${escapeHtml(product.id)}">
      <button type="button" class="product-detail-back" data-product-detail-close>
        Voltar
      </button>
      <div class="product-detail-placeholder" aria-hidden="true">
        ${escapeHtml(product.category.slice(0, 2).toUpperCase())}
      </div>
      <div class="product-detail-copy">
        ${promo ? '<span class="offer-badge">Oferta</span>' : ''}
        <small>${escapeHtml(product.category)} · ${escapeHtml(product.subcategory)}</small>
        <h2>${escapeHtml(product.name)}</h2>
        <p>Embalagem de homologação: ${escapeHtml(product.unit)}.</p>
        <div class="product-detail-price">
          ${promo ? `<del>${money(product.priceCents)}</del>` : ''}
          <strong>${money(promo ? product.promoPriceCents! : product.priceCents)}</strong>
        </div>
        <button
          type="button"
          class="product-add"
          data-cart-add-product="${escapeHtml(product.id)}"
        >
          Adicionar ao pedido
        </button>
        <p class="homologation-note">Produto fictício para teste. Nenhum pedido real será criado.</p>
      </div>
    </article>
  `.trim();
}
