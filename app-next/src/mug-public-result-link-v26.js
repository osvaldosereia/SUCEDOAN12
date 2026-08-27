(() => {
  'use strict';

  const BUILD = '20260827-mug-public-result-link-v26';
  if (window.__DA_MUG_PUBLIC_RESULT_LINK__ === BUILD) return;
  window.__DA_MUG_PUBLIC_RESULT_LINK__ = BUILD;

  function fixLinks(root = document) {
    const links = root.querySelectorAll?.('a[href*="/ceneca10/resultado.html"]') || [];
    for (const link of links) {
      try {
        const url = new URL(link.href, location.origin);
        url.pathname = '/caneca10/resultado.html';
        link.href = url.href;
      } catch {}
    }
  }

  function install() {
    const root = document.getElementById('app') || document.body;
    if (!root) return;
    fixLinks(root);
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches?.('a[href*="/ceneca10/resultado.html"]')) fixLinks(node.parentElement || root);
          else if (node.querySelector?.('a[href*="/ceneca10/resultado.html"]')) fixLinks(node);
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    document.documentElement.dataset.mugPublicResultLink = BUILD;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();