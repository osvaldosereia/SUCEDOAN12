const SHORT_BASKET_TEXT = 'Compare as cestas, confira os produtos e ajuste a composição antes de pedir. Entrega em Cuiabá e Várzea Grande.';

function applyHomeCopy(root = document) {
  const intro = root.querySelector?.('.basket-seo-intro');
  if (!intro) return;

  const eyebrow = intro.querySelector('small');
  if (eyebrow) eyebrow.remove();

  const paragraph = intro.querySelector('p');
  if (paragraph && paragraph.textContent !== SHORT_BASKET_TEXT) {
    paragraph.textContent = SHORT_BASKET_TEXT;
  }
}

window.addEventListener('da:route-rendered', event => {
  applyHomeCopy(event.detail?.root || document);
});

window.addEventListener('da:catalog-ready', () => {
  requestAnimationFrame(() => applyHomeCopy(document));
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => applyHomeCopy(document), { once: true });
} else {
  applyHomeCopy(document);
}
