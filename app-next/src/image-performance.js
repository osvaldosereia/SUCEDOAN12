const transparentPixel = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221%22 height=%221%22/%3E';
const supportsNativeLazy = typeof HTMLImageElement !== 'undefined' && 'loading' in HTMLImageElement.prototype;
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const lowEndDevice = Boolean(
  connection?.saveData
  || /(^|-)2g$/.test(String(connection?.effectiveType || ''))
  || Number(navigator.deviceMemory || 8) <= 2
  || Number(navigator.hardwareConcurrency || 8) <= 2
);
const managedLazyLoading = lowEndDevice || !supportsNativeLazy;

let fallbackObserver;
let fallbackScrollBound = false;
const fallbackImages = new Set();

function localRepositoryAsset(value) {
  const raw = String(value || '').trim();
  if (!raw) return raw;

  let match = raw.match(/^https?:\/\/raw\.githubusercontent\.com\/osvaldosereia\/SUCEDOAN12\/[^/]+\/(.+)$/i);
  if (!match) match = raw.match(/^https?:\/\/github\.com\/osvaldosereia\/SUCEDOAN12\/(?:raw|blob)\/[^/]+\/(.+)$/i);
  if (!match) return raw;

  const path = String(match[1] || '').replace(/^\/+/, '');
  return path ? `/${path}` : raw;
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
    if (!image.dataset[key]) return;
    image.dataset[key] = rewriteCandidateList(image.dataset[key]);
  });
}

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

function fallbackCandidates(image) {
  const candidates = [
    ...String(image.dataset.fallback || '').split('|'),
    ...String(image.dataset.detailFallback || '').split('|')
  ].map(item => localRepositoryAsset(item.trim())).filter(Boolean);
  candidates.push('/img/logoantonia5.png');
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
    const current = localRepositoryAsset(image.getAttribute('src'));
    let next = candidates.shift();
    while (next && next === current) next = candidates.shift();
    image.dataset.performanceCandidates = candidates.join('|');
    if (next) {
      image.loading = 'eager';
      image.src = next;
    }
  });
}

function restoreDeferredImage(image) {
  const source = image.dataset.performanceSrc;
  if (!source) return;
  image.loading = 'eager';
  image.src = localRepositoryAsset(source);
  delete image.dataset.performanceSrc;
  fallbackImages.delete(image);
  fallbackObserver?.unobserve(image);
}

function fallbackCheck() {
  const limit = innerHeight + (lowEndDevice ? 520 : 800);
  fallbackImages.forEach(image => {
    if (!image.isConnected) {
      fallbackImages.delete(image);
      return;
    }
    const rect = image.getBoundingClientRect();
    if (rect.top <= limit && rect.bottom >= -180) restoreDeferredImage(image);
  });
  if (!fallbackImages.size && fallbackScrollBound) {
    document.getElementById('app')?.removeEventListener('scroll', fallbackCheck);
    window.removeEventListener('scroll', fallbackCheck);
    fallbackScrollBound = false;
  }
}

function deferManagedImage(image) {
  if (isCritical(image) || image.dataset.performanceSrc || !image.getAttribute('src')) return;
  const rect = image.getBoundingClientRect();
  const nearLimit = innerHeight + (lowEndDevice ? 520 : 800);

  if (rect.top <= nearLimit && rect.bottom >= -180) {
    image.loading = 'eager';
    return;
  }

  image.dataset.performanceSrc = localRepositoryAsset(image.getAttribute('src'));
  image.src = transparentPixel;
  image.loading = 'eager';
  fallbackImages.add(image);

  if ('IntersectionObserver' in window) {
    if (!fallbackObserver) {
      fallbackObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) restoreDeferredImage(entry.target);
        });
      }, { root: null, rootMargin: lowEndDevice ? '520px 0px' : '800px 0px' });
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
  rewriteImageUrls(image);
  imageDimensions(image);
  image.decoding = 'async';
  bindErrorRecovery(image);

  if (isCritical(image)) {
    image.loading = 'eager';
    image.fetchPriority = 'high';
    return;
  }

  image.fetchPriority = 'low';
  if (managedLazyLoading) {
    deferManagedImage(image);
  } else {
    image.loading = 'lazy';
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
document.documentElement.dataset.imageSourceMode = 'same-origin';
