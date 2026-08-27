(() => {
  'use strict';

  const BUILD = '20260827-mug-force-low-v24';
  const MUG_ACTIONS = new Set(['generate_mug_art', 'finalize_mug_product', 'personalize_mug_model']);
  if (window.__DA_MUG_FORCE_LOW__ === BUILD) return;
  window.__DA_MUG_FORCE_LOW__ = BUILD;

  const delegateFetch = window.fetch.bind(window);

  function forceLowRequest(input, init) {
    const method = String(init?.method || (input && typeof input === 'object' ? input.method : '') || 'GET').toUpperCase();
    if (method !== 'POST' || typeof init?.body !== 'string') return init;
    try {
      const outer = JSON.parse(init.body);
      const inner = typeof outer?.payload === 'string' ? JSON.parse(outer.payload) : outer?.payload;
      if (!inner || !MUG_ACTIONS.has(String(inner.action || ''))) return init;
      inner.quality = 'low';
      const nextOuter = { ...outer, payload: typeof outer?.payload === 'string' ? JSON.stringify(inner) : inner };
      return { ...init, body: JSON.stringify(nextOuter) };
    } catch {
      return init;
    }
  }

  window.fetch = function(input, init) {
    return delegateFetch(input, forceLowRequest(input, init));
  };

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
