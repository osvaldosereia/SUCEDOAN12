(() => {
  'use strict';
  const p = new URLSearchParams(location.search);
  if (p.get('cf_personalizador') !== 'teste') return;
  if (window.__CF_INLINE_LOADER__) return;
  window.__CF_INLINE_LOADER__ = '20260901-1';
  const s = document.createElement('script');
  s.src = 'https://donaantonia.com.br/loja-integrada/personalizador-inline-v1.js?v=20260901-1';
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.onerror = () => console.error('[CanecaFácil] Não foi possível carregar o personalizador de homologação.');
  document.head.appendChild(s);
})();
