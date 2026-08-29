// CanecaFácil — deterministic scroll position for SPA product navigation.
(() => {
  const BUILD = '20260828-canecafacil-navigation-v2';
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
    setTimeout(topNow, 60);
    setTimeout(topNow, 180);
  }

  // Reset only when the product itself is being opened. Carousel arrows,
  // dots, favorite and other controls inside the card must never move the page.
  document.addEventListener('click', event => {
    if (event.target.closest?.('.cf-arrow,.cf-dots,button,a,input,select,textarea,[data-thumb],[data-cf-fav]')) return;
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
