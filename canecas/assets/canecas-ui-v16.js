(() => {
  'use strict';

  const VERSION = '20260729-16';
  const STORAGE_KEY = 'canecasImageAdjustmentsV16';
  const TARGET_KEY = 'canecasGenerationTargetV15';
  const STEP = 2;
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

  let selectedSide = localStorage.getItem(TARGET_KEY) === 'left' ? 'left' : 'right';
  let adjustments = loadAdjustments();
  let controlsMounted = false;
  let interfaceMounted = false;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeSide(value = {}) {
    return {
      brightness: clamp(Number(value.brightness) || 100, 40, 180),
      saturation: clamp(Number(value.saturation) || 100, 0, 200),
      contrast: clamp(Number(value.contrast) || 100, 40, 180)
    };
  }

  function loadAdjustments() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem('canecasImageAdjustmentsV15') || '{}');
      return {left: normalizeSide(saved.left), right: normalizeSide(saved.right)};
    } catch {
      return {left: normalizeSide(), right: normalizeSide()};
    }
  }

  function saveAdjustments() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(adjustments));
    localStorage.setItem('canecasImageAdjustmentsV15', JSON.stringify(adjustments));
  }

  function filterFor(side) {
    const value = adjustments[side];
    return `brightness(${value.brightness}%) saturate(${value.saturation}%) contrast(${value.contrast}%)`;
  }

  function detectSide(canvas, args) {
    if (!canvas || !canvas.width || !canvas.height) return null;
    const ratio = canvas.width / canvas.height;
    if (Math.abs(ratio - (248 / 98)) > 0.05) return null;
    let index = -1;
    if (args.length === 5) index = 1;
    if (args.length === 9) index = 5;
    if (index < 0) return null;
    const dx = Number(args[index]);
    const width = Number(args[index + 2]);
    if (!Number.isFinite(dx) || !Number.isFinite(width) || width <= 0) return null;
    const pixelsPerMm = canvas.width / 248;
    const centerMm = (dx + width / 2) / pixelsPerMm;
    return centerMm < 124 ? 'left' : 'right';
  }

  function patchCanvasBeforeV15() {
    if (window.__canecasV16CanvasPatched) return;
    window.__canecasV16CanvasPatched = true;
    const nativeDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(...args) {
      const previous = this.filter;
      try {
        const side = detectSide(this.canvas, args);
        if (side) this.filter = filterFor(side);
      } catch (error) {
        console.warn('Ajustes individuais ignorados nesta imagem:', error);
      }
      const result = nativeDrawImage.apply(this, args);
      this.filter = previous;
      return result;
    };
  }

  function injectStyles() {
    if ($('#canecasUiV16Styles')) return;
    const style = document.createElement('style');
    style.id = 'canecasUiV16Styles';
    style.textContent = `
      #targetV15{display:none!important}
      #automaticBtn,.automatic-note,.brightness-enhancement,#rightBrightnessEnhancement{display:none!important}
      #importRightBtn{display:none!important}
      .image-adjust-v15{display:none!important}
      #dualStartV15{margin-bottom:18px}
      .flow-v16{display:grid;gap:14px}
      .flow-side-v16{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .flow-side-v16 button{min-height:44px;font-weight:850}
      .flow-side-v16 button.active{background:var(--brand,#70422f);border-color:var(--brand,#70422f);color:#fff}
      .flow-actions-v16{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .flow-note-v16{padding:10px 12px;border-radius:11px;background:#f8f3ee;border:1px solid var(--line,#e6dbd1);font-size:11px;color:var(--muted,#746b65)}
      .side-badge-v16{display:inline-flex;align-items:center;border-radius:999px;background:#e9f4fb;color:#327aa5;padding:5px 9px;font-size:10px;font-weight:900;margin-left:8px;vertical-align:middle}
      .adjustments-v16{margin-top:10px;border:1px solid var(--line,#e6dbd1);border-radius:15px;background:#fcfaf8;overflow:hidden}
      .adjustments-head-v16{padding:12px 14px;border-bottom:1px solid var(--line,#e6dbd1)}
      .adjustments-head-v16 strong{display:block;font-size:13px}.adjustments-head-v16 span{display:block;margin-top:2px;font-size:10px;color:var(--muted,#746b65)}
      .adjustments-grid-v16{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px}
      .adjustment-card-v16{border:1px solid var(--line,#e6dbd1);border-radius:13px;background:#fff;padding:11px}
      .adjustment-title-v16{font-size:12px;font-weight:900;margin-bottom:8px}
      .adjustment-row-v16{display:grid;grid-template-columns:minmax(74px,1fr) 34px 52px 34px;gap:5px;align-items:center;margin-top:6px}
      .adjustment-row-v16 span:first-child{font-size:11px;font-weight:750}
      .adjustment-row-v16 button{min-height:30px!important;padding:4px 7px!important;font-weight:900}
      .adjustment-value-v16{text-align:center;font-size:11px;font-weight:900}
      .adjustment-reset-v16{width:100%;margin-top:9px}
      #leftArtBox img,#leftPreview,#leftCurrent img,.left-art img{filter:var(--canecas-filter-left)!important}
      #rightArtBox img,#rightPreview,#rightCurrent img,.right-art img{filter:var(--canecas-filter-right)!important}
      @media(max-width:680px){
        .flow-side-v16,.flow-actions-v16,.adjustments-grid-v16{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function updateCssVariables() {
    document.documentElement.style.setProperty('--canecas-filter-left', filterFor('left'));
    document.documentElement.style.setProperty('--canecas-filter-right', filterFor('right'));
  }

  function triggerPreview() {
    const candidate = $('[id^="scale-"][type="range"], .resize-grid input[type="range"], input[type="range"][id*="scale"]');
    if (candidate) candidate.dispatchEvent(new Event('input', {bubbles:true}));
    updateCssVariables();
  }

  function updateAdjustmentValues(side) {
    for (const key of ['brightness','saturation','contrast']) {
      const element = $(`[data-v16-value="${side}-${key}"]`);
      if (element) element.textContent = `${adjustments[side][key]}%`;
    }
  }

  function changeAdjustment(side, key, delta) {
    const limits = key === 'saturation' ? [0, 200] : [40, 180];
    adjustments[side][key] = clamp(adjustments[side][key] + delta, limits[0], limits[1]);
    saveAdjustments();
    updateAdjustmentValues(side);
    triggerPreview();
  }

  function resetSide(side) {
    adjustments[side] = normalizeSide();
    saveAdjustments();
    updateAdjustmentValues(side);
    triggerPreview();
  }

  function adjustmentCard(side, title) {
    return `<div class="adjustment-card-v16">
      <div class="adjustment-title-v16">${title}</div>
      ${[
        ['brightness','Brilho'],
        ['saturation','Intensidade'],
        ['contrast','Contraste']
      ].map(([key,label]) => `<div class="adjustment-row-v16">
        <span>${label}</span>
        <button class="btn small" type="button" data-v16-adjust="${side}-${key}" data-delta="-${STEP}">−</button>
        <span class="adjustment-value-v16" data-v16-value="${side}-${key}">${adjustments[side][key]}%</span>
        <button class="btn small" type="button" data-v16-adjust="${side}-${key}" data-delta="${STEP}">+</button>
      </div>`).join('')}
      <button class="btn small adjustment-reset-v16" type="button" data-v16-reset="${side}">↺ Restaurar imagem</button>
    </div>`;
  }

  function findResizeAnchor() {
    const grid = $('.resize-grid');
    if (grid) return grid;
    const scale = $('[id^="scale-"][type="range"], input[type="range"][id*="scale"]');
    if (scale) return scale.closest('.card-body,.card,section,div');
    const preview = $('#sheetPreview,#previewCanvas,canvas');
    return preview?.closest('.card-body,.card,section') || null;
  }

  function mountAdjustments() {
    if ($('#imageAdjustmentsV16')) {
      controlsMounted = true;
      updateCssVariables();
      return;
    }
    const anchor = findResizeAnchor();
    if (!anchor) return;
    const section = document.createElement('section');
    section.id = 'imageAdjustmentsV16';
    section.className = 'adjustments-v16';
    section.innerHTML = `<div class="adjustments-head-v16"><strong>Ajustes individuais das imagens</strong><span>Ficam junto dos controles de tamanho. Cada clique altera exatamente ${STEP}% e cada lado é independente.</span></div><div class="adjustments-grid-v16">${adjustmentCard('left','Imagem esquerda')}${adjustmentCard('right','Imagem direita')}</div>`;
    anchor.insertAdjacentElement('afterend', section);
    $$('[data-v16-adjust]', section).forEach(button => button.addEventListener('click', () => {
      const [side,key] = button.dataset.v16Adjust.split('-');
      changeAdjustment(side, key, Number(button.dataset.delta));
    }));
    $$('[data-v16-reset]', section).forEach(button => button.addEventListener('click', () => resetSide(button.dataset.v16Reset)));
    controlsMounted = true;
    updateCssVariables();
  }

  function syncTargetButtons() {
    $$('[data-flow-side-v16]').forEach(button => button.classList.toggle('active', button.dataset.flowSideV16 === selectedSide));
    const badge = $('#personalizationSideBadgeV16');
    if (badge) badge.textContent = selectedSide === 'left' ? 'LADO ESQUERDO' : 'LADO DIREITO';
  }

  function selectSide(side) {
    selectedSide = side === 'left' ? 'left' : 'right';
    localStorage.setItem(TARGET_KEY, selectedSide);
    const hiddenTarget = $(`[data-target-v15="${selectedSide}"]`);
    if (hiddenTarget) hiddenTarget.click();
    syncTargetButtons();
  }

  function sendFileToSelectedSide(file) {
    const input = selectedSide === 'left' ? $('#leftFile') : $('#rightFile');
    if (!input || typeof DataTransfer !== 'function') throw new Error('O navegador não permite aplicar esta imagem.');
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', {bubbles:true}));
  }

  function rebuildQuickFlow() {
    const panel = $('#dualStartV15');
    if (!panel || panel.dataset.uiV16 === '1') return;
    panel.dataset.uiV16 = '1';
    panel.innerHTML = `<div class="card-head"><div class="head-title"><div class="step">1</div><div><h2>Escolha o lado e o que deseja fazer</h2><p>Um único fluxo para evitar campos repetidos. Primeiro escolha o lado; depois envie uma imagem ou crie uma personalização.</p></div></div><span class="badge">PASSO INICIAL</span></div><div class="card-body"><div class="flow-v16"><div class="flow-side-v16"><button class="btn" type="button" data-flow-side-v16="left">← Trabalhar no lado esquerdo</button><button class="btn" type="button" data-flow-side-v16="right">Trabalhar no lado direito →</button></div><div class="flow-actions-v16"><button class="btn secondary" type="button" id="flowUploadV16">↥ Subir uma imagem</button><button class="btn primary" type="button" id="flowGenerateV16">✨ Criar arte personalizada</button></div><div class="flow-note-v16">As bibliotecas continuam separadas: imagens enviadas ficam em <b>Imagens enviadas</b> e artes da IA ficam em <b>Imagens geradas pela IA</b>.</div><input id="flowFileV16" type="file" accept="image/png,image/jpeg,image/webp" hidden></div></div>`;
    $$('[data-flow-side-v16]', panel).forEach(button => button.addEventListener('click', () => selectSide(button.dataset.flowSideV16)));
    $('#flowUploadV16', panel).addEventListener('click', () => {
      const input = $('#flowFileV16', panel);
      input.value = '';
      input.click();
    });
    $('#flowFileV16', panel).addEventListener('change', event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try { sendFileToSelectedSide(file); } catch (error) { alert(error.message); }
    });
    $('#flowGenerateV16', panel).addEventListener('click', () => {
      selectSide(selectedSide);
      const card = $('#personName')?.closest('.card');
      card?.scrollIntoView({behavior:'smooth', block:'start'});
      setTimeout(() => $('#personName')?.focus(), 350);
    });
    syncTargetButtons();
  }

  function simplifyPersonalizationCard() {
    const input = $('#personName');
    const card = input?.closest('.card');
    if (!card) return;
    const title = $('.card-head h2', card);
    const description = $('.card-head p', card);
    if (title) title.textContent = '2. Personalize a arte';
    if (description) description.textContent = 'Digite o texto e escolha tema, fonte, decoração, estilo e paleta. A arte será colocada no lado selecionado acima.';
    if (title && !$('#personalizationSideBadgeV16')) {
      const badge = document.createElement('span');
      badge.id = 'personalizationSideBadgeV16';
      badge.className = 'side-badge-v16';
      title.insertAdjacentElement('afterend', badge);
    }
    const nameField = input.closest('label.field');
    if (nameField) {
      const firstText = [...nameField.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (firstText) firstText.textContent = 'Texto principal ';
    }
    input.placeholder = 'Digite nome, frase ou mensagem';
    syncTargetButtons();
  }

  function applyPrintFilters() {
    const images = $$('#printRoot .print-sheet img');
    if (images[0]) images[0].style.setProperty('filter', filterFor('left'), 'important');
    if (images[1]) images[1].style.setProperty('filter', filterFor('right'), 'important');
  }

  function initializeUi() {
    injectStyles();
    rebuildQuickFlow();
    simplifyPersonalizationCard();
    mountAdjustments();
    updateCssVariables();
    interfaceMounted = Boolean($('#dualStartV15')?.dataset.uiV16 === '1');
  }

  patchCanvasBeforeV15();
  injectStyles();
  updateCssVariables();
  window.addEventListener('beforeprint', applyPrintFilters);

  const timer = setInterval(() => {
    initializeUi();
    if (interfaceMounted && controlsMounted) clearInterval(timer);
  }, 250);
  setTimeout(() => clearInterval(timer), 30000);

  new MutationObserver(() => {
    clearTimeout(window.__canecasV16Timer);
    window.__canecasV16Timer = setTimeout(() => {
      initializeUi();
      applyPrintFilters();
    }, 100);
  }).observe(document.documentElement, {childList:true, subtree:true});

  initializeUi();
})();
