(() => {
  'use strict';

  const BUILD = '20260903-2-async-recovery';
  if (window.__CF_MOBILE_FETCH_COMPAT__ === BUILD) return;
  window.__CF_MOBILE_FETCH_COMPAT__ = BUILD;

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

  function payloadAction(options = {}) {
    try {
      const raw = payloadFromOptions(options);
      if (!raw) return '';
      return String(JSON.parse(raw)?.action || '').trim();
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

  function syntheticAccepted(reason = '') {
    console.warn('[CanecaFácil] A resposta HTTP do Make foi perdida; a criação seguirá pelo Firebase.', reason);
    return new Response('Accepted', {
      status: 202,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-CF-Make-Recovered': '1'
      }
    });
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
    const action = payloadAction(options);
    const recoverAsync = action === 'personalize_mug_model';

    if (isMobileLike() && simple) {
      try {
        return await nativeFetch(input, simple);
      } catch (mobileError) {
        console.warn('[CanecaFácil] Envio simples mobile falhou; tentando JSON.', mobileError?.message || mobileError);
        try {
          return await nativeFetch(input, options);
        } catch (jsonError) {
          if (recoverAsync) return syntheticAccepted(jsonError?.message || jsonError);
          throw jsonError;
        }
      }
    }

    try {
      return await nativeFetch(input, options);
    } catch (error) {
      if (!simple) {
        if (recoverAsync) return syntheticAccepted(error?.message || error);
        throw error;
      }
      console.warn('[CanecaFácil] Envio JSON falhou; tentando modo compatível.', error?.message || error);
      try {
        return await sendFormFallback(input, options);
      } catch (fallbackError) {
        if (recoverAsync) return syntheticAccepted(fallbackError?.message || fallbackError);
        throw fallbackError;
      }
    }
  };

  console.info(`CanecaFácil · compatibilidade de rede mobile ativa · ${BUILD}`);
})();