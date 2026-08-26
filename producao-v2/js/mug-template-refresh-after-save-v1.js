(() => {
  'use strict';

  const BUILD = '20260826-mug-template-save-bridge-v3';
  let orchestrating = false;
  let bypassMainSave = false;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function text(value) {
    return String(value ?? '').trim();
  }

  function bridgeToast(message, error = false) {
    let node = document.getElementById('mugTemplateSaveBridgeToast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'mugTemplateSaveBridgeToast';
      Object.assign(node.style, {
        position: 'fixed',
        zIndex: '100000',
        left: '50%',
        bottom: '24px',
        transform: 'translateX(-50%)',
        maxWidth: '90vw',
        padding: '11px 14px',
        borderRadius: '11px',
        color: '#fff',
        font: '700 12px system-ui,-apple-system,Segoe UI,sans-serif',
        boxShadow: '0 10px 30px rgba(0,0,0,.2)'
      });
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.style.background = error ? '#8b2b2b' : '#252822';
    node.hidden = false;
    clearTimeout(bridgeToast.timer);
    bridgeToast.timer = setTimeout(() => { node.hidden = true; }, error ? 6000 : 3500);
  }

  function personalizationMounted() {
    const button = document.getElementById('mugTplSaveV2');
    const section = document.querySelector('[data-editor-section="mug-personalizacao"]');
    return Boolean(button && section && !section.hidden);
  }

  async function waitForButtonCycle(button, { startTimeout = 900, finishTimeout = 20000 } = {}) {
    const startedAt = Date.now();
    let started = false;

    while (Date.now() - startedAt < startTimeout) {
      if (button.disabled || /salvando/i.test(text(button.textContent))) {
        started = true;
        break;
      }
      await sleep(40);
    }

    if (!started) {
      await sleep(180);
      return;
    }

    const finishAt = Date.now();
    while (Date.now() - finishAt < finishTimeout) {
      if (!button.disabled && !/salvando/i.test(text(button.textContent))) return;
      await sleep(60);
    }

    throw new Error('O salvamento demorou mais que o esperado. Tente novamente.');
  }

  function personalizationError() {
    const toast = document.getElementById('mugTemplateToastV2');
    if (!toast || toast.hidden || !toast.classList.contains('error')) return '';
    return text(toast.textContent);
  }

  async function saveMainProduct(mainButton) {
    bypassMainSave = true;
    try {
      mainButton.click();
      await waitForButtonCycle(mainButton, { startTimeout: 700, finishTimeout: 20000 });
    } finally {
      bypassMainSave = false;
    }
  }

  async function savePersonalization() {
    const button = document.getElementById('mugTplSaveV2');
    if (!button) return;

    const previousToast = document.getElementById('mugTemplateToastV2');
    if (previousToast) previousToast.hidden = true;

    button.click();
    await waitForButtonCycle(button, { startTimeout: 1000, finishTimeout: 20000 });
    await sleep(80);

    const error = personalizationError();
    if (error) throw new Error(error);

    const toast = document.getElementById('mugTemplateToastV2');
    const message = text(toast?.textContent);
    if (message && !message.includes('Campos personalizáveis salvos')) {
      console.warn(`[Canecas · ${BUILD}] retorno inesperado do salvamento:`, message);
    }
  }

  async function saveEverything(mainButton) {
    if (orchestrating) return;
    orchestrating = true;
    bridgeToast('Salvando produto e personalização da caneca…');

    try {
      // 1) Salva primeiro os campos gerais do produto.
      // 2) Salva a personalização por último, para que uma cópia antiga do editor
      //    nunca consiga apagar modelo_publico/personalizacao_config_publica.
      await saveMainProduct(mainButton);
      await savePersonalization();
      bridgeToast('Produto e personalização da caneca salvos no Firebase.');
    } catch (error) {
      console.error(`[Canecas · ${BUILD}] falha ao salvar produto + personalização:`, error);
      bridgeToast(error?.message || String(error), true);
    } finally {
      orchestrating = false;
    }
  }

  document.addEventListener('click', event => {
    const mainButton = event.target.closest('#saveProductButton');
    if (!mainButton || bypassMainSave || orchestrating || !personalizationMounted()) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    saveEverything(mainButton);
  }, true);

  // O botão específico continua funcionando. Não fechamos mais o editor nem
  // recarregamos a página automaticamente, evitando perder alterações gerais.
  document.addEventListener('click', event => {
    if (!event.target.closest('#mugTplSaveV2')) return;
    console.info(`[Canecas · ${BUILD}] salvamento específico da personalização solicitado.`);
  }, true);

  console.info(`Canecas · ${BUILD}`);
})();
