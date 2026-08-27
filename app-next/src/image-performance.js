import './product-media.js?v=20260826-canecas-clean-v17';

const TRANSPARENT_PIXEL = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221%22 height=%221%22/%3E';
const PRELOAD_MARGIN = 1100;
const HORIZONTAL_PRELOAD_MARGIN = 520;
const app = document.getElementById('app');
const pendingImages = new Set();
let appObserver;
let scanScheduled = false;

function localRepositoryAsset(value) {
  const raw = String(value || '').trim();
  if (!raw) return raw;

  let match = raw.match(/^https?:\/\/raw\.githubusercontent\.com\/osvaldosereia\/SUCEDOAN12\/([^/]+)\/(.+)$/i);
  if (match) {
    const branch = decodeURIComponent(String(match[1] || ''));
    const path = String(match[2] || '').replace(/^\/+/, '');
    return branch === 'main' && path ? `/${path}` : raw;
  }

  match = raw.match(/^https?:\/\/github\.com\/osvaldosereia\/SUCEDOAN12\/(?:raw|blob)\/([^/]+)\/(.+)$/i);
  if (match) {
    const branch = decodeURIComponent(String(match[1] || ''));
    const path = String(match[2] || '').replace(/^\/+/, '');
    return branch === 'main' && path ? `/${path}` : raw;
  }

  return raw;
}

function rewriteCandidateList(value) {
  return String(value || '')
    .split('|')
    .map(item => localRepositoryAsset(item.trim()))
    .filter(Boolean)
    .join('|');
}

function rewriteImageUrls(image) {
  const source = image.getAttribute('src');
  const localSource = localRepositoryAsset(source);
  if (source && localSource && localSource !== source) image.setAttribute('src', localSource);

  const sourceSet = image.getAttribute('srcset');
  if (sourceSet) {
    const localSet = sourceSet.split(',').map(candidate => {
      const parts = candidate.trim().split(/\s+/);
      parts[0] = localRepositoryAsset(parts[0]);
      return parts.join(' ');
    }).join(', ');
    if (localSet !== sourceSet) image.setAttribute('srcset', localSet);
  }

  ['fallback', 'detailFallback'].forEach(key => {
    if (image.dataset[key]) image.dataset[key] = rewriteCandidateList(image.dataset[key]);
  });
}

function ensureDimensions(image) {
  if (image.hasAttribute('width') && image.hasAttribute('height')) return;
  if (image.matches('.brand-logo,.sidebar-brand-logo')) {
    image.width = 160;
    image.height = 44;
    return;
  }
  if (image.matches('.banner-card img')) {
    image.width = 320;
    image.height = 410;
    return;
  }
  image.width = 300;
  image.height = 300;
}

function isCritical(image) {
  return image.matches('.brand-logo,.sidebar-brand-logo,[fetchpriority="high"],.product-detail-media>img,.bundle-detail-hero>img');
}

function fallbackCandidates(image) {
  const candidates = [
    ...String(image.dataset.fallback || '').split('|'),
    ...String(image.dataset.detailFallback || '').split('|'),
    '/img/logoantonia5.png'
  ].map(item => localRepositoryAsset(item.trim())).filter(Boolean);
  return [...new Set(candidates)];
}

function bindErrorRecovery(image) {
  if (image.dataset.performanceRecoveryBound === 'true') return;
  image.dataset.performanceRecoveryBound = 'true';
  image.dataset.performanceCandidates = fallbackCandidates(image).join('|');

  image.addEventListener('error', () => {
    const candidates = String(image.dataset.performanceCandidates || '')
      .split('|')
      .map(item => item.trim())
      .filter(Boolean);
    const current = localRepositoryAsset(image.currentSrc || image.getAttribute('src'));
    let next = candidates.shift();
    while (next && next === current) next = candidates.shift();
    image.dataset.performanceCandidates = candidates.join('|');
    if (!next) return;
    image.loading = 'eager';
    image.fetchPriority = 'high';
    image.src = next;
  });
}

function loadDeferredImage(image) {
  if (!image?.isConnected) {
    pendingImages.delete(image);
    return;
  }

  const source = image.dataset.performanceSrc;
  if (!source) return;

  const sourceSet = image.dataset.performanceSrcset;
  image.loading = 'eager';
  image.src = localRepositoryAsset(source);
  if (sourceSet) image.srcset = sourceSet;
  delete image.dataset.performanceSrc;
  delete image.dataset.performanceSrcset;
  pendingImages.delete(image);
  appObserver?.unobserve(image);
}

function imageIsNearViewport(image) {
  if (!app || !app.contains(image)) return true;
  const rootRect = app.getBoundingClientRect();
  const rect = image.getBoundingClientRect();
  const verticallyNear = rect.top <= rootRect.bottom + PRELOAD_MARGIN && rect.bottom >= rootRect.top - 240;
  if (!verticallyNear) return false;

  const insideHorizontalScroller = Boolean(image.closest('.bundle-carousel,.horizontal-rail,.banner-track,.image-thumbs'));
  if (!insideHorizontalScroller) return true;
  return rect.left <= rootRect.right + HORIZONTAL_PRELOAD_MARGIN && rect.right >= rootRect.left - 180;
}

function ensureObserver() {
  if (appObserver || !app || !('IntersectionObserver' in window)) return appObserver;
  appObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) loadDeferredImage(entry.target);
    });
  }, { root: app, rootMargin: `${PRELOAD_MARGIN}px ${HORIZONTAL_PRELOAD_MARGIN}px`, threshold: 0.01 });
  return appObserver;
}

function deferImage(image) {
  if (!app?.contains(image) || imageIsNearViewport(image)) {
    image.loading = 'eager';
    return;
  }

  const source = image.getAttribute('src');
  if (!source || source === TRANSPARENT_PIXEL) return;
  image.dataset.performanceSrc = localRepositoryAsset(source);
  if (image.hasAttribute('srcset')) {
    image.dataset.performanceSrcset = image.getAttribute('srcset');
    image.removeAttribute('srcset');
  }
  image.src = TRANSPARENT_PIXEL;
  image.loading = 'eager';
  pendingImages.add(image);
  ensureObserver()?.observe(image);
}

function prepareImage(image) {
  if (!(image instanceof HTMLImageElement) || image.dataset.performancePrepared === 'true') return;
  image.dataset.performancePrepared = 'true';
  rewriteImageUrls(image);
  ensureDimensions(image);
  image.decoding = 'async';
  bindErrorRecovery(image);

  if (isCritical(image)) {
    image.loading = 'eager';
    image.fetchPriority = 'high';
    return;
  }

  image.fetchPriority = 'low';
  deferImage(image);
}

function prepareNode(node) {
  if (!(node instanceof Element)) return;
  if (node.matches('img')) prepareImage(node);
  node.querySelectorAll?.('img').forEach(prepareImage);
}

function prepareRoot(root) {
  root?.querySelectorAll?.('img').forEach(prepareImage);
}

function scanPendingImages() {
  scanScheduled = false;
  pendingImages.forEach(image => {
    if (!image.isConnected) {
      pendingImages.delete(image);
      appObserver?.unobserve(image);
      return;
    }
    if (imageIsNearViewport(image)) loadDeferredImage(image);
  });
}

function scheduleScan() {
  if (scanScheduled) return;
  scanScheduled = true;
  requestAnimationFrame(scanPendingImages);
}

function observeRoot(root) {
  if (!root) return;
  prepareRoot(root);
  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(prepareNode));
    scheduleScan();
  }).observe(root, { childList: true, subtree: true });
}

prepareRoot(document);
observeRoot(app);
observeRoot(document.getElementById('checkout-content'));

new MutationObserver(records => {
  records.forEach(record => record.addedNodes.forEach(node => {
    if (node instanceof Element && (node.id === 'bundle-confirm-overlay' || node.id === 'personalization-overlay')) prepareNode(node);
  }));
}).observe(document.body, { childList: true });

app?.addEventListener('scroll', scheduleScan, { passive: true });
document.addEventListener('scroll', event => {
  if (event.target instanceof Element && event.target.matches('.bundle-carousel,.horizontal-rail,.banner-track,.image-thumbs')) scheduleScan();
}, { passive: true, capture: true });
window.addEventListener('resize', scheduleScan, { passive: true });
window.addEventListener('da:route-rendered', () => {
  prepareRoot(app);
  scheduleScan();
});

scheduleScan();
document.documentElement.dataset.performanceProfile = 'container-aware';
document.documentElement.dataset.imageSourceMode = 'branch-aware';