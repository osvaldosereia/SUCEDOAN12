import { clone, number, productKey, text } from './utils.js';
import { recalculateNfeItems, round } from './nfe.js';

export function normalizeNfeDate(value = '') {
  const raw = text(value);
  if (!raw) return '';
  let day;
  let month;
  let year;
  let match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  } else {
    match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return '';
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${String(year).padStart(4, '0')}`;
}

function dateTimestamp(value = '') {
  const normalized = normalizeNfeDate(value);
  if (!normalized) return NaN;
  const [day, month, year] = normalized.split('/').map(Number);
  return Date.UTC(year, month - 1, day, 12);
}

function earlierDate(current, incoming) {
  const currentDate = normalizeNfeDate(current);
  const incomingDate = normalizeNfeDate(incoming);
  if (!currentDate) return incomingDate;
  if (!incomingDate) return currentDate;
  return dateTimestamp(incomingDate) < dateTimestamp(currentDate) ? incomingDate : currentDate;
}

function listFromValue(value) {
  if (Array.isArray(value)) return clone(value);
  if (value && typeof value === 'object') return Object.values(clone(value));
  return [];
}

export const NFE_EDITABLE_FIELDS = Object.freeze([
  'nome', 'codigo', 'gtin', 'ean', 'ncm', 'cest', 'embalagem', 'categoria', 'subcategoria',
  'subsubcategoria', 'marca', 'fornecedor', 'preco_custo', 'preco', 'preco_oferta',
  'validade_oferta', 'situacao', 'url_imagem', 'imagem', 'imagem_url', 'imagens',
  'imagem_path', 'imagem_storage', 'imagem_origem', 'imagem_status', 'imagem_gerada_em',
  'descricao', 'descricao_curta', 'tags', 'gondola', 'prateleira', 'localizacao',
]);

function defaultDraft(item, note = null) {
  const product = item.matchedProduct || null;
  if (product) {
    const draft = {};
    NFE_EDITABLE_FIELDS.forEach(field => {
      if (Object.prototype.hasOwnProperty.call(product, field)) draft[field] = clone(product[field]);
    });
    draft.nome = text(draft.nome || product.nome);
    draft.codigo = text(draft.codigo || product.codigo || product.sku || productKey(product));
    draft.gtin = text(draft.gtin || draft.ean || product.gtin || product.ean);
    draft.ean = text(draft.ean || draft.gtin);
    draft.ncm = text(draft.ncm || product.ncm);
    draft.cest = text(draft.cest || product.cest);
    draft.embalagem = text(draft.embalagem || product.embalagem || item.packaging || 'UN');
    draft.preco_custo = round(number(item.unitCost || draft.preco_custo || product.preco_custo));
    draft.preco = number(draft.preco ?? product.preco);
    draft.situacao = text(draft.situacao || product.situacao || 'A').toUpperCase();
    return draft;
  }
  return {
    codigo: item.ean || item.supplierCodes?.[0] || '',
    nome: item.name,
    gtin: item.ean,
    ean: item.ean,
    ncm: item.ncm,
    cest: item.cest || '',
    embalagem: item.packaging || 'UN',
    categoria: 'A CLASSIFICAR',
    subcategoria: '',
    subsubcategoria: '',
    marca: '',
    fornecedor: note?.supplier || '',
    preco_custo: item.unitCost,
    preco: item.suggestedPrice,
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

function ensureItemDefaults(item, note = null) {
  item.validity = normalizeNfeDate(item.validity);
  item.validityMode = ['keep', 'earliest', 'replace'].includes(item.validityMode) ? item.validityMode : 'earliest';
  item.noExpiry = Boolean(item.noExpiry);
  item.addStock = item.addStock !== false;
  item.skipped = Boolean(item.skipped);

  const baseDraft = defaultDraft(item, note);
  item.productDraft = { ...baseDraft, ...(item.productDraft || item.newProductDraft || {}) };
  if (!item.matchedProduct && !item.productDraft.manualPrice) {
    item.productDraft.preco_custo = round(item.unitCost);
    item.productDraft.preco = round(item.suggestedPrice);
  }
  item.productDraft.gtin = String(item.productDraft.gtin || item.productDraft.ean || '').replace(/\D/g, '');
  item.productDraft.ean = String(item.productDraft.ean || item.productDraft.gtin || '').replace(/\D/g, '');
  item.productDraft.ncm = String(item.productDraft.ncm || '').replace(/\D/g, '');
  item.productDraft.cest = String(item.productDraft.cest || '').replace(/\D/g, '');
  item.productDraft.situacao = text(item.productDraft.situacao || 'A').toUpperCase();
  item.newProductDraft = clone(item.productDraft);
  return item;
}

export function prepareNfeAnalysis(analysis, margin = 40) {
  const result = clone(analysis);
  result.items = (result.items || []).map(item => ensureItemDefaults(item, result.note));
  recalculateNfeItems(result.items, result.note, margin);
  result.items.forEach(item => ensureItemDefaults(item, result.note));
  return result;
}

export function updateNfeItem(analysis, itemId, patch, margin = 40) {
  const result = prepareNfeAnalysis(analysis, margin);
  const item = result.items.find(candidate => candidate.id === itemId);
  if (!item) return result;
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (key === 'productDraft' || key === 'newProductDraft') {
      item.productDraft = { ...(item.productDraft || {}), ...(value || {}) };
      item.newProductDraft = clone(item.productDraft);
    } else {
      item[key] = value;
    }
  });
  item.validity = normalizeNfeDate(item.validity);
  if (item.noExpiry) item.validity = '';
  ensureItemDefaults(item, result.note);
  recalculateNfeItems(result.items, result.note, margin);
  result.items.forEach(row => ensureItemDefaults(row, result.note));
  return result;
}

function deterministicNewKey(item, note, usedKeys) {
  const candidates = [
    item.productDraft?.firebaseKey,
    item.productDraft?.codigo,
    item.ean,
    item.supplierCodes?.[0],
    `NFE${note.number || ''}${item.lines?.[0] || ''}`,
  ].map(value => text(value).replace(/[^a-zA-Z0-9_-]/g, '')).filter(Boolean);
  const base = candidates[0] || `nfe_${Date.now()}`;
  let candidate = base;
  let suffix = 2;
  while (usedKeys.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  usedKeys.add(candidate);
  return candidate;
}

function futureValidity(item, product, isNew) {
  const current = normalizeNfeDate(product?.validade);
  if (item.noExpiry) return isNew ? '' : current;
  const incoming = normalizeNfeDate(item.validity);
  if (item.validityMode === 'keep' && !isNew) return current;
  if (item.validityMode === 'replace' || isNew) return incoming;
  return earlierDate(current, incoming);
}

function lotRecord(item, note, createdAt) {
  return {
    id: `${note.key}|${item.groupKey}`,
    chave_nfe: note.key,
    grupo_nfe: item.groupKey,
    numero_nfe: note.number || '',
    serie_nfe: note.series || '',
    fornecedor: note.supplier || '',
    fornecedor_documento: note.supplierCnpj || '',
    quantidade: round(item.incomingUnits),
    quantidade_comercial: round(item.commercialQuantity),
    multiplicador: number(item.multiplier),
    custo_unitario: round(item.unitCost),
    valor_bruto: round(item.gross),
    desconto: round(item.discount),
    valor_liquido: round(item.net),
    validade: item.noExpiry ? '' : normalizeNfeDate(item.validity),
    sem_validade: Boolean(item.noExpiry),
    recebido_em: note.issuedAt || '',
    registrado_em: createdAt,
  };
}

function entryRecord(item, note, key, createdAt) {
  return {
    id: `${note.key}|${item.groupKey}`,
    chave_nfe: note.key,
    grupo: item.groupKey,
    numero_nfe: note.number || '',
    serie_nfe: note.series || '',
    fornecedor: note.supplier || '',
    fornecedor_documento: note.supplierCnpj || '',
    produto_key: key,
    quantidade: round(item.incomingUnits),
    estoque_somado: item.addStock !== false,
    custo_unitario: round(item.unitCost),
    valor_liquido: round(item.net),
    validade: item.noExpiry ? '' : normalizeNfeDate(item.validity),
    sem_validade: Boolean(item.noExpiry),
    aplicado_em: createdAt,
  };
}

function sanitizeDraft(draft = {}) {
  const clean = {};
  NFE_EDITABLE_FIELDS.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(draft, field)) clean[field] = clone(draft[field]);
  });
  clean.nome = text(clean.nome);
  clean.codigo = text(clean.codigo);
  clean.gtin = String(clean.gtin || clean.ean || '').replace(/\D/g, '');
  clean.ean = String(clean.ean || clean.gtin || '').replace(/\D/g, '');
  clean.ncm = String(clean.ncm || '').replace(/\D/g, '');
  clean.cest = String(clean.cest || '').replace(/\D/g, '');
  clean.embalagem = text(clean.embalagem);
  clean.categoria = text(clean.categoria);
  clean.subcategoria = text(clean.subcategoria);
  clean.subsubcategoria = text(clean.subsubcategoria);
  clean.marca = text(clean.marca);
  clean.fornecedor = text(clean.fornecedor);
  clean.preco_custo = round(number(clean.preco_custo));
  clean.preco = round(number(clean.preco));
  clean.preco_oferta = round(number(clean.preco_oferta));
  clean.validade_oferta = normalizeNfeDate(clean.validade_oferta);
  clean.situacao = text(clean.situacao || 'A').toUpperCase();
  clean.url_imagem = text(clean.url_imagem || clean.imagem_url || clean.imagem);
  if (clean.url_imagem) {
    clean.imagem = clean.url_imagem;
    clean.imagem_url = clean.url_imagem;
    if (!Array.isArray(clean.imagens) || !clean.imagens.length) clean.imagens = [clean.url_imagem];
  }
  clean.descricao = text(clean.descricao);
  clean.descricao_curta = text(clean.descricao_curta);
  clean.gondola = text(clean.gondola);
  clean.prateleira = text(clean.prateleira);
  clean.localizacao = text(clean.localizacao);
  if (Array.isArray(clean.tags)) clean.tags = [...new Set(clean.tags.map(text).filter(Boolean))];
  else clean.tags = [...new Set(text(clean.tags).split(/[,;|]/).map(text).filter(Boolean))];
  return clean;
}

export function buildNfeSimulation(analysis, products = [], { margin = 40, createdAt = new Date().toISOString() } = {}) {
  const source = prepareNfeAnalysis(analysis, margin);
  const usedKeys = new Set((products || []).map(product => productKey(product)).filter(Boolean));
  const plans = [];

  for (const item of source.items || []) {
    const errors = [];
    const warnings = [];
    const isNew = !item.matchedProduct;
    const current = item.matchedProduct ? clone(item.matchedProduct) : null;
    if (item.skipped) {
      plans.push({
        itemId: item.id,
        groupKey: item.groupKey,
        status: 'skipped',
        errors,
        warnings,
        item: clone(item),
        currentProduct: current,
        nextProduct: current,
        editableFields: [...NFE_EDITABLE_FIELDS],
      });
      continue;
    }

    if (item.duplicate || source.globalDuplicate) errors.push(item.duplicateReason || 'Entrada duplicada bloqueada.');
    if (number(item.incomingUnits) <= 0) errors.push('Quantidade calculada precisa ser maior que zero.');
    if (number(item.unitCost) <= 0) errors.push('Custo unitário calculado precisa ser maior que zero.');
    if (!item.noExpiry && item.addStock !== false && !normalizeNfeDate(item.validity)) {
      errors.push('Informe a validade do lote ou marque produto sem validade.');
    }

    const draft = sanitizeDraft(item.productDraft || {});
    let key = current ? productKey(current) : '';
    if (isNew) key = text(item.productDraft?.firebaseKey) || deterministicNewKey(item, source.note || {}, usedKeys);

    const base = current || {
      firebaseKey: key,
      id: key,
      codigo: draft.codigo || item.ean || item.supplierCodes?.[0] || key,
      estoque: 0,
      situacao: 'A',
      entradas_nfe: [],
      lotes: [],
      historico_custos: [],
    };
    const next = clone(base);
    Object.assign(next, draft);

    next.firebaseKey = key;
    next.id = text(next.id || key);
    next.codigo = text(next.codigo || item.ean || item.supplierCodes?.[0] || key);
    next.nome = text(next.nome || item.name);
    next.gtin = String(next.gtin || next.ean || item.ean || '').replace(/\D/g, '');
    next.ean = String(next.ean || next.gtin || '').replace(/\D/g, '');
    next.ncm = String(next.ncm || item.ncm || '').replace(/\D/g, '');
    next.cest = String(next.cest || item.cest || '').replace(/\D/g, '');
    next.embalagem = text(next.embalagem || item.packaging || 'UN');
    next.fornecedor = text(next.fornecedor || source.note?.supplier);
    next.preco_custo = round(number(next.preco_custo || item.unitCost));
    next.preco = round(number(next.preco || item.suggestedPrice));
    next.categoria = text(next.categoria);
    next.situacao = text(next.situacao || 'A').toUpperCase();

    if (!next.nome) errors.push('Produto sem nome.');
    if (!next.codigo) errors.push('Produto sem código comercial.');
    if (!next.categoria) errors.push('Produto sem categoria.');
    if (!next.embalagem) errors.push('Produto sem embalagem.');
    if (next.situacao !== 'I' && number(next.preco) <= 0) errors.push('Produto sem preço de venda válido.');
    if (!text(next.url_imagem || next.imagem || next.imagem_url)) warnings.push('Produto sem imagem pública.');

    const stockBefore = round(number(base.estoque));
    const stockAfter = round(stockBefore + (item.addStock !== false ? number(item.incomingUnits) : 0));
    next.estoque = stockAfter;
    const validityBefore = normalizeNfeDate(base.validade);
    const validityAfter = futureValidity(item, base, isNew);
    next.validade = validityAfter;

    const id = `${source.note.key}|${item.groupKey}`;
    const entries = listFromValue(base.entradas_nfe);
    if (entries.some(entry => String(entry?.id || '') === id)) errors.push('A entrada já existe no produto selecionado.');
    const lots = listFromValue(base.lotes);
    const history = listFromValue(base.historico_custos);
    const entry = entryRecord(item, source.note, key, createdAt);
    const lot = item.addStock !== false ? lotRecord(item, source.note, createdAt) : null;

    next.entradas_nfe = [...entries, entry];
    next.lotes = lot ? [...lots.filter(row => String(row?.id || '') !== lot.id), lot] : lots;
    if (round(number(base.preco_custo)) !== round(number(next.preco_custo))) {
      next.historico_custos = [...history, {
        id,
        custo_anterior: round(number(base.preco_custo)),
        custo_novo: round(number(next.preco_custo)),
        origem: 'NF-e',
        chave_nfe: source.note.key,
        alterado_em: createdAt,
      }];
    } else {
      next.historico_custos = history;
    }
    next.last_update = Date.now();
    next.updated_at = createdAt;
    if (item.addStock !== false) next.stock_updated_at = createdAt;

    const changes = [];
    const labels = {
      nome: 'Nome', codigo: 'Código', gtin: 'EAN / GTIN', ncm: 'NCM', cest: 'CEST',
      embalagem: 'Embalagem', categoria: 'Categoria', subcategoria: 'Subcategoria',
      subsubcategoria: 'Subsubcategoria', marca: 'Marca', fornecedor: 'Fornecedor',
      preco_custo: 'Preço de custo', preco: 'Preço de venda', preco_oferta: 'Preço de oferta',
      validade_oferta: 'Validade da oferta', situacao: 'Situação', url_imagem: 'Imagem',
      descricao: 'Descrição', descricao_curta: 'Descrição curta', tags: 'Tags',
      gondola: 'Gôndola', prateleira: 'Prateleira', localizacao: 'Localização',
      estoque: 'Estoque', validade: 'Validade',
    };
    [...NFE_EDITABLE_FIELDS, 'estoque', 'validade'].forEach(field => {
      const before = base[field] ?? '';
      const after = next[field] ?? '';
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        changes.push({ field, label: labels[field] || field, before, after });
      }
    });
    if (lot) changes.push({ field: 'lotes', label: 'Lote', before: `${lots.length} lote(s)`, after: `${next.lotes.length} lote(s)` });
    changes.push({ field: 'entradas_nfe', label: 'Histórico NF-e', before: `${entries.length} entrada(s)`, after: `${next.entradas_nfe.length} entrada(s)` });

    plans.push({
      itemId: item.id,
      groupKey: item.groupKey,
      status: errors.length ? 'blocked' : isNew ? 'new' : 'update',
      isNew,
      productKey: key,
      errors,
      warnings,
      item: clone(item),
      currentProduct: current,
      originalSnapshot: current ? clone(current) : null,
      nextProduct: next,
      editableFields: [...NFE_EDITABLE_FIELDS],
      stockBefore,
      stockAfter,
      validityBefore,
      validityAfter,
      lotRecord: lot,
      entryRecord: entry,
      changes,
    });
  }

  const active = plans.filter(plan => plan.status !== 'skipped');
  const errors = active.flatMap(plan => plan.errors.map(message => ({
    itemId: plan.itemId,
    groupKey: plan.groupKey,
    message,
  })));
  const summary = {
    updates: plans.filter(plan => plan.status === 'update').length,
    newProducts: plans.filter(plan => plan.status === 'new').length,
    blocked: plans.filter(plan => plan.status === 'blocked').length,
    skipped: plans.filter(plan => plan.status === 'skipped').length,
    stockUnits: round(plans.filter(plan => ['update', 'new'].includes(plan.status) && plan.item.addStock !== false)
      .reduce((sum, plan) => sum + number(plan.item.incomingUnits), 0)),
  };
  return {
    createdAt,
    mode: 'preview-before-import',
    note: clone(source.note),
    globalDuplicate: source.globalDuplicate,
    plans,
    errors,
    summary,
    canImport: Boolean(active.length && errors.length === 0),
  };
}

export function buildNfeImportRecord(analysis, simulation, {
  status = 'processando', session = '', applied = [], ignored = [], error = '',
} = {}) {
  const now = new Date().toISOString();
  return {
    chave_nfe: analysis.note.key,
    numero_nfe: analysis.note.number || '',
    serie_nfe: analysis.note.series || '',
    fornecedor: analysis.note.supplier || '',
    fornecedor_documento: analysis.note.supplierCnpj || '',
    emissao: analysis.note.issuedAt || '',
    xml_hash: analysis.note.xmlHash || '',
    status,
    sessao: session,
    atualizado_em: now,
    iniciada_em: analysis.importRecord?.iniciada_em || now,
    concluida_em: status === 'concluida' ? now : '',
    erro: error || '',
    itens_aplicados: clone(applied),
    itens_ignorados: clone(ignored),
    resumo: clone(simulation?.summary || {}),
  };
}
