(() => {
  'use strict';

  const BUILD = '20260901-cf-inline-loader-prod-v3-commerce';
  const PARAM = 'cf_personalizador';
  const ACTIVE_VALUE = 'teste';
  const INLINE_URL = 'https://donaantonia.com.br/loja-integrada/personalizador-inline-v2.js?v=20260901-4';
  const COMMERCE_URL = 'https://donaantonia.com.br/loja-integrada/canecafacil-commerce-runtime-v1.js?v=20260901-2';

  if (window.__CF_INLINE_PROD_LOADER__ === BUILD) return;
  window.__CF_INLINE_PROD_LOADER__ = BUILD;

  let loading = false;

  function loadCommerceRuntime() {
    if (window.__CF_COMMERCE_RUNTIME__) return;
    if ([...document.scripts].some(s => /canecafacil-commerce-runtime-v1\.js/i.test(s.src || ''))) return;
    const script = document.createElement('script');
    script.src = COMMERCE_URL;
    script.async = true;
    script.dataset.cfCommerceRuntime = BUILD;
    script.onerror = () => console.error('[CanecaFácil] Falha ao carregar Minhas Artes/carrinho personalizado.');
    document.head.appendChild(script);
  }

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
        panel.scrollIntoView({ behavior:'smooth', block:'center' });
      } else if (tries >= 80) {
        clearInterval(timer);
      }
    }, 150);
  }

  // Mantido apenas para homologação/diagnóstico por URL ?cf_personalizador=teste.
  function loadLegacyInlineDiagnostic() {
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
    script.onload = () => { loading = false; scrollWhenReady(); };
    script.onerror = () => {
      loading = false;
      console.error('[CanecaFácil] Não foi possível carregar o personalizador inline de diagnóstico.');
    };
    document.head.appendChild(script);
  }

  // Produção atual: o formulário vem aberto dentro da descrição do produto.
  // Este loader cuida apenas da camada transversal da loja: Minhas Artes e vínculo do carrinho.
  loadCommerceRuntime();

  if (new URLSearchParams(location.search).get(PARAM) === ACTIVE_VALUE) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', loadLegacyInlineDiagnostic, { once:true });
    } else {
      loadLegacyInlineDiagnostic();
    }
  }

  console.info(`CanecaFácil · loader produção ${BUILD}`);
})();
