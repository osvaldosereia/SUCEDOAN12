(() => {
  'use strict';
  const BUILD = '20260903-product-page-adjustments-legacy-shim';
  if (window.__CF_PRODUCT_PAGE_ADJUSTMENTS_LEGACY__ === BUILD) return;
  window.__CF_PRODUCT_PAGE_ADJUSTMENTS_LEGACY__ = BUILD;
  if (window.__CF_UI_RUNTIME__ || [...document.scripts].some(s => /canecafacil-ui-runtime-v1\.js/i.test(s.src || ''))) return;
  const script = document.createElement('script');
  script.src = 'https://donaantonia.com.br/loja-integrada/canecafacil-ui-runtime-v1.js?v=20260903-1';
  script.async = false;
  script.onerror = () => console.error('[CanecaFácil] Falha ao carregar a interface estável.');
  document.head.appendChild(script);
})();
