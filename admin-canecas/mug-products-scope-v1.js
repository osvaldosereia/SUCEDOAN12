(() => {
  'use strict';

  const BUILD = '20260829-admin-canecas-mug-products-scope-v2';
  const FIREBASE_HOST = 'cedar-chemist-310801-default-rtdb.firebaseio.com';
  const PRODUCT_PATH = '/produtos.json';
  const CATEGORY_PREFIX = 'Caneca';
  const CACHE_MS = 120000;

  if (window.__DA_ADMIN_CANECAS_PRODUCT_SCOPE__ === BUILD) return;
  window.__DA_ADMIN_CANECAS_PRODUCT_SCOPE__ = BUILD;

  const nativeFetch = window.fetch.bind(window);
  let cache = null;
  let cacheAt = 0;
  let inFlight = null;

  function text(value) { return String(value ?? '').trim(); }

  function parseUrl(input) {
    try {
      return new URL(typeof input === 'string' ? input : input?.url, location.href);
    } catch {
      return null;
    }
  }

  function isBroadProductsRequest(input, init = {}) {
    const method = String(init?.method || 'GET').toUpperCase();
    if (method !== 'GET') return false;
    const url = parseUrl(input);
    if (!url || url.hostname !== FIREBASE_HOST || url.pathname !== PRODUCT_PATH) return false;
    if (url.searchParams.has('orderBy') || url.searchParams.has('equalTo') || url.searchParams.has('startAt') || url.searchParams.has('endAt')) return false;
    return true;
  }

  function isProductWrite(input, init = {}) {
    const method = String(init?.method || 'GET').toUpperCase();
    if (!['PATCH', 'PUT', 'POST', 'DELETE'].includes(method)) return false;
    const url = parseUrl(input);
    if (!url || url.hostname !== FIREBASE_HOST) return false;
    return url.pathname === PRODUCT_PATH || url.pathname.startsWith('/produtos/');
  }

  function scopedUrl() {
    const url = new URL(`https://${FIREBASE_HOST}${PRODUCT_PATH}`);
    url.searchParams.set('orderBy', JSON.stringify('categoria'));
    url.searchParams.set('startAt', JSON.stringify(CATEGORY_PREFIX));
    url.searchParams.set('endAt', JSON.stringify(`${CATEGORY_PREFIX}\uf8ff`));
    url.searchParams.set('_', String(Date.now()));
    return url.toString();
  }

  async function fetchScopedProducts() {
    const response = await nativeFetch(scopedUrl(), {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      throw new Error(`Firebase ${response.status}${raw ? ` · ${raw.slice(0, 160)}` : ''}`);
    }
    const data = await response.json().catch(() => null);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  }

  function invalidate(reason = '') {
    cache = null;
    cacheAt = 0;
    inFlight = null;
    if (reason) console.info(`[Admin Canecas] cache de canecas invalidado: ${reason}`);
  }

  async function loadScopedProducts() {
    if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      const startedAt = performance.now();
      const data = await fetchScopedProducts();
      cache = data;
      cacheAt = Date.now();
      const elapsed = Math.round(performance.now() - startedAt);
      console.info(`[Admin Canecas] ${BUILD}: ${Object.keys(data).length} caneca(s) em 1 consulta (${elapsed} ms). /produtos inteiro não foi lido.`);
      return data;
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  function jsonResponse(data) {
    return new Response(JSON.stringify(data || {}), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Admin-Canecas-Scoped-Products': BUILD,
        'X-Admin-Canecas-Query-Count': '1'
      }
    });
  }

  window.fetch = async function scopedAdminCanecasFetch(input, init = {}) {
    if (isBroadProductsRequest(input, init)) {
      try {
        return jsonResponse(await loadScopedProducts());
      } catch (error) {
        console.error('[Admin Canecas] falha ao carregar somente canecas:', error);
        return new Response(JSON.stringify({ error: text(error?.message || error) }), {
          status: 503,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      }
    }

    const productWrite = isProductWrite(input, init);
    const response = await nativeFetch(input, init);
    if (productWrite && response.ok) invalidate('produto alterado');
    return response;
  };

  document.addEventListener('click', event => {
    if (event.target.closest('#reloadButton, #cfMugReload')) invalidate('atualização manual');
  }, true);

  window.__DA_ADMIN_CANECAS_INVALIDATE_PRODUCTS__ = invalidate;
  document.documentElement.dataset.adminCanecasProductScope = BUILD;
})();
