const ACTIVE_BUILD = document.querySelector('meta[name="admin-save-build"]')?.content
  || new URLSearchParams(window.location.search).get('admin_build')
  || '20260824-mug-studio-fast-v1';

const CRITICAL_MODULES = [
  './mug-network-resilience-v1.js',
  './mug-studio-gallery.js',
  './mug-personalizer-v7.js',
  './mug-command-library-v1.js',
  './mug-command-library-compact-v2.js',
  './mug-command-layout-v4-force.js',
];

const DEFERRED_MODULES = [
  './mug-config-compact-v4-1.js',
  './mug-preset-phrases-v1.js',
  './mug-motivational-phrases-v1.js',
];

const MODULES = [...CRITICAL_MODULES, ...DEFERRED_MODULES];
let installPromise = null;
let deferredPromise = null;

function withBuild(path) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}admin_build=${encodeURIComponent(ACTIVE_BUILD)}`;
}

async function importModule(path) {
  return import(withBuild(path));
}

function loadDeferredModules() {
  if (deferredPromise) return deferredPromise;
  deferredPromise = Promise.allSettled(DEFERRED_MODULES.map(importModule)).then(results => {
    const failures = results
      .map((result, index) => ({ result, path: DEFERRED_MODULES[index] }))
      .filter(({ result }) => result.status === 'rejected');
    failures.forEach(({ result, path }) => console.warn(`Módulo complementar do Criador não carregou (${path}):`, result.reason));
    window.__daMugStudioDeferredReady = failures.length === 0;
    return results;
  });
  return deferredPromise;
}

function scheduleDeferredModules() {
  const run = () => loadDeferredModules();
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 800 });
  } else {
    setTimeout(run, 40);
  }
}

function install() {
  if (installPromise) return installPromise;
  installPromise = (async () => {
    // A camada de contingência precisa existir antes das leituras do Firebase.
    await importModule(CRITICAL_MODULES[0]);

    // Galeria, personalizador e comandos são independentes no carregamento e
    // registram seus listeners antes do evento admin-v2-route-ready.
    await Promise.all(CRITICAL_MODULES.slice(1, 4).map(importModule));

    // Acabamento visual depende dos módulos acima, mas não deve segurar frases/configuração.
    await Promise.all(CRITICAL_MODULES.slice(4).map(importModule));

    window.__daMugStudioV7Loader = ACTIVE_BUILD;
    window.__daMugStudioModules = [...MODULES];
    window.__daMugStudioCriticalReady = true;
    scheduleDeferredModules();
    return ACTIVE_BUILD;
  })().catch(error => {
    installPromise = null;
    console.error('Falha ao carregar módulos essenciais do Criador de Canecas:', error);
    throw error;
  });
  return installPromise;
}

await install();

export { install, loadDeferredModules, withBuild, ACTIVE_BUILD, CRITICAL_MODULES, DEFERRED_MODULES };
