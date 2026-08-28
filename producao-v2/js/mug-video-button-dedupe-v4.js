const BUILD = '20260828-mug-video-button-dedupe-v4';
let timer = 0;

function text(value) {
  return String(value ?? '').trim();
}

function normalizeButtons() {
  if (window.adminV2CurrentRoute?.() !== 'mug-studio') return;
  document.querySelectorAll('#mugCreatedCards .mug-created-card').forEach(card => {
    const actions = card.querySelector('.mug-created-card-actions');
    if (!actions) return;
    const current = actions.querySelector('[data-gallery-generate-mug-video]');
    const legacyButtons = [...actions.querySelectorAll('[data-generate-mug-video]')];
    if (current) {
      legacyButtons.forEach(button => {
        if (button !== current) button.remove();
      });
      return;
    }
    const legacy = legacyButtons[0];
    if (!legacy) return;
    const key = text(legacy.dataset.generateMugVideo);
    if (!key) return;
    legacy.dataset.galleryGenerateMugVideo = key;
    legacy.classList.add('mug-gallery-video-button');
    legacy.classList.remove('secondary');
    legacy.classList.add('primary');
    legacy.textContent = '🎥 Gerar vídeo 5s';
    legacyButtons.slice(1).forEach(button => button.remove());
  });
}

function schedule(delay = 30) {
  clearTimeout(timer);
  timer = setTimeout(normalizeButtons, delay);
}

window.addEventListener('admin-v2-route-ready', event => {
  if (event.detail?.route === 'mug-studio') schedule(20);
});
window.addEventListener('admin-v2-route', event => {
  if (event.detail?.route === 'mug-studio') schedule(20);
});

const root = document.querySelector('.view[data-view="mug-studio"]') || document.body;
new MutationObserver(() => schedule(40)).observe(root, { childList: true, subtree: true });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => schedule(0), { once: true });
else schedule(0);

export { BUILD, normalizeButtons };
