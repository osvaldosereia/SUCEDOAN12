(() => {
  'use strict';

  const VERSION = '20260729-12';
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

  const AUTO_COMBOS = [
    {font:'Script delicada',style:'Ilustração delicada em aquarela',palette:PALETTES[1],amount:'média',contrast:true,decorationIndex:1},
    {font:'Lettering romântico',style:'Lettering artesanal decorado',palette:PALETTES[4],amount:'rica',contrast:true,decorationIndex:2},
    {font:'Serif elegante',style:'Minimalista elegante',palette:PALETTES[5],amount:'pouca',contrast:true,decorationIndex:3},
    {font:'Moderna forte',style:'Emblema premium',palette:PALETTES[9],amount:'média',contrast:true,decorationIndex:4},
    {font:'Minimalista fina',style:'Ilustração editorial suave',palette:PALETTES[7],amount:'pouca',contrast:false,decorationIndex:5},
    {font:'Divertida decorativa',style:'Cute contemporâneo',palette:PALETTES[6],amount:'rica',contrast:true,decorationIndex:6},
    {font:'Clássica vintage',style:'Vintage delicado',palette:PALETTES[3],amount:'média',contrast:false,decorationIndex:7},
    {font:'Manuscrita leve',style:'Colagem botânica',palette:PALETTES[8],amount:'rica',contrast:true,decorationIndex:8},
    {font:'Script delicada',style:'Desenho manual moderno',palette:PALETTES[2],amount:'média',contrast:true,decorationIndex:9},
    {font:'Serif elegante',style:'Ilustração editorial suave',palette:PALETTES[10],amount:'média',contrast:true,decorationIndex:10}
  ];

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

  let automaticPending = null;
  let originalRightImage = '';
  let applyingBrightness = false;
  let brightnessTimer = null;
  let previewGuard = false;

  function toast(message, type = 'ok') {
    const area = $('#toastArea');
    if (!area) return console.log(message);
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    area.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function ensureOption(select, value) {
    if (!select || !value) return;
    if (![...select.options].some(option => option.value === value)) {
      select.add(new Option(value, value));
    }
  }

  function setSelect(select, value) {
    if (!select) return;
    ensureOption(select, value);
    select.value = value;
    select.dispatchEvent(new Event('input', {bubbles:true}));
    select.dispatchEvent(new Event('change', {bubbles:true}));
  }

  function injectStyles() {
    if ($('#productionEnhancementsV12Styles')) return;
    const style = document.createElement('style');
    style.id = 'productionEnhancementsV12Styles';
    style.textContent = `
      .enhancement-check{display:flex!important;grid-template-columns:none!important;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--line,#e6dbd1);border-radius:11px;background:#fcfaf8}
      .enhancement-check input{width:auto!important;flex:0 0 auto;transform:scale(1.15)}
      .automatic-note{margin-top:9px;padding:10px 11px;border:1px solid #ead6a9;background:#fff9e8;border-radius:11px;color:#6f5220;font-size:11px}
      .brightness-enhancement{margin-top:12px;border:1px solid var(--line,#e6dbd1);border-radius:13px;padding:12px;background:#fcfaf8}
      .brightness-enhancement h3{font-size:13px;margin:0 0 9px}
      .brightness-line{display:grid;grid-template-columns:minmax(160px,1fr) auto;gap:10px;align-items:center}
      .brightness-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      .brightness-value{min-width:56px;text-align:center;font-weight:850;font-size:12px}
      @media(max-width:680px){.brightness-line{grid-template-columns:1fr}.brightness-actions .btn{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function addPaletteAndContrast() {
    if ($('#paletteSelect')) return;
    const visualStyle = $('#visualStyle');
    const amount = $('#decorationAmount');
    if (!visualStyle || !amount) return;

    const paletteLabel = document.createElement('label');
    paletteLabel.className = 'field';
    paletteLabel.innerHTML = `Paleta de cores
      <select id="paletteSelect">${PALETTES.map(value => `<option value="${value}">${value === PALETTES[0] ? 'IA escolher' : value}</option>`).join('')}</select>
      <span class="help">Apenas uma orientação estética para a IA, sem definir cores exatas.</span>`;
    visualStyle.closest('label.field')?.insertAdjacentElement('afterend', paletteLabel);

    const contrastLabel = document.createElement('label');
    contrastLabel.className = 'field full enhancement-check';
    contrastLabel.innerHTML = `<input id="nameContrast" type="checkbox" checked>
      <span>Destacar o nome com cores diferentes da composição principal</span>`;
    amount.closest('label.field')?.insertAdjacentElement('afterend', contrastLabel);

    $('#paletteSelect')?.addEventListener('change', decoratePromptPreview);
    $('#nameContrast')?.addEventListener('change', decoratePromptPreview);
  }

  function addAutomaticButton() {
    if ($('#automaticBtn')) return;
    const generate = $('#generateBtn');
    if (!generate) return;
    const row = generate.closest('.button-row') || generate.parentElement;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn secondary';
    button.id = 'automaticBtn';
    button.textContent = '⚡ Automático';
    generate.insertAdjacentElement('afterend', button);

    const note = document.createElement('div');
    note.className = 'automatic-note';
    note.innerHTML = '<strong>Modo automático:</strong> digite o nome, escolha o tema e clique em Automático. O sistema escolhe 1 entre 10 combinações feitas para o tema e já gera a arte.';
    row.insertAdjacentElement('afterend', note);

    button.addEventListener('click', () => {
      const name = $('#personName')?.value.trim();
      if (!name) {
        toast('Digite o nome da pessoa antes de usar o modo automático.', 'error');
        $('#personName')?.focus();
        return;
      }
      const theme = $('#themeSelect')?.value || 'tema escolhido';
      const comboIndex = Math.floor(Math.random() * AUTO_COMBOS.length);
      const combo = AUTO_COMBOS[comboIndex];
      const decoration = $('#decorationSelect');
      const options = decoration ? [...decoration.options] : [];
      const optionIndex = Math.min(combo.decorationIndex, Math.max(1, options.length - 1));

      setSelect($('#fontStyle'), combo.font);
      setSelect($('#visualStyle'), combo.style);
      setSelect($('#paletteSelect'), combo.palette);
      setSelect($('#decorationAmount'), combo.amount);
      if ($('#nameContrast')) $('#nameContrast').checked = combo.contrast;
      if (decoration && options.length) setSelect(decoration, options[optionIndex]?.value || options[1]?.value || options[0]?.value);

      automaticPending = {theme, combination: comboIndex + 1};
      decoratePromptPreview();
      toast(`Combinação automática ${comboIndex + 1} aplicada ao tema ${theme}.`, 'ok');
      setTimeout(() => $('#generateBtn')?.click(), 80);
    });
  }

  function extraColorInstruction() {
    const palette = $('#paletteSelect')?.value || PALETTES[0];
    const contrast = $('#nameContrast')?.checked !== false;
    return [
      `Orientação da paleta de cores: ${palette}. A indicação é apenas estética; escolha livremente tons específicos coerentes com essa orientação.`,
      contrast
        ? 'Use no nome cores diferentes da composição principal, porém harmoniosas, para que ele tenha contraste e seja o foco visual absoluto.'
        : 'O nome pode seguir a mesma linguagem cromática da composição principal, mantendo legibilidade e destaque.'
    ].join(' ');
  }

  function decoratePromptPreview() {
    const preview = $('#promptPreview');
    if (!preview || previewGuard) return;
    previewGuard = true;
    const marker = '\n\n[CONFIGURAÇÕES ADICIONAIS DE COR]\n';
    const base = String(preview.textContent || '').split(marker)[0];
    preview.textContent = `${base}${marker}${extraColorInstruction()}`;
    previewGuard = false;
  }

  function observePromptPreview() {
    const preview = $('#promptPreview');
    if (!preview || preview.dataset.enhancedColorObserver) return;
    preview.dataset.enhancedColorObserver = '1';
    new MutationObserver(() => {
      if (!previewGuard) setTimeout(decoratePromptPreview, 0);
    }).observe(preview, {childList:true, characterData:true, subtree:true});
    decoratePromptPreview();
  }

  function patchFetchForPrompt() {
    if (window.__canecasFetchV12Patched) return;
    window.__canecasFetchV12Patched = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      try {
        const body = init?.body;
        if (body && init?.method?.toUpperCase() === 'POST') {
          const params = body instanceof URLSearchParams ? new URLSearchParams(body) : new URLSearchParams(String(body));
          if (params.has('payload')) {
            const payload = JSON.parse(params.get('payload'));
            if (payload?.action === 'generate_mug_art') {
              payload.personalization = payload.personalization || {};
              payload.personalization.palette = $('#paletteSelect')?.value || PALETTES[0];
              payload.personalization.name_contrast = $('#nameContrast')?.checked !== false;
              payload.personalization.mode = automaticPending ? 'automatic' : 'manual';
              if (automaticPending) payload.personalization.automatic_combination = automaticPending.combination;
              payload.prompt = `${payload.prompt || ''} ${extraColorInstruction()}`.trim();
              params.set('payload', JSON.stringify(payload));
              init = {...init, body: params.toString()};
              automaticPending = null;
            }
          }
        }
      } catch (error) {
        console.warn('Não foi possível complementar o payload:', error);
      }
      return nativeFetch(input, init);
    };
  }

  function addBrightnessControl() {
    if ($('#rightBrightnessEnhancement')) return;
    const artBox = $('#rightArtBox');
    if (!artBox) return;
    const generated = artBox.closest('.generated');
    if (!generated) return;

    const box = document.createElement('div');
    box.className = 'brightness-enhancement';
    box.innerHTML = `
      <h3>Brilho da arte personalizada</h3>
      <div class="brightness-line">
        <div>
          <input id="rightBrightnessEnhancement" type="range" min="60" max="140" step="1" value="100" style="width:100%">
          <div class="help">Aumente para suavizar fundos clarinhos ou diminua para escurecer a arte.</div>
        </div>
        <div class="brightness-actions">
          <button class="btn small" id="brightnessMinusV12" type="button">−</button>
          <span class="brightness-value" id="brightnessValueV12">100%</span>
          <button class="btn small" id="brightnessPlusV12" type="button">+</button>
          <button class="btn small" id="brightnessResetV12" type="button">Resetar</button>
        </div>
      </div>`;
    generated.insertAdjacentElement('afterend', box);

    const slider = $('#rightBrightnessEnhancement');
    slider.addEventListener('input', () => {
      $('#brightnessValueV12').textContent = `${slider.value}%`;
      clearTimeout(brightnessTimer);
      brightnessTimer = setTimeout(() => applyBrightness(Number(slider.value)), 220);
    });
    $('#brightnessMinusV12').addEventListener('click', () => {
      slider.value = String(Math.max(60, Number(slider.value) - 5));
      slider.dispatchEvent(new Event('input', {bubbles:true}));
    });
    $('#brightnessPlusV12').addEventListener('click', () => {
      slider.value = String(Math.min(140, Number(slider.value) + 5));
      slider.dispatchEvent(new Event('input', {bubbles:true}));
    });
    $('#brightnessResetV12').addEventListener('click', () => {
      slider.value = '100';
      slider.dispatchEvent(new Event('input', {bubbles:true}));
    });
    updateBrightnessEnabled();
  }

  function updateBrightnessEnabled() {
    const enabled = Boolean($('#rightArtBox img'));
    const slider = $('#rightBrightnessEnhancement');
    if (!slider) return;
    slider.disabled = !enabled;
    ['brightnessMinusV12','brightnessPlusV12','brightnessResetV12'].forEach(id => {
      const button = $(`#${id}`);
      if (button) button.disabled = !enabled;
    });
  }

  function captureOriginalRightImage() {
    const img = $('#rightArtBox img');
    updateBrightnessEnabled();
    if (!img || applyingBrightness) return;
    const src = img.currentSrc || img.src || '';
    if (!src || src === originalRightImage) return;
    originalRightImage = src;
    const slider = $('#rightBrightnessEnhancement');
    if (slider) slider.value = '100';
    if ($('#brightnessValueV12')) $('#brightnessValueV12').textContent = '100%';
  }

  function observeRightImage() {
    const artBox = $('#rightArtBox');
    if (!artBox || artBox.dataset.brightnessObserved) return;
    artBox.dataset.brightnessObserved = '1';
    new MutationObserver(() => setTimeout(captureOriginalRightImage, 20)).observe(artBox, {childList:true, subtree:true, attributes:true, attributeFilter:['src']});
    captureOriginalRightImage();
  }

  async function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Não foi possível processar o brilho desta imagem.'));
      img.src = src;
    });
  }

  async function applyBrightness(value) {
    if (!originalRightImage) {
      captureOriginalRightImage();
      if (!originalRightImage) return;
    }
    const fileInput = $('#rightFile');
    if (!fileInput || typeof DataTransfer !== 'function') {
      toast('O navegador não permite aplicar o brilho ao arquivo de impressão.', 'error');
      return;
    }

    const img = await loadImage(originalRightImage);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d', {alpha:false});
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.filter = `brightness(${value}%)`;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.98));
    if (!blob) throw new Error('Não foi possível criar a imagem com brilho ajustado.');

    applyingBrightness = true;
    const file = new File([blob], `arte-brilho-${value}.jpg`, {type:'image/jpeg'});
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event('change', {bubbles:true}));
    setTimeout(() => {
      applyingBrightness = false;
      updateBrightnessEnabled();
    }, 1200);
  }

  function initialize() {
    injectStyles();
    addPaletteAndContrast();
    addAutomaticButton();
    addBrightnessControl();
    observePromptPreview();
    observeRightImage();
    patchFetchForPrompt();
  }

  const started = Date.now();
  const timer = setInterval(() => {
    initialize();
    if ($('#personName') && $('#themeSelect') && $('#generateBtn') && Date.now() - started > 4000) clearInterval(timer);
    if (Date.now() - started > 90000) clearInterval(timer);
  }, 250);

  new MutationObserver(() => initialize()).observe(document.documentElement, {childList:true, subtree:true});
  initialize();
})();
