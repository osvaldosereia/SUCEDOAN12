import { buildOffersPlan } from '../core/offers.js';
import { escapeHtml, money } from '../core/utils.js';
import { DEFAULT_CONFIG, STORAGE_KEYS } from '../config.js';
import { executeOffersPlan } from '../services/offers.js';
import { readJsonFile, upsertText } from '../services/github.js';

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
    this.plan = buildOffersPlan(store.state.products, this.offerOptions());
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
    this.elements.offerRows.addEventListener('click', event => this.handleRowAction(event));
    document.getElementById('offersWorkspace')?.addEventListener('click', event => this.handleSettingsAction(event));
  }

  config() {
    return { ...DEFAULT_CONFIG, ...(this.reloadConfig?.() || {}) };
  }

  offerOptions() {
    const config = this.config();
    return {
      validityOfferRules: config.validityOfferRules,
      validityOfferBlockDays: config.validityOfferBlockDays,
      validityOfferEndDaysBefore: config.validityOfferEndDaysBefore,
    };
  }

  validityRules() {
    return Array.isArray(this.config().validityOfferRules)
      ? this.config().validityOfferRules
      : DEFAULT_CONFIG.validityOfferRules;
  }

  saveConfigPatch(patch) {
    const next = { ...this.config(), ...(patch || {}) };
    localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(next));
    return next;
  }

  recalculate() {
    this.plan = buildOffersPlan(this.store.state.products, this.offerOptions());
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
    this.renderValiditySettings();
    this.elements.offerMetrics.innerHTML = [
      ['success', this.plan.apply.length, 'Aplicar ofertas', this.validityRulesSummary()],
      ['danger', this.plan.blocked.length, 'Bloquear venda', `Vencidos ou ate ${this.config().validityOfferBlockDays ?? 2} dias`],
      ['neutral', this.plan.clear.length, 'Limpar ofertas', 'Fora da janela ou sem estoque'],
      ['warning', this.plan.manual.length, 'Ofertas manuais', 'Nunca sobrescritas'],
    ].map(([kind, value, label, help]) => `<article class="metric-card ${kind}"><strong>${value}</strong><span>${label}</span><small>${help}</small></article>`).join('');
    this.renderRows();
    this.renderControls();
  }

  validityRulesSummary() {
    const rules = this.validityRules();
    const min = Math.min(...rules.map(row => Number(row.min) || 0));
    const max = Math.max(...rules.map(row => Number(row.max) || 0));
    return `${rules.length} faixa(s), de ${min} a ${max} dias`;
  }

  renderValiditySettings() {
    const workspace = document.getElementById('offersWorkspace');
    if (!workspace) return;
    let panel = document.getElementById('validityOfferRulesPanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'validity-rules-panel';
      panel.id = 'validityOfferRulesPanel';
      workspace.insertBefore(panel, this.elements.offerMetrics);
    }
    const config = this.config();
    const rules = this.validityRules();
    panel.innerHTML = `
      <div class="validity-rules-head">
        <div>
          <h3>Regras por data de validade</h3>
          <p>Configure quando aplicar desconto, quando bloquear venda e quantos dias antes do vencimento a oferta termina.</p>
        </div>
        <div class="validity-rules-actions">
          <button class="button secondary compact" type="button" data-validity-rules-reset>Restaurar padrao</button>
          <button class="button primary compact" type="button" data-validity-rules-save>Salvar regras de validade</button>
        </div>
      </div>
      <div class="validity-rules-controls">
        <label>Bloquear venda com ate<input id="validityBlockDays" type="number" min="0" max="30" step="1" value="${escapeHtml(config.validityOfferBlockDays ?? 2)}"><span>dia(s) para vencer</span></label>
        <label>Encerrar oferta<input id="validityEndBeforeDays" type="number" min="0" max="30" step="1" value="${escapeHtml(config.validityOfferEndDaysBefore ?? 2)}"><span>dia(s) antes da validade</span></label>
      </div>
      <div class="validity-rules-grid">
        <strong>De dias</strong><strong>Ate dias</strong><strong>Desconto</strong><span></span>
        ${rules.map((rule, index) => `
          <input data-validity-rule="${index}" data-field="min" type="number" min="0" max="365" step="1" value="${escapeHtml(rule.min)}">
          <input data-validity-rule="${index}" data-field="max" type="number" min="0" max="365" step="1" value="${escapeHtml(rule.max)}">
          <input data-validity-rule="${index}" data-field="discount" type="number" min="1" max="90" step="1" value="${escapeHtml(rule.discount)}">
          <button class="button ghost compact" type="button" data-validity-rule-remove="${index}">Remover</button>
        `).join('')}
      </div>
      <button class="button secondary compact" type="button" data-validity-rule-add>Adicionar faixa</button>
    `;
  }

  renderRows() {
    const rows = this.visibleRows();
    this.elements.offerResultCount.textContent = String(rows.length);
    this.elements.offerRows.innerHTML = rows.length ? rows.map(row => {
      const [kind, label] = actionMeta(row.action);
      const checked = this.selected.has(row.key);
      return `<tr><td><input type="checkbox" data-offer-select="${escapeHtml(row.key)}" ${checked ? 'checked' : ''} ${row.actionable ? '' : 'disabled'}></td><td><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.key)}</small><div class="offer-row-actions"><button class="button secondary compact" type="button" data-offer-open-product="${escapeHtml(row.key)}">Editar produto</button>${row.actionable ? `<button class="button ghost compact" type="button" data-offer-toggle-row="${escapeHtml(row.key)}">${checked ? 'Desmarcar' : 'Selecionar'}</button>` : ''}</div></td><td>${escapeHtml(row.validity || '—')}<small>${row.days === null ? 'sem data' : row.days < 0 ? `${Math.abs(row.days)} dia(s) vencido` : `${row.days} dia(s)`}</small></td><td>${money(row.price)}<small>${row.discount ? `${row.discount}% -> ${money(row.nextProduct.preco_oferta)}` : 'sem desconto calculado'}</small></td><td><span class="badge ${kind}">${escapeHtml(label)}</span><small>${escapeHtml(row.reason)}</small></td><td>${row.errors.length ? `<span class="badge danger">${row.errors.length} erro(s)</span>` : row.warnings.length ? `<span class="badge warning">${row.warnings.length} aviso(s)</span>` : '<span class="badge success">OK</span>'}</td></tr>`;
    }).join('') : '<tr><td colspan="6" class="empty-state">Nenhum produto nesta situação.</td></tr>';
  }

  handleRowAction(event) {
    const openKey = event.target.closest('[data-offer-open-product]')?.dataset.offerOpenProduct;
    if (openKey) {
      window.dispatchEvent(new CustomEvent('admin-v2-open-product', { detail: { key: openKey } }));
      return;
    }

    const toggleKey = event.target.closest('[data-offer-toggle-row]')?.dataset.offerToggleRow;
    if (!toggleKey) return;
    this.selected.has(toggleKey) ? this.selected.delete(toggleKey) : this.selected.add(toggleKey);
    this.renderRows();
    this.renderControls();
  }

  async publishValidityRules(config) {
    if (!config.writeMode || !config.campaignOfferWriteMode) {
      throw new Error('Gravacao de ofertas automaticas bloqueada nas configuracoes.');
    }

    const path = config.offersRulesPath || DEFAULT_CONFIG.offersRulesPath;
    const existing = await readJsonFile(config, path).catch(error => {
      if (/404|not found/i.test(String(error?.message || error))) return null;
      throw error;
    });
    const documentData = existing?.data && typeof existing.data === 'object' && !Array.isArray(existing.data)
      ? existing.data
      : { versao: 1, ativo: true, exigir_quantidade_completa: true, timezone: 'America/Cuiaba', regras: [] };

    documentData.regras_validade = {
      ativo: true,
      bloquear_dias: Math.max(0, Number(config.validityOfferBlockDays) || 0),
      encerrar_oferta_dias_antes: Math.max(0, Number(config.validityOfferEndDaysBefore) || 0),
      faixas: this.validityRules().map(rule => ({
        min: Math.max(0, Number(rule.min) || 0),
        max: Math.max(0, Number(rule.max) || 0),
        desconto_percentual: Math.max(0, Number(rule.discount ?? rule.desconto_percentual) || 0),
      })).filter(rule => rule.max >= rule.min && rule.desconto_percentual > 0),
    };
    documentData.atualizado_em = new Date().toISOString();
    if (!Array.isArray(documentData.regras)) documentData.regras = [];

    return upsertText(config, path, JSON.stringify(documentData, null, 2), 'Atualiza regras de validade pelo Admin UX');
  }

  async handleSettingsAction(event) {
    if (!event.target.closest('[data-validity-rules-save], [data-validity-rules-reset], [data-validity-rule-add], [data-validity-rule-remove]')) return;
    const panel = document.getElementById('validityOfferRulesPanel');
    if (!panel) return;
    const saveButton = event.target.closest('[data-validity-rules-save]');

    if (event.target.closest('[data-validity-rules-reset]')) {
      this.saveConfigPatch({
        validityOfferBlockDays: DEFAULT_CONFIG.validityOfferBlockDays,
        validityOfferEndDaysBefore: DEFAULT_CONFIG.validityOfferEndDaysBefore,
        validityOfferRules: DEFAULT_CONFIG.validityOfferRules,
      });
      this.recalculate();
      this.onToast('Regras por validade restauradas.', 'success');
      return;
    }

    const current = this.validityRules();
    const remove = event.target.closest('[data-validity-rule-remove]')?.dataset.validityRuleRemove;
    if (remove !== undefined) current.splice(Number(remove), 1);
    if (event.target.closest('[data-validity-rule-add]')) current.push({ min: 106, max: 120, discount: 5 });

    const rules = remove !== undefined || event.target.closest('[data-validity-rule-add]')
      ? current
      : [...panel.querySelectorAll('[data-validity-rule][data-field="min"]')].map(input => {
        const index = input.dataset.validityRule;
        return {
          min: Number(input.value) || 0,
          max: Number(panel.querySelector(`[data-validity-rule="${index}"][data-field="max"]`)?.value) || 0,
          discount: Number(panel.querySelector(`[data-validity-rule="${index}"][data-field="discount"]`)?.value) || 0,
        };
      });

    const nextConfig = this.saveConfigPatch({
      validityOfferBlockDays: Math.max(0, Number(document.getElementById('validityBlockDays')?.value) || 0),
      validityOfferEndDaysBefore: Math.max(0, Number(document.getElementById('validityEndBeforeDays')?.value) || 0),
      validityOfferRules: rules,
    });
    this.recalculate();
    if (!saveButton) {
      this.onToast('Regras por validade atualizadas nesta tela.', 'success');
      return;
    }

    saveButton.disabled = true;
    try {
      await this.publishValidityRules(nextConfig);
      this.onToast('Regras de validade salvas para a rotina automatica.', 'success');
    } catch (error) {
      this.onToast(error?.message || String(error), 'error');
    } finally {
      saveButton.disabled = false;
    }
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
