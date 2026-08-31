import { renderGrid } from './mug-grid-v1.js?v=20260829-2';

const BUILD = '20260831-admin-canecas-mugs-stability-v2';
const $ = (s, r = document) => r.querySelector(s);

const state = {
  root: null,
  observer: null,
  restoring: false,
  refreshing: false,
  refreshTimer: 0,
  nodes: new Map(),
};

const PRESERVE = ['cfDualSyncPanel', 'cfBulkActions', 'cfMugGridWrap'];

function rememberVisibleNodes() {
  const root = state.root || $('#mugs');
  if (!root) return;
  for (const id of PRESERVE) {
    const current = $(`#${id}`, root);
    if (current) state.nodes.set(id, current);
  }
}

function insertStable(node, root) {
  if (!node || !root || node.isConnected) return;
  const exportBar = $('.li-export-bar', root);
  const tablePanel = root.querySelector('table.table')?.closest('.panel');
  const anchor = exportBar || tablePanel || null;
  if (anchor) root.insertBefore(node, anchor);
  else root.appendChild(node);
}

function restoreNodes() {
  if (!state.root || state.restoring) return;
  state.restoring = true;
  try {
    for (const id of PRESERVE) {
      const node = state.nodes.get(id);
      if (node && !node.isConnected) insertStable(node, state.root);
    }
  } finally {
    state.restoring = false;
  }
}

function isCatalogNode(node) {
  if (!(node instanceof Element)) return false;
  if (node.matches('.metrics,#cfCatalogToolbar,.li-export-bar')) return true;
  if (node.matches('section.panel') && node.querySelector('table.table')) return true;
  return Boolean(node.querySelector?.('table.table,#cfCatalogToolbar,.li-export-bar'));
}

function mutationIsCatalogRender(mutations) {
  return mutations.some(mutation => [...mutation.addedNodes].some(isCatalogNode));
}

function announceStable() {
  window.dispatchEvent(new CustomEvent('admin-canecas:mugs-stable-rendered', {
    detail: { source: BUILD, at: Date.now() }
  }));
}

function scheduleGridRefresh(delay = 30) {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(async () => {
    if (state.refreshing || !state.root || !location.hash.includes('mugs')) return;
    if (!state.root.querySelector('table.table')) return;
    state.refreshing = true;
    try {
      await renderGrid();
      rememberVisibleNodes();
      restoreNodes();
      announceStable();
    } catch (error) {
      console.warn('[CanecaFácil] atualização estável da grade:', error);
    } finally {
      state.refreshing = false;
    }
  }, delay);
}

function onCatalogMutation(mutations) {
  if (state.restoring) return;

  // Se o catalog-manager substituiu #mugs por inteiro, devolve imediatamente
  // a grade/painéis já existentes para não haver tela vazia entre renders.
  const lost = [...state.nodes.values()].some(node => node && !node.isConnected);
  if (lost) restoreNodes();

  // Só reconstrói a grade quando surgem os nós-base do catálogo novo.
  // Movimentações dos nossos próprios painéis não disparam outro render.
  if (mutationIsCatalogRender(mutations)) scheduleGridRefresh(20);
}

function connect() {
  const root = $('#mugs');
  if (!root) return false;
  if (state.root === root && state.observer) return true;

  state.observer?.disconnect();
  state.root = root;
  rememberVisibleNodes();
  state.observer = new MutationObserver(onCatalogMutation);
  state.observer.observe(root, { childList: true });
  scheduleGridRefresh(80);
  return true;
}

function scheduleConnect(attempt = 0) {
  if (connect()) return;
  if (attempt < 30) setTimeout(() => scheduleConnect(attempt + 1), 100);
}

window.addEventListener('admin-canecas:route', event => {
  if (event.detail?.route !== 'mugs') return;
  setTimeout(() => {
    connect();
    rememberVisibleNodes();
    restoreNodes();
    scheduleGridRefresh(60);
  }, 0);
});
window.addEventListener('hashchange', () => {
  if (location.hash.includes('mugs')) scheduleConnect();
});
window.addEventListener('admin-canecas:drawer', event => {
  if (event.detail?.kind === 'mug') rememberVisibleNodes();
});
document.addEventListener('DOMContentLoaded', scheduleConnect);
setTimeout(scheduleConnect, 250);

document.documentElement.dataset.cfMugsStability = BUILD;
export { BUILD, connect, rememberVisibleNodes, restoreNodes };
