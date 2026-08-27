(() => {
  'use strict';

  const BUILD = '20260827-mug-public-contract-v25';
  const FIREBASE_URL = 'https://cedar-chemist-310801-default-rtdb.firebaseio.com';
  const RESULT_NODE = 'canecas/geracoes';
  const WAIT_MS = 180000;
  const POLL_MS = 1800;

  if (window.__DA_MUG_PUBLIC_CONTRACT__ === BUILD) return;
  window.__DA_MUG_PUBLIC_CONTRACT__ = BUILD;

  // O runtime carrega este módulo depois do transporte LOW compartilhado.
  // Portanto transportFetch preserva a trava LOW e o ACK da finalização.
  const transportFetch = window.fetch.bind(window);
  const text = value => String(value ?? '').trim();
  const sleep = ms => new Promise(resolve => window.setTimeout(resolve, ms));

  function parseRequest(init) {
    const method = String(init?.method || 'GET').toUpperCase();
    if (method !== 'POST' || typeof init?.body !== 'string') return null;
    try {
      const outer = JSON.parse(init.body);
      const payload = typeof outer?.payload === 'string' ? JSON.parse(outer.payload) : outer?.payload;
      if (!payload || payload.action !== 'personalize_mug_model' || !payload.request_id) return null;
      return { outer, payload };
    } catch {
      return null;
    }
  }

  function firstCustomerPhoto(payload) {
    try {
      const raw = payload?.images_json;
      const photos = Array.isArray(raw) ? raw : JSON.parse(text(raw) || '[]');
      if (!Array.isArray(photos)) return '';
      for (const item of photos) {
        const source = text(item?.image_base64 || item?.base64 || item?.data);
        if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(source)) return source;
      }
    } catch {}
    return '';
  }

  function modelArt(product) {
    return text(
      product?.arte_horizontal ||
      product?.arte_horizontal_url ||
      product?.arte_personalizacao ||
      product?.art_source_public_url ||
      product?.arte_impressao?.url ||
      product?.url_arte
    );
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(text(reader.result));
      reader.onerror = () => reject(new Error('Não foi possível preparar a imagem-base do modelo.'));
      reader.readAsDataURL(blob);
    });
  }

  async function fallbackModelImage(modelId) {
    const id = text(modelId);
    if (!id) return '';
    const productResponse = await transportFetch(`${FIREBASE_URL}/produtos/${encodeURIComponent(id)}.json?_=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!productResponse.ok) return '';
    const product = await productResponse.json().catch(() => null);
    const source = modelArt(product || {});
    if (/^data:image\//i.test(source)) return source;
    if (!/^https?:\/\//i.test(source)) return '';
    const imageResponse = await transportFetch(source, { cache: 'no-store' });
    if (!imageResponse.ok) return '';
    return blobToDataUrl(await imageResponse.blob());
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
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 1000) return `data:image/webp;base64,${value.replace(/\s+/g, '')}`;
    return '';
  }

  function recordError(record) {
    if (!record || typeof record !== 'object') return '';
    return text(record.error || record.erro || record.message || (record.ok === false ? 'A personalização falhou no Make.' : ''));
  }

  function updateProgress(elapsed) {
    const box = document.querySelector('#mugPublicProgress');
    if (!box) return;
    box.hidden = false;
    const strong = box.querySelector('strong');
    const percent = box.querySelector('b');
    const bar = box.querySelector('i');
    if (strong) strong.textContent = `Personalizando sua arte… ${elapsed}s`;
    if (percent) percent.textContent = '28%';
    if (bar) bar.style.width = '28%';
  }

  async function deleteTemporary(id) {
    try {
      await transportFetch(`${FIREBASE_URL}/${RESULT_NODE}/${encodeURIComponent(id)}.json`, { method: 'DELETE' });
    } catch {}
  }

  async function waitForPersonalizedArt(payload) {
    const id = text(payload?.request_id);
    if (!id) throw new Error('A personalização ficou assíncrona sem código de acompanhamento.');
    const started = Date.now();
    const deadline = started + WAIT_MS;

    while (Date.now() < deadline) {
      updateProgress(Math.max(1, Math.round((Date.now() - started) / 1000)));
      try {
        const response = await transportFetch(`${FIREBASE_URL}/${RESULT_NODE}/${encodeURIComponent(id)}.json?_=${Date.now()}`, {
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
              action: 'personalize_mug_model',
              mode: 'personalize_model',
              request_id: id,
              model_id: text(payload.model_id),
              art_source_url: source,
              art_source_base64: /^data:image\//i.test(source) ? source.replace(/^data:image\/[^;]+;base64,/i, '') : '',
              async_recovered: true,
            }), {
              status: 200,
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'X-DA-Mug-Public-Recovered': '1',
              },
            });
          }
        }
      } catch (error) {
        const message = text(error?.message || error);
        if (message && !/Firebase|Failed to fetch|NetworkError|Load failed/i.test(message)) throw error;
        console.debug('[Canecas públicas] aguardando arte personalizada:', message);
      }
      await sleep(POLL_MS);
    }

    throw new Error('O Make continuou a personalização, mas a arte não apareceu no Firebase em até 3 minutos.');
  }

  window.fetch = async function(input, init) {
    const parsed = parseRequest(init);
    if (!parsed) return transportFetch(input, init);

    const { outer, payload } = parsed;
    payload.quality = 'low';

    if (!/^data:image\//i.test(text(payload.image_base64))) {
      payload.image_base64 = firstCustomerPhoto(payload);
    }
    if (!payload.image_base64) {
      payload.image_base64 = await fallbackModelImage(payload.model_id).catch(() => '');
    }
    if (!payload.image_base64) {
      throw new Error('A foto da personalização não chegou à automação. Selecione novamente a imagem e tente de novo.');
    }

    const nextOuter = {
      ...outer,
      payload: typeof outer?.payload === 'string' ? JSON.stringify(payload) : payload,
    };
    const nextInit = { ...init, body: JSON.stringify(nextOuter) };

    try {
      const response = await transportFetch(input, nextInit);
      const raw = await response.clone().text().catch(() => '');
      if (response.ok && /^accepted\.?$/i.test(text(raw))) {
        console.info(`[Canecas públicas] Make aceitou ${payload.request_id}; acompanhando pelo Firebase.`);
        return waitForPersonalizedArt(payload);
      }
      return response;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      console.info(`[Canecas públicas] conexão síncrona encerrou em personalize_mug_model (${error?.message || error}); acompanhando ${payload.request_id}.`);
      return waitForPersonalizedArt(payload);
    }
  };

  document.documentElement.dataset.mugPublicContract = BUILD;
  document.documentElement.dataset.mugImageQuality = 'low';
  console.info(`Canecas públicas · contrato ${BUILD}`);
})();
