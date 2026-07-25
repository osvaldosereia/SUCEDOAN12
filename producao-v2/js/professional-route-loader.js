import { activate } from './professional-shell.js?admin_build=20260725-admin-v9';

const imports = new Map();
const BUILD = '20260725-admin-v9';

function importOnce(key, paths) {
  if (imports.has(key)) return imports.get(key);
  const task = Promise.all(paths.map(path => import(`${path}?admin_build=${BUILD}`)))
    .catch(error => {
      imports.delete(key);
      throw error;
    });
  imports.set(key, task);
  return task;
}

function loadSection(section, legacyRoute = '') {
  if (section === 'quick-read') return importOnce('quick-read', ['./quick-read-bootstrap.js']);
  if (section === 'orders') return importOnce('orders', ['./order-tools-bootstrap.js', './admin-suite-bootstrap.js']);
  if (section === 'baskets' || section === 'kits') return importOnce('collections', ['./collections-bootstrap.js']);
  if (section === 'offers') return importOnce('offers', ['./offers-bootstrap.js']);
  if (section === 'coupons' || section === 'quick-purchase') return importOnce('admin-suite', ['./admin-suite-bootstrap.js']);
  if (['categories', 'brands', 'suppliers', 'tags'].includes(section)) return importOnce('registries', ['./registries-bootstrap.js']);
  if (section === 'integrations' || section === 'maintenance') return importOnce('diagnostics', ['./diagnostics-bootstrap.js']);
  if (section === 'stock' || section === 'nfe' || section === 'dashboard' || section === 'products') return Promise.resolve();

  if (legacyRoute === 'operations') return importOnce('operations-fallback', ['./quick-read-bootstrap.js', './order-tools-bootstrap.js']);
  if (legacyRoute === 'promotions') return importOnce('promotions-fallback', ['./collections-bootstrap.js', './offers-bootstrap.js', './admin-suite-bootstrap.js']);
  if (legacyRoute === 'registries') return importOnce('registries', ['./registries-bootstrap.js']);
  if (legacyRoute === 'settings') return importOnce('diagnostics', ['./diagnostics-bootstrap.js']);
  return Promise.resolve();
}

function toast(message) {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const node = document.createElement('div');
  node.className = 'toast error';
  node.textContent = message;
  region.appendChild(node);
  setTimeout(() => node.remove(), 6500);
}

function start() {
  document.getElementById('mainNav')?.addEventListener('click', event => {
    const button = event.target.closest('[data-admin-route],[data-route]');
    if (!button) return;
    const section = button.dataset.adminRoute || '';
    if (section) queueMicrotask(() => activate(section));
    loadSection(section, button.dataset.route || '')
      .catch(error => toast(`Não foi possível abrir esta função: ${error?.message || error}`));
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();

export { loadSection };
