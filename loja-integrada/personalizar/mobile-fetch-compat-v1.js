(() => {
  'use strict';

  if (window.__CF_MOBILE_FETCH_COMPAT__) return;
  window.__CF_MOBILE_FETCH_COMPAT__ = '20260902-1';

  const nativeFetch = window.fetch.bind(window);
  const MAKE_HOST = 'hook.eu1.make.com';

  function isMakeWebhook(input) {
    try {
      const value = typeof input === 'string' ? input : (input && input.url) || '';
      return new URL(value, location.href).hostname.toLowerCase() === MAKE_HOST;
    } catch (_) { return false; }
  }

  function isMobileLike() {
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean') {
      return navigator.userAgentData.mobile;
    }
    return /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent || '') ||
      (matchMedia && matchMedia('(pointer:coarse)').matches && innerWidth < 900);
  }

  function payloadFromOptions(options = {}) {
    const body = options.body;
    if (typeof body !== 'string' || !body) return '';
    try {
      const parsed = JSON.parse(body);
      return typeof parsed.payload === 'string' ? parsed.payload : '';
    } catch (_) { return ''; }
  }

  function formOptions(options = {}) {
    const payload = payloadFromOptions(options);
    if (!payload) return null;
    const form = new FormData();
    form.append('payload', payload);
    return {
      method: options.method || 'POST',
      body: form,
      cache: 'no-store',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow'
    };
  }

  async function sendFormFallback(input, options) {
    const next = formOptions(options);
    if (!next) throw new TypeError('Failed to fetch');
    return nativeFetch(input, next);
  }

  window.fetch = async function cfFetch(input, options = {}) {
    if (!isMakeWebhook(input) || String(options.method || 'GET').toUpperCase() !== 'POST') {
      return nativeFetch(input, options);
    }

    const simple = formOptions(options);

    if (isMobileLike() && simple) {
      try {
        return await nativeFetch(input, simple);
      } catch (mobileError) {
        console.warn('[CanecaFácil] Envio simples mobile falhou; tentando JSON.', mobileError?.message || mobileError);
        return nativeFetch(input, options);
      }
    }

    try {
      return await nativeFetch(input, options);
    } catch (error) {
      if (!simple) throw error;
      console.warn('[CanecaFácil] Envio JSON falhou; tentando modo compatível.', error?.message || error);
      return sendFormFallback(input, options);
    }
  };

  console.info('CanecaFácil · compatibilidade de rede mobile ativa');
})();