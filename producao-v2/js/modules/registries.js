import { buildRegistries, buildRegistryRenamePlan, registrySummary } from '../core/registries.js';
import { escapeHtml, normalizeSearch } from '../core/utils.js';
import { executeRegistryRename } from '../services/registries.js';

const TYPES = {
  categories: ['category', 'subcategory', 'subsubcategory'],
  brands: ['brand'],
  suppliers: ['supplier'],
  tags: ['tag'],
};
const LABELS = { category: 'Categoria', subcategory: 'Subcategoria', subsubcategory: 'Subsubcategoria', brand: 'Marca', supplier: 'Fornecedor', tag: 'Tag' };

export class RegistriesModule {
  constructor({ store, elements, onToast, onReload, reloadConfig }) {
    this.store = store;
    this.elements = elements;
    this.onToast = onToast;
    this.onReload = onReload;
    this.reloadConfig = reloadConfig;
    this.tab = 'categories';
    this.query = '';
    this.selected = null;
    this.registries = buildRegistries(store.state.products);
    this.bind();
    this.render();
  }

  bind() {
    this.elements.registryTabs.addEventListener('click', event => {
      const button = event.target.closest('[data-registry-tab]');
      if (!button) return;
      this.tab = button.dataset.registryTab;
      this.elements.registryTabs.querySelectorAll('[data-registry-tab]').forEach(tab => tab.classList.toggle('active', tab === button));
      this.renderRows();
    });
    this.elements.registrySearch.addEventListener('input', () => {
      this.query = this.elements.registrySearch.value;
      this.renderRows();
    });
    this.elements.registryRows.addEventListener('click', event => {
      const button = event.target.closest('[data-registry-open]');
      if (!button) return;
      const [type, index] = button.dataset.registryOpen.split(':');
      const row = this.registries[type]?.[Number(index)];
      if (row) this.open(row);
    });
    this.elements.registryClose.addEventListener('click', () => this.close());
    this.elements.registryCancel.addEventListener('click', () => this.close());
    this.elements.registryNewValue.addEventListener('input', () => this.renderPlan());
    this.elements.registryConfirm.addEventListener('change', () => this.renderPlan());
    this.elements.registrySave.addEventListener('click', () => this.save());
  }

  refresh() {
    this.registries = buildRegistries(this.store.state.products);
    this.render();
  }

  render() {
    const summary = registrySummary(this.registries);
    this.elements.registryMetrics.innerHTML = [
      ['info', summary.categories, 'Categorias', 'Hierarquia principal'],
      ['info', summary.brands, 'Marcas', 'Usadas nos produtos'],
      ['info', summary.suppliers, 'Fornecedores', 'Usados nos produtos'],
      ['warning', summary.duplicates, 'Variações duplicadas', 'Maiúsculas, acentos ou espaços'],
    ].map(([kind, value, label, help]) => `<article class="metric-card ${kind}"><strong>${value}</strong><span>${label}</span><small>${help}</small></article>`).join('');
    this.renderRows();
  }

  rows() {
    const types = TYPES[this.tab] || [];
    const query = normalizeSearch(this.query);
    const result = [];
    types.forEach(type => (this.registries[type] || []).forEach((row, index) => {
      if (!query || normalizeSearch([row.value, ...row.variants.map(item => item.value)].join(' ')).includes(query)) result.push({ type, row, index });
    }));
    return result;
  }

  renderRows() {
    const rows = this.rows();
    this.elements.registryResultCount.textContent = String(rows.length);
    this.elements.registryRows.innerHTML = rows.length ? rows.map(({ type, row, index }) => {
      const contexts = row.contexts.filter(Boolean);
      const parent = type === 'subcategory'
        ? [...new Set(contexts.map(context => context.category).filter(Boolean))].join(', ')
        : type === 'subsubcategory'
          ? [...new Set(contexts.map(context => [context.category, context.subcategory].filter(Boolean).join(' > ')).filter(Boolean))].join(', ')
          : '';
      return `<tr><td><strong>${escapeHtml(row.value)}</strong><small>${escapeHtml(parent || LABELS[type])}</small></td><td>${row.count}</td><td>${row.variants.length}</td><td>${row.duplicate ? `<span class="badge warning">${escapeHtml(row.variants.map(item => item.value).join(' · '))}</span>` : '<span class="badge success">Padronizado</span>'}</td><td><button class="row-action" type="button" data-registry-open="${type}:${index}">Renomear/mesclar</button></td></tr>`;
    }).join('') : '<tr><td colspan="5" class="empty-state">Nenhum cadastro encontrado.</td></tr>';
  }

  open(row) {
    this.selected = row;
    this.elements.registryEditorTitle.textContent = `${LABELS[row.type]}: ${row.value}`;
    this.elements.registryOldValue.value = row.value;
    this.elements.registryNewValue.value = row.value;
    this.elements.registryScope.textContent = row.type === 'subcategory' || row.type === 'subsubcategory'
      ? 'A alteração respeitará o contexto exibido na lista quando houver apenas um contexto.'
      : 'A alteração será aplicada em todos os produtos que usam este valor.';
    this.elements.registryConfirm.checked = false;
    this.elements.registryEditor.classList.add('open');
    this.elements.registryEditor.setAttribute('aria-hidden', 'false');
    this.elements.registryBackdrop.hidden = false;
    this.renderPlan();
  }

  close() {
    this.selected = null;
    this.elements.registryEditor.classList.remove('open');
    this.elements.registryEditor.setAttribute('aria-hidden', 'true');
    this.elements.registryBackdrop.hidden = true;
  }

  scope() {
    if (!this.selected || !['subcategory', 'subsubcategory'].includes(this.selected.type)) return {};
    const contexts = this.selected.contexts || [];
    const unique = [...new Map(contexts.map(context => [JSON.stringify(context), context])).values()];
    return unique.length === 1 ? unique[0] : {};
  }

  plan() {
    if (!this.selected) return null;
    return buildRegistryRenamePlan(this.store.state.products, {
      type: this.selected.type,
      oldValue: this.selected.value,
      newValue: this.elements.registryNewValue.value,
      scope: this.scope(),
    });
  }

  renderPlan() {
    const plan = this.plan();
    if (!plan) return;
    this.elements.registryPlan.innerHTML = plan.errors.length
      ? `<div class="registry-plan-errors">${plan.errors.map(error => `<p>${escapeHtml(error)}</p>`).join('')}</div>`
      : `<div class="registry-plan-ready"><strong>${plan.affected} produto(s) serão alterados</strong><span>${escapeHtml(plan.oldValue)} → ${escapeHtml(plan.newValue)}</span>${plan.changes.slice(0, 12).map(change => `<small>${escapeHtml(change.name)}</small>`).join('')}${plan.affected > 12 ? `<small>e mais ${plan.affected - 12}…</small>` : ''}</div>`;
    const config = this.reloadConfig();
    this.elements.registrySave.disabled = Boolean(plan.errors.length || !this.elements.registryConfirm.checked || !config.writeMode || !config.registryWriteMode);
    this.elements.registrySafety.textContent = !config.writeMode || !config.registryWriteMode
      ? 'Gravação bloqueada nas configurações.'
      : !this.elements.registryConfirm.checked
        ? 'Confirme a alteração em lote.'
        : 'Alteração liberada para teste controlado.';
  }

  async save() {
    const plan = this.plan();
    if (!plan || plan.errors.length) return;
    const config = this.reloadConfig();
    this.elements.registrySave.disabled = true;
    try {
      const result = await executeRegistryRename(config, this.store.state.products, {
        type: plan.type, oldValue: plan.oldValue, newValue: plan.newValue, scope: plan.scope,
      }, {
        onProgress: progress => {
          this.elements.registryProgress.textContent = `${progress.current}/${progress.total}: ${progress.change.name}`;
        },
      });
      if (result.saved.length) this.onToast(`${result.saved.length} produto(s) padronizado(s).`, 'success');
      if (result.failures.length) this.onToast(`${result.failures.length} produto(s) não foram alterados por conflito.`, 'error');
      await this.onReload();
      this.close();
      this.refresh();
    } catch (error) {
      this.onToast(error?.message || String(error), 'error');
    } finally {
      this.elements.registryProgress.textContent = '';
      this.renderPlan();
    }
  }
}
