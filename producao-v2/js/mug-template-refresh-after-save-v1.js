(() => {
  'use strict';
  let armed = true;
  function refreshIfSaved() {
    const toast = document.getElementById('mugTemplateToastV2');
    const message = String(toast?.textContent || '');
    if (!armed || toast?.hidden || !message.includes('Campos personalizáveis salvos')) return;
    armed = false;
    setTimeout(() => {
      document.getElementById('closeEditorButton')?.click();
      document.getElementById('reloadButton')?.click();
      setTimeout(() => { armed = true; }, 800);
    }, 120);
  }
  new MutationObserver(refreshIfSaved).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'class']
  });
  document.addEventListener('click', event => {
    if (event.target.closest('#mugTplSaveV2')) armed = true;
  }, true);
})();
