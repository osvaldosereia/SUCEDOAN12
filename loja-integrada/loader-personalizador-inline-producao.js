(() => {
  'use strict';

  const BUILD = '20260901-cf-inline-loader-prod-v1';
  const PARAM = 'cf_personalizador';
  const ACTIVE_VALUE = 'teste';
  const INLINE_URL = 'https://donaantonia.com.br/loja-integrada/personalizador-inline-v2.js?v=20260901-4';

  if (window.__CF_INLINE_PROD_LOADER__ === BUILD) return;
  window.__CF_INLINE_PROD_LOADER__ = BUILD;

  let loading = false;

  function isProductPage() {
    return document.body?.classList?.contains('pagina-produto')
      || Boolean(document.querySelector('.produto, .acoes-produto, [itemprop="sku"]'));
  }

  function activateUrl() {
    const url = new URL(location.href);
    if (url.searchParams.get(PARAM) !== ACTIVE_VALUE) {
      url.searchParams.set(PARAM, ACTIVE_VALUE);
      url.hash = 'cfInlinePersonalizer';
      history.replaceState(history.state, '', url.href);
    }
  }

  function scrollWhenReady() {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const panel = document.getElementById('cfInlinePersonalizer');
      if (panel) {
        clearInterval(timer);
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (tries >= 80) {
        clearInterval(timer);
      }
    }, 150);
  }

  function loadInline() {
    if (!isProductPage() || loading || document.getElementById('cfInlinePersonalizer')) {
      if (document.getElementById('cfInlinePersonalizer')) scrollWhenReady();
      return;
    }

    activateUrl();
    loading = true;

    const existing = [...document.scripts].find(s => /personalizador-inline-v2\.js/i.test(s.src || ''));
    if (existing) {
      loading = false;
      scrollWhenReady();
      return;
    }

    const script = document.createElement('script');
    script.src = INLINE_URL;
    script.async = true;
    script.dataset.cfInlinePersonalizer = BUILD;
    script.onload = () => {
      loading = false;
      scrollWhenReady();
    };
    script.onerror = () => {
      loading = false;
      console.error('[CanecaFácil] Não foi possível carregar o personalizador inline.');
      const link = document.querySelector('.cf-personalize-link');
      if (link) link.textContent = 'TENTAR PERSONALIZAR NOVAMENTE';
    };
    document.head.appendChild(script);
  }

  document.addEventListener('click', event => {
    const link = event.target.closest?.('.cf-personalize-link');
    if (!link || !isProductPage()) return;
    event.preventDefault();
    event.stopPropagation();
    loadInline();
  }, true);

  if (new URLSearchParams(location.search).get(PARAM) === ACTIVE_VALUE) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', loadInline, { once: true });
    } else {
      loadInline();
    }
  }

  console.info(`CanecaFácil · loader inline ${BUILD}`);
})();
