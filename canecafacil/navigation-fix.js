// CanecaFácil — deterministic scroll position for SPA product navigation.
// Hash navigation normally preserves the storefront scroll position. Product
// pages must always start at the top, regardless of image/layout timing.
(() => {
  const BUILD = '20260828-canecafacil-navigation-v1';
  const isProductRoute = () => /^#\/produto\//.test(location.hash || '');

  try { history.scrollRestoration = 'manual'; } catch {}

  function topNow() {
    if (!isProductRoute()) return;
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
    root.scrollTop = 0;
    root.style.scrollBehavior = previous;
  }

  function resetProductScroll() {
    if (!isProductRoute()) return;
    topNow();
    requestAnimationFrame(() => {
      topNow();
      requestAnimationFrame(topNow);
    });
    // Covers the render/enhancement pass that runs after the hash change.
    setTimeout(topNow, 60);
    setTimeout(topNow, 180);
  }

  // Reset immediately when the customer clicks a product in any grid.
  document.addEventListener('click', event => {
    const target = event.target.closest?.('[data-open-product],[data-cf-open]');
    if (!target) return;
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, true);

  window.addEventListener('hashchange', resetProductScroll);
  window.addEventListener('pageshow', () => {
    if (isProductRoute()) resetProductScroll();
  });

  if (isProductRoute()) resetProductScroll();
  document.documentElement.dataset.cfNavigation = BUILD;
})();
