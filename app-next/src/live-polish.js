const FALLBACK_IMAGE = '/img/logoantonia5.png';

function rootHashLink(value) {
  const href = String(value || '').trim();
  return href.startsWith('#/') ? `/${href}` : href;
}

function absoluteAsset(value) {
  const src = String(value || '').trim();
  if (!src || /^(?:https?:|data:|blob:)/i.test(src)) return src;
  const clean = src.replace(/^\.\.\//g, '').replace(/^\.\//, '').replace(/^\/+/, '');
  return clean ? `/${clean}` : FALLBACK_IMAGE;
}

function prepareLinks(root = document) {
  root.querySelectorAll?.('a[href^="#/"]').forEach(link => {
    link.setAttribute('href', rootHashLink(link.getAttribute('href')));
  });
}

function prepareImage(image) {
  if (!(image instanceof HTMLImageElement)) return;
  const current = image.getAttribute('src');
  const normalized = absoluteAsset(current);
  if (normalized && normalized !== current) image.setAttribute('src', normalized);
  if (image.dataset.stableFallbackBound === 'true') return;
  image.dataset.stableFallbackBound = 'true';
  image.addEventListener('error', () => {
    if (image.getAttribute('src') === FALLBACK_IMAGE) return;
    image.setAttribute('src', FALLBACK_IMAGE);
  });
}

function prepareImages(root = document) {
  root.querySelectorAll?.('img').forEach(prepareImage);
}

function closeTransientLayers() {
  document.getElementById('drawer-overlay')?.classList.remove('show');
  document.querySelectorAll('.drawer.open').forEach(drawer => {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  });
  document.body.classList.remove('drawer-open', 'bundle-confirm-open');
}

function prepare(root = document) {
  prepareLinks(root);
  prepareImages(root);
}

document.addEventListener('click', event => {
  const link = event.target.closest?.('a[href]');
  if (link?.getAttribute('href')?.startsWith('#/')) {
    link.setAttribute('href', rootHashLink(link.getAttribute('href')));
  }
  if (event.target.closest?.('.bottom-nav a,.brand,.sidebar-brand,#menu-drawer a,.back-button')) {
    closeTransientLayers();
  }
}, true);

window.addEventListener('da:route-rendered', event => prepare(event.detail?.root || document.getElementById('app') || document));
window.addEventListener('da:catalog-ready', () => prepare(document));

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => prepare(document), { once: true });
} else {
  prepare(document);
}
