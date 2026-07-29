(() => {
  'use strict';

  const VERSION = '20260729-13';
  const DB_NAME = 'canecas-production-v13';
  const DB_VERSION = 1;
  const STORE_UPLOADS = 'uploads';
  const UPLOAD_PAGE_SIZE = 24;
  const TARGET_KEY = 'canecasGenerationTargetV13';
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

  let generationTarget = localStorage.getItem(TARGET_KEY) === 'left' ? 'left' : 'right';
  let generatedDispatch = false;
  let libraryDispatch = false;
  let uploadPage = 1;
  let uploadKeys = [];
  let uploadObjectUrls = [];
  let generateBusy = false;
  let generatedAutoLoaded = false;
  let uploadsInitialized = false;

  function toast(message, type = 'ok') {
    const area = $('#toastArea');
    if (!area) return console.log(message);
    const element = document.createElement('div');
    element.className = `toast ${type}`;
    element.textContent = message;
    area.appendChild(element);
    setTimeout(() => element.remove(), 4300);
  }

  function setStatus(message, type = '') {
    const status = $('#generationStatus');
    if (!status) return;
    status.className = `status ${type}`;
    status.textContent = message;
  }

  function injectStyles() {
    if ($('#dualSideV13Styles')) return;
    const style = document.createElement('style');
    style.id = 'dualSideV13Styles';
    style.textContent = `
      .dual-start{margin-bottom:18px}
      .dual-start-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .dual-side-box{border:1px solid var(--line,#e6dbd1);border-radius:15px;padding:14px;background:#fcfaf8}
      .dual-side-box h3{margin:0 0 4px;font-size:15px}
      .dual-side-box p{margin:0 0 12px;color:var(--muted,#746b65);font-size:11px}
      .dual-side-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .generator-target{margin:0 0 14px;border:1px solid var(--line,#e6dbd1);border-radius:13px;padding:11px;background:#fcfaf8}
      .generator-target-title{font-size:12px;font-weight:850;margin-bottom:8px}
      .generator-target-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}
      .generator-target-actions button.active{background:var(--brand,#70422f);border-color:var(--brand,#70422f);color:#fff}
      .target-badge-v13{display:inline-flex;align-items:center;border-radius:999px;background:#e9f4fb;color:#327aa5;padding:5px 9px;font-size:10px;font-weight:850;margin-left:6px}
      .uploaded-library-v13{margin-top:20px}
      .uploaded-grid-v13{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:13px;margin-top:15px}
      .uploaded-card-v13{border:1px solid var(--line,#e6dbd1);border-radius:14px;overflow:hidden;background:#fff}
      .uploaded-card-v13 img{display:block;width:100%;aspect-ratio:1;object-fit:contain;background:#fff;cursor:zoom-in}
      .uploaded-card-body-v13{padding:10px}
      .uploaded-card-title-v13{font-size:12px;font-weight:850;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .uploaded-card-date-v13{font-size:10px;color:var(--muted,#746b65);margin-top:3px}
      .uploaded-card-actions-v13{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
      .uploaded-card-delete-v13{grid-column:1/-1}
      .uploaded-empty-v13{text-align:center;color:var(--muted,#746b65);padding:28px 10px;border:1px dashed var(--line,#e6dbd1);border-radius:13px;margin-top:15px}
      .generated-dual-actions-v13{display:grid!important;grid-template-columns:1fr 1fr auto!important;gap:6px!important}
      .generated-dual-actions-v13 .v13-left{background:#eef6fb;border-color:#cfe6f4;color:#2f769e}
      .generated-dual-actions-v13 .v13-right{background:#f2e6de;border-color:#ead3c3;color:var(--brand,#70422f)}
      @media(max-width:680px){
        .dual-start-grid,.dual-side-actions,.generator-target-actions{grid-template-columns:1fr}
        .uploaded-grid-v13{grid-template-columns:repeat(2,minmax(0,1fr))}
        .uploaded-card-actions-v13,.generated-dual-actions-v13{grid-template-columns:1fr!important}
        .uploaded-card-delete-v13{grid-column:auto}
      }
    `;
    document.head.appendChild(style);
  }

  function setTarget(side, shouldScroll = false) {
    generationTarget = side === 'left' ? 'left' : 'right';
    localStorage.setItem(TARGET_KEY, generationTarget);
    $$('[data-generation-target-v13]').forEach(button => {
      button.classList.toggle('active', button.dataset.generationTargetV13 === generationTarget);
    });
    const badge = $('#generationTargetBadgeV13');
    if (badge) badge.textContent = generationTarget === 'left' ? 'GERAR PARA A ESQUERDA' : 'GERAR PARA A DIREITA';
    if (shouldScroll) {
      const generatorCard = $('#personName')?.closest('.card');
      generatorCard?.scrollIntoView({behavior:'smooth', block:'start'});
      setTimeout(() => $('#personName')?.focus(), 450);
    }
  }

  function addQuickStartPanel() {
    if ($('#dualStartV13')) return;
    const workspace = $('.workspace');
    if (!workspace) return;
    const section = document.createElement('section');
    section.id = 'dualStartV13';
    section.className = 'card dual-start';
    section.innerHTML = `
      <div class="card-head">
        <div class="head-title"><div class="step">1</div><div><h2>Escolha como preencher os dois lados</h2><p>Nos dois lados você pode subir uma imagem ou gerar uma arte personalizada pela IA.</p></div></div>
        <span class="badge">ESQUERDA + DIREITA</span>
      </div>
      <div class="card-body">
        <div class="dual-start-grid">
          <div class="dual-side-box">
            <h3>Lado esquerdo</h3><p>Use uma imagem pronta ou gere uma personalização com nome.</p>
            <div class="dual-side-actions">
              <button class="btn secondary" type="button" data-quick-upload-v13="left">↥ Subir imagem</button>
              <button class="btn primary" type="button" data-quick-generate-v13="left">✨ Gerar personalizada</button>
            </div>
          </div>
          <div class="dual-side-box">
            <h3>Lado direito</h3><p>Use uma imagem pronta ou gere uma personalização com nome.</p>
            <div class="dual-side-actions">
              <button class="btn secondary" type="button" data-quick-upload-v13="right">↥ Subir imagem</button>
              <button class="btn primary" type="button" data-quick-generate-v13="right">✨ Gerar personalizada</button>
            </div>
          </div>
        </div>
        <input id="quickUploadInputV13" type="file" accept="image/png,image/jpeg,image/webp" hidden>
      </div>`;
    workspace.insertAdjacentElement('beforebegin', section);

    let quickUploadSide = 'left';
    $$('[data-quick-upload-v13]', section).forEach(button => {
      button.addEventListener('click', () => {
        quickUploadSide = button.dataset.quickUploadV13;
        $('#quickUploadInputV13').value = '';
        $('#quickUploadInputV13').click();
      });
    });
    $$('[data-quick-generate-v13]', section).forEach(button => {
      button.addEventListener('click', () => setTarget(button.dataset.quickGenerateV13, true));
    });
    $('#quickUploadInputV13').addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await saveUpload(file);
        await applyFileToSide(file, quickUploadSide, true);
        toast(`Imagem adicionada ao lado ${quickUploadSide === 'left' ? 'esquerdo' : 'direito'} e salva na biblioteca.`, 'ok');
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  }

  function addGenerationTarget() {
    if ($('#generatorTargetV13')) return;
    const nameField = $('#personName')?.closest('label.field');
    if (!nameField) return;
    const box = document.createElement('div');
    box.id = 'generatorTargetV13';
    box.className = 'generator-target field full';
    box.innerHTML = `
      <div class="generator-target-title">Onde colocar a próxima arte gerada?<span class="target-badge-v13" id="generationTargetBadgeV13"></span></div>
      <div class="generator-target-actions">
        <button class="btn" type="button" data-generation-target-v13="left">← Lado esquerdo</button>
        <button class="btn" type="button" data-generation-target-v13="right">Lado direito →</button>
      </div>`;
    nameField.insertAdjacentElement('beforebegin', box);
    $$('[data-generation-target-v13]', box).forEach(button => button.addEventListener('click', () => setTarget(button.dataset.generationTargetV13)));
    setTarget(generationTarget);

    const card = $('#personName')?.closest('.card');
    const title = $('.card-head h2', card);
    const description = $('.card-head p', card);
    if (title) title.textContent = 'Gerar imagem personalizada';
    if (description) description.textContent = 'A mesma criação pode ser enviada ao lado esquerdo ou ao lado direito.';
  }

  function readSettings() {
    let settings = {};
    try { settings = JSON.parse(localStorage.getItem('canecasStudioSettings') || '{}'); } catch {}
    return {
      webhook: settings.webhook || $('#webhookInput')?.value.trim() || '',
      owner: settings.owner || 'osvaldosereia',
      repo: settings.repo || 'SUCEDOAN12',
      branch: settings.branch || 'main',
      folder: String(settings.folder || 'canecas/imagens').replace(/^\/+|\/+$/g, '')
    };
  }

  function promptForCurrentForm() {
    const preview = String($('#promptPreview')?.textContent || '').trim();
    if (preview) return preview.split('\n\n[CONFIGURAÇÕES ADICIONAIS DE COR]\n')[0].trim();
    const name = $('#personName')?.value.trim() || 'NOME DA PESSOA';
    return `Crie uma arte gráfica quadrada para sublimação em caneca branca, fundo branco puro, com o nome “${name}” grande, central, decorado e perfeitamente legível. Tema: ${$('#themeSelect')?.value || 'livre'}. Decoração: ${$('#decorationSelect')?.value || 'IA escolher'}. Estilo: ${$('#visualStyle')?.value || 'IA escolher'}. Não criar mockup e não incluir outro texto.`;
  }

  function buildPayload() {
    const settings = readSettings();
    const requestId = crypto.randomUUID();
    const name = $('#personName')?.value.trim() || '';
    return {
      action: 'generate_mug_art',
      request_id: requestId,
      slot: generationTarget === 'left' ? 1 : 2,
      prompt: promptForCurrentForm(),
      output: {aspect_ratio:'1:1', background:'white', format:'webp'},
      personalization: {
        name,
        target_side: generationTarget,
        theme: $('#themeSelect')?.value || '',
        decoration: $('#decorationSelect')?.value || '',
        font_style: $('#fontStyle')?.value || '',
        visual_style: $('#visualStyle')?.value || '',
        palette: $('#paletteSelect')?.value || 'A IA escolhe a paleta mais adequada',
        name_contrast: $('#nameContrast')?.checked !== false,
        amount: $('#decorationAmount')?.value || 'média'
      },
      storage: {folder:`${settings.folder}/artes-geradas/${new Date().toISOString().slice(0,10)}`}
    };
  }

  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Não foi possível ler a imagem.'));
      reader.readAsDataURL(blob);
    });
  }

  async function dataUrlToFile(dataUrl, name = 'arte.webp') {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const extension = blob.type.includes('png') ? 'png' : blob.type.includes('jpeg') ? 'jpg' : 'webp';
    return new File([blob], name.replace(/\.[^.]+$/, '') + '.' + extension, {type:blob.type || 'image/webp'});
  }

  async function extractImageResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.startsWith('image/')) {
      return {dataUrl: await blobToDataUrl(await response.blob()), githubPath:''};
    }
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    let githubPath = '';
    const seen = new Set();
    function find(value) {
      if (value == null) return null;
      if (typeof value === 'string') {
        const string = value.trim();
        if (/^data:image\//i.test(string) || /^https?:\/\//i.test(string)) return string;
        if (string.length > 500 && /^[A-Za-z0-9+/=\r\n]+$/.test(string)) return `data:image/webp;base64,${string.replace(/\s/g, '')}`;
        return null;
      }
      if (typeof value !== 'object' || seen.has(value)) return null;
      seen.add(value);
      if (typeof value.github_path === 'string') githubPath = value.github_path;
      for (const key of ['image_base64','dataUrl','data_url','b64_json','image_url','url','image']) {
        if (key in value) {
          const found = find(value[key]);
          if (found) return found;
        }
      }
      for (const child of Object.values(value)) {
        const found = find(child);
        if (found) return found;
      }
      return null;
    }
    let source = find(data);
    if (!source) throw new Error('A resposta do Make não contém uma imagem.');
    if (/^https?:\/\//i.test(source)) {
      const imageResponse = await fetch(source, {cache:'no-store'});
      if (!imageResponse.ok) throw new Error('Não foi possível baixar a imagem retornada pelo Make.');
      source = await blobToDataUrl(await imageResponse.blob());
    }
    return {dataUrl:source, githubPath};
  }

  async function applyFileToSide(file, side, fromLibrary = false, fromGeneration = false) {
    const input = side === 'left' ? $('#leftFile') : $('#rightFile');
    if (!input || typeof DataTransfer !== 'function') throw new Error('O navegador não permite aplicar esta imagem ao lado escolhido.');
    libraryDispatch = fromLibrary;
    generatedDispatch = fromGeneration;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', {bubbles:true}));
    await new Promise(resolve => setTimeout(resolve, 900));
    libraryDispatch = false;
    generatedDispatch = false;
  }

  async function generateToTarget() {
    if (generateBusy) return;
    const name = $('#personName')?.value.trim();
    if (!name) {
      $('#personName')?.focus();
      throw new Error('Digite o nome da pessoa.');
    }
    const settings = readSettings();
    if (!settings.webhook) throw new Error('Configure o webhook do Make em Integrações.');
    generateBusy = true;
    const button = $('#generateBtn');
    if (button) button.disabled = true;
    setStatus(`Gerando a arte para o lado ${generationTarget === 'left' ? 'esquerdo' : 'direito'}...`, 'loading');
    try {
      const payload = buildPayload();
      const form = new URLSearchParams();
      form.set('payload', JSON.stringify(payload));
      const response = await fetch(settings.webhook, {
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body:form.toString()
      });
      if (!response.ok) throw new Error(`Make respondeu HTTP ${response.status}`);
      const result = await extractImageResponse(response);
      const file = await dataUrlToFile(result.dataUrl, `arte-${name}-${generationTarget}.webp`);
      await applyFileToSide(file, generationTarget, false, true);
      setStatus(`Arte criada e aplicada ao lado ${generationTarget === 'left' ? 'esquerdo' : 'direito'}.`, 'ok');
      toast(`Arte personalizada aplicada ao lado ${generationTarget === 'left' ? 'esquerdo' : 'direito'}.`, 'ok');
      setTimeout(() => autoLoadGenerated(true), 900);
    } finally {
      generateBusy = false;
      if (button) button.disabled = false;
    }
  }

  function replaceGenerateHandler() {
    const current = $('#generateBtn');
    if (!current || current.dataset.dualGenerateV13 === '1') return;
    const replacement = current.cloneNode(true);
    replacement.dataset.dualGenerateV13 = '1';
    current.replaceWith(replacement);
    replacement.addEventListener('click', () => generateToTarget().catch(error => {
      setStatus(error.message, 'error');
      toast(error.message, 'error');
    }));
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_UPLOADS)) {
          db.createObjectStore(STORE_UPLOADS, {keyPath:'id'});
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Não foi possível abrir a biblioteca local.'));
    });
  }

  async function dbPut(record) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_UPLOADS, 'readwrite');
      transaction.objectStore(STORE_UPLOADS).put(record);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { const error = transaction.error; db.close(); reject(error); };
    });
  }

  async function dbDelete(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_UPLOADS, 'readwrite');
      transaction.objectStore(STORE_UPLOADS).delete(id);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { const error = transaction.error; db.close(); reject(error); };
    });
  }

  async function dbKeys() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_UPLOADS, 'readonly').objectStore(STORE_UPLOADS).getAllKeys();
      request.onsuccess = () => { const result = request.result; db.close(); resolve(result); };
      request.onerror = () => { const error = request.error; db.close(); reject(error); };
    });
  }

  async function dbGet(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_UPLOADS, 'readonly').objectStore(STORE_UPLOADS).get(id);
      request.onsuccess = () => { const result = request.result; db.close(); resolve(result); };
      request.onerror = () => { const error = request.error; db.close(); reject(error); };
    });
  }

  async function saveUpload(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error('Escolha uma imagem JPG, PNG ou WebP.');
    const record = {
      id:`${Date.now()}-${crypto.randomUUID()}`,
      name:file.name || 'imagem-enviada',
      type:file.type,
      size:file.size,
      createdAt:new Date().toISOString(),
      blob:file
    };
    await dbPut(record);
    await refreshUploadedLibrary();
  }

  function attachUploadCapture() {
    for (const input of [$('#leftFile'), $('#rightFile')]) {
      if (!input || input.dataset.uploadCaptureV13 === '1') continue;
      input.dataset.uploadCaptureV13 = '1';
      input.addEventListener('change', event => {
        if (generatedDispatch || libraryDispatch) return;
        const file = event.target.files?.[0];
        if (!file) return;
        saveUpload(file).then(() => toast('Imagem adicionada à biblioteca de imagens enviadas.', 'ok')).catch(error => toast(error.message, 'error'));
      }, true);
    }
  }

  function revokeUploadUrls() {
    uploadObjectUrls.forEach(url => URL.revokeObjectURL(url));
    uploadObjectUrls = [];
  }

  function addUploadedLibrarySection() {
    if ($('#uploadedLibraryV13')) return;
    const generatedArchive = $('.archive');
    const main = $('main');
    if (!main) return;
    const section = document.createElement('section');
    section.id = 'uploadedLibraryV13';
    section.className = 'card uploaded-library-v13';
    section.innerHTML = `
      <div class="card-head">
        <div class="head-title"><div class="step">4</div><div><h2>Imagens enviadas</h2><p>Imagens que você subiu ficam guardadas neste navegador e carregam automaticamente ao acessar o sistema.</p></div></div>
        <button class="btn secondary" id="refreshUploadsV13" type="button">↻ Atualizar enviadas</button>
      </div>
      <div class="card-body">
        <div class="archive-tools"><span class="badge" id="uploadedCountV13">0 imagens</span></div>
        <div class="uploaded-grid-v13" id="uploadedGridV13"></div>
        <div class="uploaded-empty-v13" id="uploadedEmptyV13">Nenhuma imagem enviada ainda.</div>
        <div class="pagination" id="uploadedPaginationV13" hidden>
          <button class="btn small" id="uploadedPrevV13">← Anterior</button>
          <span id="uploadedPageInfoV13"></span>
          <button class="btn small" id="uploadedNextV13">Próxima →</button>
        </div>
      </div>`;
    if (generatedArchive) generatedArchive.insertAdjacentElement('beforebegin', section);
    else main.appendChild(section);
    $('#refreshUploadsV13').addEventListener('click', () => refreshUploadedLibrary().catch(error => toast(error.message, 'error')));
    $('#uploadedPrevV13').addEventListener('click', () => { if (uploadPage > 1) { uploadPage--; renderUploadedPage().catch(error => toast(error.message, 'error')); } });
    $('#uploadedNextV13').addEventListener('click', () => { uploadPage++; renderUploadedPage().catch(error => toast(error.message, 'error')); });
  }

  async function refreshUploadedLibrary() {
    uploadKeys = (await dbKeys()).sort().reverse();
    const pages = Math.max(1, Math.ceil(uploadKeys.length / UPLOAD_PAGE_SIZE));
    uploadPage = Math.min(Math.max(1, uploadPage), pages);
    await renderUploadedPage();
  }

  async function renderUploadedPage() {
    const grid = $('#uploadedGridV13');
    if (!grid) return;
    revokeUploadUrls();
    const pages = Math.max(1, Math.ceil(uploadKeys.length / UPLOAD_PAGE_SIZE));
    uploadPage = Math.min(Math.max(1, uploadPage), pages);
    const ids = uploadKeys.slice((uploadPage - 1) * UPLOAD_PAGE_SIZE, uploadPage * UPLOAD_PAGE_SIZE);
    const records = (await Promise.all(ids.map(id => dbGet(id)))).filter(Boolean);
    grid.innerHTML = '';
    records.forEach(record => {
      const url = URL.createObjectURL(record.blob);
      uploadObjectUrls.push(url);
      const card = document.createElement('article');
      card.className = 'uploaded-card-v13';
      card.innerHTML = `
        <img loading="lazy" src="${url}" alt="${escapeHtml(record.name)}">
        <div class="uploaded-card-body-v13">
          <div class="uploaded-card-title-v13">${escapeHtml(record.name)}</div>
          <div class="uploaded-card-date-v13">${new Date(record.createdAt).toLocaleString('pt-BR')}</div>
          <div class="uploaded-card-actions-v13">
            <button class="btn small" type="button" data-upload-left-v13>← Esquerda</button>
            <button class="btn small secondary" type="button" data-upload-right-v13>Direita →</button>
            <button class="btn small danger uploaded-card-delete-v13" type="button" data-upload-delete-v13>Apagar da biblioteca</button>
          </div>
        </div>`;
      $('img', card).addEventListener('click', () => openViewer(url, record.name));
      $('[data-upload-left-v13]', card).addEventListener('click', () => applyFileToSide(new File([record.blob], record.name, {type:record.type}), 'left', true).then(() => toast('Imagem aplicada à esquerda.', 'ok')).catch(error => toast(error.message, 'error')));
      $('[data-upload-right-v13]', card).addEventListener('click', () => applyFileToSide(new File([record.blob], record.name, {type:record.type}), 'right', true).then(() => toast('Imagem aplicada à direita.', 'ok')).catch(error => toast(error.message, 'error')));
      $('[data-upload-delete-v13]', card).addEventListener('click', async () => {
        if (!confirm('Apagar esta imagem da biblioteca de imagens enviadas?')) return;
        await dbDelete(record.id);
        await refreshUploadedLibrary();
        toast('Imagem apagada da biblioteca.', 'ok');
      });
      grid.appendChild(card);
    });
    $('#uploadedCountV13').textContent = `${uploadKeys.length} imagem(ns)`;
    $('#uploadedEmptyV13').hidden = uploadKeys.length > 0;
    $('#uploadedPaginationV13').hidden = uploadKeys.length <= UPLOAD_PAGE_SIZE;
    $('#uploadedPageInfoV13').textContent = `Página ${uploadPage} de ${pages}`;
    $('#uploadedPrevV13').disabled = uploadPage <= 1;
    $('#uploadedNextV13').disabled = uploadPage >= pages;
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }

  function openViewer(source, title) {
    const image = $('#viewerImage');
    if (!image) return;
    image.src = source;
    image.style.filter = 'none';
    if ($('#viewerTitle')) $('#viewerTitle').textContent = title || 'Visualização';
    $('#viewerDialog')?.showModal();
  }

  async function applyUrlToSide(url, side, name = 'imagem.webp') {
    const response = await fetch(url, {cache:'no-store'});
    if (!response.ok) throw new Error('Não foi possível carregar esta imagem.');
    const blob = await response.blob();
    const file = new File([blob], name, {type:blob.type || 'image/webp'});
    await applyFileToSide(file, side, true);
  }

  function enhanceGeneratedCards() {
    const archive = $('.archive');
    if (!archive) return;
    const title = $('.card-head h2', archive);
    const description = $('.card-head p', archive);
    if (title) title.textContent = 'Imagens geradas pela IA';
    if (description) description.textContent = 'Carregadas automaticamente do GitHub e separadas das imagens enviadas.';

    $$('.archive-item', archive).forEach(card => {
      if (card.dataset.dualActionsV13 === '1') return;
      const image = $('img', card);
      const actions = $('.archive-actions', card);
      if (!image || !actions) return;
      card.dataset.dualActionsV13 = '1';
      actions.classList.add('generated-dual-actions-v13');
      const originalUse = $('[data-use]', actions) || $('button:not(.danger)', actions);
      if (originalUse) {
        originalUse.textContent = 'Direita →';
        originalUse.classList.add('v13-right');
      }
      const leftButton = document.createElement('button');
      leftButton.type = 'button';
      leftButton.className = 'btn small v13-left';
      leftButton.textContent = '← Esquerda';
      leftButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const source = image.currentSrc || image.src;
        applyUrlToSide(source, 'left', image.alt || 'arte-gerada.webp').then(() => toast('Arte gerada aplicada à esquerda.', 'ok')).catch(error => toast(error.message, 'error'));
      });
      actions.insertBefore(leftButton, originalUse || actions.firstChild);
      image.loading = 'lazy';
    });
  }

  function autoLoadGenerated(force = false) {
    if (generatedAutoLoaded && !force) return;
    const button = $('#refreshArchiveBtn');
    if (!button || button.disabled) return;
    generatedAutoLoaded = true;
    button.click();
  }

  function initialize() {
    injectStyles();
    addQuickStartPanel();
    addGenerationTarget();
    replaceGenerateHandler();
    attachUploadCapture();
    addUploadedLibrarySection();
    enhanceGeneratedCards();
    if ($('#uploadedLibraryV13') && !uploadsInitialized) { uploadsInitialized = true; refreshUploadedLibrary().catch(error => console.warn(error)); }
    if ($('#refreshArchiveBtn')) setTimeout(() => autoLoadGenerated(), 700);
  }

  const started = Date.now();
  const timer = setInterval(() => {
    initialize();
    if (Date.now() - started > 90000) clearInterval(timer);
  }, 300);
  new MutationObserver(() => initialize()).observe(document.documentElement, {childList:true, subtree:true});
  initialize();
})();