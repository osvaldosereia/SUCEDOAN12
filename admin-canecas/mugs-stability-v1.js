import { renderGrid } from './mug-grid-v1.js?v=20260829-2';

const BUILD = '20260831-admin-canecas-mugs-stability-v1.1';
const $ = (s, r = document) => r.querySelector(s);

const state = {
  root: null,
  observer: null,
  restoring: false,
  refreshTimer: 0,
  nodes: new Map(),
};

const PRESERVE = [
  'cfDualSyncPanel',
  'cfArchiveAudit',
  'cfBulkActions',
  'cfMugGridWrap',
];

function rememberVisibleNodes() {
  const root = state.root || $('#mugs');
  if (!root) return;
  for (const id of PRESERVE) {
    const node = $(`#${id}`, root) || state.nodes.get(id);
    if (node) state.nodes.set(id, node);
  }
}

function insertBeforeCatalog(node, root) {
  if (!node || !root || node.isConnected) return;
  const exportBar = $('.li-export-bar', root);
  const tablePanel = root.querySelector('table.table')?.closest('.panel');
  const anchor = exportBar || tablePanel || null;
  if (anchor) root.insertBefore(node, anchor);
  else root.appendChild(node);
}

function restoreNodes() {
  const root = state.root;
  if (!root || state.restoring) return;
  state.restoring = true;
  try {
    for (const id of PRESERVE) {
      const node = state.nodes.get(id);
      if (node && !node.isConnected) insertBeforeCatalog(node, root);
    }
  } finally {
    state.restoring = false;
  }
}

function announceStable() {
  window.dispatchEvent(new CustomEvent('admin-canecas:mugs-stable-rendered', {
    detail: { source: BUILD, at: Date.now() }
  }));
}

function scheduleGridRefresh() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(async () => {
    const root = state.root;
    if (!root || !location.hash.includes('mugs')) return;
    if (!root.querySelector('table.table')) return;
    try {
      await renderGrid();
      rememberVisibleNodes();
      restoreNodes();
      announceStable();
    } catch (error) {
      console.warn('[CanecaFácil] atualização estável da grade:', error);
    }
  }, 0);
}

function onCatalogMutation(mutations) {
  if (state.restoring) return;
  const structural = mutations.some(m => m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length));
  if (!structural) return;

  rememberVisibleNodes();
  const lost = [...state.nodes.values()].some(node => node && !node.isConnected);
  if (lost) restoreNodes();
  if (state.root?.querySelector('table.table')) scheduleGridRefresh();
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
  scheduleGridRefresh();
  return true;
}

function scheduleConnect(attempt = 0) {
  if (connect()) return;
  if (attempt < 40) setTimeout(() => scheduleConnect(attempt + 1), 100);
}

window.addEventListener('admin-canecas:route', event => {
  if (event.detail?.route === 'mugs') {
    setTimeout(() => {
      connect();
      rememberVisibleNodes();
      restoreNodes();
      scheduleGridRefresh();
    }, 0);
  }
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
