import { clone, normalizeSearch, number, productCode, productKey, productName, text } from './utils.js';

export const COLLECTION_PATHS = Object.freeze({
  baskets: 'site/produtos-cesta-basica.json',
  kits: 'site/kits.json',
  kitQueue: 'carrosseis-kits/fila.json',
});

function round(value) {
  return Math.round(number(value) * 100) / 100;
}

function isActiveProduct(product) {
  const status = text(product?.situacao ?? product?.status ?? 'A').toLocaleLowerCase('pt-BR');
  return !['i', 'inativo', 'false', '0', 'excluido', 'excluído'].includes(status)
    && product?.ativo !== false && product?.visivel !== false;
}

function productCodes(product) {
  return [productKey(product), productCode(product), product?.sku, product?.gtin, product?.ean]
    .map(value => text(value)).filter(Boolean);
}

export function collectionProductIndex(products = []) {
  const index = new Map();
  products.forEach(product => productCodes(product).forEach(code => {
    index.set(code, product);
    index.set(normalizeSearch(code), product);
  }));
  return index;
}

function findProduct(index, code) {
  const raw = text(code);
  return index.get(raw) || index.get(normalizeSearch(raw)) || null;
}

export function resolveCollectionItem(item, productsOrIndex) {
  const index = productsOrIndex instanceof Map ? productsOrIndex : collectionProductIndex(productsOrIndex);
  const codes = [item?.codigo, ...(Array.isArray(item?.substitutos) ? item.substitutos : [])].map(text).filter(Boolean);
  const candidates = codes.map(code => ({ code, product: findProduct(index, code) })).filter(row => row.product);
  const valid = candidates.find(row => isActiveProduct(row.product) && number(row.product.preco) > 0 && number(row.product.estoque) > 0);
  const selected = valid || candidates[0] || null;
  return {
    requestedCode: text(item?.codigo),
    selectedCode: selected?.code || '',
    product: selected?.product || null,
    usedSubstitute: Boolean(selected && selected.code !== text(item?.codigo)),
    candidates,
  };
}

function latestQueueByCode(queue = []) {
  const map = new Map();
  [...(Array.isArray(queue) ? queue : [])]
    .sort((a, b) => String(b?.atualizado_em || b?.criado_em || '').localeCompare(String(a?.atualizado_em || a?.criado_em || '')))
    .forEach(entry => {
      const code = text(entry?.kit_codigo);
      if (code && !map.has(code)) map.set(code, clone(entry));
    });
  return map;
}

function validIsoDate(value) {
  const raw = text(value);
  if (!raw) return '';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) return '';
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function auditCollection(collection, type, products = [], queue = [], { today = new Date() } = {}) {
  const source = clone(collection || {});
  const errors = [];
  const warnings = [];
  const index = collectionProductIndex(products);
  const items = Array.isArray(source.produtos) ? source.produtos : [];
  if (!text(source.id)) errors.push('ID ausente');
  if (!text(source.nome)) errors.push('Nome ausente');
  if (!text(source.codigo)) errors.push('Código ausente');
  if (number(source.preco) <= 0) errors.push('Preço deve ser maior que zero');
  if (!items.length) errors.push('Composição vazia');
  if (/^data:image\//i.test(text(source.imagem))) errors.push('Imagem base64 precisa ser publicada no GitHub');
  if (!text(source.imagem)) warnings.push('Imagem ausente');

  let regularTotal = 0;
  let available = Infinity;
  const resolvedItems = items.map((item, indexPosition) => {
    const quantity = Math.max(0, Math.floor(number(item?.qtd)));
    const resolved = resolveCollectionItem(item, index);
    const rowErrors = [];
    if (quantity <= 0) rowErrors.push('Quantidade inválida');
    if (!text(item?.codigo)) rowErrors.push('Código ausente');
    if (!resolved.product) rowErrors.push('Produto inexistente');
    else {
      if (!isActiveProduct(resolved.product)) rowErrors.push('Produto inativo');
      if (number(resolved.product.preco) <= 0) rowErrors.push('Produto sem preço');
      if (number(resolved.product.estoque) <= 0) rowErrors.push('Produto sem estoque');
      else if (quantity > 0 && number(resolved.product.estoque) < quantity) rowErrors.push('Estoque insuficiente para a quantidade configurada');
      if (quantity > 0) available = Math.min(available, Math.floor(number(resolved.product.estoque) / quantity));
      regularTotal += round(number(resolved.product.preco) * quantity);
    }
    rowErrors.forEach(message => errors.push(`Item ${indexPosition + 1} (${text(item?.codigo) || 'sem código'}): ${message}`));
    if (resolved.usedSubstitute) warnings.push(`Item ${indexPosition + 1}: usando substituto ${resolved.selectedCode}`);
    return { ...clone(item), qtd: quantity, resolved, errors: rowErrors };
  });

  if (!Number.isFinite(available)) available = 0;
  const price = round(source.preco);
  const economy = round(Math.max(0, regularTotal - price));
  const discount = regularTotal > 0 ? round((economy / regularTotal) * 100) : 0;
  let active = source.ativo !== false;
  let periodStatus = 'sem período';
  const start = validIsoDate(source.data_inicio);
  const end = validIsoDate(source.data_fim);
  if (type === 'kit') {
    if (!start) errors.push('Data inicial inválida ou ausente');
    if (!end) errors.push('Data final inválida ou ausente');
    if (start && end && start > end) errors.push('Data inicial posterior à data final');
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (start && end) {
      if (todayIso < start) periodStatus = 'agendado';
      else if (todayIso > end) { periodStatus = 'encerrado'; active = false; }
      else periodStatus = 'vigente';
    }
    if (price >= regularTotal && regularTotal > 0) warnings.push('Kit sem economia em relação à compra avulsa');
  }
  if (available <= 0) active = false;
  if (errors.length) active = false;

  const queueEntry = type === 'kit' ? latestQueueByCode(queue).get(text(source.codigo)) || null : null;
  return {
    type,
    source,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    items: resolvedItems,
    regularTotal: round(regularTotal),
    configuredPrice: price,
    economy,
    discount,
    available: Math.max(0, Math.min(available, Number(source.limite_kits || available || 0) || available)),
    active,
    periodStatus,
    queueEntry,
  };
}

function formatMoney(value) {
  return round(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function normalizeCollectionForPublish(collection, type, products = [], queue = []) {
  const audit = auditCollection(collection, type, products, queue);
  const normalized = clone(collection || {});
  normalized.id = text(normalized.id);
  normalized.nome = text(normalized.nome);
  normalized.codigo = text(normalized.codigo);
  normalized.preco = round(normalized.preco);
  normalized.imagem = text(normalized.imagem);
  normalized.produtos = (Array.isArray(normalized.produtos) ? normalized.produtos : []).map(item => ({
    ...item,
    qtd: Math.max(1, Math.floor(number(item.qtd) || 1)),
    codigo: text(item.codigo),
    substitutos: [...new Set((Array.isArray(item.substitutos) ? item.substitutos : []).map(text).filter(Boolean))],
  }));

  if (type === 'kit') {
    normalized.data_inicio = validIsoDate(normalized.data_inicio);
    normalized.data_fim = validIsoDate(normalized.data_fim);
    normalized.limite_kits = Math.max(0, Math.floor(number(normalized.limite_kits) || audit.available));
    normalized.preco_anterior = audit.regularTotal;
    normalized.preco_novo = normalized.preco;
    normalized.economia = audit.economy;
    normalized.desconto_percentual = audit.discount;
    normalized.estoque_disponivel = audit.available;
    normalized.ativo = Boolean(normalized.ativo !== false && audit.active);
    normalized.preco_anterior_formatado = formatMoney(audit.regularTotal);
    normalized.preco_novo_formatado = formatMoney(normalized.preco);
    normalized.economia_formatada = formatMoney(audit.economy);
    normalized.produtos = normalized.produtos.map(item => {
      const resolved = resolveCollectionItem(item, products);
      const oldUnit = round(resolved.product?.preco);
      const factor = audit.regularTotal > 0 ? normalized.preco / audit.regularTotal : 1;
      const newUnit = round(oldUnit * factor);
      const oldTotal = round(oldUnit * item.qtd);
      const newTotal = round(newUnit * item.qtd);
      return {
        ...item,
        preco_antigo_unitario: oldUnit,
        preco_antigo_total: oldTotal,
        preco_novo_unitario_kit: newUnit,
        preco_novo_total_kit: newTotal,
        economia_unitaria_kit: round(oldUnit - newUnit),
        economia_total_kit: round(oldTotal - newTotal),
        desconto_percentual_kit: audit.discount,
        preco_antigo_unitario_formatado: formatMoney(oldUnit),
        preco_antigo_total_formatado: formatMoney(oldTotal),
        preco_novo_unitario_kit_formatado: formatMoney(newUnit),
        preco_novo_total_kit_formatado: formatMoney(newTotal),
        economia_unitaria_kit_formatado: formatMoney(oldUnit - newUnit),
        economia_total_kit_formatado: formatMoney(oldTotal - newTotal),
      };
    });
  }
  return { normalized, audit: auditCollection(normalized, type, products, queue) };
}

export function auditCollections(baskets = [], kits = [], products = [], queue = []) {
  const basketRows = (Array.isArray(baskets) ? baskets : []).map(value => auditCollection(value, 'basket', products, queue));
  const kitRows = (Array.isArray(kits) ? kits : []).map(value => auditCollection(value, 'kit', products, queue));
  const rows = [...basketRows, ...kitRows];
  return {
    baskets: basketRows,
    kits: kitRows,
    rows,
    errors: rows.filter(row => row.errors.length),
    warnings: rows.filter(row => row.warnings.length),
    active: rows.filter(row => row.active),
  };
}

export function collectionSearch(products, query, limit = 20) {
  const normalized = normalizeSearch(query);
  if (!normalized) return [];
  return (products || []).filter(product => normalizeSearch([
    productName(product), productCode(product), product?.gtin, product?.ean, product?.marca, product?.categoria,
  ].join(' ')).includes(normalized)).slice(0, limit);
}
