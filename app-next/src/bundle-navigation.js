function closeBundleConfirmation() {
  const overlay = document.getElementById('bundle-confirm-overlay');
  if (!overlay) return;
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('inert', '');
  document.body.classList.remove('bundle-confirm-open');
}

function goToOffers() {
  closeBundleConfirmation();
  const app = document.getElementById('app');
  if (app) app.scrollTop = 0;
  if (location.hash === '#/ofertas') {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  location.hash = '#/ofertas';
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-action="bundle-confirm-continue"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  goToOffers();
}, true);
