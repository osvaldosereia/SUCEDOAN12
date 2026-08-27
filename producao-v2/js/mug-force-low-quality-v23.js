(() => {
  'use strict';

  const BUILD = '20260827-mug-force-low-v23';
  if (window.__DA_MUG_FORCE_LOW__ === BUILD) return;
  window.__DA_MUG_FORCE_LOW__ = BUILD;

  function lockQuality() {
    const select = document.getElementById('mugv7Quality');
    if (!select) return false;
    if (select.dataset.forceLow === BUILD) return true;
    select.innerHTML = '<option value="low" selected>Low (fixo)</option>';
    select.value = 'low';
    select.disabled = true;
    select.dataset.forceLow = BUILD;
    select.title = 'Qualidade das imagens fixada em Low';
    const label = select.closest('label');
    if (label) label.title = 'Qualidade das imagens fixada em Low';
    return true;
  }

  function observePanel() {
    const panel = document.getElementById('mugAutomationPanel');
    lockQuality();
    if (!panel || panel.dataset.forceLowObserver === BUILD) return;
    panel.dataset.forceLowObserver = BUILD;
    const observer = new MutationObserver(() => lockQuality());
    observer.observe(panel, { childList: true, subtree: true });
  }

  window.addEventListener('admin-v2-route', event => {
    if (event?.detail?.route === 'mug-studio') queueMicrotask(observePanel);
  });
  window.addEventListener('admin-v2-route-ready', event => {
    if (event?.detail?.route === 'mug-studio') queueMicrotask(observePanel);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observePanel, { once: true });
  } else {
    observePanel();
  }

  document.documentElement.dataset.mugImageQuality = 'low';
})();
