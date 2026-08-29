(() => {
  'use strict';

  const BUILD = '20260829-li-admin-runtime-v1';
  const WEBHOOK = window.__CANECAS_ADMIN_CONFIG__?.makeWebhook || 'https://hook.eu1.make.com/cl3r1f56r9txezvltkkwlsspmnja6sw4';
  const nativeFetch = window.fetch.bind(window);
  const text = value => String(value ?? '').trim();

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

  function requestAction(input, init = {}) {
    const url = typeof input === 'string' ? input : text(input?.url);
    if (url !== WEBHOOK || typeof init?.body !== 'string') return '';
    try {
      const outer = JSON.parse(init.body);
      const payload = typeof outer?.payload === 'string' ? JSON.parse(outer.payload) : outer?.payload;
      return text(payload?.action);
    } catch { return ''; }
  }

  window.fetch = async function liAdminFetch(input, init) {
    const action = requestAction(input, init || {});
    const response = await nativeFetch(input, init);
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
      if (manufacturer && text(manufacturer.value).toLowerCase() === 'caneca fácil') manufacturer.value = '';
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
