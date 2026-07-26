import { chooseNfeProduct, digits, matchNfeAnalysis, nfeAnalysisSummary, parseNfeXml, recalculateNfeItems } from '../core/nfe.js';
import { buildNfeSimulation, normalizeNfeDate, prepareNfeAnalysis, updateNfeItem } from '../core/nfe-simulation.js?admin_build=20260726-admin-v13-nfe-real';
import {
  clone, debounce, escapeHtml, money, normalizeSearch, number, productCode, productImage,
  productKey, productName, text,
} from '../core/utils.js';
import { inspectNfeImport } from '../services/github.js';
import { executeNfeImport } from '../services/nfe-transaction.js?admin_build=20260726-admin-v13-nfe-real';
import {
  assertMakeProductIdentity, callMake, compactProductForMake, extractMakeImage, extractMakeTags, unwrapMakeResult,
} from '../services/make.js';
import { rawGithubUrl, upsertBase64File } from '../services/github-binary.js';

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
  if (['preco', 'preco_custo', 'preco_oferta', 'price', 'cost'].includes(field)) return money(value);
  if (['validade', 'validade_oferta'].includes(field)) return normalizeNfeDate(value) || '—';
  if (Array.isArray(value)) return value.join(', ') || '—';
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '') || '—';
}

function slug(value = '') {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'produto';
}

function imageExtension(dataUrl) {
  const mime = text(dataUrl).match(/^data:image\/([^;]+);base64,/i)?.[1]?.toLowerCase() || 'png';
  return mime.includes('webp') ? 'webp' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png';
}

function mergeTags(current, incoming) {
  const base = Array.isArray(current) ? current : text(current).split(/[,;|]/);
  return [...new Set([...base, ...(incoming || [])].map(item => text(item)).filter(Boolean))];
}

function draftFromProduct(product, item, note) {
  if (product) {
    return {
      nome: text(product.nome),
      codigo: text(product.codigo || product.sku || productKey(product)),
      gtin: text(product.gtin || product.ean),
      ean: text(product.ean || product.gtin),
      ncm: text(product.ncm),
      cest: text(product.cest),
      embalagem: text(product.embalagem || item.packaging || 'UN'),
      categoria: text(product.categoria),
      subcategoria: text(product.subcategoria),
      subsubcategoria: text(product.subsubcategoria),
      marca: text(product.marca),
      fornecedor: text(product.fornecedor || note?.supplier),
      preco_custo: number(item.unitCost || product.preco_custo),
      preco: number(product.preco),
      preco_oferta: number(product.preco_oferta),
      validade_oferta: text(product.validade_oferta),
      situacao: text(product.situacao || 'A').toUpperCase(),
      url_imagem: text(product.url_imagem || product.imagem_url || product.imagem),
      imagem: text(product.imagem || product.url_imagem),
      imagem_url: text(product.imagem_url || product.url_imagem),
      imagens: Array.isArray(product.imagens) ? clone(product.imagens) : [],
      descricao: text(product.descricao),
      descricao_curta: text(product.descricao_curta),
      tags: Array.isArray(product.tags) ? clone(product.tags) : text(product.tags),
      gondola: text(product.gondola || product['gôndola']),
      prateleira: text(product.prateleira),
      localizacao: text(product.localizacao || product.localização),
      manualPrice: true,
    };
  }
  return {
    nome: text(item.name),
    codigo: text(item.ean || item.supplierCodes?.[0]),
    gtin: text(item.ean),
    ean: text(item.ean),
    ncm: text(item.ncm),
    cest: text(item.cest),
    embalagem: text(item.packaging || 'UN'),
    categoria: 'A CLASSIFICAR',
    subcategoria: '',
    subsubcategoria: '',
    marca: '',
    fornecedor: text(note?.supplier),
    preco_custo: number(item.unitCost),
    preco: number(item.suggestedPrice),
    preco_oferta: 0,
    validade_oferta: '',
    situacao: 'A',
    url_imagem: '',
    imagem: '',
    imagem_url: '',
    imagens: [],
    descricao: '',
    descricao_curta: '',
    tags: [],
    gondola: '',
    prateleira: '',
    localizacao: '',
    manualPrice: false,
  };
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
    this.aiBusy = new Set();
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
      this.onToast('Conferência recalculada. Revise antes de importar.', 'success');
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
        : `${summary.lines} linha(s) agrupadas em ${summary.groups} produto(s). Edite os cadastros e importe quando a conferência estiver válida.`;
      this.setMessage(message, this.analysis.globalDuplicate || summary.duplicates ? 'danger' : 'success');
      this.renderAnalysis();
      this.onToast('XML lido. A importação real fica disponível após a conferência.', 'success');
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
    this.aiBusy.clear();
    this.elements.nfePaste.value = '';
    this.elements.nfeAccessKey.value = '';
    this.elements.nfeMargin.value = '40';
    if (this.elements.nfeGlobalValidity) this.elements.nfeGlobalValidity.value = '';
    if (this.elements.nfeConfirmImport) this.elements.nfeConfirmImport.checked = false;
    this.margin = 40;
    this.renderKeyStatus();
    this.setMessage('Selecione um XML para iniciar a conferência. Nenhuma gravação acontece antes do botão de importação.', 'neutral');
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
      ['success', summary.exact + summary.manual, 'Produtos vinculados', `${summary.unmatched} novos`],
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
    return `<article class="nfe-item${item.duplicate ? ' duplicate' : ''}" data-nfe-item-card="${escapeHtml(item.id)}">
      <div class="nfe-item-head"><div><span class="eyebrow">Item ${index + 1} · linha(s) ${escapeHtml(item.lines.join(', '))}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.ean || 'Sem EAN')} · NCM ${escapeHtml(item.ncm || 'não informado')} · ${escapeHtml(item.packaging || 'sem unidade')}</p></div><span class="badge ${matchKind}">${escapeHtml(matchLabel)}</span></div>
      ${item.duplicate ? `<div class="nfe-duplicate-warning">${escapeHtml(item.duplicateReason)}</div>` : ''}
      <div class="nfe-calculation-grid">
        <label>Quantidade comercial<strong>${escapeHtml(item.commercialQuantity)} ${escapeHtml(item.commercialUnit || '')}</strong></label>
        <label>Multiplicador<input type="number" min="1" max="1000" step="1" value="${escapeHtml(item.multiplier)}" data-nfe-field="multiplier" data-nfe-item="${escapeHtml(item.id)}"><small>${escapeHtml(item.multiplierSource)}</small></label>
        <label>Entrada calculada<strong>${escapeHtml(item.incomingUnits)} unidade(s)</strong></label>
        <label>Custo do XML<strong>${escapeHtml(money(item.unitCost))}</strong><small>Líquido ${escapeHtml(money(item.net))}</small></label>
        <label>Venda sugerida<strong>${escapeHtml(money(item.suggestedPrice))}</strong><small>Margem ${escapeHtml(this.margin)}%</small></label>
        <label>Estoque projetado<strong>${product ? `${escapeHtml(number(product.estoque))} → ${escapeHtml(item.projectedStock)}` : `0 → ${escapeHtml(item.projectedStock)}`}</strong></label>
      </div>
      <div class="nfe-entry-options">
        <label>Validade do lote<input type="text" inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA" value="${escapeHtml(item.validity || '')}" data-nfe-field="validity" data-nfe-item="${escapeHtml(item.id)}" ${item.noExpiry ? 'disabled' : ''}></label>
        <label>Regra da validade<select data-nfe-field="validityMode" data-nfe-item="${escapeHtml(item.id)}" ${item.noExpiry ? 'disabled' : ''}>${product ? `<option value="keep" ${item.validityMode === 'keep' ? 'selected' : ''}>Manter atual</option>` : ''}<option value="earliest" ${item.validityMode === 'earliest' ? 'selected' : ''}>Usar a mais próxima</option><option value="replace" ${item.validityMode === 'replace' ? 'selected' : ''}>Substituir pelo lote</option></select></label>
        <label class="nfe-check"><input type="checkbox" data-nfe-field="noExpiry" data-nfe-item="${escapeHtml(item.id)}" ${item.noExpiry ? 'checked' : ''}> Produto sem validade</label>
        <label class="nfe-check"><input type="checkbox" data-nfe-field="addStock" data-nfe-item="${escapeHtml(item.id)}" ${item.addStock !== false ? 'checked' : ''}> Somar ao estoque</label>
        <label class="nfe-check"><input type="checkbox" data-nfe-field="skipped" data-nfe-item="${escapeHtml(item.id)}" ${item.skipped ? 'checked' : ''}> Ignorar este item</label>
      </div>
      <div class="nfe-match-panel">
        <div class="nfe-current-match">${product ? `<span>Produto vinculado</span><strong>${escapeHtml(productName(product))}</strong><small>${escapeHtml(productCode(product) || productKey(product))} · estoque ${escapeHtml(number(product.estoque))}</small><button class="button ghost compact" type="button" data-nfe-unlink="${escapeHtml(item.id)}">Tratar como produto novo</button>` : '<span>Nenhum produto vinculado</span><strong>Novo produto</strong><small>O cadastro abaixo será criado junto com a entrada.</small>'}</div>
        <div class="nfe-search-product"><label>Pesquisar produto existente<input type="search" data-nfe-search="${escapeHtml(item.id)}" data-nfe-item="${escapeHtml(item.id)}" placeholder="Nome, código ou EAN" autocomplete="off"></label><div class="nfe-live-results" data-nfe-results="${escapeHtml(item.id)}"></div></div>
      </div>
      ${suggestions}
      ${this.productEditor(item)}
      ${this.planPreview(plan)}
    </article>`;
  }

  productEditor(item) {
    const draft = item.productDraft || {};
    const image = text(draft.url_imagem || draft.imagem_url || draft.imagem);
    const fullBusy = this.aiBusy.has(`${item.id}:full`);
    const imageBusy = this.aiBusy.has(`${item.id}:image`);
    const field = (name, label, type = 'text', extra = '') => {
      const value = name === 'tags' && Array.isArray(draft[name]) ? draft[name].join(', ') : draft[name] ?? '';
      return `<label>${escapeHtml(label)}<input type="${type}" ${type === 'number' ? 'step="0.01" min="0"' : ''} ${extra} value="${escapeHtml(value)}" data-nfe-draft-field="${escapeHtml(name)}" data-nfe-item="${escapeHtml(item.id)}"></label>`;
    };
    return `<section class="nfe-product-editor">
      <div class="nfe-product-editor-head"><div><h4>Cadastro completo que será salvo</h4><p>Edite aqui sem sair da NF-e. A prévia abaixo mostra exatamente o que será gravado.</p></div><div class="nfe-ai-actions"><button class="button secondary compact" type="button" data-nfe-ai="full" data-nfe-item="${escapeHtml(item.id)}" ${fullBusy || imageBusy ? 'disabled' : ''}>${fullBusy ? 'IA gerando cadastro…' : 'IA gerar cadastro'}</button><button class="button secondary compact" type="button" data-nfe-ai="image" data-nfe-item="${escapeHtml(item.id)}" ${fullBusy || imageBusy ? 'disabled' : ''}>${imageBusy ? 'IA gerando imagem…' : 'IA gerar imagem'}</button></div></div>
      <div class="nfe-product-editor-layout">
        <div class="nfe-product-image"><img src="${escapeHtml(image || '')}" ${image ? '' : 'hidden'} alt=""><div ${image ? 'hidden' : ''}>Sem imagem</div><small>${escapeHtml(image || 'A imagem gerada aparecerá aqui.')}</small></div>
        <div class="nfe-new-grid">
          ${field('nome', 'Nome')}
          ${field('codigo', 'Código')}
          ${field('gtin', 'EAN / GTIN', 'text', 'inputmode="numeric"')}
          ${field('ncm', 'NCM', 'text', 'inputmode="numeric"')}
          ${field('cest', 'CEST', 'text', 'inputmode="numeric"')}
          ${field('embalagem', 'Embalagem')}
          ${field('categoria', 'Categoria')}
          ${field('subcategoria', 'Subcategoria')}
          ${field('subsubcategoria', 'Subsubcategoria')}
          ${field('marca', 'Marca')}
          ${field('fornecedor', 'Fornecedor')}
          ${field('preco_custo', 'Preço de custo', 'number')}
          ${field('preco', 'Preço de venda', 'number')}
          ${field('preco_oferta', 'Preço de oferta', 'number')}
          ${field('validade_oferta', 'Validade da oferta', 'text', 'inputmode="numeric" maxlength="10" placeholder="DD/MM/AAAA"')}
          <label>Situação<select data-nfe-draft-field="situacao" data-nfe-item="${escapeHtml(item.id)}"><option value="A" ${text(draft.situacao).toUpperCase() !== 'I' ? 'selected' : ''}>Ativo</option><option value="I" ${text(draft.situacao).toUpperCase() === 'I' ? 'selected' : ''}>Inativo</option></select></label>
          ${field('gondola', 'Gôndola')}
          ${field('prateleira', 'Prateleira')}
          ${field('localizacao', 'Localização')}
          ${field('tags', 'Tags')}
          <label class="span-2">URL da imagem<input type="url" value="${escapeHtml(image)}" data-nfe-draft-field="url_imagem" data-nfe-item="${escapeHtml(item.id)}"></label>
          <label class="span-2">Descrição curta<textarea data-nfe-draft-field="descricao_curta" data-nfe-item="${escapeHtml(item.id)}">${escapeHtml(draft.descricao_curta || '')}</textarea></label>
          <label class="span-2">Descrição completa<textarea data-nfe-draft-field="descricao" data-nfe-item="${escapeHtml(item.id)}">${escapeHtml(draft.descricao || '')}</textarea></label>
        </div>
      </div>
    </section>`;
  }

  planPreview(plan) {
    if (!plan) return '';
    const issues = [
      ...(plan.errors || []).map(message => ['danger', message]),
      ...(plan.warnings || []).map(message => ['warning', message]),
    ];
    const changes = plan.changes || [];
    return `<div class="nfe-plan ${plan.errors?.length ? 'blocked' : ''}"><div class="nfe-plan-head"><div><h4>Prévia exata da importação</h4><p>${plan.status === 'skipped' ? 'Este item será ignorado.' : plan.isNew ? `Criará o produto ${escapeHtml(plan.productKey)}` : `Atualizará o produto ${escapeHtml(plan.productKey)}`}</p></div><span class="badge ${plan.errors?.length ? 'danger' : plan.status === 'skipped' ? 'neutral' : 'info'}">${plan.errors?.length ? 'Bloqueado' : plan.status === 'skipped' ? 'Ignorado' : 'Pronto'}</span></div>${issues.length ? `<div class="nfe-plan-issues">${issues.map(([kind, message]) => `<div class="${kind}">${escapeHtml(message)}</div>`).join('')}</div>` : ''}${changes.length ? `<div class="table-wrap"><table class="nfe-changes"><thead><tr><th>Alteração</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${changes.map(change => `<tr><th>${escapeHtml(change.label)}</th><td>${escapeHtml(displayValue(change.before, change.field))}</td><td>${escapeHtml(displayValue(change.after, change.field))}</td></tr>`).join('')}</tbody></table></div>` : ''}${plan.lotRecord ? `<div class="nfe-lot-preview"><strong>Lote que será criado</strong><span>${escapeHtml(plan.lotRecord.quantidade)} un. · custo ${escapeHtml(money(plan.lotRecord.custo_unitario))} · validade ${escapeHtml(plan.lotRecord.sem_validade ? 'sem validade' : plan.lotRecord.validade)}</span></div>` : ''}</div>`;
  }

  renderSimulation() {
    if (!this.elements.nfeSimulation) return;
    if (!this.simulation) {
      this.elements.nfeSimulation.innerHTML = '';
      return;
    }
    const summary = this.simulation.summary;
    const blockers = this.simulation.errors;
    this.elements.nfeSimulation.innerHTML = `<section class="panel nfe-simulation-panel"><div class="panel-header"><div><span class="eyebrow">Conferência antes da gravação</span><h2>Resumo da importação</h2><p>Esta prévia não grava dados. O botão final abaixo executa a importação real no Firebase.</p></div><span class="badge ${this.simulation.canImport ? 'success' : 'danger'}">${this.simulation.canImport ? 'Pronta para importar' : `${blockers.length} bloqueador(es)`}</span></div><div class="nfe-simulation-metrics"><div><strong>${summary.updates}</strong><span>Atualizações</span></div><div><strong>${summary.newProducts}</strong><span>Produtos novos</span></div><div><strong>${summary.stockUnits}</strong><span>Unidades no estoque</span></div><div><strong>${summary.skipped}</strong><span>Ignorados</span></div></div>${blockers.length ? `<div class="nfe-global-blockers"><strong>Corrija antes de importar</strong>${blockers.map(error => `<p>${escapeHtml(error.groupKey)}: ${escapeHtml(error.message)}</p>`).join('')}</div>` : '<div class="nfe-ready-notice">Conferência válida. Ative a importação, confirme e clique em “Importar NF-e no estoque”.</div>'}</section>`;
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
      this.elements.nfeImportModeStatus.textContent = enabled ? 'Importação real habilitada' : 'Importação bloqueada';
    }
    if (this.elements.nfeImportHelp) {
      this.elements.nfeImportHelp.textContent = !this.analysis
        ? 'Leia uma NF-e para gerar a conferência.'
        : !this.simulation?.canImport
          ? 'A conferência possui bloqueadores.'
          : !enabled
            ? 'Ative “Permitir gravações” e “Permitir importação de NF-e”.'
            : !confirmed
              ? 'Confirme que revisou todos os produtos.'
              : 'A importação real está liberada.';
    }
  }

  handleItemInput(event) {
    const itemId = event.target.dataset.nfeItem;
    if (!itemId || !this.analysis) return;
    if (event.target.dataset.nfeSearch !== undefined) {
      this.handleItemSearch(event);
      return;
    }
    if (event.target.dataset.nfeField === 'validity' || event.target.dataset.nfeDraftField === 'validade_oferta') {
      event.target.value = dateMask(event.target.value);
    }
    if (['gtin', 'ncm', 'cest'].includes(event.target.dataset.nfeDraftField)) {
      event.target.value = digits(event.target.value);
    }
  }

  handleItemChange(event) {
    const itemId = event.target.dataset.nfeItem;
    if (!itemId || !this.analysis) return;
    const field = event.target.dataset.nfeField;
    const draftField = event.target.dataset.nfeDraftField;
    let patch = null;
    if (field) {
      let value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      if (field === 'multiplier') value = Math.min(1000, Math.max(1, Math.floor(number(value) || 1)));
      if (field === 'validity') value = normalizeNfeDate(value);
      patch = { [field]: value };
      if (field === 'multiplier') patch.multiplierSource = 'Ajustado manualmente na entrada da NF-e';
    } else if (draftField) {
      let value = event.target.value;
      if (['preco', 'preco_custo', 'preco_oferta'].includes(draftField)) value = number(value);
      if (['gtin', 'ean', 'ncm', 'cest'].includes(draftField)) value = digits(value);
      if (draftField === 'validade_oferta') value = normalizeNfeDate(value);
      if (draftField === 'tags') value = text(value).split(/[,;|]/).map(text).filter(Boolean);
      const extra = draftField === 'preco' ? { manualPrice: true } : {};
      if (draftField === 'url_imagem') {
        patch = { productDraft: { url_imagem: value, imagem: value, imagem_url: value, imagens: value ? [value] : [], ...extra } };
      } else {
        patch = { productDraft: { [draftField]: value, ...extra } };
      }
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
    const ai = event.target.closest('[data-nfe-ai]');
    if (!this.analysis) return;
    if (ai) {
      this.runAi(ai.dataset.nfeAi, ai.dataset.nfeItem).catch(error => {
        console.error(error);
        this.onToast(error?.message || String(error), 'error');
      });
      return;
    }
    if (select) {
      const product = this.store.getProduct(select.dataset.nfeSelectProduct);
      if (!product) return;
      const next = chooseNfeProduct(this.analysis, select.dataset.nfeItem, product, this.margin);
      const item = next.items.find(row => row.id === select.dataset.nfeItem);
      if (item) {
        item.productDraft = draftFromProduct(product, item, next.note);
        item.newProductDraft = clone(item.productDraft);
      }
      this.analysis = prepareNfeAnalysis(next, this.margin);
      this.refreshSimulation();
      this.renderAnalysis();
      this.onToast(`Vínculo definido para ${productName(product)}. Revise o cadastro antes de importar.`, 'success');
    } else if (unlink) {
      const next = chooseNfeProduct(this.analysis, unlink.dataset.nfeUnlink, null, this.margin);
      const item = next.items.find(row => row.id === unlink.dataset.nfeUnlink);
      if (item) {
        item.productDraft = draftFromProduct(null, item, next.note);
        item.newProductDraft = clone(item.productDraft);
      }
      this.analysis = prepareNfeAnalysis(next, this.margin);
      this.refreshSimulation();
      this.renderAnalysis();
      this.onToast('O item será tratado como produto novo. Complete o cadastro.', 'success');
    }
  }

  async runAi(action, itemId) {
    if (!this.analysis || this.busy) return;
    const item = this.analysis.items.find(row => row.id === itemId);
    if (!item) throw new Error('Item da NF-e não encontrado.');
    const busyKey = `${itemId}:${action}`;
    if (this.aiBusy.has(busyKey)) return;
    if (typeof this.reloadConfig === 'function') this.store.state.config = this.reloadConfig();
    const config = this.store.state.config || {};
    const draft = clone(item.productDraft || {});
    const identity = item.matchedProduct || {
      firebaseKey: draft.codigo || item.ean || itemId,
      id: draft.codigo || item.ean || itemId,
      codigo: draft.codigo || item.ean || itemId,
      ...draft,
    };
    this.aiBusy.add(busyKey);
    this.renderAnalysis();
    try {
      if (action === 'full') {
        this.onToast(`IA: gerando cadastro de ${draft.nome || item.name}…`);
        const raw = await callMake(config, 'text', {
          acao: 'gerar_cadastro_produto',
          origem: 'entrada_nfe_admin_v2',
          dados_nfe: {
            nome_xml: item.name,
            ean: item.ean,
            ncm: item.ncm,
            cest: item.cest,
            embalagem: item.packaging,
            fornecedor: this.analysis.note?.supplier,
            custo_unitario: item.unitCost,
          },
          produto: compactProductForMake({ ...identity, ...draft }),
        });
        const result = assertMakeProductIdentity(identity, raw);
        const data = unwrapMakeResult(result);
        const patch = {};
        const fields = {
          nome: data.nome_sugerido || data.nome || data.name,
          codigo: data.codigo || data.sku,
          gtin: data.gtin || data.ean || data.codigo_barras,
          ncm: data.ncm,
          cest: data.cest,
          embalagem: data.embalagem_sugerida || data.embalagem,
          categoria: data.categoria,
          subcategoria: data.subcategoria,
          subsubcategoria: data.subsubcategoria,
          marca: data.marca,
          fornecedor: data.fornecedor,
          descricao: data.descricao || data.description || data.texto,
          descricao_curta: data.descricao_curta || data.short_description,
          gondola: data.gondola,
          prateleira: data.prateleira,
          localizacao: data.localizacao,
        };
        Object.entries(fields).forEach(([field, value]) => {
          if (text(value)) patch[field] = text(value);
        });
        const tags = extractMakeTags(data);
        if (tags.length) patch.tags = mergeTags(draft.tags, tags);
        if (!Object.keys(patch).length) throw new Error('A IA concluiu, mas não retornou campos utilizáveis.');
        this.analysis = updateNfeItem(this.analysis, itemId, { productDraft: patch }, this.margin);
        this.onToast('Cadastro da IA aplicado. Revise os campos antes de importar.', 'success');
      } else if (action === 'image') {
        this.onToast(`IA: gerando imagem de ${draft.nome || item.name}…`);
        const path = `${text(config.githubImagesPath || 'site/img/produtos_3').replace(/^\/+|\/+$/g, '')}/${slug(draft.codigo || draft.nome || item.name)}-ia.webp`;
        const raw = await callMake(config, 'image', {
          acao: 'melhorar_imagem_produto',
          quantidade_imagens: 1,
          produto: compactProductForMake({ ...identity, ...draft }),
          storage_destino: 'github',
          substituir_imagens_existentes: true,
          imagem_path: path,
          instrucoes: 'Gerar exatamente 1 imagem quadrada fiel ao produto, fundo branco puro, sem cenário e sem inventar informações da embalagem.',
        });
        let source = extractMakeImage(raw);
        if (!source) throw new Error('A IA não retornou imagem, URL ou base64.');
        let publishedPath = path;
        if (/^data:image\//i.test(source)) {
          const ext = imageExtension(source);
          publishedPath = `${text(config.githubImagesPath || 'site/img/produtos_3').replace(/^\/+|\/+$/g, '')}/${slug(draft.codigo || draft.nome || item.name)}-ia-${Date.now()}.${ext}`;
          const uploaded = await upsertBase64File(config, publishedPath, source, `Atualiza imagem IA de ${draft.nome || item.name} pela entrada de NF-e`);
          source = uploaded.url || rawGithubUrl(config, publishedPath);
        }
        this.analysis = updateNfeItem(this.analysis, itemId, {
          productDraft: {
            url_imagem: source,
            imagem: source,
            imagem_url: source,
            imagens: [source],
            imagem_path: publishedPath,
            imagem_storage: 'github',
            imagem_origem: 'ia_make',
            imagem_status: 'ok',
            imagem_gerada_em: new Date().toISOString(),
          },
        }, this.margin);
        this.onToast('Imagem da IA aplicada. Revise antes de importar.', 'success');
      } else {
        throw new Error('Ação de IA não reconhecida.');
      }
      this.refreshSimulation();
    } finally {
      this.aiBusy.delete(busyKey);
      this.renderAnalysis();
    }
  }

  async executeImport() {
    if (this.busy || !this.analysis || !this.simulation?.canImport) return;
    if (typeof this.reloadConfig === 'function') this.store.state.config = this.reloadConfig();
    if (!confirm(`Importar a NF-e ${this.analysis.note.key} no Firebase e somar o estoque dos itens confirmados?`)) return;
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
      this.setMessage(`NF-e ${result.record.chave_nfe} importada no Firebase e conciliada.`, 'success');
      this.onToast(`${result.savedProducts.length} produto(s) salvo(s) e estoque atualizado.`, 'success');
      if (this.elements.nfeConfirmImport) this.elements.nfeConfirmImport.checked = false;
      if (typeof this.onAfterImport === 'function') await this.onAfterImport(result);
      const record = await inspectNfeImport(this.store.state.config, this.analysis.note.key);
      this.analysis = prepareNfeAnalysis(matchNfeAnalysis({
        note: this.analysis.note,
        items: this.analysis.items,
        rawXml: this.rawXml,
      }, this.store.state.products, record, this.margin), this.margin);
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
      mode: 'preview-before-import',
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
        cest: item.cest,
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
        productDraft: item.productDraft,
        matchStatus: item.matchStatus,
        duplicate: item.duplicate,
        duplicateReason: item.duplicateReason,
        matchedProduct: item.matchedProduct ? {
          key: productKey(item.matchedProduct),
          code: productCode(item.matchedProduct),
          name: productName(item.matchedProduct),
          image: productImage(item.matchedProduct),
          stock: number(item.matchedProduct.estoque),
          projectedStock: item.projectedStock,
        } : null,
      })),
    };
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `conferencia-nfe-${this.analysis.note.key}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
