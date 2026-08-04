(() => {
  'use strict';
  const STORAGE_KEY = 'da_admin_v2_deleted_keys_v1';
  const CONFIG_KEY = 'da_admin_v2_config';
  const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  const originalFetch = window.fetch.bind(window);
  const text = value => String(value == null ? '' : value).trim();

  function readMap() {
    let map = {};
    try { map = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { map = {}; }
    const minimum = Date.now() - MAX_AGE;
    let changed = false;
    Object.keys(map).forEach(key => {
      if (!Number(map[key]) || Number(map[key]) < minimum) { delete map[key]; changed = true; }
    });
    if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    return map;
  }
  function writeMap(map) { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); }
  function remember(key) { const value = text(key); if (!value) return; const map = readMap(); map[value] = Date.now(); writeMap(map); }
  function forget(key) { const value = text(key); if (!value) return; const map = readMap(); if (map[value]) { delete map[value]; writeMap(map); } }
  function deletedSet() { return new Set(Object.keys(readMap())); }
  function productsNode() {
    try { return text(JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}').productsNode || 'produtos').replace(/^\/+|\/+$/g, '').replace(/\.json$/i, ''); }
    catch { return 'produtos'; }
  }
  function requestInfo(input, init = {}) {
    const method = text(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const requestUrl = text(input instanceof Request ? input.url : input);
    if (!requestUrl || requestUrl.includes('/produtos_excluidos/')) return { method, key: '' };
    try {
      const parsed = new URL(requestUrl, location.href);
      const marker = `/${productsNode()}/`;
      const start = parsed.pathname.indexOf(marker);
      if (start < 0 || !parsed.pathname.endsWith('.json')) return { method, key: '' };
      return { method, key: decodeURIComponent(parsed.pathname.slice(start + marker.length, -5)) };
    } catch { return { method, key: '' }; }
  }
  function productKey(product, fallback = '') { return text(product?.firebaseKey || product?.key || product?.id || fallback); }
  function filterData(data) {
    const deleted = deletedSet();
    if (!deleted.size) return data;
    if (Array.isArray(data)) return data.filter(product => !deleted.has(productKey(product)));
    if (data && typeof data === 'object') {
      return Object.fromEntries(Object.entries(data).filter(([key, product]) => !deleted.has(key) && !deleted.has(productKey(product, key))));
    }
    return data;
  }
  function isAdminCatalogRequest(input) {
    const requestUrl = text(input instanceof Request ? input.url : input);
    return /\/site\/produtos-(?:admin|home)\.json(?:[?#]|$)/i.test(requestUrl);
  }

  window.fetch = async function patchedFetch(input, init = {}) {
    const response = await originalFetch(input, init);
    const info = requestInfo(input, init);
    if (response.ok && info.key) {
      if (info.method === 'DELETE') remember(info.key);
      if (['PUT', 'PATCH'].includes(info.method)) forget(info.key);
    }
    if (!response.ok || !isAdminCatalogRequest(input) || !deletedSet().size) return response;
    try {
      const data = await response.clone().json();
      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify(filterData(data)), { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      console.warn('Não foi possível filtrar produtos excluídos do índice administrativo:', error);
      return response;
    }
  };
  window.AdminV2DeletedProducts = { remember, forget, filterData, keys: () => [...deletedSet()] };
})();
