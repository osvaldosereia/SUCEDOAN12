(() => {
  'use strict';

  const BUILD = '20260827-mug-make-low-transport-v2';
  const ACK_AFTER_MS = 10000;
  const MUG_ACTIONS = new Set(['generate_mug_art', 'finalize_mug_product', 'personalize_mug_model']);
  if (window.__DA_MUG_MAKE_FAST_ACK__ === BUILD) return;
  window.__DA_MUG_MAKE_FAST_ACK__ = BUILD;

  const nativeFetch = window.fetch.bind(window);

  function parseMugRequest(input, init) {
    const method = String(init?.method || (input && typeof input === 'object' ? input.method : '') || 'GET').toUpperCase();
    if (method !== 'POST') return null;
    const body = init?.body;
    if (typeof body !== 'string') return null;
    try {
      const outer = JSON.parse(body);
      const inner = typeof outer?.payload === 'string' ? JSON.parse(outer.payload) : outer?.payload;
      if (!inner || !MUG_ACTIONS.has(String(inner.action || '')) || !inner.request_id) return null;
      inner.quality = 'low';
      const nextOuter = { ...outer, payload: typeof outer?.payload === 'string' ? JSON.stringify(inner) : inner };
      return {
        payload: inner,
        init: { ...init, body: JSON.stringify(nextOuter) },
      };
    } catch {
      return null;
    }
  }

  window.fetch = function(input, init) {
    const mug = parseMugRequest(input, init);
    if (!mug) return nativeFetch(input, init);

    const { payload, init: lowInit } = mug;
    if (payload.action !== 'finalize_mug_product') return nativeFetch(input, lowInit);

    let settled = false;
    const request = nativeFetch(input, lowInit).then(response => {
      settled = true;
      return response;
    }).catch(error => {
      settled = true;
      throw error;
    });

    const earlyAck = new Promise(resolve => {
      window.setTimeout(() => {
        if (settled) return;
        console.info(`[Canecas] Make ainda processando ${payload.request_id}; acompanhamento passa ao Firebase.`);
        resolve(new Response('Accepted', {
          status: 202,
          statusText: 'Accepted',
          headers: { 'Content-Type':'text/plain; charset=utf-8', 'X-DA-Mug-Async':'1' }
        }));
      }, ACK_AFTER_MS);
    });

    request.catch(error => console.debug('[Canecas] resposta tardia do Make:', error?.message || error));
    return Promise.race([request, earlyAck]);
  };

  document.documentElement.dataset.mugMakeTransport = BUILD;
  document.documentElement.dataset.mugImageQuality = 'low';
})();
