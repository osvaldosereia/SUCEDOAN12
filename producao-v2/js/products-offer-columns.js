import { ProductsModule } from './modules/products.js';
import { formatDate, number } from './core/utils.js';

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

function maskBrDate(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');
}

function dateToIso(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  let day;
  let month;
  let year;
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else {
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 8) return null;
    day = Number(digits.slice(0, 2));
    month = Number(digits.slice(2, 4));
    year = Number(digits.slice(4));
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function displayDateInput(value) {
  const formatted = formatDate(value);
  return /^\d{2}\/\d{2}\/\d{4}$/.test(formatted) ? formatted : '';
}

function roundMoney(value) {
  return Math.max(0, Math.round((number(value) || 0) * 100) / 100);
}

function ensureStyles() {
  if (document.getElementById('productsOfferColumnsStyles')) return;
  const style = document.createElement('style');
  style.id = 'productsOfferColumnsStyles';
  style.textContent = `
    .product-panel .data-table { min-width: 1380px; }
    .offer-list-value,
    .offer-list-expiration { white-space: nowrap; }
    .offer-list-value .inline-product-input { min-width: 112px; }
    .offer-list-expiration .inline-product-input { min-width: 132px; }
    .offer-list-value small { display: block; margin-top: 3px; color: var(--muted, #747474); }
    .product-panel .data-table th:last-child,
    .product-panel .data-table td:last-child {
      position: sticky;
      right: 0;
      min-width: 235px;
      background: var(--surface, #fff);
      box-shadow: -10px 0 16px -16px rgba(24,32,25,.55);
    }
    .product-panel .data-table th:last-child {
      z-index: 5;
      background: #f6f7f5;
    }
    .product-panel .data-table td:last-child { z-index: 2; }
    .product-panel .data-table tr:hover td:last-child { background: #fafbf9; }
    .product-panel .data-table tr.dirty-row td:last-child { background: #fffaf0; }
    .product-panel .row-actions {
      justify-content: flex-start;
      flex-wrap: wrap;
      min-width: 215px;
    }
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

    const key = String(product.firebaseKey || product.id || product.codigo || '');
    const offerPrice = getOfferPrice(product);
    const offerPriceCell = document.createElement('td');
    offerPriceCell.className = 'offer-list-value';
    offerPriceCell.innerHTML = `<div class="inline-price-cell">${module.inlineInput(
      key,
      'preco_oferta',
      offerPrice > 0 ? offerPrice : '',
      'number',
      'min="0" step="0.01" inputmode="decimal" placeholder="0,00"',
    )}<small>Preço promocional</small></div>`;
    row.cells[2]?.after(offerPriceCell);

    const offerExpirationCell = document.createElement('td');
    offerExpirationCell.className = 'offer-list-expiration';
    offerExpirationCell.innerHTML = module.inlineInput(
      key,
      'validade_oferta',
      displayDateInput(getOfferExpiration(product)),
      'text',
      'inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA"',
    );

    const validityCell = [...row.cells]
      .find((cell, cellIndex) => cellIndex > 3 && cell.querySelector('[data-inline-field="validade"]'));
    validityCell?.after(offerExpirationCell);
  });
}

function markOfferChange(module, input, key, patch) {
  module.store.updateProduct(key, patch);
  input.closest('tr')?.classList.add('dirty-row');
  const save = input.closest('tr')?.querySelector('[data-inline-save]');
  if (save) save.disabled = false;
  module.renderDirty();
  const selected = module.store.getProduct(module.store.state.selectedProductKey);
  if (selected) module.renderValidation(selected);
}

if (!ProductsModule.prototype[PATCH_FLAG]) {
  const originalRenderTable = ProductsModule.prototype.renderTable;
  const originalHandleInlineInput = ProductsModule.prototype.handleInlineInput;

  Object.defineProperty(ProductsModule.prototype, PATCH_FLAG, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  ProductsModule.prototype.handleInlineInput = function handleInlineOfferInput(event) {
    const input = event.target.closest('[data-inline-product][data-inline-field]');
    const field = input?.dataset.inlineField;
    if (!input || !['preco_oferta', 'validade_oferta'].includes(field)) {
      return originalHandleInlineInput.call(this, event);
    }

    const key = input.dataset.inlineProduct;
    const product = this.store.getProduct(key);
    if (!key || !product) return;

    if (field === 'preco_oferta') {
      const offerPrice = roundMoney(input.value);
      const patch = { preco_oferta: offerPrice };
      const existingExpiration = getOfferExpiration(product);
      if (offerPrice > 0 && !product.validade_oferta && existingExpiration) {
        const normalizedExpiration = dateToIso(existingExpiration);
        if (normalizedExpiration) patch.validade_oferta = normalizedExpiration;
      }
      markOfferChange(this, input, key, patch);
      return;
    }

    const masked = maskBrDate(input.value);
    input.value = masked;
    const expiration = dateToIso(masked);
    if (expiration === null) {
      if (masked.replace(/\D/g, '').length === 8) {
        this.onToast('Digite uma validade de oferta válida no formato DD/MM/AAAA.', 'error');
      }
      return;
    }

    const patch = { validade_oferta: expiration };
    const existingOfferPrice = getOfferPrice(product);
    if (existingOfferPrice > 0 && !Object.prototype.hasOwnProperty.call(product, 'preco_oferta')) {
      patch.preco_oferta = existingOfferPrice;
    }
    markOfferChange(this, input, key, patch);
  };

  ProductsModule.prototype.renderTable = function renderTableWithOfferColumns(...args) {
    const result = originalRenderTable.apply(this, args);
    renderOfferColumns(this);
    return result;
  };
}