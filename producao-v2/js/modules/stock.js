import { filterStockRows, normalizeStockDate, stockDashboard } from '../core/stock.js';
import { debounce, escapeHtml, number, productCode, productImage, productKey, productName } from '../core/utils.js';
import { executeStockAdjustment } from '../services/stock-transaction.js';

const PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" fill="#f1f2ef"/><text x="50%" y="53%" text-anchor="middle" fill="#899087" font-family="Arial" font-size="10">sem foto</text></svg>')}`;

function statusBadge(status) {
  const kind = {
    expired: 'danger', critical: 'danger', upcoming: 'warning', 'no-stock': 'danger',
    'no-validity': 'warning', 'low-stock': 'warning', healthy: 'success',
  }[status.code] || 'neutral';
  return `<span class="badge ${kind}">${escapeHtml(status.label)}</span>`;
}

function daysLabel(days) {
  if (days === null) return '—';
  if (days < 0) return `${Math.abs(days)} dia(s) vencido`;
  if (days === 0) return 'Vence hoje';
  return `${days} dia(s)`;
}

function maskDate(value = '') {
  const raw = String(value || '').replace(/\D/g, '').slice(0, 8);
  const parts = [];
  if (raw.length) parts.push(raw.slice(0, 2));
  if (raw.length > 2) parts.push(raw.slice(2, 4));
  if (raw.length > 4) parts.push(raw.slice(4, 8));
  return parts.join('/');
}

export class StockModule {
  constructor({ store, elements, onToast, onReload, reloadConfig }) {
    this.store = store;
    this.elements = elements;
    this.onToast = onToast;
    this.onReload = onReload;
    this.reloadConfig = reloadConfig;
    this.filters = { query: '', status: '', windowDays: '', sort: 'expiry' };
    this.selectedKey = '';
    this.bind();
    this.render();
  }

  bind() {
    this.elements.stockSearch.addEventListener('input', debounce(() => {
      this.filters.query = this.elements.stockSearch.value;
      this.renderTable();
    }, 180));
    [this.elements.stockStatusFilter, this.elements.stockWindowFilter, this.elements.stockSort].forEach(element => element.addEventListener('change', () => {
      this.filters.status = this.elements.stockStatusFilter.value;
      this.filters.windowDays = this.elements.stockWindowFilter.value;
      this.filters.sort = this.elements.stockSort.value;
      this.renderTable();
    }));
    this.elements.stockTableBody.addEventListener('click', event => {
      const button = event.target.closest('[data-stock-edit]');
      if (button) this.openEditor(button.dataset.stockEdit);
    });
    this.elements.stockCloseEditor.addEventListener('click', () => this.closeEditor());
    this.elements.stockCancelEditor.addEventListener('click', () => this.closeEditor());
    this.elements.stockSaveEditor.addEventListener('click', () => this.saveEditor());
    this.elements.stockNoExpiry.addEventListener('change', () => {
      this.elements.stockValidity.disabled = this.elements.stockNoExpiry.checked;
      if (this.elements.stockNoExpiry.checked) this.elements.stockValidity.value = '';
      this.renderEditorPlan();
    });
    this.elements.stockValidity.addEventListener('input', () => {
      this.elements.stockValidity.value = maskDate(this.elements.stockValidity.value);
      this.renderEditorPlan();
    });
    [this.elements.stockValue, this.elements.stockReason].forEach(element => element.addEventListener('input', () => this.renderEditorPlan()));
  }

  rows() {
    return filterStockRows(this.store.state.products, this.filters, { lowThreshold: 5 });
  }

  render() {
    const dashboard = stockDashboard(this.store.state.products, { lowThreshold: 5 });
    this.elements.stockMetrics.innerHTML = [
      ['danger', dashboard.expired, 'Vencidos', 'Precisam de ação'],
      ['danger', dashboard.noStock, 'Sem estoque', 'Indisponíveis'],
      ['warning', dashboard.next30, 'Próximos 30 dias', 'Ordenados por vencimento'],
      ['warning', dashboard.noValidity, 'Sem validade', 'Revisar cadastro'],
      ['warning', dashboard.lowStock, 'Estoque baixo', 'Até 5 unidades'],
    ].map(([kind, value, label, help]) => `<article class="metric-card ${kind}"><strong>${value}</strong><span>${label}</span><small>${help}</small></article>`).join('');
    this.renderTable();
  }

  renderTable() {
    const rows = this.rows();
    this.elements.stockResultCount.textContent = String(rows.length);
    this.elements.stockTableBody.innerHTML = rows.length ? rows.slice(0, 300).map(({ product, status }) => `<tr>
      <td><div class="product-cell"><img class="product-thumb" src="${escapeHtml(productImage(product) || PLACEHOLDER)}" onerror="this.src='${PLACEHOLDER}'" alt=""><div><strong>${escapeHtml(productName(product))}</strong><small>${escapeHtml(productCode(product) || productKey(product))} · ${escapeHtml(product.categoria || 'Sem categoria')}</small></div></div></td>
      <td><strong>${number(status.stock)}</strong></td>
      <td><div class="cell-stack"><strong>${escapeHtml(status.validity || '—')}</strong><span>${escapeHtml(daysLabel(status.days))}</span></div></td>
      <td>${statusBadge(status)}</td>
      <td><div class="cell-stack"><strong>${status.lots.length}</strong><span>${escapeHtml(status.lots[0]?.validade || 'sem lote datado')}</span></div></td>
      <td><div class="cell-stack"><strong>${escapeHtml(product.gondola || '—')}</strong><span>${escapeHtml(product.prateleira || '')}</span></div></td>
      <td><button class="row-action" type="button" data-stock-edit="${escapeHtml(productKey(product))}">Ajustar</button></td>
    </tr>`).join('') : '<tr><td colspan="7" class="empty-state">Nenhum produto corresponde aos filtros.</td></tr>';
  }

  product() {
    return this.store.state.products.find(product => productKey(product) === this.selectedKey) || null;
  }

  openEditor(key) {
    const product = this.store.state.products.find(candidate => productKey(candidate) === String(key));
    if (!product) return;
    this.selectedKey = String(key);
    this.elements.stockEditorTitle.textContent = productName(product);
    this.elements.stockEditorSubtitle.textContent = `${productCode(product) || key} · ajuste protegido`;
    this.elements.stockValue.value = String(number(product.estoque));
    this.elements.stockValidity.value = normalizeStockDate(product.validade);
    this.elements.stockNoExpiry.checked = !normalizeStockDate(product.validade);
    this.elements.stockValidity.disabled = this.elements.stockNoExpiry.checked;
    this.elements.stockReason.value = '';
    this.elements.stockEditor.classList.add('open');
    this.elements.stockEditor.setAttribute('aria-hidden', 'false');
    this.elements.stockBackdrop.hidden = false;
    this.renderEditorPlan();
  }

  closeEditor() {
    this.selectedKey = '';
    this.elements.stockEditor.classList.remove('open');
    this.elements.stockEditor.setAttribute('aria-hidden', 'true');
    this.elements.stockBackdrop.hidden = true;
  }

  renderEditorPlan() {
    const product = this.product();
    if (!product) return;
    const stock = Math.max(0, Math.floor(number(this.elements.stockValue.value)));
    const validity = this.elements.stockNoExpiry.checked ? '' : normalizeStockDate(this.elements.stockValidity.value);
    const changes = [];
    if (stock !== number(product.estoque)) changes.push(`Estoque: ${number(product.estoque)} → ${stock}`);
    if (validity !== normalizeStockDate(product.validade)) changes.push(`Validade: ${normalizeStockDate(product.validade) || '—'} → ${validity || 'sem validade'}`);
    this.elements.stockEditorPlan.innerHTML = changes.length ? changes.map(change => `<div>${escapeHtml(change)}</div>`).join('') : '<div>Nenhuma alteração.</div>';
    const config = this.reloadConfig();
    this.elements.stockSaveEditor.disabled = !(changes.length && this.elements.stockReason.value.trim() && config.writeMode && config.stockWriteMode);
    this.elements.stockEditorSafety.textContent = config.writeMode && config.stockWriteMode
      ? 'Ajuste habilitado para teste controlado.'
      : 'Gravação bloqueada nas configurações.';
  }

  async saveEditor() {
    const product = this.product();
    if (!product) return;
    const config = this.reloadConfig();
    this.elements.stockSaveEditor.disabled = true;
    this.elements.stockSaveEditor.textContent = 'Salvando…';
    try {
      const saved = await executeStockAdjustment(config, product, {
        stock: this.elements.stockValue.value,
        validity: this.elements.stockValidity.value,
        noExpiry: this.elements.stockNoExpiry.checked,
        reason: this.elements.stockReason.value,
      });
      this.onToast(`${productName(saved)} ajustado com segurança.`, 'success');
      await this.onReload();
      this.closeEditor();
    } catch (error) {
      console.error(error);
      this.onToast(error?.message || String(error), 'error');
    } finally {
      this.elements.stockSaveEditor.textContent = 'Salvar ajuste';
      this.renderEditorPlan();
    }
  }
}
