(() => {
  'use strict';

  const BUILD = '20260827-mug-art-recovery-v22';
  const STORAGE_KEY = 'da_admin_v2_config';
  const DEFAULT_FIREBASE = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const RESULT_NODE = 'canecas/geracoes';
  const WAIT_MS = 180000;
  const POLL_MS = 1800;

  if (window.__DA_MUG_ART_RECOVERY__ === BUILD) return;
  window.__DA_MUG_ART_RECOVERY__ = BUILD;

  const nativeFetch = window.fetch.bind(window);

  function text(value) {
    return String(value ?? '').trim();
  }

  function firebaseBase() {
    try {
      const config = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return text(config.firebaseUrl || DEFAULT_FIREBASE).replace(/\/+$/, '');
    } catch {
      return DEFAULT_FIREBASE;
    }
  }

  function generatePayload(init) {
    if (String(init?.method || 'GET').toUpperCase() !== 'POST') return null;
    const body = init?.body;
    if (typeof body !== 'string' || !body.includes('generate_mug_art')) return null;
    try {
      const outer = JSON.parse(body);
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

  function errorFromRecord(record) {
    if (!record || typeof record !== 'object') return '';
    return text(record.error || record.erro || record.message || (record.ok === false ? 'A geração da arte falhou no Make.' : ''));
  }

  async function deleteResult(id) {
    try {
      await nativeFetch(`${firebaseBase()}/${RESULT_NODE}/${encodeURIComponent(id)}.json`, { method: 'DELETE' });
    } catch {}
  }

  async function waitForArt(payload) {
    const id = text(payload?.request_id);
    if (!id) throw new Error('A geração ficou assíncrona sem código de acompanhamento.');
    const started = Date.now();
    const deadline = started + WAIT_MS;
    const status = document.getElementById('mugAutomationStatus');

    while (Date.now() < deadline) {
      const elapsed = Math.max(1, Math.round((Date.now() - started) / 1000));
      if (status) status.textContent = `2/6 · O Make continua gerando. Recuperando a arte pelo Firebase… ${elapsed}s`;
      try {
        const response = await nativeFetch(`${firebaseBase()}/${RESULT_NODE}/${encodeURIComponent(id)}.json?_=${Date.now()}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (response.ok) {
          const record = await response.json();
          const error = errorFromRecord(record);
          if (error) throw new Error(error);
          const source = imageSource(record);
          if (source) {
            window.setTimeout(() => deleteResult(id), 5000);
            return new Response(JSON.stringify({
              ok: true,
              action: 'generate_mug_art',
              request_id: id,
              art_source_url: /^https?:\/\//i.test(source) ? source : '',
              art_source_base64: /^data:image\//i.test(source) ? source : '',
              async_recovered: true,
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-DA-Mug-Art-Recovered': '1' },
            });
          }
        }
      } catch (error) {
        if (errorFromRecord({ error: error?.message }) && !/Firebase|Failed to fetch|NetworkError/i.test(error?.message || '')) throw error;
        console.debug('[Canecas] aguardando arte temporária no Firebase:', error?.message || error);
      }
      await new Promise(resolve => window.setTimeout(resolve, POLL_MS));
    }

    throw new Error('O Make continuou a geração, mas a arte intermediária não foi gravada no Firebase em até 3 minutos. Confira o módulo “Salvar arte temporária” da rota generate_mug_art.');
  }

  window.fetch = async function(input, init) {
    const payload = generatePayload(init);
    if (!payload) return nativeFetch(input, init);

    try {
      const response = await nativeFetch(input, init);
      if (!response.ok) return response;
      const probe = response.clone();
      const raw = await probe.text().catch(() => '');
      if (!/^accepted\.?$/i.test(text(raw))) return response;
      console.info(`[Canecas] Make respondeu Accepted para ${payload.request_id}; acompanhando arte pelo Firebase.`);
      return waitForArt(payload);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      console.info(`[Canecas] conexão síncrona do Make encerrou em generate_mug_art (${error?.message || error}); acompanhando ${payload.request_id} pelo Firebase.`);
      return waitForArt(payload);
    }
  };

  document.documentElement.dataset.mugArtRecovery = BUILD;
})();
