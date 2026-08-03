import { ProductsModule } from '/producao-v2/js/modules/products.js';
import { StockModule } from './modules/stock.js';
import { NfeAdvancedModule } from './modules/nfe-advanced.js?admin_build=20260726-admin-v13-xml-editor-parity';
import './nfe-editor-parity.js?admin_build=20260726-admin-v13-xml-editor-parity';
import { chooseNfeProduct } from './core/nfe.js';
import { updateNfeItem } from './core/nfe-simulation.js?admin_build=20260726-admin-v13-xml-editor-parity';
import {
  clone, escapeHtml, productKey, productName, text,
} from './core/utils.js';

const BUILD = '20260803-alt-ean-v1';
const PRODUCTS_PATCH = '__alternateEanProductsV1';
const STOCK_PATCH = '__alternateEanStockV1';
const NFE_PATCH = '__alternateEanNfeV1';

function digits(value = '') {
  return String(value ?? '').replace(/\D/g, '');
}

function sourceValues(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return String(value || '').split(/[,;|\s]+/);
}

function normalizeEanList(value, primary = '') {
  const main = digits(primary);
  return [...new Set(sourceValues(value).map(digits).filter(code => code && code !== main))];
}

function alternateEans(product = {}) {
  const primary = digits(product.gtin || product.ean);
  return normalizeEanList([
    ...sourceValues(product.eans_alternativos),
    ...sourceValues(product.ean_aliases),
  ], primary);
}

function allProductEans(product = {}) {
  return [...new Set([
    digits(product.gtin || product.ean),
    digits(product.ean || product.gtin),
    ...alternateEans(product),
  ].filter(Boolean))];
}

function sameList(a, b) {
  return JSON.stringify(normalizeEanList(a).sort()) === JSON.stringify(normalizeEanList(b).sort());
}

function aliasesText(product = {}) {
  return alternateEans(product).join(', ');
}

function aliasesPatch(product = {}, raw = product.eans_alternativos) {
  const list = normalizeEanList([
    ...sourceValues(raw),
    ...sourceValues(product.ean_aliases),
  ], product.gtin || product.ean);
  return { eans_alternativos: list, ean_aliases: list };
}

function withAliasesInEan(products, callback) {
  const backups = (products || []).map(product => ({
    product,
    had: Object.prototype.hasOwnProperty.call(product, 'ean'),
    value: product.ean,
  }));
  try {
    backups.forEach(({ product }) => {
      const aliases = alternateEans(product);
      if (aliases.length) product.ean = [digits(product.ean || product.gtin), ...aliases].filter(Boolean).join(' ');
    });
    return callback();
  } finally {
    backups.forEach(({ product, had, value }) => {
      if (had) product.ean = value;
      else delete product.ean;
    });
  }
}

function conflictMessages(products, current) {
  const key = productKey(current);
  const primary = digits(current.gtin || current.ean);
  const aliases = alternateEans(current);
  const messages = [];

  for (const other of products || []) {
    if (productKey(other) === key) continue;
    const otherCodes = new Set(allProductEans(other));
    aliases.forEach(code => {
      if (otherCodes.has(code)) messages.push(`EAN alternativo ${code} já pertence a ${productName(other)}`);
    });
    if (primary && alternateEans(other).includes(primary)) {
      messages.push(`O EAN principal ${primary} já está como alternativo em ${productName(other)}`);
    }
  }
  return [...new Set(messages)];
}

function installStyle() {
  if (document.querySelector('style[data-alternate-ean-style]')) return;
  const style = document.createElement('style');
  style.dataset.alternateEanStyle = '1';
  style.textContent = `
    .alternate-ean-field small{display:block;margin-top:6px;color:var(--muted,#6b716c);line-height:1.35}
    .alternate-ean-summary{display:block;margin-top:3px;color:var(--muted,#6b716c);font-size:11px}
  `;
  document.head.appendChild(style);
}

function installProductsPatch() {
  const prototype = ProductsModule.prototype;
  if (prototype[PRODUCTS_PATCH]) return;
  Object.defineProperty(prototype, PRODUCTS_PATCH, { value: true });

  const originalValidation = prototype.productValidation;
  prototype.productValidation = function productValidationWithAlternateEans(product) {
    const normalizedAliases = aliasesPatch(product);
    const candidate = { ...product, ...normalizedAliases };
    const result = originalValidation.call(this, candidate);
    result.product.eans_alternativos = normalizedAliases.eans_alternativos;
    result.product.ean_aliases = normalizedAliases.ean_aliases;

    normalizedAliases.eans_alternativos.forEach(code => {
      if (code.length < 8 || code.length > 14) result.errors.push(`EAN alternativo ${code} precisa ter entre 8 e 14 números`);
    });
    result.errors.push(...conflictMessages(this.store?.state?.products, candidate));
    result.errors = [...new Set(result.errors)];
    return result;
  };

  const originalFilteredProducts = prototype.filteredProducts;
  prototype.filteredProducts = function filteredProductsWithAlternateEans() {
    return withAliasesInEan(this.store?.state?.products, () => originalFilteredProducts.call(this));
  };

  const originalRenderEditor = prototype.renderEditor;
  prototype.renderEditor = function renderEditorWithAlternateEans(product) {
    const result = originalRenderEditor.call(this, product);
    installStyle();
    const gtinInput = this.elements?.productForm?.querySelector('[data-editor-section="essential"] [data-field="gtin"]');
    const gtinLabel = gtinInput?.closest('label');
    if (gtinLabel && !this.elements.productForm.querySelector('[data-field="eans_alternativos"]')) {
      const label = document.createElement('label');
      label.className = 'span-2 alternate-ean-field';
      label.innerHTML = `EANs alternativos<input data-field="eans_alternativos" type="text" inputmode="numeric" value="${escapeHtml(aliasesText(product))}" placeholder="Ex.: 7891234567890, 7899876543210"><small>Use para códigos antigos ou novos do mesmo produto. O Bling continuará recebendo somente o EAN principal.</small>`;
      gtinLabel.insertAdjacentElement('afterend', label);
    }
    return result;
  };

  const originalHandleEditorInput = prototype.handleEditorInput;
  prototype.handleEditorInput = function handleEditorInputWithAlternateEans(event) {
    const field = event.target?.dataset?.field;
    const key = this.store?.state?.selectedProductKey;
    if (field === 'eans_alternativos' && key) {
      const current = this.store.getProduct(key);
      const list = normalizeEanList(event.target.value, current?.gtin || current?.ean);
      if (event.type === 'change') event.target.value = list.join(', ');
      this.store.updateProduct(key, { eans_alternativos: list, ean_aliases: list });
      const updated = this.store.getProduct(key);
      this.elements.editorTitle.textContent = productName(updated);
      this.elements.editorSubtitle.textContent = `${updated?.codigo || key} · alteração pendente`;
      this.renderValidation(updated);
      this.renderDirty();
      return;
    }

    const result = originalHandleEditorInput.call(this, event);
    if (field === 'gtin' && key) {
      const current = this.store.getProduct(key);
      if (current) {
        const patch = aliasesPatch(current);
        if (!sameList(current.eans_alternativos, patch.eans_alternativos)
          || !sameList(current.ean_aliases, patch.ean_aliases)) {
          this.store.updateProduct(key, patch);
          this.renderValidation(this.store.getProduct(key));
          this.renderDirty();
        }
      }
    }
    return result;
  };

  const originalRenderTable = prototype.renderTable;
  prototype.renderTable = function renderTableWithAlternateEanSummary() {
    const result = originalRenderTable.call(this);
    this.elements?.productsTableBody?.querySelectorAll('tr').forEach(row => {
      const key = row.querySelector('[data-product-key]')?.dataset?.productKey
        || row.querySelector('[data-inline-save]')?.dataset?.inlineSave;
      const product = key ? this.store.getProduct(key) : null;
      const aliases = alternateEans(product);
      if (!aliases.length) return;
      const cell = row.children?.[1]?.querySelector('.cell-stack');
      if (cell && !cell.querySelector('.alternate-ean-summary')) {
        cell.insertAdjacentHTML('beforeend', `<small class="alternate-ean-summary">${aliases.length} EAN${aliases.length > 1 ? 's' : ''} alternativo${aliases.length > 1 ? 's' : ''}</small>`);
      }
    });
    return result;
  };
}

function installStockPatch() {
  const prototype = StockModule.prototype;
  if (prototype[STOCK_PATCH]) return;
  Object.defineProperty(prototype, STOCK_PATCH, { value: true });
  const originalRows = prototype.rows;
  prototype.rows = function stockRowsWithAlternateEans() {
    return withAliasesInEan(this.store?.state?.products, () => originalRows.call(this));
  };
}

const NFE_DRAFT_FIELDS = [
  'nome', 'codigo', 'gtin', 'ean', 'ncm', 'cest', 'embalagem', 'categoria', 'subcategoria',
  'subsubcategoria', 'marca', 'fornecedor', 'preco_custo', 'preco', 'preco_oferta',
  'validade_oferta', 'situacao', 'url_imagem', 'imagem', 'imagem_url', 'imagens',
  'imagem_path', 'imagem_storage', 'imagem_origem', 'imagem_status', 'imagem_gerada_em',
  'descricao', 'descricao_curta', 'tags', 'gondola', 'prateleira', 'localizacao',
];

function nfeDraftFromProduct(product, item) {
  const draft = {};
  NFE_DRAFT_FIELDS.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(product || {}, field)) draft[field] = clone(product[field]);
  });
  draft.nome = text(draft.nome || product?.nome || item?.name);
  draft.codigo = text(draft.codigo || product?.codigo || productKey(product));
  draft.gtin = digits(draft.gtin || draft.ean || product?.gtin || product?.ean);
  draft.ean = digits(draft.ean || draft.gtin);
  draft.embalagem = text(draft.embalagem || product?.embalagem || item?.packaging || 'UN');
  draft.preco_custo = Number(item?.unitCost || draft.preco_custo || product?.preco_custo || 0);
  draft.preco = Number(draft.preco ?? product?.preco ?? 0);
  draft.situacao = text(draft.situacao || product?.situacao || 'A').toUpperCase();
  const aliases = normalizeEanList([
    ...alternateEans(product),
    item?.ean,
  ], draft.gtin || draft.ean);
  draft.eans_alternativos = aliases;
  draft.ean_aliases = aliases;
  draft.manualPrice = true;
  return draft;
}

function syncNfeItemAliases(item) {
  if (!item) return [];
  const draft = item.productDraft || {};
  const primary = digits(draft.gtin || draft.ean || item.matchedProduct?.gtin || item.matchedProduct?.ean || item.ean);
  const aliases = normalizeEanList([
    ...sourceValues(draft.eans_alternativos),
    ...sourceValues(draft.ean_aliases),
    ...alternateEans(item.matchedProduct),
    item.matchedProduct ? item.ean : '',
  ], primary);
  item.productDraft = { ...draft, eans_alternativos: aliases, ean_aliases: aliases };
  item.newProductDraft = clone(item.productDraft);
  if (item.matchedProduct) {
    item.matchedProduct.eans_alternativos = aliases;
    item.matchedProduct.ean_aliases = aliases;
  }
  return aliases;
}

function injectNfeAlternateField(html, item) {
  if (html.includes('data-nfe-draft-field="eans_alternativos"')) return html;
  const marker = 'data-nfe-draft-field="gtin"';
  const fieldAt = html.indexOf(marker);
  if (fieldAt < 0) return html;
  const labelStart = html.lastIndexOf('<label', fieldAt);
  const labelEnd = html.indexOf('</label>', fieldAt);
  if (labelStart < 0 || labelEnd < 0) return html;
  const insertAt = labelEnd + '</label>'.length;
  const aliases = alternateEans(item?.productDraft || item?.matchedProduct || {});
  const field = `<label class="span-2 alternate-ean-field">EANs alternativos<input value="${escapeHtml(aliases.join(', '))}" data-nfe-draft-field="eans_alternativos" data-nfe-item="${escapeHtml(item?.id || '')}" inputmode="numeric" placeholder="Códigos do mesmo produto separados por vírgula"><small>O EAN do XML é incluído automaticamente quando você vincula o item a um produto existente. Estes códigos ficam apenas no Firebase.</small></label>`;
  return `${html.slice(0, insertAt)}${field}${html.slice(insertAt)}`;
}

function addPlanError(plan, message) {
  if (!message) return;
  plan.errors = [...new Set([...(plan.errors || []), message])];
  plan.status = 'blocked';
}

function applyPlanAliases(instance, simulation) {
  if (!simulation) return simulation;
  const items = instance.analysis?.items || [];
  const ownerByEan = new Map();
  (instance.store?.state?.products || []).forEach(product => {
    allProductEans(product).forEach(code => {
      const owners = ownerByEan.get(code) || [];
      owners.push({ key: productKey(product), name: productName(product) });
      ownerByEan.set(code, owners);
    });
  });
  const plannedOwner = new Map();

  (simulation.plans || []).forEach(plan => {
    if (!plan?.nextProduct || plan.status === 'skipped') return;
    const item = items.find(candidate => candidate.id === plan.itemId);
    const aliases = syncNfeItemAliases(item);
    plan.nextProduct.eans_alternativos = aliases;
    plan.nextProduct.ean_aliases = aliases;
    plan.editableFields = [...new Set([...(plan.editableFields || []), 'eans_alternativos', 'ean_aliases'])];

    const before = alternateEans(plan.currentProduct || {});
    if (!sameList(before, aliases)) {
      plan.changes = (plan.changes || []).filter(change => change.field !== 'eans_alternativos');
      plan.changes.push({
        field: 'eans_alternativos',
        label: 'EANs alternativos',
        before: before.join(', '),
        after: aliases.join(', '),
      });
    }

    const planKey = text(plan.productKey);
    allProductEans(plan.nextProduct).forEach(code => {
      const externalOwners = (ownerByEan.get(code) || []).filter(owner => owner.key !== planKey);
      externalOwners.forEach(owner => addPlanError(plan, `O EAN ${code} já pertence a ${owner.name}.`));
      const previousPlan = plannedOwner.get(code);
      if (previousPlan && previousPlan !== planKey) addPlanError(plan, `O EAN ${code} também está sendo usado por outro item desta NF-e.`);
      else plannedOwner.set(code, planKey);
    });
  });

  simulation.errors = (simulation.plans || [])
    .filter(plan => plan.status !== 'skipped')
    .flatMap(plan => (plan.errors || []).map(message => ({ itemId: plan.itemId, groupKey: plan.groupKey, message })));
  simulation.summary.blocked = (simulation.plans || []).filter(plan => plan.status === 'blocked').length;
  simulation.summary.newProducts = (simulation.plans || []).filter(plan => plan.status === 'new').length;
  simulation.summary.updates = (simulation.plans || []).filter(plan => plan.status === 'update').length;
  simulation.canImport = Boolean((simulation.plans || []).some(plan => plan.status !== 'skipped') && simulation.errors.length === 0);
  return simulation;
}

function applyCanonicalAlternateMatches(instance) {
  if (!instance.analysis) return false;
  let analysis = instance.analysis;
  let changed = false;
  const products = instance.store?.state?.products || [];

  for (const sourceItem of analysis.items || []) {
    if (sourceItem.matchedProduct || !digits(sourceItem.ean)) continue;
    const product = products.find(candidate => allProductEans(candidate).includes(digits(sourceItem.ean)));
    if (!product) continue;
    analysis = chooseNfeProduct(analysis, sourceItem.id, product, instance.margin);
    const item = analysis.items.find(candidate => candidate.id === sourceItem.id);
    if (item) {
      item.matchStatus = 'exact';
      item.suggestions = [];
      item.productDraft = nfeDraftFromProduct(product, item);
      item.newProductDraft = clone(item.productDraft);
      syncNfeItemAliases(item);
      changed = true;
    }
  }

  if (changed) instance.analysis = analysis;
  return changed;
}

function installNfePatch() {
  const prototype = NfeAdvancedModule.prototype;
  if (prototype[NFE_PATCH]) return;
  Object.defineProperty(prototype, NFE_PATCH, { value: true });

  const originalRefreshSimulation = prototype.refreshSimulation;
  prototype.refreshSimulation = function refreshSimulationWithAlternateEans() {
    (this.analysis?.items || []).forEach(syncNfeItemAliases);
    const simulation = originalRefreshSimulation.call(this);
    this.simulation = applyPlanAliases(this, simulation);
    return this.simulation;
  };

  const originalProductEditor = prototype.productEditor;
  prototype.productEditor = function productEditorWithAlternateEans(item) {
    return injectNfeAlternateField(originalProductEditor.call(this, item), item);
  };

  const originalHandleItemChange = prototype.handleItemChange;
  prototype.handleItemChange = function handleNfeAlternateEanChange(event) {
    if (event.target?.dataset?.nfeDraftField === 'eans_alternativos') {
      const itemId = event.target.dataset.nfeItem;
      const item = this.analysis?.items?.find(candidate => candidate.id === itemId);
      if (!item) return;
      const primary = item.productDraft?.gtin || item.productDraft?.ean || item.ean;
      const list = normalizeEanList(event.target.value, primary);
      event.target.value = list.join(', ');
      this.analysis = updateNfeItem(this.analysis, itemId, {
        productDraft: { eans_alternativos: list, ean_aliases: list },
      }, this.margin);
      this.refreshSimulation();
      this.renderAnalysis();
      return;
    }
    return originalHandleItemChange.call(this, event);
  };

  const originalHandleItemsClick = prototype.handleItemsClick;
  prototype.handleItemsClick = function handleNfeSelectionWithAlternateEan(event) {
    const select = event.target?.closest?.('[data-nfe-select-product]');
    const itemId = select?.dataset?.nfeItem;
    const selectedProduct = select ? this.store?.getProduct?.(select.dataset.nfeSelectProduct) : null;
    const result = originalHandleItemsClick.call(this, event);
    if (itemId && selectedProduct && this.analysis) {
      const item = this.analysis.items.find(candidate => candidate.id === itemId);
      const draft = nfeDraftFromProduct(selectedProduct, item);
      this.analysis = updateNfeItem(this.analysis, itemId, { productDraft: draft }, this.margin);
      const updated = this.analysis.items.find(candidate => candidate.id === itemId);
      syncNfeItemAliases(updated);
      this.refreshSimulation();
      this.renderAnalysis();
      this.onToast('Produto vinculado. O EAN diferente do XML foi guardado como alternativo.', 'success');
    }
    return result;
  };

  const originalHandleItemSearch = prototype.handleItemSearch;
  prototype.handleItemSearch = function handleNfeSearchWithAlternateEans(event) {
    return withAliasesInEan(this.store?.state?.products, () => originalHandleItemSearch.call(this, event));
  };

  const originalAnalyze = prototype.analyze;
  prototype.analyze = async function analyzeWithAlternateEanMatch(raw, sourceLabel = 'XML') {
    const result = await originalAnalyze.call(this, raw, sourceLabel);
    if (applyCanonicalAlternateMatches(this)) {
      this.refreshSimulation();
      this.renderAnalysis();
      this.onToast('EAN alternativo reconhecido e vinculado ao cadastro existente.', 'success');
    }
    return result;
  };

  const originalRefreshMatches = prototype.refreshMatches;
  prototype.refreshMatches = function refreshMatchesWithAlternateEans() {
    const result = originalRefreshMatches.call(this);
    if (applyCanonicalAlternateMatches(this)) {
      this.refreshSimulation();
      this.renderAnalysis();
    }
    return result;
  };
}

installStyle();
installProductsPatch();
installStockPatch();
installNfePatch();

export const ALTERNATE_EAN_BUILD = BUILD;
