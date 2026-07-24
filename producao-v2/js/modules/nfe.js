import {
  chooseNfeProduct, digits, matchNfeAnalysis, nfeAnalysisSummary, parseNfeXml, recalculateNfeItems,
} from '../core/nfe.js';
import {
  debounce, escapeHtml, money, normalizeSearch, number, productCode, productKey, productName, text,
} from '../core/utils.js';
import { inspectNfeImport } from '../services/github.js';

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

export class NfeModule {
  constructor({ store, elements, onToast, onBeforeAnalyze = null }) {
    this.store = store;
    this.elements = elements;
    this.onToast = onToast;
    this.onBeforeAnalyze = onBeforeAnalyze;
    this.analysis = null;
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
    this.elements.nfeAccessKey.addEventListener('input', () => {
      this.elements.nfeAccessKey.value = digits(this.elements.nfeAccessKey.value).slice(0, 44);
      this.renderKeyStatus();
    });
    this.elements.nfeMargin.addEventListener('input', debounce(() => {
      this.margin = Math.min(95, Math.max(0, number(this.elements.nfeMargin.value)));
      if (this.analysis) {
        recalculateNfeItems(this.analysis.items, this.analysis.note, this.margin);
        this.renderAnalysis();
      }
    }, 120));
    this.elements.nfeItems.addEventListener('click', event => this.handleItemsClick(event));
    this.elements.nfeItems.addEventListener('input', debounce(event => this.handleItemSearch(event), 160));
    this.elements.nfeItems.addEventListener('change', event => this.handleMultiplier(event));
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
    const raw = this.elements.nfePaste.value;
    try {
      await this.analyze(raw, 'XML colado');
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
      this.analysis = matchNfeAnalysis(parsed, this.store.state.products, record, this.margin);
      const summary = nfeAnalysisSummary(this.analysis);
      const message = this.analysis.globalDuplicate
        ? `NF-e ${this.analysis.note.key} já foi concluída. Toda a nota está bloqueada na análise.`
        : `${summary.lines} linha(s) agrupadas em ${summary.groups} produto(s). Nenhum dado foi salvo.`;
      this.setMessage(message, this.analysis.globalDuplicate || summary.duplicates ? 'danger' : 'success');
      this.renderAnalysis();
      this.onToast('NF-e analisada em modo somente leitura.', 'success');
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
    [this.elements.nfeFileLabel, this.elements.nfeReadPasteButton, this.elements.nfeClearButton].forEach(element => {
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
    this.rawXml = '';
    this.registryChecked = false;
    this.elements.nfePaste.value = '';
    this.elements.nfeAccessKey.value = '';
    this.elements.nfeMargin.value = '40';
    this.margin = 40;
    this.renderKeyStatus();
    this.setMessage('Selecione um XML para iniciar a conferência. Nenhuma gravação será realizada.', 'neutral');
    this.render();
  }

  refreshMatches() {
    if (!this.analysis) return;
    const base = { note: this.analysis.note, items: this.analysis.items, rawXml: this.rawXml };
    this.analysis = matchNfeAnalysis(base, this.store.state.products, this.analysis.importRecord, this.margin);
    this.renderAnalysis();
  }

  render() {
    this.elements.nfeMargin.value = String(this.margin);
    this.elements.nfeExportButton.disabled = !this.analysis;
    if (!this.analysis) {
      this.elements.nfeNote.innerHTML = '';
      this.elements.nfeSummary.innerHTML = '';
      this.elements.nfeItems.innerHTML = '<div class="empty-state nfe-empty">O resultado da nota aparecerá aqui após a leitura do XML.</div>';
    } else {
      this.renderAnalysis();
    }
  }

  renderAnalysis() {
    if (!this.analysis) return this.render();
    const { note, items, importRecord, globalDuplicate } = this.analysis;
    const summary = nfeAnalysisSummary(this.analysis);
    this.elements.nfeExportButton.disabled = false;
    this.elements.nfeNote.innerHTML = `<div class="nfe-note-main"><div><span>Fornecedor</span><strong>${escapeHtml(note.supplier || 'Não informado')}</strong><small>${escapeHtml(documentMask(note.supplierCnpj))}</small></div><div><span>NF-e</span><strong>${escapeHtml(note.number || '—')} · série ${escapeHtml(note.series || '—')}</strong><small>${escapeHtml(dateTime(note.issuedAt))}</small></div><div><span>Chave</span><strong class="nfe-key">${escapeHtml(note.key)}</strong><small>SHA-256 ${escapeHtml(note.xmlHash ? note.xmlHash.slice(0, 16) + '…' : 'indisponível')}</small></div><div><span>Registro fiscal</span><strong>${globalDuplicate ? 'Concluído anteriormente' : importRecord ? escapeHtml(importRecord.status || 'Encontrado') : this.registryChecked ? 'Não encontrado' : 'Não consultado'}</strong><small>${globalDuplicate ? escapeHtml(dateTime(importRecord?.concluida_em)) : 'Consulta somente leitura'}</small></div></div>`;

    this.elements.nfeSummary.innerHTML = [
      ['info', summary.lines, 'Linhas no XML', `${summary.groups} grupos`],
      ['success', summary.exact + summary.manual, 'Produtos vinculados', `${summary.unmatched} sem vínculo`],
      [summary.duplicates ? 'danger' : 'success', summary.duplicates, 'Entradas duplicadas', summary.duplicates ? 'Bloqueadas' : 'Nenhuma detectada'],
      ['info', summary.incomingUnits, 'Unidades calculadas', money(summary.calculatedNet)],
    ].map(([kind, value, label, help]) => `<article class="metric-card ${kind}"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span><small>${escapeHtml(help)}</small></article>`).join('');

    this.elements.nfeItems.innerHTML = items.map((item, index) => this.itemCard(item, index)).join('');
  }

  itemCard(item, index) {
    const product = item.matchedProduct;
    const matchKind = item.duplicate ? 'danger' : product ? 'success' : 'warning';
    const matchLabel = item.duplicate ? 'Entrada bloqueada' : item.matchStatus === 'exact' ? 'EAN encontrado' : item.matchStatus === 'manual' ? 'Vínculo manual' : 'Produto não encontrado';
    const suggestions = item.suggestions?.length
      ? `<div class="nfe-suggestions"><span>Sugestões iniciais</span>${item.suggestions.map(suggestion => `<button type="button" data-nfe-select-product="${escapeHtml(suggestion.key)}" data-nfe-item="${escapeHtml(item.id)}"><strong>${escapeHtml(suggestion.name)}</strong><small>${escapeHtml(suggestion.code || 'sem código')} · ${suggestion.score}%</small></button>`).join('')}</div>`
      : '';
    return `<article class="nfe-item${item.duplicate ? ' duplicate' : ''}" data-nfe-item-card="${escapeHtml(item.id)}">
      <div class="nfe-item-head"><div><span class="eyebrow">Item ${index + 1} · linha(s) ${escapeHtml(item.lines.join(', '))}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.ean || 'Sem EAN')} · NCM ${escapeHtml(item.ncm || 'não informado')} · ${escapeHtml(item.packaging || 'sem unidade')}</p></div><span class="badge ${matchKind}">${escapeHtml(matchLabel)}</span></div>
      ${item.duplicate ? `<div class="nfe-duplicate-warning">${escapeHtml(item.duplicateReason)}</div>` : ''}
      <div class="nfe-calculation-grid">
        <label>Quantidade comercial<strong>${escapeHtml(item.commercialQuantity)} ${escapeHtml(item.commercialUnit || '')}</strong></label>
        <label>Multiplicador<input type="number" min="1" max="1000" step="1" value="${escapeHtml(item.multiplier)}" data-nfe-multiplier="${escapeHtml(item.id)}"><small>${escapeHtml(item.multiplierSource)}</small></label>
        <label>Entrada calculada<strong>${escapeHtml(item.incomingUnits)} unidade(s)</strong></label>
        <label>Custo unitário<strong>${escapeHtml(money(item.unitCost))}</strong><small>Líquido ${escapeHtml(money(item.net))}</small></label>
        <label>Venda sugerida<strong>${escapeHtml(money(item.suggestedPrice))}</strong><small>Margem ${escapeHtml(this.margin)}%</small></label>
        <label>Estoque projetado<strong>${product ? `${escapeHtml(number(product.estoque))} → ${escapeHtml(item.projectedStock)}` : 'Aguardando vínculo'}</strong></label>
      </div>
      <div class="nfe-match-panel">
        <div class="nfe-current-match">${product ? `<span>Produto vinculado</span><strong>${escapeHtml(productName(product))}</strong><small>${escapeHtml(productCode(product) || productKey(product))} · estoque ${escapeHtml(number(product.estoque))}</small>` : '<span>Nenhum produto vinculado</span><strong>Será tratado como produto novo em uma fase futura</strong><small>Nesta etapa nada será criado.</small>'}</div>
        <div class="nfe-search-product"><label>Pesquisar outro produto<input type="search" data-nfe-search="${escapeHtml(item.id)}" placeholder="Nome, código ou EAN" autocomplete="off"></label><div class="nfe-live-results" data-nfe-results="${escapeHtml(item.id)}"></div></div>
      </div>
      ${suggestions}
    </article>`;
  }

  handleMultiplier(event) {
    const itemId = event.target.dataset.nfeMultiplier;
    if (!itemId || !this.analysis) return;
    const item = this.analysis.items.find(candidate => candidate.id === itemId);
    if (!item) return;
    item.multiplier = Math.min(1000, Math.max(1, Math.floor(number(event.target.value) || 1)));
    item.multiplierSource = 'Ajustado manualmente na conferência V2';
    recalculateNfeItems(this.analysis.items, this.analysis.note, this.margin);
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
    const button = event.target.closest('[data-nfe-select-product]');
    if (!button || !this.analysis) return;
    const product = this.store.getProduct(button.dataset.nfeSelectProduct);
    if (!product) return;
    this.analysis = chooseNfeProduct(this.analysis, button.dataset.nfeItem, product, this.margin);
    this.renderAnalysis();
    this.onToast(`Vínculo de conferência definido para ${productName(product)}. Nada foi salvo.`, 'success');
  }

  exportAnalysis() {
    if (!this.analysis) return;
    const safe = {
      exportedAt: new Date().toISOString(),
      mode: 'read-only',
      margin: this.margin,
      note: this.analysis.note,
      globalDuplicate: this.analysis.globalDuplicate,
      registryChecked: this.registryChecked,
      importRecord: this.analysis.importRecord,
      summary: nfeAnalysisSummary(this.analysis),
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
    anchor.download = `analise-nfe-${this.analysis.note.key}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
