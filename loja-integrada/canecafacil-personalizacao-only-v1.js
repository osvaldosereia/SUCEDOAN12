(() => {
  'use strict';

  const BUILD = '20260903-personalizacao-only-v3.2-native-menu-restored';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const BASE = 'https://donaantonia.com.br/loja-integrada/';

  const UI_RUNTIME = `${BASE}canecafacil-ui-runtime-v1.js?v=20260903-3`;
  const COMMERCE_RUNTIME = `${BASE}canecafacil-commerce-runtime-v1.js?v=20260902-9`;
  const DRAWER_SCROLL_FIX = `${BASE}minhas-canecas-scroll-fix-v1.js?v=20260902-1`;
  const FULL_ART_VIEWER = `${BASE}minhas-canecas-art-viewer-v1.js?v=20260903-1`;
  const PERSONALIZATION_RUNTIME = `${BASE}loader-personalizador-inline-producao.js?v=20260903-1`;
  const FULLWIDTH_RUNTIME = `${BASE}personalizer-fullwidth-native-v1.js?v=20260903-3`;

  if (window.__CF_PERSONALIZACAO_ONLY__ === BUILD) return;
  window.__CF_PERSONALIZACAO_ONLY__ = BUILD;
  window.__CF_DEFAULT_LI_THEME_MODE__ = true;

  const text = value => String(value ?? '').trim();
  let personalizationRequired = false;
  let guardReady = false;

  function hasScript(part) {
    return [...document.scripts].some(script => String(script.src || '').includes(part));
  }

  function loadScript(url, part, marker) {
    if (hasScript(part)) return;
    const script = document.createElement('script');
    script.src = url;
    script.async = false;
    script.dataset.cfModule = marker;
    script.onerror = () => console.error(`[CanecaFácil] Falha ao carregar ${marker}.`);
    document.head.appendChild(script);
  }

  function isProductPage() {
    return document.body?.classList?.contains('pagina-produto') || Boolean(document.querySelector('.produto, .acoes-produto, [itemprop="sku"]'));
  }

  function loadBaseRuntimes() {
    loadScript(UI_RUNTIME, 'canecafacil-ui-runtime-v1.js', 'interface estável');
    loadScript(COMMERCE_RUNTIME, 'canecafacil-commerce-runtime-v1.js', 'Minhas Canecas');
    loadScript(DRAWER_SCROLL_FIX, 'minhas-canecas-scroll-fix-v1.js', 'rolagem de Minhas Canecas');
    loadScript(FULL_ART_VIEWER, 'minhas-canecas-art-viewer-v1.js', 'visualização da arte completa');
  }

  function loadProductRuntimes() {
    if (!isProductPage()) return;
    loadScript(PERSONALIZATION_RUNTIME, 'loader-personalizador-inline-producao.js', 'personalização');
    loadScript(FULLWIDTH_RUNTIME, 'personalizer-fullwidth-native-v1.js', 'personalizador em largura total');
  }

  function skuFromPage() {
    const nodes = [...document.querySelectorAll('[itemprop="sku"],[data-sku],.codigo-produto,.produto-codigo,.sku,[class*="codigo"]')];
    for (const node of nodes) {
      const raw = text(node.getAttribute?.('content') || node.dataset?.sku || node.textContent).toUpperCase();
      const cf = raw.match(/CANP-[A-Z0-9]{3,24}/);
      if (cf) return cf[0];
      const cleaned = raw.replace(/^.*?(?:C[ÓO]DIGO|SKU)\s*[:#-]?\s*/i, '').trim().split(/\s+/)[0];
      if (/^[A-Z0-9._-]{3,40}$/.test(cleaned)) return cleaned;
    }
    return text(document.body?.innerText).toUpperCase().match(/CANP-[A-Z0-9]{3,24}/)?.[0] || '';
  }

  async function productBySku(sku) {
    if (!sku) return null;
    try {
      const url = new URL(`${FIREBASE}/produtos.json`);
      url.searchParams.set('orderBy', JSON.stringify('codigo'));
      url.searchParams.set('equalTo', JSON.stringify(sku));
      url.searchParams.set('_', Date.now());
      const response = await fetch(url, { cache:'no-store', headers:{ Accept:'application/json' } });
      if (!response.ok) return null;
      const data = await response.json();
      const row = Object.entries(data || {})[0];
      return row ? { __key:row[0], ...(row[1] || {}) } : null;
    } catch {
      return null;
    }
  }

  function requiresPersonalization(product = {}) {
    const cfg = product.personalizacao && typeof product.personalizacao === 'object' ? product.personalizacao : {};
    const active = cfg.ativa === true
      || product.personalizavel === true
      || product.loja_integrada_personalizavel === true
      || product.canecafacil_personalizavel === true
      || product.personalizacao_publica === true;
    return active && cfg.obrigatoria === true;
  }

  function personalizerHost() {
    return document.querySelector('[data-cf-native-personalizer="1"], .cf-native-personalizer, .cf-native-personalizer-host');
  }

  function nativeBuyButton(node) {
    return node?.closest?.('a.botao-comprar[href*="/carrinho/produto/"][href*="/adicionar"], .acoes-produto a.botao-comprar');
  }

  function relabelNativeBuyButtons() {
    if (!personalizationRequired) return;
    document.querySelectorAll('a.botao-comprar[href*="/carrinho/produto/"][href*="/adicionar"], .acoes-produto a.botao-comprar').forEach(button => {
      button.dataset.cfPersonalizationRequired = '1';
      button.title = 'Personalize esta caneca antes de comprar';
      button.setAttribute('aria-label', 'Personalize esta caneca antes de comprar');
      const textNode = [...button.childNodes].find(node => node.nodeType === Node.TEXT_NODE && /comprar/i.test(node.nodeValue || ''));
      if (textNode && !/personalize/i.test(textNode.nodeValue || '')) textNode.nodeValue = ' Personalize para comprar';
    });
  }

  function focusPersonalizer() {
    const host = personalizerHost();
    if (!host) return false;
    host.scrollIntoView({ behavior:'smooth', block:'center' });
    const firstInput = host.querySelector?.('input:not([type="hidden"]),textarea,select');
    setTimeout(() => {
      try { firstInput?.focus?.({ preventScroll:true }); } catch {}
    }, 350);
    return true;
  }

  function installPurchaseGuard() {
    if (guardReady) return;
    guardReady = true;
    document.addEventListener('click', event => {
      if (!personalizationRequired) return;
      const button = nativeBuyButton(event.target);
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (!focusPersonalizer()) alert('Personalize esta caneca antes de comprar.');
    }, true);
  }

  async function resolvePurchaseRule() {
    if (!isProductPage()) return;
    const sku = skuFromPage();
    if (!sku) return;
    personalizationRequired = requiresPersonalization(await productBySku(sku) || {});
    if (!personalizationRequired) return;
    document.documentElement.dataset.cfPersonalizacaoObrigatoria = '1';
    relabelNativeBuyButtons();
    setTimeout(relabelNativeBuyButtons, 900);
  }

  function init() {
    loadBaseRuntimes();
    if (!isProductPage()) return;
    loadProductRuntimes();
    installPurchaseGuard();
    resolvePurchaseRule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

  console.info(`CanecaFácil · personalização estável · ${BUILD}`);
})();