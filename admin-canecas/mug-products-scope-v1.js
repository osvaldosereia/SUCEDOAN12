(() => {
  'use strict';

  const BUILD = '20260829-admin-canecas-mug-products-scope-v1';
  const FIREBASE_HOST = 'cedar-chemist-310801-default-rtdb.firebaseio.com';
  const PRODUCT_PATH = '/produtos.json';
  const CATEGORY_VALUES = [
    'Caneca de Porcelana',
    'Canecas de Porcelana',
    'Canecas'
  ];
  const CACHE_MS = 3000;

  if (window.__DA_ADMIN_CANECAS_PRODUCT_SCOPE__ === BUILD) return;
  window.__DA_ADMIN_CANECAS_PRODUCT_SCOPE__ = BUILD;

  const nativeFetch = window.fetch.bind(window);
  let cache = null;
  let cacheAt = 0;
  let inFlight = null;

  function text(value) { return String(value ?? '').trim(); }

  function isBroadProductsRequest(input, init = {}) {
    const method = String(init?.method || 'GET').toUpperCase();
    if (method !== 'GET') return false;
    let url;
    try {
      url = new URL(typeof input === 'string' ? input : input?.url, location.href);
    } catch {
      return false;
    }
    if (url.hostname !== FIREBASE_HOST || url.pathname !== PRODUCT_PATH) return false;
    // Leituras específicas já filtradas continuam intocadas.
    if (url.searchParams.has('orderBy') || url.searchParams.has('equalTo') || url.searchParams.has('startAt') || url.searchParams.has('endAt')) return false;
    return true;
  }

  function categoryUrl(category) {
    const url = new URL(`https://${FIREBASE_HOST}${PRODUCT_PATH}`);
    url.searchParams.set('orderBy', JSON.stringify('categoria'));
    url.searchParams.set('equalTo', JSON.stringify(category));
    url.searchParams.set('_', String(Date.now()));
    return url.toString();
  }

  async function fetchCategory(category) {
    const response = await nativeFetch(categoryUrl(category), {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`${category}: Firebase ${response.status}`);
    const data = await response.json().catch(() => null);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  }

  async function loadScopedProducts() {
    if (cache && Date.now() - cacheAt < CACHE_MS) return cache;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      const results = await Promise.allSettled(CATEGORY_VALUES.map(fetchCategory));
      const merged = {};
      let successfulQueries = 0;
      const failures = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successfulQueries += 1;
          Object.assign(merged, result.value || {});
        } else {
          failures.push(`${CATEGORY_VALUES[index]}: ${text(result.reason?.message || result.reason)}`);
        }
      });

      if (!successfulQueries) {
        throw new Error(`Não foi possível consultar as categorias de canecas. ${failures.join(' | ')}`);
      }

      cache = merged;
      cacheAt = Date.now();
      console.info(`[Admin Canecas] ${BUILD}: ${Object.keys(merged).length} caneca(s) carregada(s) sem ler /produtos inteiro.`);
      if (failures.length) console.warn('[Admin Canecas] consultas parciais com falha:', failures);
      return merged;
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
        'X-Admin-Canecas-Scoped-Products': BUILD
      }
    });
  }

  window.fetch = async function scopedAdminCanecasFetch(input, init = {}) {
    if (!isBroadProductsRequest(input, init)) return nativeFetch(input, init);
    try {
      return jsonResponse(await loadScopedProducts());
    } catch (error) {
      console.error('[Admin Canecas] falha ao carregar somente canecas:', error);
      return new Response(JSON.stringify({ error: text(error?.message || error) }), {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }
  };

  document.documentElement.dataset.adminCanecasProductScope = BUILD;
})();
