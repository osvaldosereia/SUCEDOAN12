(() => {
  'use strict';

  const BUILD = '20260901-admin-canecas-generator-recovery-v1';
  const FIREBASE_BASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const RESULT_NODE = 'canecas/geracoes';
  const WAIT_MS = 180000;
  const POLL_MS = 1800;

  if (window.__CF_ADMIN_MUG_ART_RECOVERY__ === BUILD) return;

  const text = value => String(value ?? '').trim();
  const sleep = ms => new Promise(resolve => window.setTimeout(resolve, ms));

  function extractPayload(init) {
    if (String(init?.method || 'GET').toUpperCase() !== 'POST') return null;
    if (typeof init?.body !== 'string' || !init.body.includes('generate_mug_art')) return null;
    try {
      const outer = JSON.parse(init.body);
      const inner = typeof outer?.payload === 'string' ? JSON.parse(outer.payload) : outer?.payload;
      return inner?.action === 'generate_mug_art' && inner?.request_id ? inner : null;
    } catch {
      return null;
    }
  }

  function imageSource(record) {
    if (!record || typeof record !== 'object') return '';
    const value = text(record.art_source_url || record.art_url || record.arte_url || record.art_source_base64 || record.art_base64 || record.image_base64);
    if (!value) return '';
    if (/^https?:\/\//i.test(value) || /^data:image\/(?:png|jpe?g|webp);base64,/i.test(value)) return value;
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 1000) return `data:image/webp;base64,${value.replace(/\s+/g, '')}`;
    return '';
  }

  function progress(message) {
    const status = document.querySelector('#mugAutomationStatus');
    const title = document.querySelector('#mugProgressTitle');
    if (status) status.textContent = message;
    if (title) title.textContent = 'Recuperando arte do Make';
  }

  async function cleanup(fetchFn, id) {
    try { await fetchFn(`${FIREBASE_BASE}/${RESULT_NODE}/${encodeURIComponent(id)}.json`, { method: 'DELETE' }); } catch {}
  }

  async function waitForArt(fetchFn, id) {
    const started = Date.now();
    const deadline = started + WAIT_MS;
    while (Date.now() < deadline) {
      const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
      progress(`O Make continua processando. Recuperando a arte pelo Firebase… ${seconds}s`);
      try {
        const response = await fetchFn(`${FIREBASE_BASE}/${RESULT_NODE}/${encodeURIComponent(id)}.json?_=${Date.now()}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (response.ok) {
          const record = await response.json();
          if (record?.ok === false) throw new Error(text(record.error || record.message) || 'A geração da arte falhou no Make.');
          const source = imageSource(record);
          if (source) {
            window.setTimeout(() => cleanup(fetchFn, id), 10000);
            return new Response(JSON.stringify({
              ok: true,
              action: 'generate_mug_art',
              request_id: id,
              art_source_url: source,
              art_source_base64: /^data:image\//i.test(source) ? source : '',
              async_recovered: true,
              engine: text(record.engine || 'firebase-recovery'),
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-CanecaFacil-Art-Recovered': '1' },
            });
          }
        }
      } catch (error) {
        const message = text(error?.message || error);
        if (message && !/Firebase|Failed to fetch|NetworkError|Load failed|fetch/i.test(message)) throw error;
      }
      await sleep(POLL_MS);
    }
    throw new Error('A arte não apareceu no Firebase em até 3 minutos. Confira a execução da rota generate_mug_art no Make.');
  }

  function install() {
    if (window.__CF_ADMIN_MUG_ART_RECOVERY__ === BUILD) return;
    const innerFetch = window.fetch.bind(window);
    window.fetch = async function cfAdminMugRecoveryFetch(input, init = {}) {
      const payload = extractPayload(init);
      if (!payload) return innerFetch(input, init);
      try {
        const response = await innerFetch(input, init);
        if (!response.ok) return response;
        const raw = await response.clone().text().catch(() => '');
        if (raw) {
          try {
            const data = JSON.parse(raw);
            if (imageSource(data)) return response;
          } catch {}
        }
        if (!raw || /^accepted\.?$/i.test(text(raw))) return waitForArt(innerFetch, text(payload.request_id));
        return response;
      } catch (error) {
        console.warn('[Admin Canecas] retorno síncrono do Make encerrou; tentando recuperação no Firebase.', error);
        return waitForArt(innerFetch, text(payload.request_id));
      }
    };
    window.__CF_ADMIN_MUG_ART_RECOVERY__ = BUILD;
    document.documentElement.dataset.cfAdminMugArtRecovery = BUILD;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => window.setTimeout(install, 50), { once: true });
  else window.setTimeout(install, 50);
})();
