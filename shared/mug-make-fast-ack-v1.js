(() => {
  'use strict';

  const BUILD = '20260826-mug-make-fast-ack-v1';
  const ACK_AFTER_MS = 10000;
  if (window.__DA_MUG_MAKE_FAST_ACK__ === BUILD) return;
  window.__DA_MUG_MAKE_FAST_ACK__ = BUILD;

  const nativeFetch = window.fetch.bind(window);

  function finalizePayload(input, init) {
    const method = String(init?.method || (input && typeof input === 'object' ? input.method : '') || 'GET').toUpperCase();
    if (method !== 'POST') return null;
    const body = init?.body;
    if (typeof body !== 'string' || !body.includes('finalize_mug_product')) return null;
    try {
      const outer = JSON.parse(body);
      const inner = typeof outer?.payload === 'string' ? JSON.parse(outer.payload) : outer?.payload;
      return inner?.action === 'finalize_mug_product' && inner?.request_id ? inner : null;
    } catch {
      return null;
    }
  }

  window.fetch = function(input, init) {
    const payload = finalizePayload(input, init);
    if (!payload) return nativeFetch(input, init);

    let settled = false;
    const request = nativeFetch(input, init).then(response => {
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
})();
