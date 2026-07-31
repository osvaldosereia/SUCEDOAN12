import { ProductsModule } from './modules/products.js';
import { formatDate, money, number } from './core/utils.js';

const PATCH_FLAG = '__offerColumnsInstalled';

function getOfferPrice(product = {}) {
  return number(
    product.preco_oferta
    ?? product.valor_oferta
    ?? product.precoOferta
    ?? product.valorOferta
  );
}

function getOfferExpiration(product = {}) {
  return product.validade_oferta
    || product.validadeOferta
    || product.data_fim_oferta
    || product.dataFimOferta
    || '';
}

function ensureStyles() {
  if (document.getElementById('productsOfferColumnsStyles')) return;
  const style = document.createElement('style');
  style.id = 'productsOfferColumnsStyles';
  style.textContent = `
    .product-panel .data-table { min-width: 1240px; }
    .offer-list-value,
    .offer-list-expiration { white-space: nowrap; }
    .offer-list-value strong { display: block; font-size: .95rem; }
    .offer-list-value small { display: block; margin-top: 3px; color: var(--muted, #747474); }
    .offer-list-empty { color: var(--muted, #747474); }
  `;
  document.head.appendChild(style);
}

function ensureHeaders(module) {
  const table = module.elements.productsTableBody?.closest('table');
  const headerRow = table?.tHead?.rows?.[0];
  if (!headerRow) return;

  if (!headerRow.querySelector('[data-offer-price-column]')) {
    const header = document.createElement('th');
    header.dataset.offerPriceColumn = '';
    header.textContent = 'Valor da oferta';
    headerRow.cells[2]?.after(header);
  }

  if (!headerRow.querySelector('[data-offer-expiration-column]')) {
    const validityHeader = [...headerRow.cells]
      .find(cell => cell.textContent.trim().toLowerCase() === 'validade');
    const header = document.createElement('th');
    header.dataset.offerExpirationColumn = '';
    header.textContent = 'Validade da oferta';
    validityHeader?.after(header);
  }
}

function renderOfferColumns(module) {
  ensureStyles();
  ensureHeaders(module);

  const body = module.elements.productsTableBody;
  if (!body) return;

  const products = module.filteredProducts();
  const start = (module.store.state.filters.page - 1) * module.pageSize;
  const visible = products.slice(start, start + module.pageSize);
  const rows = [...body.querySelectorAll('tr')];

  if (!visible.length) {
    const emptyCell = body.querySelector('.empty-state');
    if (emptyCell) emptyCell.colSpan = 10;
    return;
  }

  rows.forEach((row, index) => {
    const product = visible[index];
    if (!product || row.querySelector('.empty-state')) return;

    const offerPrice = getOfferPrice(product);
    const offerPriceCell = document.createElement('td');
    offerPriceCell.className = 'offer-list-value';
    offerPriceCell.innerHTML = offerPrice > 0
      ? `<strong>${money(offerPrice)}</strong><small>Preço promocional</small>`
      : '<span class="offer-list-empty">—</span>';
    row.cells[2]?.after(offerPriceCell);

    const expiration = getOfferExpiration(product);
    const offerExpirationCell = document.createElement('td');
    offerExpirationCell.className = 'offer-list-expiration';
    offerExpirationCell.textContent = expiration ? formatDate(expiration) : '—';

    const validityCell = [...row.cells]
      .find((cell, cellIndex) => cellIndex > 3 && cell.querySelector('[data-inline-field="validade"]'));
    validityCell?.after(offerExpirationCell);
  });
}

if (!ProductsModule.prototype[PATCH_FLAG]) {
  const originalRenderTable = ProductsModule.prototype.renderTable;
  Object.defineProperty(ProductsModule.prototype, PATCH_FLAG, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  ProductsModule.prototype.renderTable = function renderTableWithOfferColumns(...args) {
    const result = originalRenderTable.apply(this, args);
    renderOfferColumns(this);
    return result;
  };
}
