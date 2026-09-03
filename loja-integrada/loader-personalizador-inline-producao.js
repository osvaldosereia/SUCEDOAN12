(() => {
  'use strict';

  const BUILD = '20260903-cf-inline-loader-prod-v12-native';
  const FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const CATALOG = 'https://raw.githubusercontent.com/osvaldosereia/SUCEDOAN12/main/site/canecas-galeria.json';
  const NATIVE_PERSONALIZER = 'https://donaantonia.com.br/loja-integrada/native-personalizer-inline-v1.js?v=20260903-1';
  const CART_BRIDGE_URL = 'https://donaantonia.com.br/loja-integrada/personalized-order-bridge-v2.js?v=20260902-4';
  const COMMERCE_URL = 'https://donaantonia.com.br/loja-integrada/canecafacil-commerce-runtime-v1.js?v=20260902-9';
  const PARAM = 'cf_personalizador';
  const ACTIVE_VALUE = 'teste';
  const DIAGNOSTIC_URL = 'https://donaantonia.com.br/loja-integrada/personalizador-inline-v2.js?v=20260901-4';

  if (window.__CF_INLINE_PROD_LOADER__ === BUILD) return;
  window.__CF_INLINE_PROD_LOADER__ = BUILD;

  const text = value => String(value ?? '').trim();
  let autoLoading = false;
  let catalogCache = null;

  function isProductPage() {
    return document.body?.classList?.contains('pagina-produto') || Boolean(document.querySelector('.produto, .acoes-produto, [itemprop="sku"]'));
  }

  function loadCartBridge() {
    if ([...document.scripts].some(s => /personalized-order-bridge-v2\.js/i.test(s.src || ''))) return;
    const script = document.createElement('script');
    script.src = CART_BRIDGE_URL;
    script.async = false;
    script.dataset.cfCartBridge = BUILD;
    script.onerror = () => console.error('[CanecaFácil] Falha ao carregar visual/vínculo do carrinho personalizado.');
    document.head.appendChild(script);
  }

  function loadCommerceRuntime() {
    if (window.__CF_COMMERCE_RUNTIME__ && /20260902-canecafacil-commerce-runtime-v3-retention/.test(String(window.__CF_COMMERCE_RUNTIME__))) return;
    if ([...document.scripts].some(s => /canecafacil-commerce-runtime-v1\.js/i.test(s.src || ''))) return;
    const script = document.createElement('script');
    script.src = COMMERCE_URL;
    script.async = true;
    script.dataset.cfCommerceRuntime = BUILD;
    script.onerror = () => console.error('[CanecaFácil] Falha ao carregar Minhas Canecas/carrinho personalizado.');
    document.head.appendChild(script);
  }

  function loadNativeRuntime() {
    if (window.CanecaFacilNativePersonalizer?.mount) return Promise.resolve(window.CanecaFacilNativePersonalizer);
    const existing = [...document.scripts].find(s => /native-personalizer-inline-v1\.js/i.test(s.src || ''));
    if (existing) {
      return new Promise(resolve => {
        if (window.CanecaFacilNativePersonalizer?.mount) return resolve(window.CanecaFacilNativePersonalizer);
        document.addEventListener('canecafacil:native-personalizer-ready', () => resolve(window.CanecaFacilNativePersonalizer), { once:true });
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = NATIVE_PERSONALIZER;
      script.async = false;
      script.dataset.cfNativePersonalizerLoader = BUILD;
      script.onload = () => resolve(window.CanecaFacilNativePersonalizer);
      script.onerror = () => reject(new Error('Falha ao carregar o personalizador nativo.'));
      document.head.appendChild(script);
    });
  }

  function skuFromPage() {
    const sources = [...document.querySelectorAll('[itemprop="sku"],[data-sku],.codigo-produto,.produto-codigo,.sku,[class*="codigo"]')];
    for (const el of sources) {
      const raw = text(el.getAttribute?.('content') || el.dataset?.sku || el.textContent).toUpperCase();
      const cf = raw.match(/CANP-[A-Z0-9]{3,24}/);
      if (cf) return cf[0];
      const cleaned = raw.replace(/^.*?(?:C[ÓO]DIGO|SKU)\s*[:#-]?\s*/i, '').trim().split(/\s+/)[0];
      if (/^[A-Z0-9._-]{3,40}$/.test(cleaned)) return cleaned;
    }
    const visible = text(document.body?.innerText).toUpperCase();
    return visible.match(/CANP-[A-Z0-9]{3,24}/)?.[0] || '';
  }

  async function fetchCatalog() {
    if (catalogCache) return catalogCache;
    const response = await fetch(`${CATALOG}?_=${Date.now()}`, { cache:'no-store', headers:{ Accept:'application/json' } });
    if (!response.ok) throw new Error(`Catálogo ${response.status}`);
    catalogCache = await response.json();
    return catalogCache || {};
  }

  async function catalogProductBySku(sku) {
    const wanted = text(sku).toUpperCase();
    if (!wanted) return null;
    const data = await fetchCatalog();
    for (const [key, value] of Object.entries(data || {})) {
      const code = text(value?.codigo || value?.sku).toUpperCase();
      if (code === wanted) return { __key:text(value?.firebaseKey || value?.id || key) || key, ...(value || {}) };
    }
    return null;
  }

  async function firebaseProductBySku(sku) {
    const url = new URL(`${FIREBASE}/produtos.json`);
    url.searchParams.set('orderBy', JSON.stringify('codigo'));
    url.searchParams.set('equalTo', JSON.stringify(sku));
    url.searchParams.set('_', Date.now());
    const response = await fetch(url, { cache:'no-store', headers:{ Accept:'application/json' } });
    if (!response.ok) throw new Error(`Firebase ${response.status}`);
    const data = await response.json();
    const rows = Object.entries(data || {}).map(([key,value]) => ({ __key:key, ...(value || {}) }));
    return rows[0] || null;
  }

  async function fullProduct(modelKey, fallback = {}) {
    if (!modelKey) return fallback;
    try {
      const response = await fetch(`${FIREBASE}/produtos/${encodeURIComponent(modelKey)}.json?_=${Date.now()}`, { cache:'no-store', headers:{ Accept:'application/json' } });
      if (response.ok) {
        const data = await response.json();
        if (data) return { __key:modelKey, ...data };
      }
    } catch (_) {}
    return { __key:modelKey, ...(fallback || {}) };
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
    return [...document.querySelectorAll('a,button')].find(node => /personalizar\s+esta\s+caneca/i.test(text(node.textContent))) || null;
  }

  function modelFromOldButton(button) {
    if (!button) return '';
    const href = text(button.getAttribute?.('href'));
    if (!href || href === '#') return '';
    try {
      const url = new URL(href, location.href);
      return text(url.searchParams.get('model') || url.searchParams.get('modelo'));
    } catch { return ''; }
  }

  function nativeProductionForm() {
    return document.querySelector('[data-cf-native-personalizer="1"], .cf-native-personalizer');
  }

  function legacyProductionFrame() {
    return document.querySelector('.cf-personalizer-box iframe[src*="/loja-integrada/personalizar/"], iframe[title="Personalizar esta caneca"][src*="/loja-integrada/personalizar/"]');
  }

  function removeLegacyFrame() {
    const frame = legacyProductionFrame();
    if (!frame) return;
    const box = frame.closest('.cf-personalizer-box');
    if (box) box.remove();
    else frame.remove();
  }

  function insertionAnchor(old) {
    if (old) return { node:old, mode:'before', old };
    const quantity = document.querySelector('.acoes-produto .quantidade, .acoes-produto [class*="quantidade"]');
    if (quantity) return { node:quantity, mode:'before', old:null };
    const buy = document.querySelector('.acoes-produto .comprar, .acoes-produto [class*="comprar"], form.comprar');
    if (buy) return { node:buy, mode:'before', old:null };
    const actions = document.querySelector('.acoes-produto');
    return actions ? { node:actions, mode:'append', old:null } : null;
  }

  function injectPersonalizer(product, old = null, force = false) {
    if (nativeProductionForm() || document.querySelector('[data-cf-auto-personalizer]')) return true;
    removeLegacyFrame();

    const modelKey = text(product?.__key || product?.firebaseKey || product?.id);
    if (!modelKey) return false;
    if (!force && !isPersonalizable(product)) return false;
    const anchor = insertionAnchor(old);
    if (!anchor) return false;

    const returnUrl = new URL(location.href);
    returnUrl.searchParams.delete('model');
    returnUrl.searchParams.delete('creation');
    returnUrl.searchParams.delete('return');
    returnUrl.hash = '';

    const box = document.createElement('div');
    box.className = 'cf-personalizer-box cf-native-personalizer-host';
    box.dataset.cfAutoPersonalizer = BUILD;
    box.dataset.modelId = modelKey;
    box.style.cssText = 'display:block;width:100%;margin:14px 0 20px;padding:0;border:0;background:transparent;text-align:left;overflow:visible';

    if (anchor.mode === 'append') anchor.node.appendChild(box);
    else anchor.node.parentNode?.insertBefore(box, anchor.node);
    if (anchor.old) anchor.old.style.setProperty('display','none','important');

    loadNativeRuntime()
      .then(api => api?.mount?.(box, { modelId:modelKey, returnUrl:returnUrl.href, product }))
      .catch(error => {
        box.innerHTML = '<div style="padding:16px;background:#fff5f2;border:1px solid #f0d5cd;border-radius:10px;color:#8c3b2f">Não foi possível carregar o personalizador. Atualize a página e tente novamente.</div>';
        console.error('[CanecaFácil] personalizador nativo:', error);
      });
    return true;
  }

  async function resolveProduct() {
    const old = oldPersonalizeButton();
    const sku = skuFromPage();
    if (old) {
      const buttonModel = modelFromOldButton(old);
      if (buttonModel) return { product:await fullProduct(buttonModel, { codigo:sku }), old, force:true };
      if (sku) {
        const catalog = await catalogProductBySku(sku).catch(() => null);
        if (catalog?.__key) return { product:await fullProduct(catalog.__key, catalog), old, force:true };
      }
    }
    if (!sku) return { product:null, old, force:false };
    const firebase = await firebaseProductBySku(sku).catch(() => null);
    if (firebase) return { product:firebase, old, force:false };
    const catalog = await catalogProductBySku(sku).catch(() => null);
    if (!catalog) return { product:null, old, force:false };
    return { product:await fullProduct(catalog.__key, catalog), old, force:false };
  }

  async function ensurePersonalizer() {
    if (!isProductPage() || autoLoading || nativeProductionForm()) return;
    autoLoading = true;
    try {
      removeLegacyFrame();
      const resolved = await resolveProduct();
      if (!resolved.product) return;
      injectPersonalizer(resolved.product, resolved.old, resolved.force);
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
    loadCartBridge();
    loadCommerceRuntime();
    ensurePersonalizer();
    if (new URLSearchParams(location.search).get(PARAM) === ACTIVE_VALUE) loadDiagnostic();
    setTimeout(ensurePersonalizer, 350);
    setTimeout(ensurePersonalizer, 1000);
    setTimeout(ensurePersonalizer, 2200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();

  console.info(`CanecaFácil · loader produção ${BUILD}`);
})();