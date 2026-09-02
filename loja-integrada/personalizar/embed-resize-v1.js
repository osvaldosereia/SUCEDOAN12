(() => {
  'use strict';

  const BUILD = '20260902-embed-resize-v1';
  const embedded = new URLSearchParams(location.search).get('embed') === '1';
  if (!embedded || window.__CF_EMBED_RESIZE__ === BUILD) return;
  window.__CF_EMBED_RESIZE__ = BUILD;

  let timer = 0;
  const clamp = value => Math.max(220, Math.min(1600, Math.ceil(Number(value) || 0)));

  function sendHeight() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const body = document.body;
      const html = document.documentElement;
      const height = clamp(Math.max(
        body?.scrollHeight || 0,
        body?.offsetHeight || 0,
        html?.scrollHeight || 0,
        html?.offsetHeight || 0
      ) + 2);
      try {
        window.parent.postMessage({
          type:'canecafacil:personalizer-height',
          height,
          build:BUILD
        }, '*');
      } catch (_) {}
    }, 32);
  }

  function syncDots() {
    const counter = document.getElementById('previewCounter');
    const dots = document.getElementById('previewDots');
    if (!counter || !dots) return;
    const current = Math.max(1, Math.min(2, parseInt(counter.textContent, 10) || 1));
    [...dots.children].forEach((dot, index) => dot.classList.toggle('active', index === current - 1));
  }

  function refresh() {
    syncDots();
    sendHeight();
  }

  const start = () => {
    const body = document.body;
    if (!body) return;

    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(refresh);
      ro.observe(body);
      document.querySelectorAll('.form-card,.preview-card,.progress-card,.pending-card,.success-card,.error-card').forEach(node => ro.observe(node));
    }

    const mo = new MutationObserver(refresh);
    mo.observe(body, { subtree:true, childList:true, attributes:true, characterData:true, attributeFilter:['hidden','class','style','src'] });

    ['load','resize','input','change'].forEach(name => window.addEventListener(name, refresh, { passive:true }));
    document.addEventListener('click', () => setTimeout(refresh, 20), true);

    refresh();
    setTimeout(refresh, 250);
    setTimeout(refresh, 900);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();