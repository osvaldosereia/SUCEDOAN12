import { chooseNfeProduct, digits, matchNfeAnalysis, nfeAnalysisSummary, parseNfeXml, recalculateNfeItems } from '../core/nfe.js';
import { buildNfeSimulation, normalizeNfeDate, prepareNfeAnalysis, updateNfeItem } from '../core/nfe-simulation.js';
import {
  debounce, escapeHtml, money, normalizeSearch, number, productCode, productKey, productName, text,
} from '../core/utils.js';
import { inspectNfeImport } from '../services/github.js';
import { executeNfeImport } from '../services/nfe-transaction.js';

function dateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR');
}

function documentMask(value) {
  const raw = digits(value);
  if (raw.length === 14) return raw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (raw.length === 11) return raw.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return raw || '—';
}

function dateMask(value) {
  const raw = digits(value).slice(0, 8);
  const parts = [];
  if (raw.length) parts.push(raw.slice(0, 2));
  if (raw.length > 2) parts.push(raw.slice(2, 4));
  if (raw.length > 4) parts.push(raw.slice(4, 8));
  return parts.join('/');
}

function displayValue(value, field = '') {
  if (['preco', 'preco_custo', 'price', 'cost'].includes(field)) return money(value);
  if (field === 'validade') return normalizeNfeDate(value) || '—';
  return String(value ?? '') || '—';
}

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
}

export class NfeAdvancedModule {
  constructor({ store, elements, onToast, onBeforeAnalyze = null, onAfterImport = null, reloadConfig = null }) {
    this.store = store;
    this.elements = elements;
    this.onToast = onToast;
    this.onBeforeAnalyze = onBeforeAnalyze;
    this.onAfterImport = onAfterImport;
    this.reloadConfig = reloadConfig;
    this.analysis = null;
    this.simulation = null;
    this.rawXml = '';
    this.margin = 40;
    this.busy = false;
    this.registryChecked = false;
    this.bind();
    this.render();
  }

  bind() {
    this.elements.nfeFile.addEventListener('change', event => this.readFile(event));
    this.elements.nfeReadPasteButton.addEventListener('click', () => this.readPasted());
    this.elements.nfeClearButton.addEventListener('click', () => this.clear());
    this.elements.nfeExportButton.addEventListener('click', () => this.exportAnalysis());
    this.elements.nfeRefreshSimulationButton?.addEventListener('click', () => {
      this.refreshSimulation();
      this.renderAnalysis();
      this.onToast('Simulação recalculada. Nenhum dado foi salvo.', 'success');
    });
    this.elements.nfeApplyGlobalValidityButton?.addEventListener('click', () => this.applyGlobalValidity());
    this.elements.nfeExecuteImportButton?.addEventListener('click', () => this.executeImport());
    this.elements.nfeConfirmImport?.addEventListener('change', () => this.renderImportControls());
    this.elements.nfeAccessKey.addEventListener('input', () => {
      this.elements.nfeAccessKey.value = digits(this.elements.nfeAccessKey.value).slice(0, 44);
      this.renderKeyStatus();
    });
    this.elements.nfeGlobalValidity?.addEventListener('input', () => {
      this.elements.nfeGlobalValidity.value = dateMask(this.elements.nfeGlobalValidity.value);
    });
    this.elements.nfeMargin.addEventListener('input', debounce(() => {
      this.margin = Math.min(95, Math.max(0, number(this.elements.nfeMargin.value)));
      if (this.analysis) {
        recalculateNfeItems(this.analysis.items, this.analysis.note, this.margin);
        this.refreshSimulation();
        this.renderAnalysis();
      }
    }, 120));
    this.elements.nfeItems.addEventListener('click', event => this.handleItemsClick(event));
    this.elements.nfeItems.addEventListener('input', event => this.handleItemInput(event));
    this.elements.nfeItems.addEventListener('change', event => this.handleItemChange(event));
  }

  renderKeyStatus() {
    const length = digits(this.elements.nfeAccessKey.value).length;
    this.elements.nfeKeyHelp.textContent = length ? `${length} de 44 números informados.` : 'Opcional: escaneie a chave para conferir se ela corresponde ao XML.';
    this.elements.nfeKeyHelp.className = `field-help${length === 44 ? ' success-text' : length ? ' warning-text' : ''}`;
  }

  async readFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      await this.analyze(raw, file.name);
    } catch (error) {
      this.fail(error);
    } finally {
      event.target.value = '';
    }
  }

  async readPasted() {
    try {
      await this.analyze(this.elements.nfePaste.value, 'XML colado');
    } catch (error) {
      this.fail(error);
    }
  }

  async analyze(raw, sourceLabel = 'XML') {
    if (this.busy) return;
    this.busy = true;
    this.setMessage(`Analisando ${sourceLabel}…`, 'info');
    this.setControlsDisabled(true);
    try {
      if (typeof this.reloadConfig === 'function') this.store.state.config = this.reloadConfig();
      if (typeof this.onBeforeAnalyze === 'function') await this.onBeforeAnalyze();
      const parsed = await parseNfeXml(raw, {
        scannedKey: this.elements.nfeAccessKey.value,
        margin: this.margin,
      });
      this.rawXml = parsed.rawXml;
      let record = null;
      this.registryChecked = false;
      const config = this.store.state.config;
      if (text(config.githubOwner) && text(config.githubRepo) && text(config.githubBranch)) {
        try {
          record = await inspectNfeImport(config, parsed.note.key);
          this.registryChecked = true;
        } catch (error) {
          console.warn('NF-e: não foi possível consultar o registro fiscal.', error);
          this.onToast(`XML lido, mas o registro fiscal não foi consultado: ${error?.message || error}`, 'error');
        }
      }
      this.analysis = prepareNfeAnalysis(matchNfeAnalysis(parsed, this.store.state.products, record, this.margin), this.margin);
      this.refreshSimulation();
      const summary = nfeAnalysisSummary(this.analysis);
      const message = this.analysis.globalDuplicate
        ? `NF-e ${this.analysis.note.key} já foi concluída. Toda a nota está bloqueada.`
        : `${summary.lines} linha(s) agrupadas em ${summary.groups} produto(s). Simulação pronta; nenhum dado foi salvo.`;
      this.setMessage(message, this.analysis.globalDuplicate || summary.duplicates ? 'danger' : 'success');
      this.renderAnalysis();
      this.onToast('NF-e analisada e simulada sem gravação.', 'success');
    } finally {
      this.busy = false;
      this.setControlsDisabled(false);
    }
  }

  fail(error) {
    console.error(error);
    this.setMessage(error?.message || String(error), 'danger');
    this.onToast(error?.message || String(error), 'error');
    this.busy = false;
    this.setControlsDisabled(false);
  }

  setControlsDisabled(disabled) {
    [
      this.elements.nfeFileLabel, this.elements.nfeReadPasteButton, this.elements.nfeClearButton,
      this.elements.nfeRefreshSimulationButton, this.elements.nfeExecuteImportButton,
    ].forEach(element => {
      if (!element) return;
      element.classList.toggle('disabled', disabled);
      if ('disabled' in element) element.disabled = disabled;
    });
  }

  setMessage(message, kind = 'neutral') {
    this.elements.nfeMessage.className = `nfe-message ${kind}`;
    this.elements.nfeMessage.textContent = message;
  }

  clear() {
    this.analysis = null;
    this.simulation = null;
    this.rawXml = '';
    this.registryChecked = false;
    this.elements.nfePaste.value = '';
    this.elements.nfeAccessKey.value = '';
    this.elements.nfeMargin.value = '40';
    if (this.elements.nfeGlobalValidity) this.elements.nfeGlobalValidity.value = '';
    if (this.elements.nfeConfirmImport) this.elements.nfeConfirmImport.checked = false;
    this.margin = 40;
    this.renderKeyStatus();
    this.setMessage('Selecione um XML para iniciar a conferência. Nenhuma gravação será realizada.', 'neutral');
    this.render();
  }

  refreshMatches() {
    if (!this.analysis) return;
    const base = { note: this.analysis.note, items: this.analysis.items, rawXml: this.rawXml };
    this.analysis = prepareNfeAnalysis(matchNfeAnalysis(base, this.store.state.products, this.analysis.importRecord, this.margin), this.margin);
    this.refreshSimulation();
    this.renderAnalysis();
  }

  refreshSimulation() {
    if (!this.analysis) {
      this.simulation = null;
      return null;
    }
    this.simulation = buildNfeSimulation(this.analysis, this.store.state.products, { margin: this.margin });
    return this.simulation;
  }

  applyGlobalValidity() {
    if (!this.analysis) return;
    const value = normalizeNfeDate(this.elements.nfeGlobalValidity?.value);
    if (!value) {
      this.onToast('Informe uma validade válida no formato dia/mês/ano.', 'error');
      return;
    }
    this.analysis.items.forEach(item => {
      this.analysis = updateNfeItem(this.analysis, item.id, { validity: value, noExpiry: false }, this.margin);
    });
    this.refreshSimulation();
    this.renderAnalysis();
    this.onToast(`Validade ${value} aplicada em todos os itens.`, 'success');
  }

  render() {
    this.elements.nfeMargin.value = String(this.margin);
    this.elements.nfeExportButton.disabled = !this.analysis;
    if (!this.analysis) {
      this.elements.nfeNote.innerHTML = '';
      this.elements.nfeSummary.innerHTML = '';
      this.elements.nfeItems.innerHTML = '<div class="empty-state nfe-empty">O resultado da nota aparecerá aqui após a leitura do XML.</div>';
      if (this.elements.nfeSimulation) this.elements.nfeSimulation.innerHTML = '';
      this.renderImportControls();
    } else {
      this.renderAnalysis();
    }
  }

  renderAnalysis() {
    if (!this.analysis) return this.render();
    this.refreshSimulation();
    const { note, items, importRecord, globalDuplicate } = this.analysis;
    const summary = nfeAnalysisSummary(this.analysis);
    this.elements.nfeExportButton.disabled = false;
    if (this.elements.nfeRefreshSimulationButton) this.elements.nfeRefreshSimulationButton.disabled = false;
    this.elements.nfeNote.innerHTML = `<div class="nfe-note-main"><div><span>Fornecedor</span><strong>${escapeHtml(note.supplier || 'Não informado')}</strong><small>${escapeHtml(documentMask(note.supplierCnpj))}</small></div><div><span>NF-e</span><strong>${escapeHtml(note.number || '—')} · série ${escapeHtml(note.series || '—')}</strong><small>${escapeHtml(dateTime(note.issuedAt))}</small></div><div><span>Chave</span><strong class="nfe-key">${escapeHtml(note.key)}</strong><small>SHA-256 ${escapeHtml(note.xmlHash ? note.xmlHash.slice(0, 16) + '…' : 'indisponível')}</small></div><div><span>Registro fiscal</span><strong>${globalDuplicate ? 'Concluído anteriormente' : importRecord ? escapeHtml(importRecord.status || 'Encontrado') : this.registryChecked ? 'Não encontrado' : 'Não consultado'}</strong><small>${globalDuplicate ? escapeHtml(dateTime(importRecord?.concluida_em)) : 'Consulta sem gravação'}</small></div></div>`;

    this.elements.nfeSummary.innerHTML = [
      ['info', summary.lines, 'Linhas no XML', `${summary.groups} grupos`],
      ['success', summary.exact + summary.manual, 'Produtos vinculados', `${summary.unmatched} sem vínculo`],
      [summary.duplicates ? 'danger' : 'success', summary.duplicates, 'Entradas duplicadas', summary.duplicates ? 'Bloqueadas' : 'Nenhuma detectada'],
      ['info', summary.incomingUnits, 'Unidades calculadas', money(summary.calculatedNet)],
    ].map(([kind, value, label, help]) => `<article class="metric-card ${kind}"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span><small>${escapeHtml(help)}</small></article>`).join('');

    this.elements.nfeItems.innerHTML = items.map((item, index) => this.itemCard(item, index)).join('');
    this.renderSimulation();
    this.renderImportControls();
  }

  planFor(itemId) {
    return this.simulation?.plans?.find(plan => plan.itemId === itemId) || null;
  }

  itemCard(item, index) {
    const product = item.matchedProduct;
    const plan = this.planFor(item.id);
    const matchKind = item.duplicate || plan?.errors?.length ? 'danger' : product ? 'success' : 'warning';
    const matchLabel = item.duplicate ? 'Entrada bloqueada' : item.matchStatus === 'exact' ? 'EAN encontrado' : item.matchStatus === 'manual' ? 'Vínculo manual' : 'Produto novo';
    const suggestions = item.suggestions?.length
      ? `<div class="nfe-suggestions"><span>Sugestões iniciais</span>${item.suggestions.map(suggestion => `<button type="button" data-nfe-select-product="${escapeHtml(suggestion.key)}" data-nfe-item="${escapeHtml(item.id)}"><strong>${escapeHtml(suggestion.name)}</strong><small>${escapeHtml(suggestion.code || 'sem código')} · ${suggestion.score}%</small></button>`).join('')}</div>`
      : '';
    const choices = product ? this.compareFields(item, product) : this.newProductFields(item);
    const preview = this.planPreview(plan);
    return `<article class="nfe-item${item.duplicate ? ' duplicate' : ''}" data-nfe-item-card="${escapeHtml(item.id)}">
      <div class="nfe-item-head"><div><span class="eyebrow">Item ${index + 1} · linha(s) ${escapeHtml(item.lines.join(', '))}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.ean || 'Sem EAN')} · NCM ${escapeHtml(item.ncm || 'não informado')} · ${escapeHtml(item.packaging || 'sem unidade')}</p></div><span class="badge ${matchKind}">${escapeHtml(matchLabel)}</span></div>
      ${item.duplicate ? `<div class="nfe-duplicate-warning">${escapeHtml(item.duplicateReason)}</div>` : ''}
      <div class="nfe-calculation-grid">
        <label>Quantidade comercial<strong>${escapeHtml(item.commercialQuantity)} ${escapeHtml(item.commercialUnit || '')}</strong></label>
        <label>Multiplicador<input type="number" min="1" max="1000" step="1" value="${escapeHtml(item.multiplier)}" data-nfe-field="multiplier" data-nfe-item="${escapeHtml(item.id)}"><small>${escapeHtml(item.multiplierSource)}</small></label>
        <label>Entrada calculada<strong>${escapeHtml(item.incomingUnits)} unidade(s)</strong></label>
        <label>Custo unitário<strong>${escapeHtml(money(item.unitCost))}</strong><small>Líquido ${escapeHtml(money(item.net))}</small></label>
        <label>Venda sugerida<strong>${escapeHtml(money(item.suggestedPrice))}</strong><small>Margem ${escapeHtml(this.margin)}%</small></label>
        <label>Estoque projetado<strong>${product ? `${escapeHtml(number(product.estoque))} → ${escapeHtml(item.projectedStock)}` : `0 → ${escapeHtml(item.projectedStock)}`}</strong></label>
      </div>
      <div class="nfe-entry-options">
        <label>Validade do lote<input type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" value="${escapeHtml(item.validity || '')}" data-nfe-field="validity" data-nfe-item="${escapeHtml(item.id)}" ${item.noExpiry ? 'disabled' : ''}></label>
        <label>Regra da validade<select data-nfe-field="validityMode" data-nfe-item="${escapeHtml(item.id)}" ${item.noExpiry ? 'disabled' : ''}>${product ? option('keep', 'Manter atual', item.validityMode) : ''}${option('earliest', 'Usar a mais próxima', item.validityMode)}${option('replace', 'Substituir pelo lote', item.validityMode)}</select></label>
        <label class="nfe-check"><input type="checkbox" data-nfe-field="noExpiry" data-nfe-item="${escapeHtml(item.id)}" ${item.noExpiry ? 'checked' : ''}> Produto sem validade</label>
        <label class="nfe-check"><input type="checkbox" data-nfe-field="addStock" data-nfe-item="${escapeHtml(item.id)}" ${item.addStock !== false ? 'checked' : ''}> Somar ao estoque</label>
        <label class="nfe-check"><input type="checkbox" data-nfe-field="skipped" data-nfe-item="${escapeHtml(item.id)}" ${item.skipped ? 'checked' : ''}> Ignorar este item</label>
      </div>
      <div class="nfe-match-panel">
        <div class="nfe-current-match">${product ? `<span>Produto vinculado</span><strong>${escapeHtml(productName(product))}</strong><small>${escapeHtml(productCode(product) || productKey(product))} · estoque ${escapeHtml(number(product.estoque))}</small><button class="button ghost compact" type="button" data-nfe-unlink="${escapeHtml(item.id)}">Remover vínculo</button>` : '<span>Nenhum produto vinculado</span><strong>Simulação de produto novo</strong><small>Complete os campos obrigatórios abaixo.</small>'}</div>
        <div class="nfe-search-product"><label>Pesquisar produto existente<input type="search" data-nfe-search="${escapeHtml(item.id)}" placeholder="Nome, código ou EAN" autocomplete="off"></label><div class="nfe-live-results" data-nfe-results="${escapeHtml(item.id)}"></div></div>
      </div>
      ${suggestions}
      ${choices}
      ${preview}
    </article>`;
  }

  compareFields(item, product) {
    const rows = [
      ['name', 'Nome', product.nome, item.name],
      ['gtin', 'EAN / GTIN', product.gtin || product.ean, item.ean],
      ['ncm', 'NCM', product.ncm, item.ncm],
      ['packaging', 'Embalagem', product.embalagem, item.packaging],
      ['cost', 'Preço de custo', product.preco_custo, item.unitCost],
      ['price', 'Preço de venda', product.preco, item.suggestedPrice],
    ];
    return `<div class="nfe-comparison"><h4>Comparação campo a campo</h4><div class="table-wrap"><table class="nfe-compare-table"><thead><tr><th>Campo</th><th>Atual</th><th>NF-e</th><th>Escolha</th></tr></thead><tbody>${rows.map(([field, label, oldValue, nfeValue]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(displayValue(oldValue, field))}</td><td>${escapeHtml(displayValue(nfeValue, field))}</td><td><select data-nfe-choice="${escapeHtml(field)}" data-nfe-item="${escapeHtml(item.id)}">${option('old', 'Manter atual', item.choices?.[field])}${option('nfe', 'Usar NF-e', item.choices?.[field])}</select></td></tr>`).join('')}</tbody></table></div></div>`;
  }

  newProductFields(item) {
    const draft = item.newProductDraft || {};
    const fields = [
      ['nome', 'Nome', 'text'], ['codigo', 'Código', 'text'], ['gtin', 'EAN / GTIN', 'text'], ['ncm', 'NCM', 'text'],
      ['embalagem', 'Embalagem', 'text'], ['categoria', 'Categoria', 'text'], ['subcategoria', 'Subcategoria', 'text'], ['marca', 'Marca', 'text'],
      ['fornecedor', 'Fornecedor', 'text'], ['preco_custo', 'Preço de custo', 'number'], ['preco', 'Preço de venda', 'number'], ['url_imagem', 'URL da imagem', 'url'],
    ];
    return `<div class="nfe-new-product"><h4>Cadastro simulado do produto novo</h4><p>Categoria, embalagem, nome, código e preço são obrigatórios para permitir a importação.</p><div class="nfe-new-grid">${fields.map(([field, label, type]) => `<label>${escapeHtml(label)}<input type="${type}" ${type === 'number' ? 'step="0.01" min="0"' : ''} value="${escapeHtml(draft[field] ?? '')}" data-nfe-draft-field="${escapeHtml(field)}" data-nfe-item="${escapeHtml(item.id)}"></label>`).join('')}<label class="span-2">Descrição<textarea data-nfe-draft-field="descricao" data-nfe-item="${escapeHtml(item.id)}">${escapeHtml(draft.descricao || '')}</textarea></label></div></div>`;
  }

  planPreview(plan) {
    if (!plan) return '';
    const issues = [...(plan.errors || []).map(message => ['danger', message]), ...(plan.warnings || []).map(message => ['warning', message])];
    const changes = plan.changes || [];
    return `<div class="nfe-plan ${plan.errors?.length ? 'blocked' : ''}"><div class="nfe-plan-head"><div><h4>Prévia exata da operação</h4><p>${plan.status === 'skipped' ? 'Este item será ignorado.' : plan.isNew ? `Criará o produto ${escapeHtml(plan.productKey)}` : `Atualizará o produto ${escapeHtml(plan.productKey)}`}</p></div><span class="badge ${plan.errors?.length ? 'danger' : plan.status === 'skipped' ? 'neutral' : 'info'}">${plan.errors?.length ? 'Bloqueado' : plan.status === 'skipped' ? 'Ignorado' : 'Simulado'}</span></div>${issues.length ? `<div class="nfe-plan-issues">${issues.map(([kind, message]) => `<div class="${kind}">${escapeHtml(message)}</div>`).join('')}</div>` : ''}${changes.length ? `<div class="table-wrap"><table class="nfe-changes"><thead><tr><th>Alteração</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${changes.map(change => `<tr><th>${escapeHtml(change.label)}</th><td>${escapeHtml(displayValue(change.before, change.field))}</td><td>${escapeHtml(displayValue(change.after, change.field))}</td></tr>`).join('')}</tbody></table></div>` : ''}${plan.lotRecord ? `<div class="nfe-lot-preview"><strong>Lote que seria criado</strong><span>${escapeHtml(plan.lotRecord.quantidade)} un. · custo ${escapeHtml(money(plan.lotRecord.custo_unitario))} · validade ${escapeHtml(plan.lotRecord.sem_validade ? 'sem validade' : plan.lotRecord.validade)}</span></div>` : ''}</div>`;
  }

  renderSimulation() {
    if (!this.elements.nfeSimulation) return;
    if (!this.simulation) {
      this.elements.nfeSimulation.innerHTML = '';
      return;
    }
    const summary = this.simulation.summary;
    const blockers = this.simulation.errors;
    this.elements.nfeSimulation.innerHTML = `<section class="panel nfe-simulation-panel"><div class="panel-header"><div><span class="eyebrow">Plano transacional</span><h2>Resultado da simulação</h2><p>Nenhum dado foi alterado. A importação somente será liberada sem bloqueadores.</p></div><span class="badge ${this.simulation.canImport ? 'success' : 'danger'}">${this.simulation.canImport ? 'Pronto para teste' : `${blockers.length} bloqueador(es)`}</span></div><div class="nfe-simulation-metrics"><div><strong>${summary.updates}</strong><span>Atualizações</span></div><div><strong>${summary.newProducts}</strong><span>Produtos novos</span></div><div><strong>${summary.stockUnits}</strong><span>Unidades no estoque</span></div><div><strong>${summary.skipped}</strong><span>Ignorados</span></div></div>${blockers.length ? `<div class="nfe-global-blockers"><strong>Corrija antes de importar</strong>${blockers.map(error => `<p>${escapeHtml(error.groupKey)}: ${escapeHtml(error.message)}</p>`).join('')}</div>` : '<div class="nfe-ready-notice">A simulação não encontrou bloqueadores. Ainda é necessário ativar as gravações e confirmar a operação.</div>'}</section>`;
  }

  renderImportControls() {
    if (!this.elements.nfeExecuteImportButton) return;
    if (typeof this.reloadConfig === 'function') this.store.state.config = this.reloadConfig();
    const config = this.store.state.config || {};
    const enabled = Boolean(config.writeMode && config.nfeImportMode);
    const confirmed = Boolean(this.elements.nfeConfirmImport?.checked);
    const ready = Boolean(this.analysis && this.simulation?.canImport && enabled && confirmed && !this.busy);
    this.elements.nfeExecuteImportButton.disabled = !ready;
    if (this.elements.nfeImportModeStatus) {
      this.elements.nfeImportModeStatus.className = `badge ${enabled ? 'warning' : 'success'}`;
      this.elements.nfeImportModeStatus.textContent = enabled ? 'Importação habilitada para teste' : 'Importação bloqueada';
    }
    if (this.elements.nfeImportHelp) {
      this.elements.nfeImportHelp.textContent = !this.analysis
        ? 'Leia uma NF-e para gerar a simulação.'
        : !this.simulation?.canImport
          ? 'A simulação possui bloqueadores.'
          : !enabled
            ? 'Ative gravações gerais e importação de NF-e nas configurações desta bancada.'
            : !confirmed
              ? 'Confirme que revisou a simulação.'
              : 'Operação liberada para teste controlado.';
    }
  }

  handleItemInput(event) {
    const itemId = event.target.dataset.nfeItem;
    if (!itemId || !this.analysis) return;
    if (event.target.dataset.nfeSearch !== undefined) {
      this.handleItemSearch(event);
      return;
    }
    if (event.target.dataset.nfeField === 'validity') event.target.value = dateMask(event.target.value);
  }

  handleItemChange(event) {
    const itemId = event.target.dataset.nfeItem;
    if (!itemId || !this.analysis) return;
    const field = event.target.dataset.nfeField;
    const choice = event.target.dataset.nfeChoice;
    const draftField = event.target.dataset.nfeDraftField;
    let patch = null;
    if (field) {
      let value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      if (field === 'multiplier') value = Math.min(1000, Math.max(1, Math.floor(number(value) || 1)));
      if (field === 'validity') value = normalizeNfeDate(value);
      patch = { [field]: value };
      if (field === 'multiplier') patch.multiplierSource = 'Ajustado manualmente na simulação V2';
    } else if (choice) {
      patch = { choices: { [choice]: event.target.value } };
    } else if (draftField) {
      let value = event.target.value;
      if (['preco', 'preco_custo'].includes(draftField)) value = number(value);
      patch = { newProductDraft: { [draftField]: value, ...(draftField === 'preco' ? { manualPrice: true } : {}) } };
    }
    if (!patch) return;
    this.analysis = updateNfeItem(this.analysis, itemId, patch, this.margin);
    this.refreshSimulation();
    this.renderAnalysis();
  }

  handleItemSearch(event) {
    const itemId = event.target.dataset.nfeSearch;
    if (!itemId) return;
    const target = this.elements.nfeItems.querySelector(`[data-nfe-results="${CSS.escape(itemId)}"]`);
    if (!target) return;
    const query = normalizeSearch(event.target.value);
    if (query.length < 2) {
      target.innerHTML = '';
      return;
    }
    const results = this.store.state.products.filter(product => normalizeSearch([
      productName(product), productCode(product), product.gtin, product.ean, product.marca, product.categoria,
    ].join(' ')).includes(query)).slice(0, 8);
    target.innerHTML = results.length ? results.map(product => `<button type="button" data-nfe-select-product="${escapeHtml(productKey(product))}" data-nfe-item="${escapeHtml(itemId)}"><strong>${escapeHtml(productName(product))}</strong><small>${escapeHtml(productCode(product) || 'sem código')} · estoque ${escapeHtml(number(product.estoque))}</small></button>`).join('') : '<small>Nenhum produto encontrado.</small>';
  }

  handleItemsClick(event) {
    const select = event.target.closest('[data-nfe-select-product]');
    const unlink = event.target.closest('[data-nfe-unlink]');
    if (!this.analysis) return;
    if (select) {
      const product = this.store.getProduct(select.dataset.nfeSelectProduct);
      if (!product) return;
      this.analysis = prepareNfeAnalysis(chooseNfeProduct(this.analysis, select.dataset.nfeItem, product, this.margin), this.margin);
      this.refreshSimulation();
      this.renderAnalysis();
      this.onToast(`Vínculo definido para ${productName(product)}. Nada foi salvo.`, 'success');
    } else if (unlink) {
      this.analysis = prepareNfeAnalysis(chooseNfeProduct(this.analysis, unlink.dataset.nfeUnlink, null, this.margin), this.margin);
      this.refreshSimulation();
      this.renderAnalysis();
      this.onToast('Vínculo removido. O item voltou para produto novo simulado.', 'success');
    }
  }

  async executeImport() {
    if (this.busy || !this.analysis || !this.simulation?.canImport) return;
    if (typeof this.reloadConfig === 'function') this.store.state.config = this.reloadConfig();
    this.busy = true;
    this.setControlsDisabled(true);
    this.renderImportControls();
    try {
      const result = await executeNfeImport({
        config: this.store.state.config,
        analysis: this.analysis,
        simulation: this.simulation,
        rawXml: this.rawXml,
        onProgress: progress => {
          if (this.elements.nfeProgress) this.elements.nfeProgress.textContent = progress.message;
          this.setMessage(progress.message, progress.step === 'done' ? 'success' : 'info');
        },
      });
      this.setMessage(`NF-e ${result.record.chave_nfe} importada e conciliada.`, 'success');
      this.onToast(`${result.savedProducts.length} produto(s) processado(s) com segurança.`, 'success');
      if (this.elements.nfeConfirmImport) this.elements.nfeConfirmImport.checked = false;
      if (typeof this.onAfterImport === 'function') await this.onAfterImport(result);
      const record = await inspectNfeImport(this.store.state.config, this.analysis.note.key);
      this.analysis = prepareNfeAnalysis(matchNfeAnalysis({ note: this.analysis.note, items: this.analysis.items, rawXml: this.rawXml }, this.store.state.products, record, this.margin), this.margin);
      this.refreshSimulation();
      this.renderAnalysis();
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy = false;
      this.setControlsDisabled(false);
      this.renderImportControls();
    }
  }

  exportAnalysis() {
    if (!this.analysis) return;
    const safe = {
      exportedAt: new Date().toISOString(),
      mode: 'simulation',
      margin: this.margin,
      note: this.analysis.note,
      globalDuplicate: this.analysis.globalDuplicate,
      registryChecked: this.registryChecked,
      importRecord: this.analysis.importRecord,
      summary: nfeAnalysisSummary(this.analysis),
      simulation: this.simulation,
      items: this.analysis.items.map(item => ({
        groupKey: item.groupKey,
        lines: item.lines,
        supplierCodes: item.supplierCodes,
        ean: item.ean,
        name: item.name,
        ncm: item.ncm,
        packaging: item.packaging,
        commercialQuantity: item.commercialQuantity,
        multiplier: item.multiplier,
        incomingUnits: item.incomingUnits,
        gross: item.gross,
        discount: item.discount,
        net: item.net,
        unitCost: item.unitCost,
        suggestedPrice: item.suggestedPrice,
        validity: item.validity,
        validityMode: item.validityMode,
        noExpiry: item.noExpiry,
        addStock: item.addStock,
        skipped: item.skipped,
        choices: item.choices,
        newProductDraft: item.newProductDraft,
        matchStatus: item.matchStatus,
        duplicate: item.duplicate,
        duplicateReason: item.duplicateReason,
        matchedProduct: item.matchedProduct ? {
          key: productKey(item.matchedProduct),
          code: productCode(item.matchedProduct),
          name: productName(item.matchedProduct),
          stock: number(item.matchedProduct.estoque),
          projectedStock: item.projectedStock,
        } : null,
      })),
    };
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `simulacao-nfe-${this.analysis.note.key}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
