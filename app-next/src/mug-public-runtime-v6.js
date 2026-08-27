const BUILD = '20260827-site-mug-runtime-v11-public-recovery-cache';
let featurePromise = null;

function isProductRoute() {
  return /^#\/produto\/[^/?#]+/i.test(String(location.hash || ''));
}

async function loadMugFeatures() {
  if (!isProductRoute()) return;
  if (!featurePromise) {
    featurePromise = (async () => {
      await import(`../../shared/mug-make-fast-ack-v1.js?v=${encodeURIComponent(BUILD)}`);
      await import(`./mug-public-personalization-contract-v25.js?v=${encodeURIComponent(BUILD)}`);
      await import(`./mug-public-personalization-v5.js?v=${encodeURIComponent(BUILD)}`);
      await import(`./mug-public-result-link-v26.js?v=${encodeURIComponent(BUILD)}`);
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

loadMugFeatures();

export { BUILD, loadMugFeatures };
