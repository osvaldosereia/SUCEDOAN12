let scheduled = false;

function sectionTitle(section) {
  return section?.querySelector('.section-heading h2')?.textContent?.trim().toLowerCase() || '';
}

function paymentNoticesHtml() {
  return `<section class="payment-notices" aria-label="Condições da compra">
    <article class="payment-notice"><span class="payment-notice-mark">4x</span><div><small>Pagamento facilitado</small><strong>Parcele em até 4x sem juros</strong><span>no Cartão de Crédito</span></div></article>
    <article class="payment-notice"><span class="payment-notice-mark">OK</span><div><small>Compra com segurança</small><strong>Pague somente na entrega</strong><span>após receber o seu pedido</span></div></article>
    <article class="payment-notice"><span class="payment-notice-mark">R$0</span><div><small>Entrega grátis</small><strong>Em Cuiabá e Várzea Grande</strong><span>em pedidos a partir de R$ 75</span></div></article>
  </section>`;
}

function offersBannerHtml() {
  return `<section class="home-offers-banner" aria-label="Descontos de até 50%">
    <div><small>Ofertas especiais</small><strong>DESCONTOS DE ATÉ 50%</strong></div>
    <a class="home-offers-banner-button" href="#/ofertas/50">Ver Ofertas</a>
  </section>`;
}

function applyHomeParity() {
  const page = document.querySelector('.home-page');
  if (!page || page.dataset.visualParityApplied === 'true') return;

  page.classList.add('home-clean', 'home-funnel');
  page.querySelector('.home-hero')?.remove();
  page.querySelector('.purchase-journey')?.remove();
  page.querySelector('.quick-links')?.remove();
  document.getElementById('personalization-consent')?.remove();

  const sections = [...page.querySelectorAll(':scope > .content-section')];
  const findSection = fragment => sections.find(section => sectionTitle(section).includes(fragment));
  const offers = findSection('ofertas de hoje');
  const baskets = findSection('cestas básicas');
  const kits = findSection('kits promocionais');
  const categories = findSection('categorias');
  const personalized = findSection('escolhidos para você');
  const recent = findSection('vistos recentemente');
  const buyAgain = findSection('compre novamente');

  offers?.remove();

  if (!page.querySelector('.payment-notices')) page.insertAdjacentHTML('afterbegin', paymentNoticesHtml());
  if (!page.querySelector('.home-offers-banner')) page.insertAdjacentHTML('beforeend', offersBannerHtml());

  const payment = page.querySelector('.payment-notices');
  const offersBanner = page.querySelector('.home-offers-banner');

  [payment, baskets, kits, offersBanner, categories, personalized, recent, buyAgain]
    .filter(Boolean)
    .forEach(element => page.appendChild(element));

  page.dataset.visualParityApplied = 'true';
}

function scheduleParity() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    document.getElementById('personalization-consent')?.remove();
    applyHomeParity();
  });
}

const observer = new MutationObserver(scheduleParity);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('hashchange', scheduleParity);
window.addEventListener('DOMContentLoaded', scheduleParity);
scheduleParity();
