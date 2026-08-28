const ACTIVE_BUILD = document.querySelector('meta[name="admin-save-build"]')?.content
  || new URLSearchParams(window.location.search).get('admin_build')
  || '20260828-canecas-2mockups-v25';

const MODULES = [
  './mug-make-art-recovery-v22.js',
  './mug-personalizer-v16-2mockups.js',
  './mug-art-command-compat-v2.js',
  './mug-force-low-quality-v23.js',
  './mug-studio-gallery.js',
  './mug-command-library-v1.js',
  './mug-command-library-compact-v2.js',
  './mug-command-library-restore-v3.js',
  './mug-command-layout-v4-force.js',
  './mug-config-compact-v4-1.js',
  './mug-studio-v8-finalizer.js',
  './mug-model-carousel-v10.js',
];

let installPromise = null;

function withBuild(path) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}admin_build=${encodeURIComponent(ACTIVE_BUILD)}`;
}

function ensureStudioPanelShell() {
  const view = document.querySelector('.view[data-view="mug-studio"]');
  if (!view) return null;
  let panel = document.getElementById('mugAutomationPanel');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'mugAutomationPanel';
    panel.className = 'mug-automation-panel';
    panel.setAttribute('aria-live', 'polite');
    view.appendChild(panel);
  } else if (panel.parentElement !== view) {
    view.appendChild(panel);
  }
  return panel;
}

function handleStudioRoute(event) {
  if (event?.detail?.route === 'mug-studio') ensureStudioPanelShell();
}

window.addEventListener('admin-v2-route', handleStudioRoute);
window.addEventListener('admin-v2-route-ready', handleStudioRoute);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureStudioPanelShell, { once: true });
} else {
  ensureStudioPanelShell();
}

function install() {
  if (installPromise) return installPromise;
  installPromise = (async () => {
    ensureStudioPanelShell();
    for (const path of MODULES) await import(withBuild(path));
    ensureStudioPanelShell();
    window.__daMugStudioLoader = ACTIVE_BUILD;
    window.__daMugStudioModules = [...MODULES];
    return ACTIVE_BUILD;
  })().catch(error => {
    installPromise = null;
    console.error('Falha ao carregar módulos do Criador de Canecas:', error);
    throw error;
  });
  return installPromise;
}

await install();

export { install, withBuild, ACTIVE_BUILD, ensureStudioPanelShell };
