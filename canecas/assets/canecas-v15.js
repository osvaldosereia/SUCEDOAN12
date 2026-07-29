(() => {
  'use strict';

  const VERSION = '20260729-15';
  const PAGE_SIZE = 5;
  const DB_NAME = 'canecas-production-v15';
  const DB_VERSION = 1;
  const STORE_UPLOADS = 'uploads';
  const TARGET_KEY = 'canecasGenerationTargetV15';
  const ADJUST_KEY = 'canecasImageAdjustmentsV15';
  const CACHE_GENERATED = 'canecasGeneratedCacheV15';
  const CACHE_UPLOADS = 'canecasUploadsCacheV15';

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

  const PALETTES = [
    'A IA escolhe a paleta mais adequada',
    'Tons suaves florais e delicados',
    'Tons quentes acolhedores e afetivos',
    'Tons terrosos naturais e orgânicos',
    'Pastéis leves e românticos',
    'Clássica elegante e refinada',
    'Vibrante alegre e luminosa',
    'Frios serenos e suaves',
    'Romântica delicada com contraste leve',
    'Neutros sofisticados com ponto de destaque',
    'Tropical clara e cheia de vida'
  ];

  const MALE_THEMES = {
    'Masculino clássico': ['IA criar livremente','monograma elegante e linhas finas','relógio clássico e detalhes discretos','brasão com iniciais','terno, gravata e composição refinada','coroa minimalista e nome','tipografia forte com moldura clássica','leão estilizado e nome','bússola e linhas sofisticadas','emblema premium com iniciais','detalhes em couro e metal ilustrados'],
    'Churrasco': ['IA criar livremente','churrasqueira, fogo e utensílios','tábua, faca e carne assada','avental e ferramentas de churrasco','emblema do mestre churrasqueiro','grelha, brasas e fumaça leve','espetos e lettering robusto','churrasco de domingo e bebida sem marca','boi estilizado e fogo','facas cruzadas e texto em destaque','selo rústico de churrasqueiro'],
    'Futebol': ['IA criar livremente','bola e linhas de movimento','estádio e refletores','camisa genérica e texto','escudo esportivo personalizado','chuteira e bola','gramado e gol','torcida estilizada e confetes','troféu e estrelas','número de jogador em destaque','emblema esportivo sem marcas de times'],
    'Pesca': ['IA criar livremente','peixe e ondas suaves','vara, anzol e lago','barco de pesca ao amanhecer','emblema de pescador','peixe saltando e respingos','rio, montanhas e natureza','isca, linha e texto','silhueta de pescador','bússola, peixe e ondas','selo rústico de pesca esportiva'],
    'Oficina e ferramentas': ['IA criar livremente','chaves cruzadas e engrenagens','caixa de ferramentas e texto','martelo, alicate e parafusos','emblema de mecânico','engrenagem com iniciais','oficina industrial estilizada','capacete e ferramentas','motor, pistão e linhas técnicas','placa vintage de oficina','ferramentas organizadas em composição moderna']
  };

  const MALE_STYLES = [
    'Emblema masculino clássico',
    'Vintage rústico',
    'Esportivo dinâmico',
    'Industrial moderno',
    'Aventura e natureza'
  ];

  let targetSide = localStorage.getItem(TARGET_KEY) === 'left' ? 'left' : 'right';
  let internalApply = false;
  let generatedApply = false;
  let generating = false;
  let uploadPage = 1;
  let generatedPage = 1;
  let uploadedItems = [];
  let generatedItems = [];
  let uploadUrls = [];
  let controlsReady = false;

  let adjustments = loadAdjustments();

  function loadAdjustments() {
    try {
      const saved = JSON.parse(localStorage.getItem(ADJUST_KEY) || '{}');
      return {
        left: normalizeAdjust(saved.left),
        right: normalizeAdjust(saved.right)
      };
    } catch {
      return {left: normalizeAdjust(), right: normalizeAdjust()};
    }
  }

  function normalizeAdjust(value = {}) {
    return {
      brightness: clamp(Number(value.brightness) || 100, 40, 180),
      saturation: clamp(Number(value.saturation) || 100, 0, 200),
      contrast: clamp(Number(value.contrast) || 100, 40, 180)
    };
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function saveAdjustments() { localStorage.setItem(ADJUST_KEY, JSON.stringify(adjustments)); }
  function filterFor(side) {
    const a = adjustments[side];
    return `brightness(${a.brightness}%) saturate(${a.saturation}%) contrast(${a.contrast}%)`;
  }

  function toast(message, type = 'ok') {
    const area = $('#toastArea');
    if (!area) return console.log(message);
    const element = document.createElement('div');
    element.className = `toast ${type}`;
    element.textContent = message;
    area.appendChild(element);
    setTimeout(() => element.remove(), 4300);
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  }

  function injectStyles() {
    if ($('#canecasV15Styles')) return;
    const style = document.createElement('style');
    style.id = 'canecasV15Styles';
    style.textContent = `
      .enhancement-check-v15{display:flex!important;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--line,#e6dbd1);border-radius:11px;background:#fcfaf8}
      .enhancement-check-v15 input{width:auto!important;flex:0 0 auto;transform:scale(1.15)}
      .dual-start-v15{margin-bottom:18px}.dual-grid-v15{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .dual-box-v15{border:1px solid var(--line,#e6dbd1);border-radius:15px;padding:14px;background:#fcfaf8}
      .dual-box-v15 h3{margin:0 0 4px;font-size:15px}.dual-box-v15 p{margin:0 0 12px;color:var(--muted,#746b65);font-size:11px}
      .dual-actions-v15,.target-actions-v15{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .target-v15{margin:0 0 14px;border:1px solid var(--line,#e6dbd1);border-radius:13px;padding:11px;background:#fcfaf8}
      .target-title-v15{font-size:12px;font-weight:850;margin-bottom:8px}.target-actions-v15 button.active{background:var(--brand,#70422f);border-color:var(--brand,#70422f);color:#fff}
      .target-badge-v15{display:inline-flex;align-items:center;border-radius:999px;background:#e9f4fb;color:#327aa5;padding:5px 9px;font-size:10px;font-weight:850;margin-left:6px}
      .image-adjust-v15{border-top:1px solid var(--line,#e6dbd1);margin-top:9px;padding-top:9px;display:grid;gap:6px}
      .image-adjust-row-v15{display:grid;grid-template-columns:minmax(72px,1fr) 34px 48px 34px;gap:5px;align-items:center;font-size:11px}
      .image-adjust-row-v15 strong{margin:0!important;font-size:11px!important}.image-adjust-row-v15 button{min-height:30px!important;padding:4px 7px!important}.image-adjust-value-v15{text-align:center;font-weight:850;font-size:11px}
      .library-v15{margin-top:20px}.library-grid-v15{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-top:15px}
      .library-card-v15{border:1px solid var(--line,#e6dbd1);border-radius:14px;overflow:hidden;background:#fff;min-width:0}.library-card-v15 img{display:block;width:100%;aspect-ratio:1;object-fit:contain;background:#fff;cursor:zoom-in}
      .library-body-v15{padding:9px}.library-title-v15{font-size:11px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.library-meta-v15{font-size:9px;color:var(--muted,#746b65);margin-top:3px}
      .library-actions-v15{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:7px}.library-delete-v15{grid-column:1/-1}.library-placeholder-v15{text-align:center;color:var(--muted,#746b65);padding:28px 10px;border:1px dashed var(--line,#e6dbd1);border-radius:13px;margin-top:15px}
      .archive .archive-grid{grid-template-columns:repeat(5,minmax(0,1fr))!important}.archive .archive-item{min-width:0}.archive .archive-title{font-size:11px!important}
      #automaticBtn,.automatic-note,.brightness-enhancement{display:none!important}
      @media(max-width:1000px){.library-grid-v15,.archive .archive-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
      @media(max-width:680px){.dual-grid-v15,.dual-actions-v15,.target-actions-v15{grid-template-columns:1fr}.library-grid-v15,.archive .archive-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.library-actions-v15{grid-template-columns:1fr}.library-delete-v15{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function addPaletteAndContrast() {
    const visual = $('#visualStyle');
    const amount = $('#decorationAmount');
    if (!visual || !amount) return;
    if (!$('#paletteSelect')) {
      const label = document.createElement('label');
      label.className = 'field';
      label.innerHTML = `Paleta de cores<select id="paletteSelect">${PALETTES.map((value,index) => `<option value="${escapeHtml(value)}">${index === 0 ? 'IA escolher' : escapeHtml(value)}</option>`).join('')}</select><span class="help">Orientação estética para a IA, sem definir cores exatas.</span>`;
      visual.closest('label.field')?.insertAdjacentElement('afterend', label);
    }
    if (!$('#nameContrast')) {
      const label = document.createElement('label');
      label.className = 'field full enhancement-check-v15';
      label.innerHTML = '<input id="nameContrast" type="checkbox" checked><span>Destacar o texto com cores diferentes da composição principal</span>';
      amount.closest('label.field')?.insertAdjacentElement('afterend', label);
    }
  }

  function addMaleThemes() {
    const theme = $('#themeSelect');
    const decoration = $('#decorationSelect');
    const visual = $('#visualStyle');
    if (!theme || !decoration || !visual) return;
    Object.keys(MALE_THEMES).forEach(name => {
      if (![...theme.options].some(option => option.value === name)) theme.add(new Option(name, name));
    });
    MALE_STYLES.forEach(name => {
      if (![...visual.options].some(option => option.value === name)) visual.add(new Option(name, name));
    });
    if (theme.dataset.maleV15 !== '1') {
      theme.dataset.maleV15 = '1';
      theme.addEventListener('change', () => {
        const values = MALE_THEMES[theme.value];
        if (!values) return;
        decoration.innerHTML = values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
        decoration.value = values[0];
        decoration.dispatchEvent(new Event('input', {bubbles:true}));
        decoration.dispatchEvent(new Event('change', {bubbles:true}));
      });
    }
  }

  function enableLongText() {
    const input = $('#personName');
    if (!input || input.dataset.longTextV15 === '1') return;
    input.dataset.longTextV15 = '1';
    input.removeAttribute('maxlength');
    input.placeholder = 'Digite um nome, frase ou mensagem, sem limite de caracteres';
    input.setAttribute('aria-label', 'Nome, frase ou mensagem personalizada');
    const field = input.closest('label.field');
    if (field) {
      const help = document.createElement('span');
      help.className = 'help';
      help.textContent = 'Aceita nomes, frases curtas ou mensagens maiores. O texto será enviado exatamente como digitado.';
      field.appendChild(help);
    }
    const card = input.closest('.card');
    const title = $('.card-head h2', card);
    const description = $('.card-head p', card);
    if (title) title.textContent = 'Gerar imagem personalizada';
    if (description) description.textContent = 'Use um nome, uma frase ou uma mensagem maior e envie a criação para qualquer lado.';
  }

  function setTarget(side, scroll = false) {
    targetSide = side === 'left' ? 'left' : 'right';
    localStorage.setItem(TARGET_KEY, targetSide);
    $$('[data-target-v15]').forEach(button => button.classList.toggle('active', button.dataset.targetV15 === targetSide));
    const badge = $('#targetBadgeV15');
    if (badge) badge.textContent = targetSide === 'left' ? 'GERAR PARA A ESQUERDA' : 'GERAR PARA A DIREITA';
    if (scroll) {
      $('#personName')?.closest('.card')?.scrollIntoView({behavior:'smooth', block:'start'});
      setTimeout(() => $('#personName')?.focus(), 350);
    }
  }

  function addQuickStart() {
    if ($('#dualStartV15')) return;
    const workspace = $('.workspace');
    if (!workspace) return;
    const section = document.createElement('section');
    section.id = 'dualStartV15';
    section.className = 'card dual-start-v15';
    section.innerHTML = `<div class="card-head"><div class="head-title"><div class="step">1</div><div><h2>Preencher os dois lados</h2><p>Em cada lado você pode subir uma imagem ou gerar uma arte personalizada.</p></div></div><span class="badge">ESQUERDA + DIREITA</span></div><div class="card-body"><div class="dual-grid-v15"><div class="dual-box-v15"><h3>Lado esquerdo</h3><p>Imagem pronta ou texto personalizado.</p><div class="dual-actions-v15"><button class="btn secondary" data-upload-side-v15="left">↥ Subir imagem</button><button class="btn primary" data-generate-side-v15="left">✨ Gerar</button></div></div><div class="dual-box-v15"><h3>Lado direito</h3><p>Imagem pronta ou texto personalizado.</p><div class="dual-actions-v15"><button class="btn secondary" data-upload-side-v15="right">↥ Subir imagem</button><button class="btn primary" data-generate-side-v15="right">✨ Gerar</button></div></div></div><input id="quickUploadV15" type="file" accept="image/png,image/jpeg,image/webp" hidden></div>`;
    workspace.insertAdjacentElement('beforebegin', section);
    let side = 'left';
    $$('[data-upload-side-v15]', section).forEach(button => button.addEventListener('click', () => {
      side = button.dataset.uploadSideV15;
      $('#quickUploadV15').value = '';
      $('#quickUploadV15').click();
    }));
    $$('[data-generate-side-v15]', section).forEach(button => button.addEventListener('click', () => setTarget(button.dataset.generateSideV15, true)));
    $('#quickUploadV15').addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const record = await saveManualUpload(file);
        await applyFileToSide(file, side, true, false);
        toast(`Imagem aplicada ao lado ${side === 'left' ? 'esquerdo' : 'direito'} e salva em Imagens enviadas.`, 'ok');
        if (record.remoteError) toast(record.remoteError, 'error');
      } catch (error) { toast(error.message, 'error'); }
    });
  }

  function addTargetSelector() {
    if ($('#targetV15')) return;
    const field = $('#personName')?.closest('label.field');
    if (!field) return;
    const box = document.createElement('div');
    box.id = 'targetV15';
    box.className = 'target-v15 field full';
    box.innerHTML = `<div class="target-title-v15">Onde colocar a próxima arte?<span id="targetBadgeV15" class="target-badge-v15"></span></div><div class="target-actions-v15"><button class="btn" data-target-v15="left">← Lado esquerdo</button><button class="btn" data-target-v15="right">Lado direito →</button></div>`;
    field.insertAdjacentElement('beforebegin', box);
    $$('[data-target-v15]', box).forEach(button => button.addEventListener('click', () => setTarget(button.dataset.targetV15)));
    setTarget(targetSide);
  }

  function readSettings() {
    let settings = {};
    try { settings = JSON.parse(localStorage.getItem('canecasStudioSettings') || '{}'); } catch {}
    return {
      webhook: settings.webhook || $('#webhookInput')?.value.trim() || '',
      owner: settings.owner || 'osvaldosereia',
      repo: settings.repo || 'SUCEDOAN12',
      branch: settings.branch || 'main',
      folder: String(settings.folder || 'canecas/imagens').replace(/^\/+|\/+$/g, ''),
      token: sessionStorage.getItem('canecasGithubToken') || ''
    };
  }

  function colorInstruction() {
    const palette = $('#paletteSelect')?.value || PALETTES[0];
    const contrast = $('#nameContrast')?.checked !== false;
    return `Orientação de paleta: ${palette}. Esta é apenas uma direção estética, sem cores exatas. ${contrast ? 'Use no texto cores diferentes, porém harmoniosas, para que ele se destaque claramente da composição.' : 'O texto pode seguir a mesma linguagem de cores da composição, mantendo ótima legibilidade.'}`;
  }

  function currentPrompt() {
    const text = $('#personName')?.value.trim() || 'TEXTO PERSONALIZADO';
    const basePreview = String($('#promptPreview')?.textContent || '').trim();
    const base = basePreview || `Crie uma arte gráfica quadrada para sublimação em caneca branca com o texto “${text}” em destaque. Tema: ${$('#themeSelect')?.value || 'livre'}. Decoração: ${$('#decorationSelect')?.value || 'IA escolher'}. Estilo: ${$('#visualStyle')?.value || 'IA escolher'}.`;
    return `${base} O conteúdo informado pode ser um nome, uma frase curta ou uma mensagem longa, sem limite de caracteres. Reproduza o texto exatamente como digitado, respeitando acentos, pontuação, maiúsculas e quebras naturais de linha. Organize o texto em uma ou mais linhas com excelente legibilidade e destaque. ${colorInstruction()} Fundo branco puro, sem mockup, sem marca d’água e sem acrescentar outro texto.`;
  }

  function buildPayload() {
    const settings = readSettings();
    const text = $('#personName')?.value.trim() || '';
    return {
      action:'generate_mug_art',
      request_id:crypto.randomUUID(),
      slot:targetSide === 'left' ? 1 : 2,
      prompt:currentPrompt(),
      output:{aspect_ratio:'1:1',background:'white',format:'webp'},
      personalization:{
        name:text,
        text,
        target_side:targetSide,
        theme:$('#themeSelect')?.value || '',
        decoration:$('#decorationSelect')?.value || '',
        font_style:$('#fontStyle')?.value || '',
        visual_style:$('#visualStyle')?.value || '',
        palette:$('#paletteSelect')?.value || PALETTES[0],
        name_contrast:$('#nameContrast')?.checked !== false,
        amount:$('#decorationAmount')?.value || 'média'
      },
      storage:{folder:`${settings.folder}/artes-geradas/${new Date().toISOString().slice(0,10)}`}
    };
  }

  function setStatus(message, type = '') {
    const status = $('#generationStatus');
    if (!status) return;
    status.className = `status ${type}`;
    status.textContent = message;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Não foi possível ler a imagem.'));
      reader.readAsDataURL(blob);
    });
  }

  async function extractImage(response) {
    if ((response.headers.get('content-type') || '').startsWith('image/')) return blobToDataUrl(await response.blob());
    const raw = await response.text();
    let value;
    try { value = JSON.parse(raw); } catch { value = raw; }
    const seen = new Set();
    function find(item) {
      if (item == null) return null;
      if (typeof item === 'string') {
        const string = item.trim();
        if (/^data:image\//i.test(string) || /^https?:\/\//i.test(string)) return string;
        if (string.length > 500 && /^[A-Za-z0-9+/=\r\n]+$/.test(string)) return `data:image/webp;base64,${string.replace(/\s/g, '')}`;
        return null;
      }
      if (typeof item !== 'object' || seen.has(item)) return null;
      seen.add(item);
      for (const key of ['image_base64','dataUrl','data_url','b64_json','image_url','url','image']) {
        if (key in item) { const found = find(item[key]); if (found) return found; }
      }
      for (const child of Object.values(item)) { const found = find(child); if (found) return found; }
      return null;
    }
    let source = find(value);
    if (!source) throw new Error('A resposta do Make não contém uma imagem.');
    if (/^https?:\/\//i.test(source)) {
      const imageResponse = await fetch(source, {cache:'no-store'});
      if (!imageResponse.ok) throw new Error('Não foi possível baixar a imagem retornada pelo Make.');
      source = await blobToDataUrl(await imageResponse.blob());
    }
    return source;
  }

  async function dataUrlToFile(dataUrl, name) {
    const blob = await (await fetch(dataUrl)).blob();
    const extension = blob.type.includes('png') ? 'png' : blob.type.includes('jpeg') ? 'jpg' : 'webp';
    return new File([blob], `${name.replace(/\.[^.]+$/, '')}.${extension}`, {type:blob.type || 'image/webp'});
  }

  async function applyFileToSide(file, side, fromLibrary = false, fromGeneration = false) {
    const input = side === 'left' ? $('#leftFile') : $('#rightFile');
    if (!input || typeof DataTransfer !== 'function') throw new Error('O navegador não permite aplicar esta imagem ao lado escolhido.');
    internalApply = fromLibrary;
    generatedApply = fromGeneration;
    const autoGithub = $('#autoGithub');
    const restoreAuto = autoGithub?.checked;
    if (autoGithub) autoGithub.checked = false;
    try {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', {bubbles:true}));
      await new Promise(resolve => setTimeout(resolve, 1200));
    } finally {
      internalApply = false;
      generatedApply = false;
      if (autoGithub && restoreAuto) autoGithub.checked = true;
    }
  }

  async function generateToTarget() {
    if (generating) return;
    const text = $('#personName')?.value.trim();
    if (!text) throw new Error('Digite um nome, frase ou mensagem.');
    const settings = readSettings();
    if (!settings.webhook) throw new Error('Configure o webhook do Make em Integrações.');
    generating = true;
    const button = $('#generateBtn');
    if (button) button.disabled = true;
    setStatus(`Gerando para o lado ${targetSide === 'left' ? 'esquerdo' : 'direito'}...`, 'loading');
    try {
      const form = new URLSearchParams();
      form.set('payload', JSON.stringify(buildPayload()));
      const response = await fetch(settings.webhook, {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:form.toString()});
      if (!response.ok) throw new Error(`Make respondeu HTTP ${response.status}`);
      const dataUrl = await extractImage(response);
      const file = await dataUrlToFile(dataUrl, `arte-${Date.now()}-${targetSide}.webp`);
      await applyFileToSide(file, targetSide, false, true);
      setStatus(`Arte aplicada ao lado ${targetSide === 'left' ? 'esquerdo' : 'direito'}.`, 'ok');
      toast('Arte criada. Clique em “Carregar artes geradas” para atualizar o catálogo.', 'ok');
    } finally {
      generating = false;
      if (button) button.disabled = false;
    }
  }

  function replaceGenerateButton() {
    const current = $('#generateBtn');
    if (!current || current.dataset.v15 === '1') return;
    const replacement = current.cloneNode(true);
    replacement.dataset.v15 = '1';
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
        if (!db.objectStoreNames.contains(STORE_UPLOADS)) db.createObjectStore(STORE_UPLOADS, {keyPath:'id'});
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

  async function dbAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_UPLOADS, 'readonly').objectStore(STORE_UPLOADS).getAll();
      request.onsuccess = () => { const result = request.result || []; db.close(); resolve(result); };
      request.onerror = () => { const error = request.error; db.close(); reject(error); };
    });
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const step = 0x8000;
    for (let index = 0; index < bytes.length; index += step) binary += String.fromCharCode(...bytes.subarray(index, index + step));
    return btoa(binary);
  }

  function safeFilename(name, type) {
    const extension = type.includes('png') ? 'png' : type.includes('jpeg') ? 'jpg' : 'webp';
    const base = String(name || 'imagem').replace(/\.[^.]+$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0,60) || 'imagem';
    return `${Date.now()}-${crypto.randomUUID().slice(0,8)}-${base}.${extension}`;
  }

  async function uploadManualToGithub(file) {
    const settings = readSettings();
    if (!settings.token) return {path:'', error:'Imagem salva neste navegador. Para também salvar na pasta do GitHub, informe o token nas Integrações.'};
    const date = new Date().toISOString().slice(0,10);
    const path = `${settings.folder}/imagens-enviadas/${date}/${safeFilename(file.name, file.type)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const endpoint = `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
    const response = await fetch(endpoint, {
      method:'PUT',
      headers:{'Authorization':`Bearer ${settings.token}`,'Accept':'application/vnd.github+json','Content-Type':'application/json'},
      body:JSON.stringify({message:`canecas: adicionar imagem enviada ${path.split('/').pop()}`,content:bytesToBase64(bytes),branch:settings.branch})
    });
    if (!response.ok) throw new Error(`Não foi possível salvar a imagem enviada no GitHub: HTTP ${response.status}`);
    return {path, error:''};
  }

  async function saveManualUpload(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error('Escolha uma imagem JPG, PNG ou WebP.');
    const record = {id:`${Date.now()}-${crypto.randomUUID()}`,name:file.name || 'imagem-enviada',type:file.type,size:file.size,createdAt:new Date().toISOString(),origin:'upload',remotePath:'',blob:file};
    try {
      const remote = await uploadManualToGithub(file);
      record.remotePath = remote.path;
      record.remoteError = remote.error;
    } catch (error) {
      record.remoteError = error.message;
    }
    await dbPut(record);
    const button = $('#loadUploadsV15');
    if (button) button.textContent = '↻ Recarregar imagens enviadas';
    return record;
  }

  function attachManualUploadCapture() {
    [$('#leftFile'), $('#rightFile')].forEach(input => {
      if (!input || input.dataset.captureV15 === '1') return;
      input.dataset.captureV15 = '1';
      input.addEventListener('change', event => {
        if (internalApply || generatedApply) return;
        const file = event.target.files?.[0];
        if (!file) return;
        saveManualUpload(file).then(record => {
          toast('Imagem salva em Imagens enviadas.', 'ok');
          if (record.remoteError) toast(record.remoteError, 'error');
        }).catch(error => toast(error.message, 'error'));
      }, true);
    });
  }

  function apiHeaders() {
    const settings = readSettings();
    return settings.token ? {'Authorization':`Bearer ${settings.token}`,'Accept':'application/vnd.github+json'} : {'Accept':'application/vnd.github+json'};
  }

  async function fetchJsonRetry(url, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await fetch(url, {headers:apiHeaders(), cache:'no-store'});
        if (response.status === 404) return [];
        if (!response.ok) throw new Error(`GitHub respondeu HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      }
    }
    throw lastError;
  }

  async function listGithubImages(rootPath) {
    const settings = readSettings();
    const base = `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/`;
    const queue = [rootPath];
    const images = [];
    while (queue.length) {
      const path = queue.shift();
      const url = `${base}${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(settings.branch)}`;
      const list = await fetchJsonRetry(url);
      if (!Array.isArray(list)) continue;
      list.sort((a,b) => String(b.name).localeCompare(String(a.name)));
      for (const item of list) {
        if (item.type === 'dir') queue.push(item.path);
        else if (item.type === 'file' && /\.(png|jpe?g|webp)$/i.test(item.name)) images.push({name:item.name,path:item.path,url:item.download_url,sha:item.sha,createdAt:item.path.match(/\d{4}-\d{2}-\d{2}/)?.[0] || ''});
      }
    }
    return images.sort((a,b) => b.path.localeCompare(a.path));
  }

  function addUploadLibrary() {
    if ($('#uploadLibraryV15')) return;
    const archive = $('.archive');
    const main = $('main');
    if (!main) return;
    const section = document.createElement('section');
    section.id = 'uploadLibraryV15';
    section.className = 'card library-v15';
    section.innerHTML = `<div class="card-head"><div class="head-title"><div class="step">4</div><div><h2>Imagens enviadas</h2><p>Somente imagens subidas manualmente. Elas ficam separadas das artes geradas, na pasta imagens-enviadas.</p></div></div><button id="loadUploadsV15" class="btn secondary">↻ Carregar imagens enviadas</button></div><div class="card-body"><div class="archive-tools"><label class="field">Pesquisar<input id="uploadSearchV15" type="search" placeholder="Nome ou arquivo..."></label><span id="uploadCountV15" class="badge">Não carregado</span></div><div id="uploadGridV15" class="library-grid-v15"></div><div id="uploadEmptyV15" class="library-placeholder-v15">Clique em “Carregar imagens enviadas”.</div><div id="uploadPaginationV15" class="pagination" hidden><button id="uploadPrevV15" class="btn small">← Anterior</button><span id="uploadPageInfoV15"></span><button id="uploadNextV15" class="btn small">Próxima →</button></div></div>`;
    if (archive) archive.insertAdjacentElement('beforebegin', section); else main.appendChild(section);
    $('#loadUploadsV15').addEventListener('click', () => loadUploadedLibrary().catch(error => toast(error.message, 'error')));
    $('#uploadSearchV15').addEventListener('input', () => { uploadPage = 1; renderUploadedLibrary(); });
    $('#uploadPrevV15').addEventListener('click', () => { if (uploadPage > 1) { uploadPage--; renderUploadedLibrary(); } });
    $('#uploadNextV15').addEventListener('click', () => { uploadPage++; renderUploadedLibrary(); });
  }

  function revokeUploadUrls() { uploadUrls.forEach(url => URL.revokeObjectURL(url)); uploadUrls = []; }

  async function loadUploadedLibrary() {
    const button = $('#loadUploadsV15');
    button.disabled = true;
    button.textContent = 'Carregando...';
    try {
      const local = (await dbAll()).filter(item => item.origin === 'upload');
      let remote = [];
      try {
        remote = await listGithubImages(`${readSettings().folder}/imagens-enviadas`);
        sessionStorage.setItem(CACHE_UPLOADS, JSON.stringify(remote));
      } catch (error) {
        try { remote = JSON.parse(sessionStorage.getItem(CACHE_UPLOADS) || '[]'); } catch {}
        if (!remote.length) throw error;
        toast('O GitHub falhou nesta tentativa. Exibindo a última lista salva.', 'error');
      }
      const remotePaths = new Set(remote.map(item => item.path));
      uploadedItems = [
        ...remote.map(item => ({...item,source:'github'})),
        ...local.filter(item => !item.remotePath || !remotePaths.has(item.remotePath)).map(item => ({...item,source:'local'}))
      ].sort((a,b) => String(b.createdAt || b.path || '').localeCompare(String(a.createdAt || a.path || '')));
      uploadPage = 1;
      renderUploadedLibrary();
    } finally {
      button.disabled = false;
      button.textContent = '↻ Recarregar imagens enviadas';
    }
  }

  function filteredUploads() {
    const query = ($('#uploadSearchV15')?.value || '').trim().toLowerCase();
    return uploadedItems.filter(item => !query || `${item.name || ''} ${item.path || ''}`.toLowerCase().includes(query));
  }

  function openViewer(source, title, side = null) {
    const image = $('#viewerImage');
    if (!image) return;
    image.src = source;
    image.style.filter = side ? filterFor(side) : 'none';
    if ($('#viewerTitle')) $('#viewerTitle').textContent = title || 'Visualização';
    $('#viewerDialog')?.showModal();
  }

  async function fileFromItem(item) {
    if (item.blob) return new File([item.blob], item.name || 'imagem.webp', {type:item.type || item.blob.type || 'image/webp'});
    const response = await fetch(item.url, {cache:'no-store'});
    if (!response.ok) throw new Error('Não foi possível carregar esta imagem.');
    const blob = await response.blob();
    return new File([blob], item.name || 'imagem.webp', {type:blob.type || 'image/webp'});
  }

  function renderUploadedLibrary() {
    const grid = $('#uploadGridV15');
    if (!grid) return;
    revokeUploadUrls();
    const all = filteredUploads();
    const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    uploadPage = clamp(uploadPage, 1, pages);
    const current = all.slice((uploadPage - 1) * PAGE_SIZE, uploadPage * PAGE_SIZE);
    grid.innerHTML = '';
    current.forEach(item => {
      const source = item.blob ? URL.createObjectURL(item.blob) : item.url;
      if (item.blob) uploadUrls.push(source);
      const card = document.createElement('article');
      card.className = 'library-card-v15';
      card.innerHTML = `<img loading="lazy" decoding="async" src="${source}" alt="${escapeHtml(item.name)}"><div class="library-body-v15"><div class="library-title-v15">${escapeHtml(item.name)}</div><div class="library-meta-v15">${item.source === 'github' ? 'GitHub · imagens-enviadas' : 'Este navegador'}</div><div class="library-actions-v15"><button class="btn small" data-left>← Esquerda</button><button class="btn small secondary" data-right>Direita →</button>${item.source === 'local' ? '<button class="btn small danger library-delete-v15" data-delete>Apagar</button>' : ''}</div></div>`;
      $('img', card).addEventListener('click', () => openViewer(source, item.name));
      $('[data-left]', card).addEventListener('click', () => fileFromItem(item).then(file => applyFileToSide(file, 'left', true, false)).then(() => toast('Imagem aplicada à esquerda.', 'ok')).catch(error => toast(error.message, 'error')));
      $('[data-right]', card).addEventListener('click', () => fileFromItem(item).then(file => applyFileToSide(file, 'right', true, false)).then(() => toast('Imagem aplicada à direita.', 'ok')).catch(error => toast(error.message, 'error')));
      $('[data-delete]', card)?.addEventListener('click', async () => {
        if (!confirm('Apagar esta imagem enviada deste navegador?')) return;
        await dbDelete(item.id);
        await loadUploadedLibrary();
        toast('Imagem apagada.', 'ok');
      });
      grid.appendChild(card);
    });
    $('#uploadCountV15').textContent = `${all.length} imagem(ns)`;
    $('#uploadEmptyV15').hidden = all.length > 0;
    $('#uploadPaginationV15').hidden = all.length <= PAGE_SIZE;
    $('#uploadPageInfoV15').textContent = `Página ${uploadPage} de ${pages}`;
    $('#uploadPrevV15').disabled = uploadPage <= 1;
    $('#uploadNextV15').disabled = uploadPage >= pages;
  }

  function prepareGeneratedArchive() {
    const archive = $('.archive');
    if (!archive || archive.dataset.v15 === '1') return;
    archive.dataset.v15 = '1';
    const title = $('.card-head h2', archive);
    const description = $('.card-head p', archive);
    if (title) title.textContent = 'Imagens geradas pela IA';
    if (description) description.textContent = 'Carregamento manual, com 5 imagens por página e busca mais estável.';

    const oldButton = $('#refreshArchiveBtn');
    if (oldButton) {
      const button = oldButton.cloneNode(true);
      button.id = 'refreshArchiveBtn';
      button.textContent = '↻ Carregar artes geradas';
      oldButton.replaceWith(button);
      button.addEventListener('click', () => loadGeneratedLibrary().catch(error => toast(error.message, 'error')));
    }
    const oldSearch = $('#archiveSearch');
    if (oldSearch) {
      const search = oldSearch.cloneNode(true);
      oldSearch.replaceWith(search);
      search.addEventListener('input', () => { generatedPage = 1; renderGeneratedLibrary(); });
    }
    const oldPrev = $('#archivePrev');
    if (oldPrev) {
      const prev = oldPrev.cloneNode(true); oldPrev.replaceWith(prev);
      prev.addEventListener('click', () => { if (generatedPage > 1) { generatedPage--; renderGeneratedLibrary(); } });
    }
    const oldNext = $('#archiveNext');
    if (oldNext) {
      const next = oldNext.cloneNode(true); oldNext.replaceWith(next);
      next.addEventListener('click', () => { generatedPage++; renderGeneratedLibrary(); });
    }
    const grid = $('#archiveGrid');
    if (grid) grid.innerHTML = '';
    const empty = $('#archiveEmpty');
    if (empty) { empty.hidden = false; empty.textContent = 'Clique em “Carregar artes geradas”.'; }
    const count = $('#archiveCount');
    if (count) count.textContent = 'Não carregado';
    const pagination = $('#archivePagination');
    if (pagination) pagination.hidden = true;
  }

  async function loadGeneratedLibrary() {
    const button = $('#refreshArchiveBtn');
    button.disabled = true;
    button.textContent = 'Carregando...';
    try {
      try {
        generatedItems = await listGithubImages(`${readSettings().folder}/artes-geradas`);
        sessionStorage.setItem(CACHE_GENERATED, JSON.stringify(generatedItems));
      } catch (error) {
        try { generatedItems = JSON.parse(sessionStorage.getItem(CACHE_GENERATED) || '[]'); } catch {}
        if (!generatedItems.length) throw error;
        toast('A busca no GitHub falhou nesta tentativa. Exibindo a última lista salva.', 'error');
      }
      generatedPage = 1;
      renderGeneratedLibrary();
    } finally {
      button.disabled = false;
      button.textContent = '↻ Recarregar artes geradas';
    }
  }

  function filteredGenerated() {
    const query = ($('#archiveSearch')?.value || '').trim().toLowerCase();
    return generatedItems.filter(item => !query || `${item.name} ${item.path}`.toLowerCase().includes(query));
  }

  function renderGeneratedLibrary() {
    const grid = $('#archiveGrid');
    if (!grid) return;
    const all = filteredGenerated();
    const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    generatedPage = clamp(generatedPage, 1, pages);
    const current = all.slice((generatedPage - 1) * PAGE_SIZE, generatedPage * PAGE_SIZE);
    grid.innerHTML = '';
    current.forEach(item => {
      const card = document.createElement('article');
      card.className = 'archive-item';
      card.innerHTML = `<img loading="lazy" decoding="async" src="${item.url}" alt="${escapeHtml(item.name)}"><div class="archive-body"><div class="archive-title">${escapeHtml(item.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g,' '))}</div><div class="tags"><span class="tag">Gerada pela IA</span></div><div class="archive-actions" style="grid-template-columns:1fr 1fr"><button class="btn small" data-left>← Esquerda</button><button class="btn small secondary" data-right>Direita →</button></div></div>`;
      $('img', card).addEventListener('click', () => openViewer(item.url, item.name));
      $('[data-left]', card).addEventListener('click', () => fileFromItem(item).then(file => applyFileToSide(file, 'left', true, false)).then(() => toast('Arte aplicada à esquerda.', 'ok')).catch(error => toast(error.message, 'error')));
      $('[data-right]', card).addEventListener('click', () => fileFromItem(item).then(file => applyFileToSide(file, 'right', true, false)).then(() => toast('Arte aplicada à direita.', 'ok')).catch(error => toast(error.message, 'error')));
      grid.appendChild(card);
    });
    $('#archiveCount').textContent = `${all.length} arte(s)`;
    $('#archiveEmpty').hidden = all.length > 0;
    $('#archivePagination').hidden = all.length <= PAGE_SIZE;
    $('#archivePageInfo').textContent = `Página ${generatedPage} de ${pages}`;
    $('#archivePrev').disabled = generatedPage <= 1;
    $('#archiveNext').disabled = generatedPage >= pages;
  }

  function patchCanvasFilters() {
    if (window.__canecasFiltersV15) return;
    window.__canecasFiltersV15 = true;
    const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(...args) {
      let previousFilter;
      try {
        const canvas = this.canvas;
        const ratio = canvas?.width && canvas?.height ? canvas.width / canvas.height : 0;
        if (Math.abs(ratio - (248 / 98)) < 0.035) {
          let index = -1;
          if (args.length === 5) index = 1;
          if (args.length === 9) index = 5;
          if (index >= 0) {
            const dx = Number(args[index]);
            const dw = Number(args[index + 2]);
            if (Number.isFinite(dx) && Number.isFinite(dw)) {
              const px = canvas.width / 248;
              const centerMm = (dx + dw / 2) / px;
              const widthMm = dw / px;
              if (widthMm > 35) {
                const side = centerMm < 124 ? 'left' : 'right';
                previousFilter = this.filter;
                this.filter = filterFor(side);
              }
            }
          }
        }
      } catch (error) { console.warn('Filtro individual ignorado:', error); }
      const result = nativeDrawImage.apply(this, args);
      if (previousFilter !== undefined) this.filter = previousFilter;
      return result;
    };
  }

  function triggerPreview() {
    const scale = $('[id^="scale-"][type="range"], .resize-card input[type="range"]');
    if (scale) scale.dispatchEvent(new Event('input', {bubbles:true}));
    applyCssFilters();
  }

  function updateAdjustValues(side) {
    const a = adjustments[side];
    for (const key of ['brightness','saturation','contrast']) {
      const value = $(`[data-adjust-value-v15="${side}-${key}"]`);
      if (value) value.textContent = `${a[key]}%`;
    }
  }

  function changeAdjustment(side, key, delta) {
    const limits = key === 'saturation' ? [0,200] : [40,180];
    adjustments[side][key] = clamp(adjustments[side][key] + delta, limits[0], limits[1]);
    saveAdjustments();
    updateAdjustValues(side);
    triggerPreview();
  }

  function resetAdjustments(side) {
    adjustments[side] = normalizeAdjust();
    saveAdjustments();
    updateAdjustValues(side);
    triggerPreview();
  }

  function sideForResizeCard(card, index) {
    const ids = $$('[id]', card).map(element => element.id.toLowerCase()).join(' ');
    const text = card.textContent.toLowerCase();
    if (ids.includes('left') || text.includes('esquer')) return 'left';
    if (ids.includes('right') || text.includes('direit')) return 'right';
    return index === 0 ? 'left' : index === 1 ? 'right' : null;
  }

  function addImageAdjustments() {
    const cards = $$('.resize-grid .resize-card');
    if (!cards.length) return;
    const used = new Set();
    cards.forEach((card,index) => {
      const side = sideForResizeCard(card,index);
      if (!side || used.has(side) || card.querySelector('.image-adjust-v15')) return;
      used.add(side);
      const box = document.createElement('div');
      box.className = 'image-adjust-v15';
      box.innerHTML = `${[
        ['brightness','Brilho'],
        ['saturation','Intensidade'],
        ['contrast','Contraste']
      ].map(([key,label]) => `<div class="image-adjust-row-v15"><strong>${label}</strong><button class="btn small" type="button" data-adjust-v15="${side}-${key}" data-delta="-2">−</button><span class="image-adjust-value-v15" data-adjust-value-v15="${side}-${key}">${adjustments[side][key]}%</span><button class="btn small" type="button" data-adjust-v15="${side}-${key}" data-delta="2">+</button></div>`).join('')}<button class="btn small" type="button" data-adjust-reset-v15="${side}">↺ Resetar imagem</button>`;
      card.appendChild(box);
      $$('[data-adjust-v15]', box).forEach(button => button.addEventListener('click', () => {
        const [buttonSide,key] = button.dataset.adjustV15.split('-');
        changeAdjustment(buttonSide,key,Number(button.dataset.delta));
      }));
      $('[data-adjust-reset-v15]', box).addEventListener('click', () => resetAdjustments(side));
    });
    controlsReady = used.size > 0;
    applyCssFilters();
  }

  function applyCssFilters() {
    const leftSelectors = ['#leftArtBox img','#leftPreview','#leftCurrent img','.left-art img'];
    const rightSelectors = ['#rightArtBox img','#rightPreview','#rightCurrent img','.right-art img'];
    leftSelectors.forEach(selector => $$(selector).forEach(image => { image.style.filter = filterFor('left'); }));
    rightSelectors.forEach(selector => $$(selector).forEach(image => { image.style.filter = filterFor('right'); }));
    const printImages = $$('#printRoot .print-sheet img');
    if (printImages[0]) printImages[0].style.filter = filterFor('left');
    if (printImages[1]) printImages[1].style.filter = filterFor('right');
  }

  function beforePrint() { setTimeout(applyCssFilters, 0); }

  function initialize() {
    injectStyles();
    patchCanvasFilters();
    addPaletteAndContrast();
    addMaleThemes();
    enableLongText();
    addQuickStart();
    addTargetSelector();
    replaceGenerateButton();
    attachManualUploadCapture();
    addUploadLibrary();
    prepareGeneratedArchive();
    addImageAdjustments();
    applyCssFilters();
  }

  window.addEventListener('beforeprint', beforePrint);
  const timer = setInterval(() => {
    initialize();
    if ($('#personName') && $('#generateBtn') && $('.resize-grid') && controlsReady) clearInterval(timer);
  }, 350);
  setTimeout(() => clearInterval(timer), 20000);
  new MutationObserver(() => {
    clearTimeout(window.__canecasV15MutationTimer);
    window.__canecasV15MutationTimer = setTimeout(() => {
      addImageAdjustments();
      applyCssFilters();
    }, 120);
  }).observe(document.documentElement,{childList:true,subtree:true});
  initialize();
})();
