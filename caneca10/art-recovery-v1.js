(() => {
  'use strict';

  const BUILD = '20260827-caneca10-art-recovery-v1';
  const FIREBASE_URL = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const RESULT_NODE = 'canecas/geracoes';
  const WAIT_MS = 180000;
  const POLL_MS = 1800;

  if (window.__DA_CANECA10_ART_RECOVERY__ === BUILD) return;
  window.__DA_CANECA10_ART_RECOVERY__ = BUILD;

  const nativeFetch = window.fetch.bind(window);
  const text = value => String(value ?? '').trim();
  const sleep = ms => new Promise(resolve => window.setTimeout(resolve, ms));

  function generatePayload(init) {
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
    const nested = record.result && typeof record.result === 'object' ? record.result : {};
    const data = record.data && typeof record.data === 'object' ? record.data : {};
    const value = text(
      record.art_source_url || record.art_url || record.result_url || record.arte_horizontal_url || record.arte_horizontal || record.arte_url ||
      record.art_source_base64 || record.art_base64 || record.image_base64 || record.b64_json ||
      nested.art_source_url || nested.art_url || nested.result_url || nested.art_source_base64 || nested.b64_json ||
      data.art_source_url || data.art_url || data.result_url || data.art_source_base64 || data.b64_json
    );
    if (!value) return '';
    if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value)) return value;
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 1000) return `data:image/png;base64,${value.replace(/\s+/g, '')}`;
    return '';
  }

  function recordError(record) {
    if (!record || typeof record !== 'object') return '';
    return text(record.error || record.erro || record.message || (record.ok === false ? 'A geração da arte falhou no Make.' : ''));
  }

  function updateProgress(elapsed) {
    const card = document.getElementById('progressCard');
    const title = document.getElementById('progressTitle');
    const detail = document.getElementById('progressDetail');
    const percent = document.getElementById('progressPercent');
    const bar = document.getElementById('progressBar');
    if (card) card.hidden = false;
    if (title) title.textContent = 'Recuperando a arte do Make';
    if (detail) detail.textContent = `A conexão síncrona encerrou, mas o Make continua gerando. Acompanhando pelo Firebase… ${elapsed}s`;
    if (percent) percent.textContent = '33%';
    if (bar) bar.style.width = '33%';
  }

  async function deleteTemporary(id) {
    try {
      await nativeFetch(`${FIREBASE_URL}/${RESULT_NODE}/${encodeURIComponent(id)}.json`, { method: 'DELETE' });
    } catch {}
  }

  async function waitForArt(payload) {
    const id = text(payload?.request_id);
    if (!id) throw new Error('A geração ficou assíncrona sem código de acompanhamento.');
    const started = Date.now();
    const deadline = started + WAIT_MS;

    while (Date.now() < deadline) {
      updateProgress(Math.max(1, Math.round((Date.now() - started) / 1000)));
      try {
        const response = await nativeFetch(`${FIREBASE_URL}/${RESULT_NODE}/${encodeURIComponent(id)}.json?_=${Date.now()}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (response.ok) {
          const record = await response.json();
          const error = recordError(record);
          if (error) throw new Error(error);
          const source = imageSource(record);
          if (source) {
            window.setTimeout(() => deleteTemporary(id), 5000);
            return new Response(JSON.stringify({
              ok: true,
              action: 'generate_mug_art',
              request_id: id,
              art_source_url: /^https?:\/\//i.test(source) ? source : '',
              art_source_base64: /^data:image\//i.test(source) ? source : '',
              async_recovered: true,
            }), {
              status: 200,
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'X-DA-Caneca10-Art-Recovered': '1',
              },
            });
          }
        }
      } catch (error) {
        const message = text(error?.message || error);
        if (message && !/Firebase|Failed to fetch|NetworkError|Load failed/i.test(message)) throw error;
        console.debug('[Caneca10] aguardando arte temporária no Firebase:', message);
      }
      await sleep(POLL_MS);
    }

    throw new Error('O Make continuou a geração, mas a arte intermediária não apareceu no Firebase em até 3 minutos. Confira a rota generate_mug_art do cenário atual.');
  }

  window.fetch = async function(input, init) {
    const payload = generatePayload(init);
    if (!payload) return nativeFetch(input, init);

    try {
      const response = await nativeFetch(input, init);
      if (!response.ok) return response;
      const raw = await response.clone().text().catch(() => '');
      if (!/^accepted\.?$/i.test(text(raw))) return response;
      console.info(`[Caneca10] Make respondeu Accepted para ${payload.request_id}; recuperando arte pelo Firebase.`);
      return waitForArt(payload);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      console.info(`[Caneca10] conexão síncrona encerrou em generate_mug_art (${error?.message || error}); acompanhando ${payload.request_id} pelo Firebase.`);
      return waitForArt(payload);
    }
  };

  document.documentElement.dataset.caneca10ArtRecovery = BUILD;
})();
