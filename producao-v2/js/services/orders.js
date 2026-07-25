const CACHE_MS = 15000;
let recentCache = null;
let recentCacheAt = 0;
let recentCacheLimit = 0;
let recentLoading = null;
let recentLoadingLimit = 0;

function clean(value = '') {
  return String(value ?? '').trim();
}

function baseUrl(config) {
  return clean(config?.firebaseUrl).replace(/\/+$/, '');
}

function safePageLimit(value, fallback = 120) {
  return Math.max(10, Math.min(250, Math.floor(Number(value) || fallback)));
}

function orderTimestamp(order) {
  const value = order?.criado_em || order?.created_at || order?.data || order?.timestamp || 0;
  const timestamp = typeof value === 'number' ? value : new Date(String(value || '')).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeCollection(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.entries(data)
    .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
    .map(([firebaseKey, value]) => ({ firebaseKey, ...value }))
    .sort((a, b) => orderTimestamp(b) - orderTimestamp(a));
}

function cloneForLimit(result, limit) {
  const orders = Array.isArray(result?.orders) ? result.orders.slice(0, limit) : [];
  return structuredClone({
    ...result,
    orders,
    hasMore: Boolean(result?.hasMore || (result?.orders?.length || 0) > limit),
  });
}

async function fetchJson(url, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Pedidos retornaram ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
    }
    return await response.json().catch(() => null);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Tempo esgotado ao consultar os pedidos.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOrderPage(config, { limit = 120, beforeKey = '' } = {}) {
  const safeLimit = safePageLimit(limit);
  const requested = safeLimit + (beforeKey ? 1 : 0);
  const params = new URLSearchParams();
  params.set('orderBy', '"$key"');
  params.set('limitToLast', String(requested));
  if (beforeKey) params.set('endAt', JSON.stringify(String(beforeKey)));
  params.set('_admin_orders', String(Date.now()));

  const root = baseUrl(config);
  if (!root) throw new Error('Firebase URL não configurada.');
  const data = await fetchJson(`${root}/pedidos.json?${params.toString()}`);
  let orders = normalizeCollection(data);
  if (beforeKey) orders = orders.filter(order => String(order.firebaseKey) !== String(beforeKey));

  const keys = orders.map(order => String(order.firebaseKey || '')).filter(Boolean).sort();
  return {
    orders,
    hasMore: Object.keys(data || {}).length >= requested,
    oldestKey: keys[0] || '',
  };
}

export async function loadRecentOrders(config, { limit = 120, force = false } = {}) {
  const requestedLimit = safePageLimit(limit);
  const cacheFresh = recentCache && Date.now() - recentCacheAt < CACHE_MS;
  if (!force && cacheFresh && recentCacheLimit >= requestedLimit) {
    return cloneForLimit(recentCache, requestedLimit);
  }
  if (!force && recentLoading && recentLoadingLimit >= requestedLimit) {
    return cloneForLimit(await recentLoading, requestedLimit);
  }

  recentLoadingLimit = requestedLimit;
  recentLoading = fetchOrderPage(config, { limit: requestedLimit });
  try {
    recentCache = await recentLoading;
    recentCacheAt = Date.now();
    recentCacheLimit = requestedLimit;
    return cloneForLimit(recentCache, requestedLimit);
  } finally {
    recentLoading = null;
    recentLoadingLimit = 0;
  }
}

export async function loadOlderOrders(config, beforeKey, { limit = 100 } = {}) {
  if (!beforeKey) return { orders: [], hasMore: false, oldestKey: '' };
  return fetchOrderPage(config, { limit: safePageLimit(limit, 100), beforeKey });
}

export function invalidateOrdersCache() {
  recentCache = null;
  recentCacheAt = 0;
  recentCacheLimit = 0;
  recentLoading = null;
  recentLoadingLimit = 0;
}
