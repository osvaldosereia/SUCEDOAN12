const transparentPixel = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221%22 height=%221%22/%3E';
const supportsNativeLazy = typeof HTMLImageElement !== 'undefined' && 'loading' in HTMLImageElement.prototype;
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const lowEndDevice = Boolean(
  connection?.saveData
  || /(^|-)2g$/.test(String(connection?.effectiveType || ''))
  || Number(navigator.deviceMemory || 8) <= 2
  || Number(navigator.hardwareConcurrency || 8) <= 2
);

let fallbackObserver;
let fallbackScrollBound = false;
const fallbackImages = new Set();

function imageDimensions(image) {
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
  image.width = image.width || 300;
  image.height = image.height || 300;
}

function isCritical(image) {
  return image.matches('.brand-logo,.sidebar-brand-logo,[fetchpriority="high"],.basket-detail-media img,.product-detail-media>img');
}

function restoreDeferredImage(image) {
  const source = image.dataset.performanceSrc;
  if (!source) return;
  image.src = source;
  delete image.dataset.performanceSrc;
  fallbackImages.delete(image);
  fallbackObserver?.unobserve(image);
}

function fallbackCheck() {
  const limit = innerHeight + (lowEndDevice ? 360 : 700);
  fallbackImages.forEach(image => {
    if (!image.isConnected) {
      fallbackImages.delete(image);
      return;
    }
    if (image.getBoundingClientRect().top <= limit) restoreDeferredImage(image);
  });
  if (!fallbackImages.size && fallbackScrollBound) {
    document.getElementById('app')?.removeEventListener('scroll', fallbackCheck);
    window.removeEventListener('scroll', fallbackCheck);
    fallbackScrollBound = false;
  }
}

function deferForLegacyBrowser(image) {
  if (supportsNativeLazy || isCritical(image) || image.dataset.performanceSrc || !image.getAttribute('src')) return;
  const rect = image.getBoundingClientRect();
  if (rect.top <= innerHeight + 300) return;
  image.dataset.performanceSrc = image.src;
  image.src = transparentPixel;
  fallbackImages.add(image);

  if ('IntersectionObserver' in window) {
    if (!fallbackObserver) {
      fallbackObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) restoreDeferredImage(entry.target);
        });
      }, { root: document.getElementById('app'), rootMargin: lowEndDevice ? '360px 0px' : '700px 0px' });
    }
    fallbackObserver.observe(image);
  } else if (!fallbackScrollBound) {
    document.getElementById('app')?.addEventListener('scroll', fallbackCheck, { passive: true });
    window.addEventListener('scroll', fallbackCheck, { passive: true });
    fallbackScrollBound = true;
  }
}

function prepareImage(image) {
  if (!(image instanceof HTMLImageElement) || image.dataset.performancePrepared === 'true') return;
  image.dataset.performancePrepared = 'true';
  imageDimensions(image);
  image.decoding = 'async';

  if (isCritical(image)) {
    image.loading = 'eager';
    image.fetchPriority = 'high';
  } else {
    image.loading = 'lazy';
    image.fetchPriority = 'low';
    deferForLegacyBrowser(image);
  }
}

function prepareNode(node) {
  if (!(node instanceof Element)) return;
  if (node.matches('img')) prepareImage(node);
  node.querySelectorAll?.('img').forEach(prepareImage);
}

function prepareRoot(root) {
  root?.querySelectorAll?.('img').forEach(prepareImage);
}

function observeRoot(root) {
  if (!root) return;
  prepareRoot(root);
  new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(prepareNode));
  }).observe(root, { childList: true, subtree: true });
}

prepareRoot(document);
observeRoot(document.getElementById('app'));
observeRoot(document.getElementById('checkout-content'));
new MutationObserver(records => {
  records.forEach(record => record.addedNodes.forEach(node => {
    if (node instanceof Element && (node.id === 'bundle-confirm-overlay' || node.id === 'personalization-overlay')) prepareNode(node);
  }));
}).observe(document.body, { childList: true });

document.documentElement.dataset.performanceProfile = lowEndDevice ? 'economy' : 'standard';