(() => {
  'use strict';

  const BUILD = '20260902-image-upload-stability-v1';
  const MAKE_HOST_RE = /^hook\.[a-z0-9-]+\.make\.com$/i;
  const MAX_SIDE = 1600;
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const TARGET_DATAURL_CHARS = 1800000;
  const previousFetch = window.fetch.bind(window);

  if (window.__CF_IMAGE_UPLOAD_STABILITY__ === BUILD) return;
  window.__CF_IMAGE_UPLOAD_STABILITY__ = BUILD;

  const text = value => String(value ?? '').trim();

  function progress(message) {
    const title = document.getElementById('progressTitle');
    const detail = document.getElementById('progressText');
    if (title) title.textContent = 'Gerando sua arte';
    if (detail && message) detail.textContent = message;
  }

  function makeUrl(input) {
    try {
      const raw = typeof input === 'string' ? input : (input?.url || '');
      const url = new URL(raw, location.href);
      return MAKE_HOST_RE.test(url.hostname) ? url : null;
    } catch { return null; }
  }

  function parseRequest(init = {}) {
    if (typeof init?.body !== 'string') return null;
    try {
      const outer = JSON.parse(init.body);
      const payload = typeof outer?.payload === 'string' ? JSON.parse(outer.payload) : outer?.payload;
      if (!payload || typeof payload !== 'object') return null;
      return { outer, payload };
    } catch { return null; }
  }

  function parseImages(value) {
    try {
      const list = Array.isArray(value) ? value : JSON.parse(text(value) || '[]');
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Não foi possível preparar a foto selecionada. Tente outra imagem.'));
      image.src = src;
    });
  }

  function encodeWebp(image, maxSide = MAX_SIDE, quality = 0.86) {
    const width = Number(image.naturalWidth || image.width || 0);
    const height = Number(image.naturalHeight || image.height || 0);
    if (!width || !height) throw new Error('A foto selecionada não possui dimensões válidas.');
    const scale = Math.min(1, maxSide / width, maxSide / height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d', { alpha:false });
    if (!ctx) throw new Error('Este navegador não conseguiu preparar a foto para envio.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/webp', quality);
    if (!/^data:image\/webp;base64,/i.test(data)) throw new Error('Seu navegador não conseguiu compactar a foto. Tente JPG, PNG ou WebP.');
    return data;
  }

  async function normalizeCustomerImage(source) {
    if (!/^data:image\//i.test(text(source))) return source;
    const image = await loadImage(source);
    let result = encodeWebp(image, MAX_SIDE, 0.86);
    if (result.length > TARGET_DATAURL_CHARS) result = encodeWebp(image, 1400, 0.80);
    if (result.length > TARGET_DATAURL_CHARS) result = encodeWebp(image, 1200, 0.74);
    return result;
  }

  function metadataOnly(images = []) {
    return images.map((item, index) => ({
      field_id:text(item?.field_id || item?.id || `foto_${index + 1}`),
      role:text(item?.role || item?.field_id || item?.id || 'foto'),
      file_name:text(item?.file_name || item?.name),
      mime_type:'image/webp',
      has_image:Boolean(text(item?.image_base64))
    }));
  }

  function formRequest(payload, init = {}) {
    const form = new FormData();
    form.append('payload', JSON.stringify(payload));
    return {
      method:String(init.method || 'POST').toUpperCase(),
      body:form,
      cache:'no-store',
      mode:'cors',
      credentials:'omit',
      redirect:'follow'
    };
  }

  window.fetch = async function cfImageStableFetch(input, init = {}) {
    if (!makeUrl(input) || String(init.method || 'GET').toUpperCase() !== 'POST') return previousFetch(input, init);
    const parsed = parseRequest(init);
    if (!parsed || parsed.payload?.action !== 'personalize_mug_model') return previousFetch(input, init);

    const images = parseImages(parsed.payload.images_json);
    const uploaded = images.find(item => /^data:image\//i.test(text(item?.image_base64)));
    if (!uploaded) return previousFetch(input, init);

    progress('Otimizando sua foto para enviar com segurança…');
    const original = text(uploaded.image_base64 || parsed.payload.image_base64);
    if (!original) throw new Error('A foto foi selecionada, mas não pôde ser preparada para envio. Selecione-a novamente.');

    const compact = await normalizeCustomerImage(original);
    const payload = {
      ...parsed.payload,
      image_base64:compact,
      images_json:JSON.stringify(metadataOnly(images)),
      image_upload_transport:'formdata_webp_compact_v1',
      image_upload_original_chars:original.length,
      image_upload_sent_chars:compact.length,
      client_image_present:true
    };

    progress('Foto pronta. Enviando a personalização…');
    try {
      const response = await previousFetch(input, formRequest(payload, init));
      if (!response?.ok) throw new Error(`A automação respondeu HTTP ${response?.status || 0}.`);
      return response;
    } catch (error) {
      console.error('[CanecaFácil] Falha real ao enviar foto para o Make:', error);
      throw new Error('Não conseguimos enviar sua foto para a criação. A imagem foi compactada, mas a conexão falhou antes da automação confirmar o recebimento. Tente novamente.');
    }
  };

  function fileHint(input) {
    let hint = input.parentElement?.querySelector('.cf-upload-hint');
    if (!hint) {
      hint = document.createElement('small');
      hint.className = 'cf-upload-hint';
      hint.style.cssText = 'display:block;margin-top:7px;font-weight:700;color:#5d685c';
      input.insertAdjacentElement('afterend', hint);
    }
    return hint;
  }

  function prepareInputs(root = document) {
    root.querySelectorAll?.('input[type="file"][data-kind="image"]').forEach(input => {
      input.setAttribute('accept', 'image/*');
      if (input.dataset.cfImageStableBound === BUILD) return;
      input.dataset.cfImageStableBound = BUILD;
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        const hint = fileHint(input);
        if (!file) { hint.textContent = ''; return; }
        if (!String(file.type || '').startsWith('image/')) {
          hint.textContent = 'Selecione um arquivo de imagem.';
          input.value = '';
          return;
        }
        if (file.size > MAX_FILE_BYTES) {
          hint.textContent = 'Esta foto é muito grande. Escolha uma imagem de até 25 MB.';
          input.value = '';
          return;
        }
        const mb = Math.max(0.1, file.size / 1024 / 1024).toFixed(1).replace('.', ',');
        hint.textContent = `Foto selecionada (${mb} MB). Ela será compactada automaticamente ao gerar a arte.`;
      });
    });
  }

  prepareInputs();
  const observer = new MutationObserver(() => prepareInputs());
  if (document.documentElement) observer.observe(document.documentElement, { childList:true, subtree:true });

  console.info(`CanecaFácil · envio de foto estável · ${BUILD}`);
})();