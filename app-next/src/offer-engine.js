import { parseDate, roundMoney } from './core.js?v=20260727-4';

export const VALIDITY_DISCOUNT_BANDS = Object.freeze([
  { min: 3, max: 7, discount: 50 },
  { min: 8, max: 15, discount: 40 },
  { min: 16, max: 31, discount: 35 },
  { min: 32, max: 46, discount: 30 },
  { min: 47, max: 65, discount: 25 },
  { min: 66, max: 76, discount: 20 },
  { min: 77, max: 91, discount: 10 },
  { min: 92, max: 105, discount: 5 }
]);

export function validityDays(product, today = new Date()) {
  const validity = parseDate(product?.validade, true);
  if (!validity) return null;
  const end = new Date(validity.getFullYear(), validity.getMonth(), validity.getDate());
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((end - start) / 86400000);
}

export function discountForValidityDays(days) {
  if (!Number.isFinite(days)) return 0;
  return VALIDITY_DISCOUNT_BANDS.find(band => days >= band.min && days <= band.max)?.discount || 0;
}

function automaticOfferEnd(product) {
  const validity = parseDate(product?.validade, true);
  if (!validity) return '';
  const end = new Date(validity.getFullYear(), validity.getMonth(), validity.getDate());
  end.setDate(end.getDate() - 2);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
}

function explicitOfferIsActive(product, regularPrice, today) {
  const offerPrice = Number(product?.preco_oferta || 0);
  if (!(offerPrice > 0 && offerPrice < regularPrice)) return false;
  if (!product.validade_oferta) return true;
  const end = parseDate(product.validade_oferta, true);
  return Boolean(end && end >= today);
}

export function prepareProductOffer(product, today = new Date()) {
  const copy = { ...product };
  const regularPrice = Number(copy.oldPrice || copy.price || 0);
  if (!(regularPrice > 0)) return copy;

  if (explicitOfferIsActive(copy, regularPrice, today)) {
    copy.preco_oferta = roundMoney(copy.preco_oferta);
    copy.validade_oferta = copy.validade_oferta || '2099-12-31';
    copy.offerSource = 'manual';
    return copy;
  }

  const days = validityDays(copy, today);
  const discount = discountForValidityDays(days);
  const end = automaticOfferEnd(copy);
  const endDate = parseDate(end, true);
  if (!discount || !endDate || endDate < today) return copy;

  const offerPrice = roundMoney(regularPrice * (1 - discount / 100));
  if (!(offerPrice > 0 && offerPrice < regularPrice)) return copy;

  copy.preco_oferta = offerPrice;
  copy.validade_oferta = end;
  copy.desconto_validade = discount;
  copy.offerSource = 'validade';
  return copy;
}
