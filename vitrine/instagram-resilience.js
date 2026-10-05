(() => {
  'use strict';

  const API = 'https://ssbesxgaijknwsjbsbcz.supabase.co/functions/v1/storefront-v2';
  const CACHE_KEY = 'da_storefront_home_carousel_v1';
  const MAX_STALE_MS = 24 * 60 * 60 * 1000;
  const TIMEOUT_MS = 10000;
  const RETRIES = 2;

  function readCachedHome() {
    try {
      const value = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!value || !value.saved_at || Date.now() - Number(value.saved_at) > MAX_STALE_MS) return null;
      return value.data && Array.isArray(value.data.baskets) && value.data.baskets.length ? value.data : null;
    } catch {
      return null;
    }
  }

  function writeCachedHome(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ saved_at: Date.now(), data }));
    } catch {}
  }

  async function fetchHome() {
    const url = new URL(API);
    url.searchParams.set('action', 'home');
    url.searchParams.set('layout', 'basket-carousel-v1');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.ok === false) throw new Error(data?.error || 'home_unavailable');
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function refreshHomeCache() {
    let lastError;
    for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
      try {
        const data = await fetchHome();
        writeCachedHome(data);
        return data;
      } catch (error) {
        lastError = error;
        if (attempt < RETRIES) await new Promise(resolve => setTimeout(resolve, 450 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  async function recoverStorefront() {
    const content = document.getElementById('content');
    if (!content || !/Não consegui abrir a vitrine agora/i.test(content.textContent || '')) return;

    const cached = readCachedHome();
    if (cached) {
      location.reload();
      return;
    }

    const retry = document.getElementById('retryHome');
    if (retry) {
      retry.disabled = true;
      retry.textContent = 'Reconectando…';
    }

    try {
      await refreshHomeCache();
      location.reload();
    } catch {
      if (retry) {
        retry.disabled = false;
        retry.textContent = 'Tentar novamente';
      }
    }
  }

  window.addEventListener('load', () => {
    const cached = readCachedHome();
    if (!cached) {
      refreshHomeCache().catch(() => {});
    }

    setTimeout(recoverStorefront, 50);

    const observer = new MutationObserver(() => {
      if (/Não consegui abrir a vitrine agora/i.test(document.getElementById('content')?.textContent || '')) {
        recoverStorefront();
      }
    });
    const content = document.getElementById('content');
    if (content) observer.observe(content, { childList: true, subtree: true });
  });
})();
