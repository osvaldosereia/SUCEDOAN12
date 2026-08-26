const ACTIVE_BUILD = document.querySelector('meta[name="admin-save-build"]')?.content
  || new URLSearchParams(window.location.search).get('admin_build')
  || '20260826-mug-v14-stable-make';

const MODULES = [
  './mug-make-client-guard-v14.js',
  './mug-personalizer-v7.js',
  './mug-studio-gallery.js',
  './mug-command-library-v1.js',
  './mug-command-library-compact-v2.js',
  './mug-command-layout-v4-force.js',
  './mug-config-compact-v4-1.js',
  './mug-studio-v8-finalizer.js',
  './mug-model-carousel-v10.js',
  './mug-personalizer-v12.js',
  './mug-catalog-no-block-v13.js',
];

let installPromise = null;

function withBuild(path) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}admin_build=${encodeURIComponent(ACTIVE_BUILD)}`;
}

function install() {
  if (installPromise) return installPromise;
  installPromise = (async () => {
    for (const path of MODULES) await import(withBuild(path));
    window.__daMugStudioV7Loader = ACTIVE_BUILD;
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

export { install, withBuild, ACTIVE_BUILD };
