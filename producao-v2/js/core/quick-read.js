import { normalizeSearch, number, productCode, productKey, productName, text } from './utils.js';
import { productLots, stockStatus } from './stock.js';

export function normalizeScan(value = '') {
  return text(value).replace(/[\r\n\t]/g, '').trim();
}

function exactValues(product) {
  const aliases = Array.isArray(product?.ean_aliases) ? product.ean_aliases : [];
  return [
    productKey(product), productCode(product), product?.sku, product?.gtin, product?.ean, ...aliases,
  ].map(value => text(value)).filter(Boolean);
}

export function findScannedProduct(products = [], scan = '') {
  const raw = normalizeScan(scan);
  const normalized = normalizeSearch(raw);
  if (!raw) return { scan: raw, product: null, matches: [], exact: false, error: 'Leia ou digite um código.' };
  const exact = products.filter(product => exactValues(product).some(value => normalizeSearch(value) === normalized));
  if (exact.length === 1) return { scan: raw, product: exact[0], matches: exact, exact: true, error: '' };
  if (exact.length > 1) return { scan: raw, product: null, matches: exact, exact: false, error: 'Mais de um produto usa este código.' };
  const partial = products.filter(product => normalizeSearch([
    productName(product), productCode(product), product?.gtin, product?.ean, product?.marca,
  ].join(' ')).includes(normalized)).slice(0, 12);
  return {
    scan: raw,
    product: partial.length === 1 ? partial[0] : null,
    matches: partial,
    exact: false,
    error: partial.length ? '' : 'Produto não encontrado.',
  };
}

export function quickReadSnapshot(product, { today = new Date() } = {}) {
  if (!product) return null;
  const status = stockStatus(product, { today, lowThreshold: 5 });
  return {
    key: productKey(product),
    code: productCode(product),
    name: productName(product),
    gtin: text(product?.gtin || product?.ean),
    image: text(product?.url_imagem || product?.imagem || product?.foto),
    price: number(product?.preco),
    offerPrice: number(product?.preco_oferta),
    stock: number(product?.estoque),
    validity: status.validity,
    days: status.days,
    status,
    lots: productLots(product),
    location: {
      gondola: text(product?.gondola || product?.['gôndola']),
      shelf: text(product?.prateleira),
      location: text(product?.localizacao || product?.localização),
    },
    category: text(product?.categoria),
    brand: text(product?.marca),
  };
}
