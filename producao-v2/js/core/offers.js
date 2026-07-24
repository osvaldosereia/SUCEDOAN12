import { clone, number, productKey, productName, text } from './utils.js';
import { daysUntilStockDate, normalizeStockDate } from './stock.js';

export const VALIDITY_DISCOUNT_BANDS = Object.freeze([
  { min: 3, max: 7, discount: 50 },
  { min: 8, max: 15, discount: 40 },
  { min: 16, max: 31, discount: 35 },
  { min: 32, max: 46, discount: 30 },
  { min: 47, max: 65, discount: 25 },
  { min: 66, max: 76, discount: 20 },
  { min: 77, max: 91, discount: 10 },
  { min: 92, max: 105, discount: 5 },
]);

function round(value) {
  return Math.round(number(value) * 100) / 100;
}

function isoToday(today) {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function endOfOffer(validity) {
  const normalized = normalizeStockDate(validity);
  if (!normalized) return '';
  const [day, month, year] = normalized.split('/').map(Number);
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() - 2);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T23:59:59-04:00`;
}

export function discountForValidityDays(days) {
  const band = VALIDITY_DISCOUNT_BANDS.find(row => days >= row.min && days <= row.max);
  return band?.discount || 0;
}

function clearValidityOffer(next) {
  if (text(next.oferta_origem) !== 'validade') return;
  delete next.preco_oferta;
  delete next.validade_oferta;
  delete next.data_inicio_oferta;
  delete next.oferta_origem;
  delete next.desconto_validade;
}

function currentSituation(product) {
  return text(product?.situacao || product?.status || 'A').toUpperCase() || 'A';
}

export function planValidityOffer(product, { today = new Date() } = {}) {
  const source = clone(product || {});
  const key = productKey(source);
  const errors = [];
  const warnings = [];
  const changes = [];
  const validity = normalizeStockDate(source.validade);
  const days = daysUntilStockDate(validity, today);
  const price = round(source.preco);
  const stock = Math.max(0, number(source.estoque));
  const manualOffer = number(source.preco_oferta) > 0 && text(source.oferta_origem) !== 'validade';
  const next = clone(source);
  let action = 'none';
  let reason = 'Sem ação necessária';
  let discount = 0;

  if (!key) errors.push('Produto sem chave do Firebase');
  if (!validity) {
    action = text(source.oferta_origem) === 'validade' ? 'clear' : 'none';
    reason = 'Produto sem validade cadastrada';
    if (action === 'clear') clearValidityOffer(next);
  } else if (stock <= 0) {
    action = text(source.oferta_origem) === 'validade' ? 'clear' : 'none';
    reason = 'Produto sem estoque';
    if (action === 'clear') clearValidityOffer(next);
  } else if (manualOffer) {
    action = 'skip-manual';
    reason = 'Oferta manual preservada';
    warnings.push('Existe uma oferta manual; a automação não irá sobrescrevê-la');
  } else if (days !== null && days <= 2) {
    action = 'block-sale';
    reason = days < 0 ? 'Produto vencido' : days === 0 ? 'Produto vence hoje' : `Restam ${days} dia(s)`;
    clearValidityOffer(next);
    if (!source.bloqueio_validade) next.situacao_antes_bloqueio_validade = currentSituation(source);
    next.situacao = 'I';
    next.bloqueio_validade = true;
    next.bloqueio_validade_em = new Date().toISOString();
  } else {
    discount = discountForValidityDays(days);
    if (discount > 0) {
      action = 'apply';
      reason = `${discount}% para validade em ${days} dia(s)`;
      const offer = round(price * (1 - discount / 100));
      if (price <= 0) errors.push('Preço normal inválido');
      if (offer <= 0 || offer >= price) errors.push('Preço de oferta calculado inválido');
      next.preco_oferta = offer;
      next.data_inicio_oferta = isoToday(today);
      next.validade_oferta = endOfOffer(validity);
      next.oferta_origem = 'validade';
      next.desconto_validade = discount;
      if (source.bloqueio_validade) {
        next.situacao = text(source.situacao_antes_bloqueio_validade || 'A').toUpperCase();
        delete next.bloqueio_validade;
        delete next.bloqueio_validade_em;
        delete next.situacao_antes_bloqueio_validade;
      }
    } else {
      action = text(source.oferta_origem) === 'validade' || source.bloqueio_validade ? 'clear' : 'none';
      reason = days > 105 ? 'Validade fora da janela de ofertas' : 'Sem faixa configurada';
      clearValidityOffer(next);
      if (source.bloqueio_validade) {
        next.situacao = text(source.situacao_antes_bloqueio_validade || 'A').toUpperCase();
        delete next.bloqueio_validade;
        delete next.bloqueio_validade_em;
        delete next.situacao_antes_bloqueio_validade;
      }
    }
  }

  const compared = [
    ['preco_oferta', 'Preço de oferta'], ['desconto_validade', 'Desconto'], ['data_inicio_oferta', 'Início'],
    ['validade_oferta', 'Fim da oferta'], ['situacao', 'Situação'], ['bloqueio_validade', 'Bloqueio por validade'],
  ];
  compared.forEach(([field, label]) => {
    const before = source[field] ?? '';
    const after = next[field] ?? '';
    if (String(before) !== String(after)) changes.push({ field, label, before, after });
  });
  next.last_update = Date.now();
  next.updated_at = new Date().toISOString();

  return {
    key,
    name: productName(source),
    validity,
    days,
    stock,
    price,
    discount,
    action,
    reason,
    manualOffer,
    errors,
    warnings,
    changes,
    source,
    nextProduct: next,
    actionable: ['apply', 'clear', 'block-sale'].includes(action) && changes.length > 0 && errors.length === 0,
  };
}

export function buildOffersPlan(products = [], options = {}) {
  const rows = products.map(product => planValidityOffer(product, options));
  return {
    rows,
    actionable: rows.filter(row => row.actionable),
    apply: rows.filter(row => row.action === 'apply'),
    clear: rows.filter(row => row.action === 'clear'),
    blocked: rows.filter(row => row.action === 'block-sale'),
    manual: rows.filter(row => row.action === 'skip-manual'),
    errors: rows.filter(row => row.errors.length),
  };
}
