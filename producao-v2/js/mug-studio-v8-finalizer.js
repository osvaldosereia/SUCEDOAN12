const BUILD = document.querySelector('meta[name="admin-save-build"]')?.content
  || new URLSearchParams(window.location.search).get('admin_build')
  || '20260825-mug-v8';

let galleryPromise = null;
let timer = null;

function galleryModule() {
  if (!galleryPromise) {
    galleryPromise = import(`./mug-studio-gallery.js?admin_build=${encodeURIComponent(BUILD)}`);
  }
  return galleryPromise;
}

function schedule(delay = 120) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (window.adminV2CurrentRoute?.() !== 'mug-studio') return;
    try {
      const gallery = await galleryModule();
      await gallery.refresh(true);
    } catch (error) {
      console.error('Falha ao finalizar o Criador de Canecas V8:', error);
    }
  }, delay);
}

window.addEventListener('admin-v2-route-ready', event => {
  if (event.detail?.route === 'mug-studio') schedule(120);
});
window.addEventListener('admin-v2-route', event => {
  if (event.detail?.route === 'mug-studio') schedule(120);
});
window.addEventListener('admin-v2-products-invalidated', () => schedule(850));

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => schedule(160), { once: true });
} else {
  schedule(160);
}

export { schedule };