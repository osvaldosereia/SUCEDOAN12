import { CONFIG } from './config.js';
import { norm, readStorage, writeStorage } from './core.js';
import { isAvailable } from './commerce.js';

const VERSION = 1;
const MAX_RECENT = 30;
const MAX_PURCHASES = 3;
const MAX_PRODUCTS = 100;

function emptyData() {
  return {
    version: VERSION,
    consent: null,
    consentAt: '',
    updatedAt: '',
    profile: { products: {}, categories: {}, subcategories: {}, brands: {} },
    recentlyViewed: [],
    purchases: [],
    cooldowns: {}
  };
}

function loadData() {
  const parsed = readStorage(CONFIG.STORAGE.PERSONALIZATION, null);
  if (!parsed || Number(parsed.version) !== VERSION) return emptyData();
  const fallback = emptyData();
  parsed.profile = parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : fallback.profile;
  for (const key of ['products', 'categories', 'subcategories', 'brands']) {
    if (!parsed.profile[key] || typeof parsed.profile[key] !== 'object') parsed.profile[key] = {};
  }
  parsed.recentlyViewed = Array.isArray(parsed.recentlyViewed) ? parsed.recentlyViewed : [];
  parsed.purchases = Array.isArray(parsed.purchases) ? parsed.purchases : [];
  parsed.cooldowns = parsed.cooldowns && typeof parsed.cooldowns === 'object' ? parsed.cooldowns : {};
  return parsed;
}

export function createPersonalization(store, events) {
  let data = loadData();

  function save() {
    data.updatedAt = new Date().toISOString();
    writeStorage(CONFIG.STORAGE.PERSONALIZATION, data);
  }

  function enabled() { return data.consent === true; }

  function cooldownAllows(key, duration = 30 * 60 * 1000) {
    const now = Date.now();
    const last = Number(data.cooldowns[key] || 0);
    if (last && now - last < duration) return false;
    data.cooldowns[key] = now;
    return true;
  }

  function bump(group, rawKey, points) {
    if (!enabled()) return;
    const key = norm(rawKey);
    if (!key) return;
    const now = new Date().toISOString();
    const current = data.profile[group][key] || { points: 0, lastAt: now, interactions: 0 };
    current.points = Math.max(-20, Math.min(250, Number(current.points || 0) + Number(points || 0)));
    current.lastAt = now;
    current.interactions = Number(current.interactions || 0) + 1;
    data.profile[group][key] = current;
  }

  function bumpProduct(product, points, source, useCooldown = true) {
    if (!enabled() || !product || product.isFee) return;
    const id = String(product.id || '');
    if (!id) return;
    if (useCooldown && !cooldownAllows(`${source}:product:${id}`)) return;
    bump('products', id, points);
    if (product.categoria) bump('categories', product.categoria, Math.max(1, points * 0.65));
    if (product.subcategoria) bump('subcategories', product.subcategoria, Math.max(1, points * 0.75));
    if (product.marca) bump('brands', product.marca, Math.max(1, points * 0.45));
    prune();
    save();
  }

  function prune() {
    const cutoff = Date.now() - 90 * 86400000;
    for (const group of Object.keys(data.profile)) {
      for (const [key, item] of Object.entries(data.profile[group])) {
        if ((Date.parse(item.lastAt || 0) || 0) < cutoff) delete data.profile[group][key];
      }
      const entries = Object.entries(data.profile[group]);
      const max = group === 'products' ? MAX_PRODUCTS : 50;
      if (entries.length > max) {
        entries.sort((a, b) => Number(b[1].points || 0) - Number(a[1].points || 0));
        data.profile[group] = Object.fromEntries(entries.slice(0, max));
      }
    }
    data.recentlyViewed = data.recentlyViewed.filter(item => (Date.parse(item.viewedAt || 0) || 0) > Date.now() - 30 * 86400000).slice(0, MAX_RECENT);
    data.purchases = data.purchases.slice(0, MAX_PURCHASES);
  }

  function setConsent(value) {
    const consentAt = new Date().toISOString();
    data = value ? { ...data, consent: true, consentAt } : { ...emptyData(), consent: false, consentAt };
    save();
    events.emit('personalization:changed', { enabled: value === true });
  }

  function clearHistory() {
    const consent = data.consent;
    const consentAt = data.consentAt;
    data = { ...emptyData(), consent, consentAt };
    save();
    events.emit('personalization:changed', { enabled: consent === true });
  }

  function addRecentlyViewed(product) {
    if (!enabled() || !product) return;
    const id = String(product.id);
    data.recentlyViewed = data.recentlyViewed.filter(item => String(item.productId) !== id);
    data.recentlyViewed.unshift({ productId: id, viewedAt: new Date().toISOString() });
    data.recentlyViewed = data.recentlyViewed.slice(0, MAX_RECENT);
    bumpProduct(product, 1, 'open');
    save();
  }

  function recordPurchase(items) {
    if (!enabled() || !items?.length) return;
    const normalized = items.map(item => ({ productId: String(item.product.id), qty: Number(item.qty || 1) }));
    data.purchases.unshift({ at: new Date().toISOString(), items: normalized });
    data.purchases = data.purchases.slice(0, MAX_PURCHASES);
    normalized.forEach(item => bumpProduct(store.getState().productMap.get(item.productId), 12, `purchase:${Date.now()}`, false));
    save();
  }

  function effectivePoints(entry) {
    if (!entry) return 0;
    const ageDays = Math.max(0, (Date.now() - (Date.parse(entry.lastAt || 0) || Date.now())) / 86400000);
    const weight = ageDays > 90 ? 0 : ageDays > 60 ? 0.25 : ageDays > 30 ? 0.5 : ageDays > 7 ? 0.75 : 1;
    return Number(entry.points || 0) * weight;
  }

  function scoreProduct(product) {
    if (!product || !isAvailable(product)) return -Infinity;
    const profile = data.profile;
    const productScore = effectivePoints(profile.products[norm(product.id)]);
    const categoryScore = effectivePoints(profile.categories[norm(product.categoria)]);
    const subcategoryScore = effectivePoints(profile.subcategories[norm(product.subcategoria)]);
    const brandScore = effectivePoints(profile.brands[norm(product.marca)]);
    const cartPenalty = store.getState().cart[String(product.id)] ? 8 : 0;
    const recentIndex = data.recentlyViewed.findIndex(item => String(item.productId) === String(product.id));
    return productScore * 5 + subcategoryScore * 3 + categoryScore * 2 + brandScore * 1.5 + (recentIndex >= 0 ? Math.max(0, 5 - recentIndex * 0.25) : 0) - cartPenalty;
  }

  function recommendations(limit = 8) {
    if (!enabled()) return [];
    return store.getState().products
      .filter(isAvailable)
      .map(product => ({ product, score: scoreProduct(product) }))
      .filter(item => Number.isFinite(item.score) && item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.product);
  }

  function recentProducts(limit = 8) {
    if (!enabled()) return [];
    return data.recentlyViewed
      .map(item => store.getState().productMap.get(String(item.productId)))
      .filter(product => product && isAvailable(product))
      .slice(0, limit);
  }

  function buyAgain(limit = 8) {
    if (!enabled() || !data.purchases.length) return [];
    return data.purchases[0].items
      .map(item => {
        const product = store.getState().productMap.get(String(item.productId));
        return product ? { ...product, __lastPurchaseQty: item.qty } : null;
      })
      .filter(product => product && isAvailable(product))
      .slice(0, limit);
  }

  events.on('cart:item-added', ({ product }) => bumpProduct(product, 6, 'cart-add'));
  events.on('cart:item-removed', ({ product }) => bumpProduct(product, -2, 'cart-remove'));
  events.on('favorite:changed', ({ id, kind, active }) => {
    if (kind === 'kit') return;
    bumpProduct(store.getState().productMap.get(String(id)), active ? 8 : -5, active ? 'favorite-add' : 'favorite-remove', false);
  });
  events.on('order:opened-whatsapp', ({ items }) => recordPurchase(items));

  return {
    enabled,
    consent: () => data.consent,
    setConsent,
    clearHistory,
    addRecentlyViewed,
    recommendations,
    recentProducts,
    buyAgain,
    snapshot: () => structuredClone(data)
  };
}
