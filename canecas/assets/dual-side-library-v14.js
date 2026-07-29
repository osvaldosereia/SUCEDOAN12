(() => {
  'use strict';

  const VERSION = '20260729-14';
  const DB_NAME = 'canecas-production-v13';
  const DB_VERSION = 1;
  const STORE_UPLOADS = 'uploads';
  const PAGE_SIZE = 24;
  const TARGET_KEY = 'canecasGenerationTargetV14';
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

  const MALE_THEMES = {
    'Masculino clássico': ['IA criar livremente','monograma elegante e linhas finas','relógio clássico e detalhes discretos','brasão com iniciais','terno, gravata e composição refinada','coroa minimalista e nome','tipografia forte com moldura clássica','leão estilizado e nome','bússola e linhas sofisticadas','emblema premium com iniciais','detalhes em couro e metal ilustrados'],
    'Churrasco': ['IA criar livremente','churrasqueira, fogo e utensílios','tábua, faca e carne assada','avental e ferramentas de churrasco','emblema do mestre churrasqueiro','grelha, brasas e fumaça leve','espetos e lettering robusto','churrasco de domingo e cerveja sem marca','boi estilizado e fogo','facas cruzadas e nome em destaque','selo rústico de churrasqueiro'],
    'Futebol': ['IA criar livremente','bola e linhas de movimento','estádio e refletores','camisa genérica e nome','escudo esportivo personalizado','chuteira e bola','gramado e gol','torcida estilizada e confetes','troféu e estrelas','número de jogador em destaque','emblema esportivo sem marcas de times'],
    'Pesca': ['IA criar livremente','peixe e ondas suaves','vara, anzol e lago','barco de pesca ao amanhecer','emblema de pescador','peixe saltando e respingos','rio, montanhas e natureza','isca, linha e nome','silhueta de pescador','bússola, peixe e ondas','selo rústico de pesca esportiva'],
    'Oficina e ferramentas': ['IA criar livremente','chaves cruzadas e engrenagens','caixa de ferramentas e nome','martelo, alicate e parafusos','emblema de mecânico','engrenagem com iniciais','oficina industrial estilizada','capacete e ferramentas','motor, pistão e linhas técnicas','placa vintage de oficina','ferramentas organizadas em composição moderna']
  };

  const MALE_STYLES = [
    'Emblema masculino clássico',
    'Vintage rústico',
    'Esportivo dinâmico',
    'Industrial moderno',
    'Aventura e natureza'
  ];

  let targetSide = localStorage.getItem(TARGET_KEY) === 'left' ? 'left' : 'right';
  let applyingFromLibrary = false;
  let applyingGenerated = false;
  let uploadPage = 1;
  let uploadKeys = [];
  let uploadUrls = [];
  let generateBusy = false;
  let archiveObserverTimer = null;

  function toast(message, type = 'ok') {
    const area = $('#toastArea');
    if (!area) return console.log(message);
    const element = document.createElement('div');
    element.className = `toast ${type}`;
    element.textContent = message;
    area.appendChild(element);
    setTimeout(() => element.remove(), 4200);
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }

  function injectStyles() {
    if ($('#dualSideV14Styles')) return;
    const style = document.createElement('style');
    style.id = 'dualSideV14Styles';
    style.textContent = `
      .dual-start-v14{margin-bottom:18px}
      .dual-start-grid-v14{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .dual-side-box-v14{border:1px solid var(--line,#e6dbd1);border-radius:15px;padding:14px;background:#fcfaf8}
      .dual-side-box-v14 h3{margin:0 0 4px;font-size:15px}.dual-side-box-v14 p{margin:0 0 12px;color:var(--muted,#746b65);font-size:11px}
      .dual-side-actions-v14,.target-actions-v14{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .target-box-v14{margin:0 0 14px;border:1px solid var(--line,#e6dbd1);border-radius:13px;padding:11px;background:#fcfaf8}
      .target-title-v14{font-size:12px;font-weight:850;margin-bottom:8px}
      .target-actions-v14 button.active{background:var(--brand,#70422f);border-color:var(--brand,#70422f);color:#fff}
      .target-badge-v14{display:inline-flex;align-items:center;border-radius:999px;background:#e9f4fb;color:#327aa5;padding:5px 9px;font-size:10px;font-weight:850;margin-left:6px}
      .manual-library-v14{margin-top:20px}.uploaded-grid-v14{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:13px;margin-top:15px}
      .uploaded-card-v14{border:1px solid var(--line,#e6dbd1);border-radius:14px;overflow:hidden;background:#fff}.uploaded-card-v14 img{display:block;width:100%;aspect-ratio:1;object-fit:contain;background:#fff;cursor:zoom-in}
      .uploaded-body-v14{padding:10px}.uploaded-title-v14{font-size:12px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.uploaded-date-v14{font-size:10px;color:var(--muted,#746b65);margin-top:3px}
      .uploaded-actions-v14{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.uploaded-delete-v14{grid-column:1/-1}
      .library-placeholder-v14{text-align:center;color:var(--muted,#746b65);padding:28px 10px;border:1px dashed var(--line,#e6dbd1);border-radius:13px;margin-top:15px}
      .generated-dual-v14{display:grid!important;grid-template-columns:1fr 1fr auto!important;gap:6px!important}.generated-left-v14{background:#eef6fb!important;border-color:#cfe6f4!important;color:#2f769e!important}
      @media(max-width:680px){.dual-start-grid-v14,.dual-side-actions-v14,.target-actions-v14{grid-template-columns:1fr}.uploaded-grid-v14{grid-template-columns:repeat(2,minmax(0,1fr))}.uploaded-actions-v14,.generated-dual-v14{grid-template-columns:1fr!important}.uploaded-delete-v14{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function addMaleThemes() {
    const theme = $('#themeSelect');
    const decoration = $('#decorationSelect');
    const visualStyle = $('#visualStyle');
    if (!theme || !decoration || !visualStyle) return;
    Object.keys(MALE_THEMES).forEach(name => { if (![...theme.options].some(option => option.value === name)) theme.add(new Option(name, name)); });
    MALE_STYLES.forEach(name => { if (![...visualStyle.options].some(option => option.value === name)) visualStyle.add(new Option(name, name)); });
    if (theme.dataset.maleThemesV14 !== '1') {
      theme.dataset.maleThemesV14 = '1';
      theme.addEventListener('change', () => {
        const options = MALE_THEMES[theme.value];
        if (!options) return;
        decoration.innerHTML = options.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
        decoration.value = options[0];
        decoration.dispatchEvent(new Event('input', {bubbles:true}));
        decoration.dispatchEvent(new Event('change', {bubbles:true}));
      });
    }
  }

  function setTarget(side, scroll = false) {
    targetSide = side === 'left' ? 'left' : 'right';
    localStorage.setItem(TARGET_KEY, targetSide);
    $$('[data-target-v14]').forEach(button => button.classList.toggle('active', button.dataset.targetV14 === targetSide));
    const badge = $('#targetBadgeV14');
    if (badge) badge.textContent = targetSide === 'left' ? 'GERAR PARA A ESQUERDA' : 'GERAR PARA A DIREITA';
    if (scroll) { $('#personName')?.closest('.card')?.scrollIntoView({behavior:'smooth', block:'start'}); setTimeout(() => $('#personName')?.focus(), 350); }
  }

  function addQuickStart() {
    if ($('#dualStartV14')) return;
    const workspace = $('.workspace');
    if (!workspace) return;
    const section = document.createElement('section');
    section.id = 'dualStartV14';
    section.className = 'card dual-start-v14';
    section.innerHTML = `<div class="card-head"><div class="head-title"><div class="step">1</div><div><h2>Preencher os dois lados</h2><p>Em cada lado você pode subir uma imagem ou gerar uma personalização pela IA.</p></div></div><span class="badge">ESQUERDA + DIREITA</span></div><div class="card-body"><div class="dual-start-grid-v14"><div class="dual-side-box-v14"><h3>Lado esquerdo</h3><p>Imagem pronta ou nome personalizado.</p><div class="dual-side-actions-v14"><button class="btn secondary" data-upload-side-v14="left">↥ Subir imagem</button><button class="btn primary" data-generate-side-v14="left">✨ Gerar</button></div></div><div class="dual-side-box-v14"><h3>Lado direito</h3><p>Imagem pronta ou nome personalizado.</p><div class="dual-side-actions-v14"><button class="btn secondary" data-upload-side-v14="right">↥ Subir imagem</button><button class="btn primary" data-generate-side-v14="right">✨ Gerar</button></div></div></div><input id="quickUploadV14" type="file" accept="image/png,image/jpeg,image/webp" hidden></div>`;
    workspace.insertAdjacentElement('beforebegin', section);
    let uploadSide = 'left';
    $$('[data-upload-side-v14]', section).forEach(button => button.addEventListener('click', () => { uploadSide = button.dataset.uploadSideV14; $('#quickUploadV14').value = ''; $('#quickUploadV14').click(); }));
    $$('[data-generate-side-v14]', section).forEach(button => button.addEventListener('click', () => setTarget(button.dataset.generateSideV14, true)));
    $('#quickUploadV14').addEventListener('change', async event => {
      const file = event.target.files?.[0]; if (!file) return;
      try { await saveUpload(file); await applyFileToSide(file, uploadSide, true, false); toast(`Imagem aplicada ao lado ${uploadSide === 'left' ? 'esquerdo' : 'direito'} e salva na biblioteca.`, 'ok'); }
      catch (error) { toast(error.message, 'error'); }
    });
  }

  function addTargetSelector() {
    if ($('#targetBoxV14')) return;
    const nameField = $('#personName')?.closest('label.field'); if (!nameField) return;
    const box = document.createElement('div');
    box.id = 'targetBoxV14'; box.className = 'target-box-v14 field full';
    box.innerHTML = `<div class="target-title-v14">Onde colocar a próxima arte?<span id="targetBadgeV14" class="target-badge-v14"></span></div><div class="target-actions-v14"><button class="btn" data-target-v14="left">← Lado esquerdo</button><button class="btn" data-target-v14="right">Lado direito →</button></div>`;
    nameField.insertAdjacentElement('beforebegin', box);
    $$('[data-target-v14]', box).forEach(button => button.addEventListener('click', () => setTarget(button.dataset.targetV14)));
    setTarget(targetSide);
    const card = nameField.closest('.card'); const title = $('.card-head h2', card); const description = $('.card-head p', card);
    if (title) title.textContent = 'Gerar imagem personalizada'; if (description) description.textContent = 'Use a mesma criação no lado esquerdo ou direito.';
  }

  function readSettings() {
    let settings = {}; try { settings = JSON.parse(localStorage.getItem('canecasStudioSettings') || '{}'); } catch {}
    return {webhook:settings.webhook || $('#webhookInput')?.value.trim() || '',folder:String(settings.folder || 'canecas/imagens').replace(/^\/+|\/+$/g, '')};
  }

  function currentPrompt() {
    const preview = String($('#promptPreview')?.textContent || '').trim(); if (preview) return preview;
    const name = $('#personName')?.value.trim() || 'NOME DA PESSOA';
    return `Crie uma arte quadrada para caneca branca com o nome “${name}” grande e legível. Tema: ${$('#themeSelect')?.value || 'livre'}. Decoração: ${$('#decorationSelect')?.value || 'IA escolher'}. Estilo: ${$('#visualStyle')?.value || 'IA escolher'}. Fundo branco, sem mockup e sem outro texto.`;
  }

  function buildPayload() {
    const settings = readSettings();
    return {action:'generate_mug_art',request_id:crypto.randomUUID(),slot:targetSide === 'left' ? 1 : 2,prompt:currentPrompt(),output:{aspect_ratio:'1:1',background:'white',format:'webp'},personalization:{name:$('#personName')?.value.trim() || '',target_side:targetSide,theme:$('#themeSelect')?.value || '',decoration:$('#decorationSelect')?.value || '',font_style:$('#fontStyle')?.value || '',visual_style:$('#visualStyle')?.value || '',palette:$('#paletteSelect')?.value || 'A IA escolhe a paleta mais adequada',name_contrast:$('#nameContrast')?.checked !== false,amount:$('#decorationAmount')?.value || 'média'},storage:{folder:`${settings.folder}/artes-geradas/${new Date().toISOString().slice(0,10)}`}};
  }

  function setStatus(message, type = '') { const status = $('#generationStatus'); if (!status) return; status.className = `status ${type}`; status.textContent = message; }
  function blobToDataUrl(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error || new Error('Não foi possível ler a imagem.')); reader.readAsDataURL(blob); }); }

  async function extractImage(response) {
    if ((response.headers.get('content-type') || '').startsWith('image/')) return blobToDataUrl(await response.blob());
    const text = await response.text(); let value; try { value = JSON.parse(text); } catch { value = text; }
    const seen = new Set();
    function find(item) {
      if (item == null) return null;
      if (typeof item === 'string') { const string = item.trim(); if (/^data:image\//i.test(string) || /^https?:\/\//i.test(string)) return string; if (string.length > 500 && /^[A-Za-z0-9+/=\r\n]+$/.test(string)) return `data:image/webp;base64,${string.replace(/\s/g, '')}`; return null; }
      if (typeof item !== 'object' || seen.has(item)) return null; seen.add(item);
      for (const key of ['image_base64','dataUrl','data_url','b64_json','image_url','url','image']) if (key in item) { const found = find(item[key]); if (found) return found; }
      for (const child of Object.values(item)) { const found = find(child); if (found) return found; } return null;
    }
    let source = find(value); if (!source) throw new Error('A resposta do Make não contém uma imagem.');
    if (/^https?:\/\//i.test(source)) { const imageResponse = await fetch(source, {cache:'no-store'}); if (!imageResponse.ok) throw new Error('Não foi possível baixar a imagem retornada.'); source = await blobToDataUrl(await imageResponse.blob()); }
    return source;
  }

  async function dataUrlToFile(dataUrl, name) { const blob = await (await fetch(dataUrl)).blob(); const extension = blob.type.includes('png') ? 'png' : blob.type.includes('jpeg') ? 'jpg' : 'webp'; return new File([blob], `${name.replace(/\.[^.]+$/, '')}.${extension}`, {type:blob.type || 'image/webp'}); }

  async function applyFileToSide(file, side, fromLibrary = false, fromGeneration = false) {
    const input = side === 'left' ? $('#leftFile') : $('#rightFile'); if (!input || typeof DataTransfer !== 'function') throw new Error('O navegador não permite aplicar esta imagem.');
    applyingFromLibrary = fromLibrary; applyingGenerated = fromGeneration;
    const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true}));
    await new Promise(resolve => setTimeout(resolve, 850)); applyingFromLibrary = false; applyingGenerated = false;
  }

  async function generateToTarget() {
    if (generateBusy) return; const name = $('#personName')?.value.trim(); if (!name) throw new Error('Digite o nome da pessoa.');
    const settings = readSettings(); if (!settings.webhook) throw new Error('Configure o webhook do Make em Integrações.');
    generateBusy = true; const button = $('#generateBtn'); if (button) button.disabled = true; setStatus(`Gerando para o lado ${targetSide === 'left' ? 'esquerdo' : 'direito'}...`, 'loading');
    try { const form = new URLSearchParams(); form.set('payload', JSON.stringify(buildPayload())); const response = await fetch(settings.webhook, {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:form.toString()}); if (!response.ok) throw new Error(`Make respondeu HTTP ${response.status}`); const dataUrl = await extractImage(response); const file = await dataUrlToFile(dataUrl, `arte-${name}-${targetSide}.webp`); await applyFileToSide(file, targetSide, false, true); setStatus(`Arte aplicada ao lado ${targetSide === 'left' ? 'esquerdo' : 'direito'}.`, 'ok'); toast('Arte criada. Para ver no catálogo, clique em “Carregar artes geradas”.', 'ok'); }
    finally { generateBusy = false; if (button) button.disabled = false; }
  }

  function replaceGenerateButton() {
    const current = $('#generateBtn'); if (!current || current.dataset.dualV14 === '1') return;
    const replacement = current.cloneNode(true); replacement.dataset.dualV14 = '1'; current.replaceWith(replacement);
    replacement.addEventListener('click', () => generateToTarget().catch(error => { setStatus(error.message, 'error'); toast(error.message, 'error'); }));
  }

  function openDb() { return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, DB_VERSION); request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(STORE_UPLOADS)) db.createObjectStore(STORE_UPLOADS, {keyPath:'id'}); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error('Não foi possível abrir a biblioteca local.')); }); }
  async function dbPut(record) { const db = await openDb(); return new Promise((resolve, reject) => { const transaction = db.transaction(STORE_UPLOADS, 'readwrite'); transaction.objectStore(STORE_UPLOADS).put(record); transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onerror = () => { const error = transaction.error; db.close(); reject(error); }; }); }
  async function dbDelete(id) { const db = await openDb(); return new Promise((resolve, reject) => { const transaction = db.transaction(STORE_UPLOADS, 'readwrite'); transaction.objectStore(STORE_UPLOADS).delete(id); transaction.oncomplete = () => { db.close(); resolve(); }; transaction.onerror = () => { const error = transaction.error; db.close(); reject(error); }; }); }
  async function dbKeys() { const db = await openDb(); return new Promise((resolve, reject) => { const request = db.transaction(STORE_UPLOADS, 'readonly').objectStore(STORE_UPLOADS).getAllKeys(); request.onsuccess = () => { const result = request.result; db.close(); resolve(result); }; request.onerror = () => { const error = request.error; db.close(); reject(error); }; }); }
  async function dbGet(id) { const db = await openDb(); return new Promise((resolve, reject) => { const request = db.transaction(STORE_UPLOADS, 'readonly').objectStore(STORE_UPLOADS).get(id); request.onsuccess = () => { const result = request.result; db.close(); resolve(result); }; request.onerror = () => { const error = request.error; db.close(); reject(error); }; }); }

  async function saveUpload(file) { if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error('Escolha uma imagem JPG, PNG ou WebP.'); await dbPut({id:`${Date.now()}-${crypto.randomUUID()}`,name:file.name || 'imagem-enviada',type:file.type,size:file.size,createdAt:new Date().toISOString(),blob:file}); const button = $('#loadUploadsV14'); if (button) button.textContent = '↻ Recarregar imagens enviadas'; }

  function attachUploadCapture() {
    [$('#leftFile'), $('#rightFile')].forEach(input => { if (!input || input.dataset.captureV14 === '1') return; input.dataset.captureV14 = '1'; input.addEventListener('change', event => { if (applyingFromLibrary || applyingGenerated) return; const file = event.target.files?.[0]; if (!file) return; saveUpload(file).then(() => toast('Imagem salva na biblioteca. Clique em carregar para visualizá-la.', 'ok')).catch(error => toast(error.message, 'error')); }, true); });
  }

  function addUploadLibrary() {
    if ($('#uploadLibraryV14')) return; const archive = $('.archive'); const main = $('main'); if (!main) return;
    const section = document.createElement('section'); section.id = 'uploadLibraryV14'; section.className = 'card manual-library-v14';
    section.innerHTML = `<div class="card-head"><div class="head-title"><div class="step">4</div><div><h2>Imagens enviadas</h2><p>Carregue somente quando precisar, evitando travar a abertura do sistema.</p></div></div><button id="loadUploadsV14" class="btn secondary">↻ Carregar imagens enviadas</button></div><div class="card-body"><span id="uploadCountV14" class="badge">Não carregado</span><div id="uploadGridV14" class="uploaded-grid-v14"></div><div id="uploadEmptyV14" class="library-placeholder-v14">Clique em “Carregar imagens enviadas”.</div><div id="uploadPaginationV14" class="pagination" hidden><button id="uploadPrevV14" class="btn small">← Anterior</button><span id="uploadPageInfoV14"></span><button id="uploadNextV14" class="btn small">Próxima →</button></div></div>`;
    if (archive) archive.insertAdjacentElement('beforebegin', section); else main.appendChild(section);
    $('#loadUploadsV14').addEventListener('click', () => loadUploads().catch(error => toast(error.message, 'error')));
    $('#uploadPrevV14').addEventListener('click', () => { if (uploadPage > 1) { uploadPage--; renderUploadPage().catch(error => toast(error.message, 'error')); } });
    $('#uploadNextV14').addEventListener('click', () => { uploadPage++; renderUploadPage().catch(error => toast(error.message, 'error')); });
  }

  function revokeUrls() { uploadUrls.forEach(URL.revokeObjectURL); uploadUrls = []; }
  async function loadUploads() { const button = $('#loadUploadsV14'); if (button) { button.disabled = true; button.textContent = 'Carregando...'; } try { uploadKeys = (await dbKeys()).sort().reverse(); uploadPage = 1; await renderUploadPage(); } finally { if (button) { button.disabled = false; button.textContent = '↻ Recarregar imagens enviadas'; } } }

  async function renderUploadPage() {
    const grid = $('#uploadGridV14'); if (!grid) return; revokeUrls(); const pages = Math.max(1, Math.ceil(uploadKeys.length / PAGE_SIZE)); uploadPage = Math.min(Math.max(1, uploadPage), pages);
    const ids = uploadKeys.slice((uploadPage - 1) * PAGE_SIZE, uploadPage * PAGE_SIZE); const records = (await Promise.all(ids.map(dbGet))).filter(Boolean); grid.innerHTML = '';
    records.forEach(record => { const url = URL.createObjectURL(record.blob); uploadUrls.push(url); const card = document.createElement('article'); card.className = 'uploaded-card-v14'; card.innerHTML = `<img loading="lazy" src="${url}" alt="${escapeHtml(record.name)}"><div class="uploaded-body-v14"><div class="uploaded-title-v14">${escapeHtml(record.name)}</div><div class="uploaded-date-v14">${new Date(record.createdAt).toLocaleString('pt-BR')}</div><div class="uploaded-actions-v14"><button class="btn small" data-left>← Esquerda</button><button class="btn small secondary" data-right>Direita →</button><button class="btn small danger uploaded-delete-v14" data-delete>Apagar da biblioteca</button></div></div>`; $('img', card).addEventListener('click', () => openViewer(url, record.name)); $('[data-left]', card).addEventListener('click', () => applyFileToSide(new File([record.blob], record.name, {type:record.type}), 'left', true).then(() => toast('Imagem aplicada à esquerda.', 'ok')).catch(error => toast(error.message, 'error'))); $('[data-right]', card).addEventListener('click', () => applyFileToSide(new File([record.blob], record.name, {type:record.type}), 'right', true).then(() => toast('Imagem aplicada à direita.', 'ok')).catch(error => toast(error.message, 'error'))); $('[data-delete]', card).addEventListener('click', async () => { if (!confirm('Apagar esta imagem da biblioteca?')) return; await dbDelete(record.id); await loadUploads(); toast('Imagem apagada.', 'ok'); }); grid.appendChild(card); });
    $('#uploadCountV14').textContent = `${uploadKeys.length} imagem(ns)`; $('#uploadEmptyV14').hidden = uploadKeys.length > 0; $('#uploadPaginationV14').hidden = uploadKeys.length <= PAGE_SIZE; $('#uploadPageInfoV14').textContent = `Página ${uploadPage} de ${pages}`; $('#uploadPrevV14').disabled = uploadPage <= 1; $('#uploadNextV14').disabled = uploadPage >= pages;
  }

  function openViewer(source, title) { const image = $('#viewerImage'); if (!image) return; image.src = source; image.style.filter = 'none'; if ($('#viewerTitle')) $('#viewerTitle').textContent = title || 'Visualização'; $('#viewerDialog')?.showModal(); }
  async function applyUrlToSide(url, side, name = 'arte.webp') { const response = await fetch(url, {cache:'no-store'}); if (!response.ok) throw new Error('Não foi possível carregar esta arte.'); const blob = await response.blob(); await applyFileToSide(new File([blob], name, {type:blob.type || 'image/webp'}), side, true); }

  function prepareGeneratedArchive() {
    const archive = $('.archive'); if (!archive) return; const title = $('.card-head h2', archive); const description = $('.card-head p', archive); const button = $('#refreshArchiveBtn');
    if (title) title.textContent = 'Imagens geradas pela IA'; if (description) description.textContent = 'Clique em carregar somente quando precisar. As artes não são buscadas durante a abertura.';
    if (button && button.dataset.manualV14 !== '1') { button.dataset.manualV14 = '1'; button.textContent = '↻ Carregar artes geradas'; }
    enhanceGeneratedCards();
  }

  function enhanceGeneratedCards() {
    const archive = $('.archive'); if (!archive) return;
    $$('.archive-item', archive).forEach(card => { if (card.dataset.dualV14 === '1') return; const image = $('img', card); const actions = $('.archive-actions', card); if (!image || !actions) return; card.dataset.dualV14 = '1'; actions.classList.add('generated-dual-v14'); const originalUse = $('[data-use]', actions) || $('button:not(.danger)', actions); if (originalUse) originalUse.textContent = 'Direita →'; const left = document.createElement('button'); left.type = 'button'; left.className = 'btn small generated-left-v14'; left.textContent = '← Esquerda'; left.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); applyUrlToSide(image.currentSrc || image.src, 'left', image.alt || 'arte-gerada.webp').then(() => toast('Arte aplicada à esquerda.', 'ok')).catch(error => toast(error.message, 'error')); }); actions.insertBefore(left, originalUse || actions.firstChild); image.loading = 'lazy'; });
  }

  function scheduleArchiveEnhancement() { clearTimeout(archiveObserverTimer); archiveObserverTimer = setTimeout(enhanceGeneratedCards, 100); }
  function initialize() { injectStyles(); addMaleThemes(); addQuickStart(); addTargetSelector(); replaceGenerateButton(); attachUploadCapture(); addUploadLibrary(); prepareGeneratedArchive(); }

  const timer = setInterval(initialize, 300); setTimeout(() => clearInterval(timer), 30000);
  new MutationObserver(scheduleArchiveEnhancement).observe(document.documentElement, {childList:true, subtree:true});
  initialize();
})();
