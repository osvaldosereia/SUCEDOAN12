(() => {
  'use strict';
  const BUILD = '20260830-personalizador-navigation-v1';
  const STOREFRONT = 'https://canecafacil.com.br/';
  const params = new URLSearchParams(location.search);

  function safeTarget(value) {
    const raw = String(value || '').trim();
    if (!raw) return STOREFRONT;
    try {
      const url = new URL(raw, STOREFRONT);
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      return host === 'canecafacil.com.br' ? url.href : STOREFRONT;
    } catch { return STOREFRONT; }
  }
  function target() { return safeTarget(params.get('return')); }
  function insideFrame() {
    try { return window.self !== window.top; }
    catch { return true; }
  }
  function goBack() {
    const url = target();
    if (insideFrame()) {
      try {
        window.parent.postMessage({ type: 'canecafacil:return-to-store', url }, '*');
        return;
      } catch {}
    }
    location.href = url;
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('#backButton,#returnButton');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    goBack();
  }, true);

  document.documentElement.dataset.cfPersonalizerNavigation = BUILD;
})();