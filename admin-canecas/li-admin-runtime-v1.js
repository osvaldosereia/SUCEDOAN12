(() => {
  'use strict';

  const BUILD = '20260829-li-admin-runtime-v2';
  const WEBHOOK = window.__CANECAS_ADMIN_CONFIG__?.makeWebhook || 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
  const FIREBASE_PRODUCTS = 'cedar-chemist-310801-default-rtdb.firebaseio.com/produtos/';
  const nativeFetch = window.fetch.bind(window);
  const text = value => String(value ?? '').trim();
  const isCommercialBrand = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === 'caneca facil';

  function decodeBase64Json(value) {
    const raw = text(value);
    if (!raw) return null;
    try {
      const bin = atob(raw);
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      return JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch (error) {
      console.warn('[LI Admin] Falha ao decodificar referência:', error);
      return null;
    }
  }

  function requestPayload(init = {}) {
    if (typeof init?.body !== 'string') return null;
    try { return JSON.parse(init.body); } catch { return null; }
  }

  function requestAction(input, init = {}) {
    const url = typeof input === 'string' ? input : text(input?.url);
    if (url !== WEBHOOK) return '';
    try {
      const outer = requestPayload(init);
      const payload = typeof outer?.payload === 'string' ? JSON.parse(outer.payload) : outer?.payload;
      return text(payload?.action);
    } catch { return ''; }
  }

  function sanitizeFirebaseProductWrite(input, init = {}) {
    const url = typeof input === 'string' ? input : text(input?.url);
    if (!url.includes(FIREBASE_PRODUCTS) || !['PATCH','PUT'].includes(String(init?.method || '').toUpperCase())) return init;
    const payload = requestPayload(init);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return init;
    let changed = false;
    const clean = { ...payload };
    if (isCommercialBrand(clean.fabricante)) { clean.fabricante = ''; changed = true; }
    if (clean.loja_integrada && typeof clean.loja_integrada === 'object' && isCommercialBrand(clean.loja_integrada.fabricante)) {
      clean.loja_integrada = { ...clean.loja_integrada, fabricante: '' };
      changed = true;
    }
    return changed ? { ...init, body: JSON.stringify(clean) } : init;
  }

  window.fetch = async function liAdminFetch(input, init) {
    let nextInit = sanitizeFirebaseProductWrite(input, init || {});
    const action = requestAction(input, nextInit);
    const response = await nativeFetch(input, nextInit);
    if (action !== 'loja_integrada_catalog_refs') return response;
    try {
      const data = await response.clone().json();
      if (!response.ok || data?.ok === false || (!data?.marcas_b64 && !data?.categorias_b64)) return response;
      const brands = decodeBase64Json(data.marcas_b64);
      const categories = decodeBase64Json(data.categorias_b64);
      const normalized = {
        ...data,
        marcas: Array.isArray(brands?.objects) ? brands.objects : [],
        categorias: Array.isArray(categories?.objects) ? categories.objects : [],
      };
      return new Response(JSON.stringify(normalized), {
        status: response.status,
        statusText: response.statusText,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      console.warn('[LI Admin] Resposta mantida sem transformação:', error);
      return response;
    }
  };

  // Caneca Fácil é a marca comercial. Como a operação é de revenda, o
  // fabricante físico não deve ser presumido como Caneca Fácil.
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-cf-mug]')) return;
    window.setTimeout(() => {
      const manufacturer = document.querySelector('#cfManufacturer');
      if (manufacturer && isCommercialBrand(manufacturer.value)) manufacturer.value = '';
      if (manufacturer) manufacturer.placeholder = 'Fabricante real da caneca, se conhecido';
      const label = manufacturer?.closest('label');
      if (label && !label.querySelector('[data-li-manufacturer-note]')) {
        const note = document.createElement('small');
        note.dataset.liManufacturerNote = '1';
        note.style.display = 'block';
        note.style.marginTop = '5px';
        note.textContent = 'Marca comercial: Caneca Fácil. Informe como fabricante somente o fabricante real do produto.';
        label.appendChild(note);
      }
    }, 0);
  }, true);

  window.__LI_ADMIN_POLICY__ = Object.freeze({
    build: BUILD,
    brand: 'Caneca Fácil',
    operation: 'revenda',
    origin: '0',
    ncmPorcelain: '69111090',
    ncmCeramicExceptPorcelain: '69120000',
  });
  document.documentElement.dataset.liAdminRuntime = BUILD;
})();
