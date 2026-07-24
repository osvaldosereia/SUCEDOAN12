import { CONFIG } from './config.js';
import {
  codeVariants, norm, parseDate, parseMoney, readStorage, removeStorage,
  roundMoney, writeStorage
} from './core.js';
import { findProductByReference } from './catalog.js';

export function applyProductOffer(product, now = new Date()) {
  const copy = { ...product };
  copy.oldPrice = Number(copy.oldPrice || copy.price || 0);
  copy.price = copy.oldPrice;
  copy.hasExplicitOffer = false;
  copy.discountPercent = 0;
  if (copy.preco_oferta && copy.validade_oferta) {
    const end = parseDate(copy.validade_oferta, true);
    if (end && end >= now && Number(copy.preco_oferta) < copy.oldPrice) {
      copy.price = Number(copy.preco_oferta);
      copy.hasExplicitOffer = true;
      copy.discountPercent = Math.round(((copy.oldPrice - copy.price) / Math.max(copy.oldPrice, 0.01)) * 100);
    }
  }
  return copy;
}

export function isAvailable(product) {
  if (!product) return false;
  if (product.isFee) return true;
  if (String(product.situacao || '').toUpperCase() === 'I') return false;
  if (Number(product.stock || 0) <= 0) return false;
  if (Number(product.price || 0) <= 0 && Number(product.oldPrice || 0) <= 0) return false;
  return true;
}

export function couponIsValid(coupon, now = new Date()) {
  if (!coupon || coupon.ativo !== true) return false;
  if (!coupon.validade) return true;
  const end = parseDate(coupon.validade, true);
  return Boolean(end && end >= now);
}

export function getCouponByCode(coupons, code) {
  const wanted = norm(code).replace(/\s+/g, '');
  return coupons.find(coupon => norm(coupon.codigo).replace(/\s+/g, '') === wanted) || null;
}

export function couponMatchesProduct(coupon, product) {
  if (!coupon || !product || product.isFee) return false;
  const categories = (coupon.categorias || []).map(norm).filter(Boolean);
  const brands = (coupon.marcas || []).map(norm).filter(Boolean);
  const keywords = (coupon.palavras_chave || []).map(norm).filter(Boolean);
  if (!categories.length && !brands.length && !keywords.length) return true;
  const categoryText = norm([product.categoria, product.subcategoria, product.subsubcategoria].join(' '));
  const brandText = norm(product.marca);
  const productText = norm([product.name, product.marca, product.categoria, product.subcategoria, product.subsubcategoria].join(' '));
  return categories.some(value => categoryText.includes(value) || value.includes(categoryText))
    || brands.some(value => brandText === value || productText.includes(value))
    || keywords.some(value => productText.includes(value));
}

export function couponEligibility(coupon, subtotal, customerLookupStatus = 'unknown') {
  if (!coupon) return { eligible: false, reason: 'Cupom não encontrado.' };
  if (!couponIsValid(coupon)) return { eligible: false, reason: 'Este cupom está inativo ou vencido.' };
  const minimum = Number(coupon.valorMinimo || 0);
  if (subtotal < minimum) return { eligible: false, pending: true, reason: `Faltam ${roundMoney(minimum - subtotal)} para usar este cupom.` };
  if (coupon.grupo === 'cliente_novo' && customerLookupStatus === 'existing') {
    return { eligible: false, reason: 'Este cupom é exclusivo para a primeira compra.' };
  }
  return { eligible: true, reason: '' };
}

export function couponUnitPrice(product, coupon) {
  const current = Number(product.price || 0);
  if (!couponMatchesProduct(coupon, product)) return current;
  if (coupon.tipo === 'percentual') {
    const base = Number(product.oldPrice || current);
    const candidate = base * (1 - Number(coupon.desconto || 0) / 100);
    return Math.max(0, Math.min(current, roundMoney(candidate)));
  }
  if (coupon.tipo === 'valor') {
    return Math.max(0, roundMoney(current - Number(coupon.desconto || 0)));
  }
  return current;
}

export function productExpiryDays(product, today = new Date()) {
  const end = parseDate(product?.validade, true);
  if (!end) return null;
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((endDay - current) / 86400000);
}

export function hasExpiryBulkDiscount(product, today = new Date()) {
  const days = productExpiryDays(product, today);
  return days !== null && days >= 0 && days < CONFIG.EXPIRY_BULK_MAX_DAYS;
}

export function cartUnitPricing(product, qty, coupon, eligibility, today = new Date()) {
  const original = Number(product.price || 0);
  const couponPrice = eligibility?.eligible ? couponUnitPrice(product, coupon) : original;
  const wholesaleEligible = !product.isFee && Number(qty || 0) >= CONFIG.WHOLESALE_MIN_QTY;
  const expiryBulkEligible = wholesaleEligible && hasExpiryBulkDiscount(product, today);
  const expiryBulkPrice = expiryBulkEligible ? roundMoney(couponPrice * (1 - CONFIG.EXPIRY_BULK_DISCOUNT_RATE)) : couponPrice;
  const effective = wholesaleEligible ? roundMoney(expiryBulkPrice * (1 - CONFIG.WHOLESALE_DISCOUNT_RATE)) : expiryBulkPrice;
  return {
    original,
    couponPrice,
    expiryBulkPrice,
    effective,
    wholesaleEligible,
    expiryBulkEligible,
    couponDiscount: Math.max(0, original - couponPrice),
    expiryBulkDiscount: Math.max(0, couponPrice - expiryBulkPrice),
    wholesaleDiscount: Math.max(0, expiryBulkPrice - effective)
  };
}

export function normalizeQuantityMap(value) {
  return Object.entries(value || {}).reduce((map, [id, qty]) => {
    const amount = Math.max(0, Number(qty) || 0);
    if (amount > 0) map[String(id)] = amount;
    return map;
  }, {});
}

export function parseBasketItem(line) {
  if (line && typeof line === 'object') {
    const code = line.codigo || line.sku || line.id || line.gtin || line.ean || '';
    const substitutes = Array.isArray(line.substitutos || line.substitutes)
      ? (line.substitutos || line.substitutes)
      : String(line.substitutos || line.substitutes || '').split(/[;,|]/g);
    return {
      qty: Math.max(1, Number(line.qtd || line.qty || line.quantidade || line.quantity || 1) || 1),
      code: String(code).trim(),
      substitutes: substitutes.map(item => String(item?.codigo || item?.sku || item?.id || item || '').trim()).filter(Boolean)
    };
  }
  const raw = String(line || '').trim();
  const match = raw.match(/^(\d+)\s*x\s*(.+)$/i);
  return match ? { qty: Math.max(1, Number(match[1])), code: match[2].trim(), substitutes: [] } : { qty: 1, code: raw, substitutes: [] };
}

export function findProductByCode(state, code) {
  const direct = findProductByReference(state, code);
  if (direct) return direct;
  const variants = codeVariants(code);
  for (const variant of variants) {
    if (state.productCodeMap?.has(variant)) return state.productCodeMap.get(variant);
  }
  return null;
}

export function resolveBundleRows(state, bundle) {
  return (bundle?.produtos || []).map(line => {
    const parsed = parseBasketItem(line);
    const references = [parsed.code, ...parsed.substitutes];
    const product = references.map(reference => findProductByCode(state, reference)).find(candidate => candidate && isAvailable(candidate));
    return product ? { product, qty: parsed.qty } : null;
  }).filter(Boolean);
}

export function kitDateIsActive(kit, now = new Date()) {
  const start = parseDate(kit?.dataInicio, false);
  const end = parseDate(kit?.dataFim, true);
  return (!start || now >= start) && (!end || now <= end);
}

export function kitRetailTotal(state, kit) {
  return resolveBundleRows(state, kit).reduce((sum, row) => sum + Number(row.product.price || 0) * Number(row.qty || 0), 0);
}

export function kitOriginalPrice(state, kit) {
  return Math.max(Number(kit?.precoOriginal || 0), kitRetailTotal(state, kit));
}

export function kitStockCapacity(state, kit) {
  if (!kit || !kit.produtos?.length) return 0;
  const rows = resolveBundleRows(state, kit);
  if (rows.length !== kit.produtos.length) return 0;
  const productCapacity = Math.min(...rows.map(row => Math.floor(Math.max(0, Number(row.product.stock || 0)) / Math.max(1, Number(row.qty || 1)))));
  const manualLimit = Math.max(0, Math.floor(Number(kit.limiteKits || 0)));
  const publishedStock = Math.max(0, Math.floor(Number(kit.estoqueDisponivel || 0)));
  const limited = manualLimit > 0 ? Math.min(productCapacity, manualLimit) : productCapacity;
  return publishedStock > 0 ? Math.min(limited, publishedStock) : limited;
}

export function kitDiscountPercent(state, kit) {
  const original = kitOriginalPrice(state, kit);
  return original > Number(kit?.preco || 0)
    ? Math.round(((original - Number(kit.preco || 0)) / Math.max(original, 0.01)) * 100)
    : 0;
}

export function kitIsVisible(state, kit, now = new Date()) {
  if (!kit || kit.ativo === false || !kitDateIsActive(kit, now)) return false;
  if (!Number(kit.preco || 0) || !kit.produtos?.length) return false;
  if (kitStockCapacity(state, kit) <= 0) return false;
  return kitDiscountPercent(state, kit) > 0 || Number(kit.descontoPercentual || 0) > 0;
}

function activeKitAdjustments(state) {
  const protectedQtyById = {};
  const activeFeeIds = new Set();
  let kitDiscount = 0;
  Object.entries(state.basketCustomizations || {}).forEach(([key, info]) => {
    const isKit = String(key).startsWith('kit:') || String(info?.label || '').toUpperCase().includes('KIT');
    if (!isKit) return;
    const originalItems = normalizeQuantityMap(info.originalItems);
    const intact = Object.entries(originalItems).every(([id, qty]) => Number(state.cart[id] || 0) >= Number(qty));
    const feeId = `fee_${key}`;
    const feeQty = Number(state.cart[feeId] || 0);
    const fee = Number(state.virtualFees?.[feeId]?.price ?? info.fee ?? 0);
    if (!intact || (fee !== 0 && feeQty <= 0)) return;
    Object.entries(originalItems).forEach(([id, qty]) => {
      protectedQtyById[id] = Number(protectedQtyById[id] || 0) + Number(qty);
    });
    if (feeQty > 0) {
      activeFeeIds.add(feeId);
      if (fee < 0) kitDiscount += Math.abs(fee * feeQty);
    }
  });
  return { protectedQtyById, activeFeeIds, kitDiscount: roundMoney(kitDiscount) };
}

export function calculateCartPricing(state, { includeFees = true, now = new Date() } = {}) {
  const allItems = state.cartOrder.map(id => {
    const product = state.productMap.get(String(id)) || state.virtualFees?.[id];
    const qty = Number(state.cart[id] || 0);
    return product && qty > 0 ? { id: String(id), product, qty } : null;
  }).filter(Boolean);
  const kitContext = activeKitAdjustments(state);
  const productItems = allItems.filter(item => !item.product.isFee);
  const feeItems = includeFees ? allItems.filter(item => item.product.isFee) : [];
  const basketAdjustment = feeItems.filter(item => !String(item.id).startsWith('fee_kit:')).reduce((sum, item) => sum + Number(item.product.price || 0) * item.qty, 0);
  const kitAdjustment = feeItems.filter(item => String(item.id).startsWith('fee_kit:') && kitContext.activeFeeIds.has(item.id)).reduce((sum, item) => sum + Number(item.product.price || 0) * item.qty, 0);
  const productsSubtotalBefore = productItems.reduce((sum, item) => sum + Number(item.product.price || 0) * item.qty, 0);
  const subtotalBefore = roundMoney(productsSubtotalBefore + basketAdjustment);
  const coupon = couponIsValid(getCouponByCode(state.coupons, state.activeCouponCode)) ? getCouponByCode(state.coupons, state.activeCouponCode) : null;
  const eligibility = couponEligibility(coupon, subtotalBefore, state.customerLookupStatus);
  let couponDiscount = 0;
  let expiryBulkDiscount = 0;
  let wholesaleDiscount = 0;
  let participatingItems = 0;
  let expiryBulkItems = 0;
  let wholesaleItems = 0;
  const linePrices = new Map();
  const productsTotal = productItems.reduce((sum, item) => {
    const quantity = item.qty;
    const protectedQty = Math.min(quantity, Number(kitContext.protectedQtyById[item.id] || 0));
    const discountedQty = Math.max(0, quantity - protectedQty);
    const pricing = cartUnitPricing(item.product, discountedQty, coupon, eligibility, now);
    const total = roundMoney(protectedQty * Number(item.product.price || 0) + discountedQty * pricing.effective);
    couponDiscount += pricing.couponDiscount * discountedQty;
    expiryBulkDiscount += pricing.expiryBulkDiscount * discountedQty;
    wholesaleDiscount += pricing.wholesaleDiscount * discountedQty;
    if (pricing.couponDiscount > 0) participatingItems += discountedQty;
    if (pricing.expiryBulkEligible) expiryBulkItems += discountedQty;
    if (pricing.wholesaleEligible) wholesaleItems += discountedQty;
    linePrices.set(item.id, { ...pricing, total, effective: quantity ? roundMoney(total / quantity) : pricing.effective, protectedQty, discountedQty });
    return sum + total;
  }, 0);
  const total = roundMoney(productsTotal + basketAdjustment + kitAdjustment);
  return {
    coupon,
    eligibility,
    subtotalBefore,
    productsSubtotalBefore: roundMoney(productsSubtotalBefore),
    basketAdjustment: roundMoney(basketAdjustment),
    kitAdjustment: roundMoney(kitAdjustment),
    total,
    discount: roundMoney(subtotalBefore - total),
    couponDiscount: roundMoney(couponDiscount),
    expiryBulkDiscount: roundMoney(expiryBulkDiscount),
    wholesaleDiscount: roundMoney(wholesaleDiscount),
    kitDiscount: kitContext.kitDiscount,
    participatingItems,
    expiryBulkItems,
    wholesaleItems,
    linePrices,
    items: allItems
  };
}

export class CartService {
  constructor(store, events) {
    this.store = store;
    this.events = events;
  }

  load() {
    const saved = readStorage(CONFIG.STORAGE.CART, null);
    const favorites = readStorage(CONFIG.STORAGE.FAVORITES, []);
    const activeCoupon = readStorage(CONFIG.STORAGE.ACTIVE_COUPON, null);
    const expired = !saved?.savedAt || Date.now() - Number(saved.savedAt) > CONFIG.CART_MAX_AGE_MS;
    this.store.mutate(state => {
      if (!expired && saved) {
        state.cart = normalizeQuantityMap(saved.cart);
        state.cartOrder = [...new Set([...(saved.cartOrder || []), ...Object.keys(state.cart)].map(String))].filter(id => state.cart[id]);
        state.basketCustomizations = saved.basketCustomizations || {};
        state.basketDrafts = saved.basketDrafts || {};
      }
      state.favorites = new Set(Array.isArray(favorites) ? favorites.map(String) : []);
      state.activeCouponCode = String(activeCoupon?.codigo || '').toUpperCase();
    }, 'cart:loaded');
  }

  persist() {
    const state = this.store.getState();
    writeStorage(CONFIG.STORAGE.CART, {
      savedAt: Date.now(),
      appVersion: CONFIG.APP_VERSION,
      cart: state.cart,
      cartOrder: state.cartOrder,
      basketCustomizations: state.basketCustomizations,
      basketDrafts: state.basketDrafts
    });
    writeStorage(CONFIG.STORAGE.FAVORITES, [...state.favorites]);
  }

  getProduct(id) {
    const state = this.store.getState();
    return state.productMap.get(String(id)) || state.virtualFees?.[String(id)] || null;
  }

  setQty(id, qty, { silent = false } = {}) {
    const key = String(id);
    const state = this.store.getState();
    const product = this.getProduct(key);
    if (!product || !isAvailable(product)) return false;
    const previous = Number(state.cart[key] || 0);
    const requested = Math.max(0, Math.floor(Number(qty) || 0));
    const max = product.isFee ? 999999 : Math.max(0, Math.floor(Number(product.stock || 0)));
    const next = Math.min(requested, max);
    this.store.mutate(current => {
      if (next <= 0) {
        delete current.cart[key];
        current.cartOrder = current.cartOrder.filter(item => item !== key);
      } else {
        current.cart[key] = next;
        if (!current.cartOrder.includes(key)) current.cartOrder.push(key);
      }
    }, 'cart:quantity');
    this.persist();
    if (!silent && previous !== next) this.events.emit(next > previous ? 'cart:item-added' : 'cart:item-removed', { product, previous, next });
    this.events.emit('cart:changed', { id: key, previous, next });
    return next;
  }

  add(id, qty = 1) {
    const state = this.store.getState();
    return this.setQty(id, Number(state.cart[String(id)] || 0) + Number(qty || 1));
  }

  clear() {
    this.store.mutate(state => {
      state.cart = {};
      state.cartOrder = [];
      state.basketCustomizations = {};
      state.basketDrafts = {};
      state.virtualFees = {};
    }, 'cart:cleared');
    removeStorage(CONFIG.STORAGE.CART);
    this.events.emit('cart:changed', { cleared: true });
  }

  toggleFavorite(id, kind = 'product') {
    const key = kind === 'kit' ? `kit:${id}` : String(id);
    let active = false;
    this.store.mutate(state => {
      if (state.favorites.has(key)) state.favorites.delete(key);
      else { state.favorites.add(key); active = true; }
    }, 'favorites:changed');
    this.persist();
    this.events.emit('favorite:changed', { id: String(id), kind, active });
    return active;
  }

  activateCoupon(code) {
    const state = this.store.getState();
    const coupon = getCouponByCode(state.coupons, code);
    if (!couponIsValid(coupon)) return { ok: false, message: 'Cupom inválido, inativo ou vencido.' };
    if (coupon.grupo === 'cliente_novo' && state.customerLookupStatus === 'existing') {
      return { ok: false, message: 'Este cupom é exclusivo para a primeira compra.' };
    }
    this.store.mutate(current => { current.activeCouponCode = String(coupon.codigo).toUpperCase(); }, 'coupon:activated');
    writeStorage(CONFIG.STORAGE.ACTIVE_COUPON, { codigo: coupon.codigo, savedAt: Date.now() });
    this.events.emit('cart:changed', { coupon: coupon.codigo });
    return { ok: true, coupon };
  }

  removeCoupon() {
    this.store.mutate(state => { state.activeCouponCode = ''; }, 'coupon:removed');
    removeStorage(CONFIG.STORAGE.ACTIVE_COUPON);
    this.events.emit('cart:changed', { coupon: null });
  }

  rebuildVirtualFees() {
    this.store.mutate(state => {
      state.virtualFees = {};
      Object.entries(state.basketCustomizations || {}).forEach(([bundleId, info]) => {
        const feeId = `fee_${bundleId}`;
        state.virtualFees[feeId] = {
          id: feeId,
          name: String(info.label || '').toUpperCase().includes('KIT') ? 'Ajuste de valor do kit' : 'Ajuste de valor da cesta',
          price: Number(info.fee || 0),
          isFee: true,
          stock: 999,
          img: '../img/logoantonia5.png'
        };
      });
    }, 'cart:fees');
  }

  addBasket(basket, quantities = null) {
    const state = this.store.getState();
    const rows = resolveBundleRows(state, basket);
    if (!rows.length) return { ok: false, message: 'Os produtos da cesta não estão disponíveis.' };
    const selected = quantities || Object.fromEntries(rows.map(row => [row.product.id, row.qty]));
    for (const [id, qty] of Object.entries(selected)) {
      const product = state.productMap.get(String(id));
      if (!product || Number(state.cart[id] || 0) + Number(qty) > Number(product.stock || 0)) {
        return { ok: false, message: `Estoque insuficiente para ${product?.name || id}.` };
      }
    }
    const defaultTotal = rows.reduce((sum, row) => sum + Number(row.product.price || 0) * Number(row.qty), 0);
    const selectedTotal = Object.entries(selected).reduce((sum, [id, qty]) => sum + Number(state.productMap.get(String(id))?.price || 0) * Number(qty), 0);
    const fixedAdjustment = basket.preco ? roundMoney(Number(basket.preco) - defaultTotal) : 0;
    const bundleKey = `basket:${basket.id}`;
    this.store.mutate(current => {
      Object.entries(selected).forEach(([id, qty]) => {
        const next = Number(current.cart[id] || 0) + Number(qty);
        current.cart[id] = next;
        if (!current.cartOrder.includes(id)) current.cartOrder.push(id);
      });
      current.basketCustomizations[bundleKey] = {
        label: 'CESTA',
        name: basket.nome,
        originalItems: Object.fromEntries(rows.map(row => [String(row.product.id), Number(row.qty)])),
        selectedItems: normalizeQuantityMap(selected),
        fee: fixedAdjustment,
        changed: roundMoney(selectedTotal - defaultTotal) !== 0
      };
      const feeId = `fee_${bundleKey}`;
      if (fixedAdjustment !== 0) {
        current.cart[feeId] = 1;
        if (!current.cartOrder.includes(feeId)) current.cartOrder.push(feeId);
      }
    }, 'cart:basket-added');
    this.rebuildVirtualFees();
    this.persist();
    this.events.emit('cart:changed', { basketId: basket.id });
    return { ok: true };
  }

  addKit(kit) {
    const state = this.store.getState();
    if (!kitIsVisible(state, kit)) return { ok: false, message: 'Este kit não está disponível.' };
    const rows = resolveBundleRows(state, kit);
    const retail = kitRetailTotal(state, kit);
    const fee = roundMoney(Number(kit.preco || 0) - retail);
    const bundleKey = `kit:${kit.id}`;
    for (const row of rows) {
      if (Number(state.cart[row.product.id] || 0) + row.qty > Number(row.product.stock || 0)) {
        return { ok: false, message: `Estoque insuficiente para ${row.product.name}.` };
      }
    }
    this.store.mutate(current => {
      rows.forEach(row => {
        current.cart[row.product.id] = Number(current.cart[row.product.id] || 0) + row.qty;
        if (!current.cartOrder.includes(row.product.id)) current.cartOrder.push(row.product.id);
      });
      current.basketCustomizations[bundleKey] = {
        label: 'KIT PROMOCIONAL',
        name: kit.nome,
        originalItems: Object.fromEntries(rows.map(row => [String(row.product.id), Number(row.qty)])),
        selectedItems: Object.fromEntries(rows.map(row => [String(row.product.id), Number(row.qty)])),
        fee,
        changed: false
      };
      const feeId = `fee_${bundleKey}`;
      if (fee !== 0) {
        current.cart[feeId] = 1;
        if (!current.cartOrder.includes(feeId)) current.cartOrder.push(feeId);
      }
    }, 'cart:kit-added');
    this.rebuildVirtualFees();
    this.persist();
    this.events.emit('cart:changed', { kitId: kit.id });
    return { ok: true };
  }
}
