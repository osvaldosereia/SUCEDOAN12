import { clone, normalizeSearch, number, productKey, productName, text } from './utils.js';

export function normalizeStockDate(value = '') {
  const raw = text(value);
  if (!raw) return '';
  let year;
  let month;
  let day;
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return '';
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return '';
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${String(year)}`;
}

function dateParts(value) {
  const normalized = normalizeStockDate(value);
  if (!normalized) return null;
  const [day, month, year] = normalized.split('/').map(Number);
  return { day, month, year };
}

export function daysUntilStockDate(value, today = new Date()) {
  const parts = dateParts(value);
  if (!parts) return null;
  const target = Date.UTC(parts.year, parts.month - 1, parts.day);
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - base) / 86400000);
}

function list(value) {
  if (Array.isArray(value)) return clone(value);
  if (value && typeof value === 'object') return Object.values(clone(value));
  return [];
}

export function productLots(product) {
  const lots = list(product?.lotes).map((lot, index) => ({
    ...lot,
    id: text(lot?.id) || `lot_${index + 1}`,
    quantidade: Math.max(0, number(lot?.quantidade ?? lot?.estoque ?? 0)),
    validade: normalizeStockDate(lot?.validade),
    sem_validade: Boolean(lot?.sem_validade),
  }));
  if (lots.length) return lots;
  const stock = Math.max(0, number(product?.estoque));
  const validity = normalizeStockDate(product?.validade);
  if (stock > 0 || validity) {
    return [{
      id: 'cadastro_principal',
      quantidade: stock,
      validade: validity,
      sem_validade: !validity,
      origem: 'Cadastro principal',
    }];
  }
  return [];
}

export function nearestStockValidity(product) {
  const lots = productLots(product)
    .filter(lot => lot.quantidade > 0 && !lot.sem_validade && normalizeStockDate(lot.validade))
    .sort((a, b) => {
      const aTime = daysUntilStockDate(a.validade, new Date(2000, 0, 1));
      const bTime = daysUntilStockDate(b.validade, new Date(2000, 0, 1));
      return aTime - bTime;
    });
  return lots[0]?.validade || normalizeStockDate(product?.validade);
}

export function stockStatus(product, { today = new Date(), lowThreshold = 5 } = {}) {
  const stock = Math.max(0, number(product?.estoque));
  const lots = productLots(product);
  const validity = nearestStockValidity(product);
  const days = daysUntilStockDate(validity, today);
  let code = 'healthy';
  let label = 'Regular';
  if (stock <= 0) {
    code = 'no-stock';
    label = 'Sem estoque';
  } else if (days !== null && days < 0) {
    code = 'expired';
    label = 'Vencido';
  } else if (days !== null && days <= 5) {
    code = 'critical';
    label = 'Vence em até 5 dias';
  } else if (days !== null && days <= 30) {
    code = 'upcoming';
    label = 'Vence em até 30 dias';
  } else if (!validity) {
    code = 'no-validity';
    label = 'Sem validade';
  } else if (stock <= lowThreshold) {
    code = 'low-stock';
    label = 'Estoque baixo';
  }
  return { code, label, stock, validity, days, lots };
}

export function stockDashboard(products, options = {}) {
  const rows = (products || []).map(product => ({ product, status: stockStatus(product, options) }));
  return {
    rows,
    total: rows.length,
    noStock: rows.filter(row => row.status.code === 'no-stock').length,
    expired: rows.filter(row => row.status.code === 'expired').length,
    next30: rows.filter(row => row.status.days !== null && row.status.days >= 0 && row.status.days <= 30 && row.status.stock > 0).length,
    noValidity: rows.filter(row => row.status.code === 'no-validity').length,
    lowStock: rows.filter(row => row.status.stock > 0 && row.status.stock <= Number(options.lowThreshold || 5)).length,
  };
}

export function filterStockRows(products, filters = {}, options = {}) {
  const dashboard = stockDashboard(products, options);
  const query = normalizeSearch(filters.query);
  const windowDays = Number(filters.windowDays || 0);
  let rows = dashboard.rows;
  if (query) {
    rows = rows.filter(({ product }) => normalizeSearch([
      productName(product), product.codigo, product.gtin, product.ean, product.categoria,
      product.marca, product.gondola, product.prateleira,
    ].join(' ')).includes(query));
  }
  if (filters.status) {
    rows = rows.filter(row => row.status.code === filters.status
      || (filters.status === 'low-stock' && row.status.stock > 0 && row.status.stock <= Number(options.lowThreshold || 5)));
  }
  if (windowDays > 0) {
    rows = rows.filter(row => row.status.days !== null && row.status.days >= 0 && row.status.days <= windowDays && row.status.stock > 0);
  }
  rows.sort((a, b) => {
    const aDays = a.status.days === null ? 999999 : a.status.days;
    const bDays = b.status.days === null ? 999999 : b.status.days;
    if (filters.sort === 'stock') return a.status.stock - b.status.stock || aDays - bDays;
    if (filters.sort === 'name') return productName(a.product).localeCompare(productName(b.product), 'pt-BR');
    return aDays - bDays || a.status.stock - b.status.stock || productName(a.product).localeCompare(productName(b.product), 'pt-BR');
  });
  return rows;
}

export function buildStockAdjustment(product, input, { createdAt = new Date().toISOString(), id = '' } = {}) {
  const current = clone(product || {});
  const key = productKey(current);
  const errors = [];
  if (!key) errors.push('Produto sem chave do Firebase.');
  const requestedStock = number(input?.stock);
  if (!Number.isFinite(requestedStock) || requestedStock < 0) errors.push('Estoque inválido.');
  const nextStock = Math.max(0, Math.floor(requestedStock));
  const nextValidity = input?.noExpiry ? '' : normalizeStockDate(input?.validity);
  if (input?.validity && !input?.noExpiry && !nextValidity) errors.push('Validade inválida.');
  const reason = text(input?.reason);
  if (!reason) errors.push('Informe o motivo do ajuste.');

  const next = clone(current);
  next.estoque = nextStock;
  next.validade = nextValidity;
  next.last_update = Date.now();
  next.updated_at = createdAt;
  if (nextStock !== number(current.estoque)) next.stock_updated_at = createdAt;

  const adjustments = list(current.ajustes_estoque);
  const record = {
    id: id || `ajuste_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    estoque_anterior: number(current.estoque),
    estoque_novo: nextStock,
    validade_anterior: normalizeStockDate(current.validade),
    validade_nova: nextValidity,
    motivo: reason,
    origem: 'Admin V2',
    ajustado_em: createdAt,
  };
  next.ajustes_estoque = [...adjustments, record];

  const changes = [];
  if (number(current.estoque) !== nextStock) changes.push({ field: 'estoque', label: 'Estoque', before: number(current.estoque), after: nextStock });
  if (normalizeStockDate(current.validade) !== nextValidity) changes.push({ field: 'validade', label: 'Validade', before: normalizeStockDate(current.validade), after: nextValidity });
  if (!changes.length) errors.push('Nenhuma alteração foi informada.');
  return { key, errors: [...new Set(errors)], nextProduct: next, originalSnapshot: current, record, changes };
}
