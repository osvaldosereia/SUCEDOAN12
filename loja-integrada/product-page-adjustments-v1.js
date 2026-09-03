(() => {
  'use strict';

  const BUILD = '20260903-product-page-adjustments-v1';
  if (window.__CF_PRODUCT_PAGE_ADJUSTMENTS__ === BUILD) return;
  window.__CF_PRODUCT_PAGE_ADJUSTMENTS__ = BUILD;

  const MOBILE = window.matchMedia('(max-width: 767px)');

  function isProductPage() {
    return document.body?.classList?.contains('pagina-produto') || Boolean(document.querySelector('#imagemProduto, .produto-thumbs, .acoes-produto'));
  }

  function installStyle() {
    let style = document.getElementById('cfProductPageAdjustmentsStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = 'cfProductPageAdjustmentsStyle';
      document.head.appendChild(style);
    }

    style.textContent = `
body.pagina-produto .principal .preco-produto .preco-promocional,
body.pagina-produto .acoes-produto .preco-promocional,
body.pagina-produto .preco-produto .preco-promocional{
  font-size:32px!important;
  line-height:1.05!important;
  font-weight:500!important;
}

body.pagina-produto .cf-native-personalizer .form-head h2{
  font-weight:500!important;
}

@media(max-width:767px){
  body.pagina-produto .principal .preco-produto .preco-promocional,
  body.pagina-produto .acoes-produto .preco-promocional,
  body.pagina-produto .preco-produto .preco-promocional{
    font-size:35px!important;
    line-height:1.04!important;
  }

  body.pagina-produto .conteiner-imagem,
  body.pagina-produto #imagemProduto{
    touch-action:pan-y pinch-zoom!important;
  }

  body.pagina-produto .cf-native-personalizer .form-head h2{
    font-weight:500!important;
  }
}
`;
  }

  function galleryLinks() {
    return [...document.querySelectorAll('.produto-thumbs .miniaturas a[data-imagem-grande], .produto-thumbs .miniaturas a[data-largeimg]')]
      .filter((node, index, arr) => arr.indexOf(node) === index);
  }

  function activeIndex(links) {
    let index = links.findIndex(link => link.closest('li')?.classList.contains('active'));
    if (index >= 0) return index;

    const current = document.querySelector('#imagemProduto');
    const src = String(current?.currentSrc || current?.src || current?.getAttribute('data-largeimg') || current?.getAttribute('data-zoom') || '');
    if (!src) return 0;

    index = links.findIndex(link => {
      const candidate = String(link.getAttribute('data-imagem-grande') || link.getAttribute('data-largeimg') || '');
      return candidate && (candidate === src || src.includes(candidate) || candidate.includes(src));
    });
    return index >= 0 ? index : 0;
  }

  function goGallery(step) {
    const links = galleryLinks();
    if (links.length < 2) return;
    const current = activeIndex(links);
    let next = current + step;
    if (next < 0) next = links.length - 1;
    if (next >= links.length) next = 0;
    const target = links[next];
    try { target.click(); } catch {}
  }

  function installSwipe() {
    if (!MOBILE.matches || !isProductPage()) return;
    const stage = document.querySelector('.conteiner-imagem') || document.querySelector('#imagemProduto')?.parentElement;
    if (!stage || stage.dataset.cfSwipeGallery === BUILD) return;
    stage.dataset.cfSwipeGallery = BUILD;

    let startX = 0;
    let startY = 0;
    let startedAt = 0;

    stage.addEventListener('touchstart', event => {
      const touch = event.touches?.[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      startedAt = Date.now();
    }, { passive:true });

    stage.addEventListener('touchend', event => {
      const touch = event.changedTouches?.[0];
      if (!touch || !startedAt) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const elapsed = Date.now() - startedAt;
      startedAt = 0;

      if (elapsed > 900) return;
      if (Math.abs(dx) < 42) return;
      if (Math.abs(dx) <= Math.abs(dy) * 1.15) return;

      goGallery(dx < 0 ? 1 : -1);
    }, { passive:true });
  }

  function updateShareText() {
    const button = document.getElementById('cfWhatsappShareProduct');
    if (!button) return;
    const label = [...button.querySelectorAll('span')].find(node => !node.classList.contains('cf-wa-share-icon'));
    if (label) label.textContent = 'Compartilhar no WhatsApp';
    button.setAttribute('aria-label', 'Compartilhar no WhatsApp');
  }

  function refresh() {
    if (!isProductPage()) return;
    installStyle();
    installSwipe();
    updateShareText();
  }

  if (typeof MOBILE.addEventListener === 'function') MOBILE.addEventListener('change', refresh);
  else if (typeof MOBILE.addListener === 'function') MOBILE.addListener(refresh);

  const start = () => {
    refresh();
    [350, 900, 1700, 3000, 5000].forEach(delay => setTimeout(refresh, delay));

    const observer = new MutationObserver(() => {
      updateShareText();
      if (MOBILE.matches) installSwipe();
    });
    observer.observe(document.documentElement, { childList:true, subtree:true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();

  console.info(`CanecaFácil · ajustes página de produto · ${BUILD}`);
})();
