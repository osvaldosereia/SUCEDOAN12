(() => {
  'use strict';

  const BUILD = '20260901-cf-temp-product-privacy-v1';
  const TEMP_LINK = /\/caneca-personalizada-/i;
  const TEMP_PAGE = TEMP_LINK.test(location.pathname);

  if (window.__CF_TEMP_PRODUCT_PRIVACY__ === BUILD) return;
  window.__CF_TEMP_PRODUCT_PRIVACY__ = BUILD;

  function markNoIndex() {
    if (!TEMP_PAGE) return;
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    meta.content = 'noindex,nofollow,noarchive,nosnippet';
    document.documentElement.dataset.cfTemporaryProduct = '1';
  }

  function cardFor(link) {
    const selectors = [
      '.listagem-item', '.produto-item', '.item-produto', '.product-item', '.produto',
      '.card-produto', '.produto-card', '[data-produto-id]', '[data-product-id]',
      '.slick-slide', '.swiper-slide', 'li'
    ];
    for (const selector of selectors) {
      const card = link.closest(selector);
      if (card) return card;
    }
    return link.parentElement;
  }

  function hideCard(link) {
    if (!link || !TEMP_LINK.test(link.getAttribute('href') || '')) return;
    const card = cardFor(link);
    if (!card || card === document.body || card === document.documentElement) return;
    card.dataset.cfTemporaryHidden = '1';
    card.setAttribute('aria-hidden', 'true');
    card.style.setProperty('display', 'none', 'important');
  }

  function scrub(root = document) {
    if (TEMP_PAGE) return;
    const links = root.querySelectorAll?.('a[href*="caneca-personalizada-"]') || [];
    links.forEach(hideCard);
  }

  markNoIndex();
  scrub();

  if (!TEMP_PAGE) {
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        scrub();
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('load', () => scrub(), { once: true });
    setTimeout(() => scrub(), 600);
    setTimeout(() => scrub(), 1800);
  }

  console.info(`CanecaFácil · privacidade de produto temporário ${BUILD}`);
})();
