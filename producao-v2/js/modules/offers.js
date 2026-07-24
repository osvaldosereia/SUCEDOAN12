import { buildOffersPlan } from '../core/offers.js';
import { escapeHtml, money } from '../core/utils.js';
import { executeOffersPlan } from '../services/offers.js';

function actionMeta(action) {
  return {
    apply: ['success', 'Aplicar oferta'],
    clear: ['neutral', 'Limpar oferta'],
    'block-sale': ['danger', 'Bloquear venda'],
    'skip-manual': ['warning', 'Preservar manual'],
    none: ['neutral', 'Sem ação'],
  }[action] || ['neutral', action];
}

export class OffersModule {
  constructor({ store, elements, onToast, onReload, reloadConfig }) {
    this.store = store;
    this.elements = elements;
    this.onToast = onToast;
    this.onReload = onReload;
    this.reloadConfig = reloadConfig;
    this.filter = 'actionable';
    this.selected = new Set();
    this.plan = buildOffersPlan(store.state.products);
    this.bind();
    this.render();
  }

  bind() {
    this.elements.offerFilter.addEventListener('change', () => {
      this.filter = this.elements.offerFilter.value;
      this.renderRows();
    });
    this.elements.offerSelectAll.addEventListener('change', () => {
      const rows = this.visibleRows().filter(row => row.actionable);
      rows.forEach(row => this.elements.offerSelectAll.checked ? this.selected.add(row.key) : this.selected.delete(row.key));
      this.renderRows();
      this.renderControls();
    });
    this.elements.offerRows.addEventListener('change', event => {
      const key = event.target.dataset.offerSelect;
      if (!key) return;
      event.target.checked ? this.selected.add(key) : this.selected.delete(key);
      this.renderControls();
    });
    this.elements.offerConfirm.addEventListener('change', () => this.renderControls());
    this.elements.offerRecalculate.addEventListener('click', () => this.recalculate());
    this.elements.offerApply.addEventListener('click', () => this.applySelected());
  }

  recalculate() {
    this.plan = buildOffersPlan(this.store.state.products);
    const validKeys = new Set(this.plan.actionable.map(row => row.key));
    this.selected = new Set([...this.selected].filter(key => validKeys.has(key)));
    this.render();
    this.onToast('Ofertas recalculadas sem alterar produtos.', 'success');
  }

  visibleRows() {
    const rows = this.plan.rows;
    if (this.filter === 'all') return rows;
    if (this.filter === 'actionable') return rows.filter(row => row.actionable);
    if (this.filter === 'manual') return rows.filter(row => row.action === 'skip-manual');
    if (this.filter === 'errors') return rows.filter(row => row.errors.length);
    return rows.filter(row => row.action === this.filter);
  }

  render() {
    this.elements.offerMetrics.innerHTML = [
      ['success', this.plan.apply.length, 'Aplicar ofertas', 'Faixas de 3 a 105 dias'],
      ['danger', this.plan.blocked.length, 'Bloquear venda', 'Vencidos ou até 2 dias'],
      ['neutral', this.plan.clear.length, 'Limpar ofertas', 'Fora da janela ou sem estoque'],
      ['warning', this.plan.manual.length, 'Ofertas manuais', 'Nunca sobrescritas'],
    ].map(([kind, value, label, help]) => `<article class="metric-card ${kind}"><strong>${value}</strong><span>${label}</span><small>${help}</small></article>`).join('');
    this.renderRows();
    this.renderControls();
  }

  renderRows() {
    const rows = this.visibleRows();
    this.elements.offerResultCount.textContent = String(rows.length);
    this.elements.offerRows.innerHTML = rows.length ? rows.map(row => {
      const [kind, label] = actionMeta(row.action);
      const checked = this.selected.has(row.key);
      return `<tr><td><input type="checkbox" data-offer-select="${escapeHtml(row.key)}" ${checked ? 'checked' : ''} ${row.actionable ? '' : 'disabled'}></td><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.key)}</small></td><td>${escapeHtml(row.validity || '—')}<small>${row.days === null ? 'sem data' : row.days < 0 ? `${Math.abs(row.days)} dia(s) vencido` : `${row.days} dia(s)`}</small></td><td>${money(row.price)}<small>${row.discount ? `${row.discount}% → ${money(row.nextProduct.preco_oferta)}` : 'sem desconto calculado'}</small></td><td><span class="badge ${kind}">${escapeHtml(label)}</span><small>${escapeHtml(row.reason)}</small></td><td>${row.errors.length ? `<span class="badge danger">${row.errors.length} erro(s)</span>` : row.warnings.length ? `<span class="badge warning">${row.warnings.length} aviso(s)</span>` : '<span class="badge success">OK</span>'}</td></tr>`;
    }).join('') : '<tr><td colspan="6" class="empty-state">Nenhum produto nesta situação.</td></tr>';
  }

  renderControls() {
    const config = this.reloadConfig();
    const selectedPlans = this.plan.actionable.filter(row => this.selected.has(row.key));
    const ready = selectedPlans.length > 0 && config.writeMode && config.offerWriteMode && this.elements.offerConfirm.checked;
    this.elements.offerApply.disabled = !ready;
    this.elements.offerApply.textContent = selectedPlans.length ? `Aplicar em ${selectedPlans.length} produto(s)` : 'Aplicar selecionadas';
    this.elements.offerSafety.textContent = !selectedPlans.length
      ? 'Selecione ao menos uma ação simulada.'
      : !config.writeMode || !config.offerWriteMode
        ? 'Gravação bloqueada nas configurações.'
        : !this.elements.offerConfirm.checked
          ? 'Confirme a revisão antes de aplicar.'
          : 'Ações liberadas para teste controlado.';
  }

  async applySelected() {
    const config = this.reloadConfig();
    const selectedPlans = this.plan.actionable.filter(row => this.selected.has(row.key));
    if (!selectedPlans.length) return;
    this.elements.offerApply.disabled = true;
    try {
      const result = await executeOffersPlan(config, selectedPlans, {
        onProgress: progress => {
          this.elements.offerProgress.textContent = `${progress.current}/${progress.total}: ${progress.plan.name}`;
        },
      });
      if (result.saved.length) this.onToast(`${result.saved.length} produto(s) atualizado(s).`, 'success');
      if (result.failures.length) this.onToast(`${result.failures.length} produto(s) falharam e não foram alterados.`, 'error');
      this.selected.clear();
      this.elements.offerConfirm.checked = false;
      await this.onReload();
      this.recalculate();
    } catch (error) {
      this.onToast(error?.message || String(error), 'error');
    } finally {
      this.elements.offerProgress.textContent = '';
      this.renderControls();
    }
  }
}
