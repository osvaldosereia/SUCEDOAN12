const ABSOLUTE_IMAGE = /^(?:https?:|data:|blob:|\/\/|\/)/i;

export function resolveCollectionImage(value = '') {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  if (!raw || ABSOLUTE_IMAGE.test(raw)) return raw;
  const clean = raw.replace(/^\.\//, '').replace(/^\/+/, '');
  if (clean.startsWith('img/') || clean.startsWith('site/')) return `../${clean}`;
  return raw;
}

function fixImage(image) {
  if (!(image instanceof HTMLImageElement)) return;
  if (image.dataset.collectionImageResolved === '1') return;
  const original = image.getAttribute('src') || '';
  const resolved = resolveCollectionImage(original);
  image.dataset.collectionImageResolved = '1';
  if (resolved && resolved !== original) image.src = resolved;
}

export function installCollectionImageResolver(root = document) {
  const scan = node => {
    if (node instanceof HTMLImageElement) fixImage(node);
    node?.querySelectorAll?.('.collection-card img').forEach(fixImage);
  };
  scan(root);
  const observer = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(scan));
  });
  observer.observe(root === document ? document.body : root, { childList: true, subtree: true });
  return observer;
}
