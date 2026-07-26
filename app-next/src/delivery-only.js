const DELIVERY_VERSION = '2026-07-26-delivery-only-v1';
let scheduled = false;

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function updateCompanySummary(root = document) {
  root.querySelectorAll('.home-company-info').forEach(section => {
    section.dataset.deliveryOnly = DELIVERY_VERSION;
    const eyebrow = section.querySelector('.home-company-copy > small');
    if (eyebrow) eyebrow.textContent = 'Delivery local';
    const paragraph = section.querySelector('.home-company-copy > p');
    if (paragraph) {
      paragraph.textContent = 'Cestas básicas, kits promocionais e produtos de supermercado com atendimento humano, conferência do pedido e delivery em Cuiabá e Várzea Grande. Pedido mínimo de R$ 75.';
    }
    section.querySelectorAll('.home-company-facts > div').forEach(item => {
      const term = item.querySelector('dt');
      const description = item.querySelector('dd');
      if (!term || !description) return;
      if (normalizeText(term.textContent).includes('endereço')) {
        term.textContent = 'Modalidade';
        description.textContent = 'Somente delivery, sem loja física';
      }
    });
  });
}

function updatePublicCopy(root = document) {
  root.querySelectorAll('.public-site-footer-contact > span').forEach(node => {
    node.textContent = 'Somente delivery em Cuiabá e Várzea Grande - MT';
  });
  const homeHeading = root.querySelector('.home-page h1.sr-only');
  if (homeHeading) {
    homeHeading.textContent = 'Cestas básicas e kits promocionais com delivery em Cuiabá e Várzea Grande';
  }
}

function applyDeliveryOnly() {
  document.documentElement.dataset.deliveryOnly = DELIVERY_VERSION;
  updateCompanySummary();
  updatePublicCopy();
}

function scheduleDeliveryOnly() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    applyDeliveryOnly();
  });
}

if (typeof document !== 'undefined') {
  const app = document.getElementById('app');
  if (app) new MutationObserver(scheduleDeliveryOnly).observe(app, { childList: true, subtree: true });
  window.addEventListener('DOMContentLoaded', scheduleDeliveryOnly);
  window.addEventListener('hashchange', scheduleDeliveryOnly);
  window.addEventListener('da:catalog-ready', scheduleDeliveryOnly);
  scheduleDeliveryOnly();
}

export { applyDeliveryOnly };
