(() => {
  'use strict';

  const BUILD = '20260902-cf-inline-loader-prod-v5-auto';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const PERSONALIZER = 'https://donaantonia.com.br/loja-integrada/personalizar/';
  const COMMERCE_URL = 'https://donaantonia.com.br/loja-integrada/canecafacil-commerce-runtime-v1.js?v=20260902-2';
  const PARAM = 'cf_personalizador';
  const ACTIVE_VALUE = 'teste';
  const DIAGNOSTIC_URL = 'https://donaantonia.com.br/loja-integrada/personalizador-inline-v2.js?v=20260901-4';

  if (window.__CF_INLINE_PROD_LOADER__ === BUILD) return;
  window.__CF_INLINE_PROD_LOADER__ = BUILD;

  const text = value => String(value ?? '').trim();
  let autoLoading = false;

  function isProductPage() {
    return document.body?.classList?.contains('pagina-produto') || Boolean(document.querySelector('.produto, .acoes-produto, [itemprop="sku"]'));
  }

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

  function skuFromPage() {
    const selectors = ['[itemprop="sku"]','[data-sku]','.codigo-produto','.produto-codigo','.sku','[class*="codigo"]'];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const raw = text(el.getAttribute?.('content') || el.dataset?.sku || el.textContent);
        const cleaned = raw.replace(/^.*?(?:c[oó]digo|sku)\s*[:#-]?\s*/i, '').trim().split(/\s+/)[0];
        if (/^[A-Za-z0-9._-]{3,40}$/.test(cleaned)) return cleaned;
      }
    }
    return '';
  }

  async function findProductBySku(sku) {
    const url = new URL(`${FIREBASE}/produtos.json`);
    url.searchParams.set('orderBy', JSON.stringify('codigo'));
    url.searchParams.set('equalTo', JSON.stringify(sku));
    url.searchParams.set('_', Date.now());
    const response = await fetch(url, { cache:'no-store', headers:{ Accept:'application/json' } });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    const data = await response.json();
    const rows = Object.entries(data || {}).map(([key,value]) => ({ __key:key, ...(value || {}) }));
    return rows.length === 1 ? rows[0] : null;
  }

  function isPersonalizable(product = {}) {
    const raw = product.personalizacao && typeof product.personalizacao === 'object' ? product.personalizacao : {};
    const enabled = product.personalizavel === true || product.loja_integrada_personalizavel === true || product.canecafacil_personalizavel === true || product.personalizacao_publica === true || raw.ativa === true;
    const fieldsRaw = raw.campos || product.personalizacao_campos || product.campos_personalizacao || product.campos_publicos || product.canecafacil_campos || {};
    const fields = Array.isArray(fieldsRaw)
      ? fieldsRaw.filter(item => item && item.ativo !== false)
      : Object.values(fieldsRaw || {}).filter(item => item && item.ativo === true);
    return enabled && fields.length > 0;
  }

  function oldPersonalizeButton() {
    const nodes = [...document.querySelectorAll('a,button')];
    return nodes.find(node => /personalizar\s+esta\s+caneca/i.test(text(node.textContent))) || null;
  }

  function existingProductionForm() {
    return document.querySelector('.cf-personalizer-box iframe[src*="/loja-integrada/personalizar/"], iframe[title="Personalizar esta caneca"][src*="/loja-integrada/personalizar/"]');
  }

  function insertionAnchor() {
    const old = oldPersonalizeButton();
    if (old) return { node:old, mode:'before', old };
    const quantity = document.querySelector('.acoes-produto .quantidade, .acoes-produto [class*="quantidade"]');
    if (quantity) return { node:quantity, mode:'before', old:null };
    const buy = document.querySelector('.acoes-produto .comprar, .acoes-produto [class*="comprar"], form.comprar');
    if (buy) return { node:buy, mode:'before', old:null };
    const actions = document.querySelector('.acoes-produto');
    return actions ? { node:actions, mode:'append', old:null } : null;
  }

  function injectPersonalizer(product) {
    if (existingProductionForm() || document.querySelector('[data-cf-auto-personalizer]')) return true;
    const anchor = insertionAnchor();
    if (!anchor) return false;

    const fieldsRaw = product.personalizacao?.campos || product.personalizacao_campos || product.campos_personalizacao || product.campos_publicos || product.canecafacil_campos || {};
    const fieldCount = Array.isArray(fieldsRaw)
      ? fieldsRaw.filter(item => item && item.ativo !== false).length
      : Object.values(fieldsRaw || {}).filter(item => item && item.ativo === true).length;
    const height = Math.min(680, Math.max(345, 250 + (fieldCount + 1) * 52));
    const returnUrl = new URL(location.href); returnUrl.search = ''; returnUrl.hash = '';
    const frameUrl = new URL(PERSONALIZER);
    frameUrl.searchParams.set('model', product.__key);
    frameUrl.searchParams.set('embed', '1');
    frameUrl.searchParams.set('return', returnUrl.href);

    const box = document.createElement('div');
    box.className = 'cf-personalizer-box';
    box.dataset.cfAutoPersonalizer = BUILD;
    box.style.cssText = 'margin:12px 0 18px;padding:0;border:1px solid #ece8e4;border-radius:12px;overflow:hidden;background:#fff;text-align:left';
    const iframe = document.createElement('iframe');
    iframe.title = 'Personalizar esta caneca';
    iframe.src = frameUrl.href;
    iframe.loading = 'eager';
    iframe.setAttribute('allow','clipboard-write');
    iframe.style.cssText = `display:block;width:100%;height:${height}px;margin:0;border:0;background:#fff`;
    box.appendChild(iframe);

    if (anchor.mode === 'append') anchor.node.appendChild(box);
    else anchor.node.parentNode?.insertBefore(box, anchor.node);
    if (anchor.old) anchor.old.style.setProperty('display','none','important');
    return true;
  }

  async function ensurePersonalizer() {
    if (!isProductPage() || autoLoading || existingProductionForm() || document.querySelector('[data-cf-auto-personalizer]')) return;
    autoLoading = true;
    try {
      const sku = skuFromPage();
      if (!sku) return;
      const product = await findProductBySku(sku);
      if (!product || !isPersonalizable(product)) return;
      injectPersonalizer(product);
    } catch (error) {
      console.debug('[CanecaFácil] personalizador automático:', error?.message || error);
    } finally {
      autoLoading = false;
    }
  }

  function loadDiagnostic() {
    if (!isProductPage() || [...document.scripts].some(s => /personalizador-inline-v2\.js/i.test(s.src || ''))) return;
    const script = document.createElement('script');
    script.src = DIAGNOSTIC_URL;
    script.async = true;
    script.onerror = () => console.error('[CanecaFácil] Falha ao carregar diagnóstico do personalizador.');
    document.head.appendChild(script);
  }

  function init() {
    loadCommerceRuntime();
    ensurePersonalizer();
    if (new URLSearchParams(location.search).get(PARAM) === ACTIVE_VALUE) loadDiagnostic();
    setTimeout(ensurePersonalizer, 500);
    setTimeout(ensurePersonalizer, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

  console.info(`CanecaFácil · loader produção ${BUILD}`);
})();