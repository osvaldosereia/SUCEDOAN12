(() => {
  'use strict';

  const BUILD = '20260829-admin-canecas-catalog-bridge-v1';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  let recoverTimer = 0;
  let exportKickTimer = 0;

  function onMugsRoute() {
    return location.hash.includes('mugs');
  }

  function kickCatalogManager() {
    if (recoverTimer) return;
    recoverTimer = window.setTimeout(() => {
      recoverTimer = 0;
      // O catalog-manager-v4 escuta hashchange e recompõe a tela completa.
      window.dispatchEvent(new Event('hashchange'));
    }, 0);
  }

  function kickExporter() {
    if (exportKickTimer) return;
    exportKickTimer = window.setTimeout(() => {
      exportKickTimer = 0;
      // O exportador legado também escuta hashchange. Depois de expor data-mug,
      // ele consegue acrescentar seleção e exportação .xlsx à tabela V4.
      window.dispatchEvent(new Event('hashchange'));
    }, 0);
  }

  function stabilize() {
    if (!onMugsRoute()) return;
    const root = $('#mugs');
    if (!root) return;

    const v4 = $('#cfCatalogToolbar', root);
    if (!v4) {
      // app.js ainda possui o renderizador antigo. Quando o carregamento global
      // termina ele pode sobrescrever o V4; nesse caso mandamos o V4 se recompor.
      if ($('#mugSearch', root) || $('tr[data-mug]', root) || root.children.length) kickCatalogManager();
      return;
    }

    // Compatibilidade com o exportador de planilha criado antes do V4.
    let addedAlias = false;
    $$('tr[data-cf-mug]', root).forEach(row => {
      if (!row.dataset.mug) {
        row.dataset.mug = row.dataset.cfMug || '';
        addedAlias = true;
      }
    });

    const exportHeader = $('[data-li-status-head]', root);
    if (exportHeader && exportHeader.textContent !== 'Planilha LI') exportHeader.textContent = 'Planilha LI';

    const exportBar = $('.li-export-bar', root);
    if (exportBar) {
      const subtitle = $('.li-export-title small', exportBar);
      if (subtitle) subtitle.textContent = 'Exportação .xlsx oficial como alternativa e contingência à sincronização por API/Make.';
    }

    if (addedAlias) kickExporter();
  }

  function boot() {
    const root = $('#mugs');
    if (!root) return;

    new MutationObserver(() => queueMicrotask(stabilize)).observe(root, { childList: true, subtree: true });
    window.addEventListener('hashchange', () => setTimeout(stabilize, 0));
    $('#nav')?.addEventListener('click', event => {
      if (event.target.closest('[data-route="mugs"]')) setTimeout(stabilize, 0);
    });
    $('#reloadButton')?.addEventListener('click', () => {
      if (onMugsRoute()) setTimeout(stabilize, 0);
    });

    setTimeout(stabilize, 60);
    setTimeout(stabilize, 900);
    setTimeout(stabilize, 2200);
    document.documentElement.dataset.cfCatalogBridge = BUILD;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
