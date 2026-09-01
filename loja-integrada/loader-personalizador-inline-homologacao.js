(() => {
  'use strict';
  const p = new URLSearchParams(location.search);
  if (p.get('cf_personalizador') !== 'teste') return;
  if (window.__CF_INLINE_LOADER__) return;
  window.__CF_INLINE_LOADER__ = '20260901-3';
  const s = document.createElement('script');
  s.src = 'https://donaantonia.com.br/loja-integrada/personalizador-inline-v2.js?v=20260901-3';
  s.async = true;
  s.onerror = () => console.error('[CanecaFácil] Não foi possível carregar o personalizador de homologação.');
  document.head.appendChild(s);
})();
