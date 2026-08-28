const BUILD = '20260828-site-mug-runtime-v17-media-fields-3d-v2';
let libraryPromise = null;
let featurePromise = null;
let thumbPromise = null;
let customerSyncBound = false;

function isProductRoute() {
  return /^#\/produto\/[^/?#]+/i.test(String(location.hash || ''));
}

function bindCustomerLibrarySync() {
  if (customerSyncBound) return;
  customerSyncBound = true;
  window.addEventListener('da:mug-personalized-added', () => {
    window.setTimeout(async () => {
      try {
        const library = window.__DA_CUSTOMER_LIBRARY__;
        if (library && typeof library.sync === 'function') await library.sync();
      } catch {}
    }, 500);
  });
}

async function loadCustomerLibrary() {
  if (!libraryPromise) {
    libraryPromise = import(`./customer-favorites-v27.js?v=${encodeURIComponent(BUILD)}`).then(module => {
      bindCustomerLibrarySync();
      return module;
    }).catch(error => {
      libraryPromise = null;
      console.error('[Favoritos + Minhas canecas] Falha ao carregar biblioteca:', error);
      throw error;
    });
  }
  return libraryPromise;
}

async function loadMugThumbnails() {
  if (!thumbPromise) {
    thumbPromise = import(`./mug-public-thumbnails-v2.js?v=${encodeURIComponent(BUILD)}`).catch(error => {
      thumbPromise = null;
      console.warn('[Canecas públicas] Miniaturas próprias indisponíveis:', error);
    });
  }
  return thumbPromise;
}

async function loadMugFeatures() {
  await Promise.all([loadCustomerLibrary().catch(() => null), loadMugThumbnails().catch(() => null)]);
  if (!isProductRoute()) return;
  if (!featurePromise) {
    featurePromise = (async () => {
      await import(`../../shared/mug-make-fast-ack-v1.js?v=${encodeURIComponent(BUILD)}`);
      await import(`./mug-public-personalization-contract-v25.js?v=${encodeURIComponent(BUILD)}`);
      await import(`./mug-public-personalization-v5.js?v=${encodeURIComponent(BUILD)}`);
      await import(`./mug-public-result-link-v26.js?v=${encodeURIComponent(BUILD)}`);
      await import(`./mug-public-3d-v2.js?v=${encodeURIComponent(BUILD)}`);
      document.documentElement.dataset.mugPublicRuntime = BUILD;
      console.info(`Canecas públicas runtime · ${BUILD}`);
    })().catch(error => {
      featurePromise = null;
      console.error('[Canecas públicas runtime] Falha ao carregar recursos:', error);
    });
  }
  await featurePromise;
}

window.addEventListener('hashchange', loadMugFeatures);
window.addEventListener('da:route-rendered', loadMugFeatures);
window.addEventListener('da:catalog-ready', loadMugFeatures);
window.addEventListener('da:catalog-refreshed', loadMugFeatures);

loadMugFeatures();

export { BUILD, loadMugFeatures, loadCustomerLibrary, loadMugThumbnails };