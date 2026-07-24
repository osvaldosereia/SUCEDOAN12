let scheduled = false;

function sectionTitle(section) {
  return section?.querySelector('.section-heading h2')?.textContent?.trim().toLowerCase() || '';
}

function discountShortcutsHtml() {
  const definitions = [
    { badge: '50% OFF', title: 'Metade do preço', copy: 'Produtos selecionados com desconto máximo.', href: '#/ofertas/50', cls: 'deal-50' },
    { badge: '40% OFF', title: 'Economize mais', copy: 'Ofertas fortes para reduzir o valor da compra.', href: '#/ofertas/40', cls: 'deal-40' },
    { badge: 'OFERTAS', title: 'Todas as ofertas', copy: 'Outros descontos, organizados do maior para o menor.', href: '#/ofertas?faixa=outras', cls: 'deal-all' },
    { badge: 'ATÉ R$ 5', title: 'Achadinhos', copy: 'Itens baratos para completar o seu pedido.', href: '#/ofertas/ate-5', cls: 'deal-5' }
  ];

  return definitions.map(definition => `<a class="home-deal-shortcut ${definition.cls}" href="${definition.href}" aria-label="${definition.badge}: ${definition.title}">
    <span class="home-deal-copy">
      <span class="home-deal-badge">${definition.badge}</span>
      <strong>${definition.title}</strong>
      <small>${definition.copy}</small>
      <span class="home-deal-cta">Ver ofertas <b aria-hidden="true">→</b></span>
    </span>
  </a>`).join('');
}

function paymentNoticesHtml() {
  return `<section class="payment-notices" aria-label="Condições de pagamento">
    <article class="payment-notice"><span class="payment-notice-mark">4x</span><div><small>Pagamento facilitado</small><strong>Parcele em até 4x sem juros</strong><span>no Cartão de Crédito</span></div></article>
    <article class="payment-notice"><span class="payment-notice-mark">OK</span><div><small>Compra com segurança</small><strong>Pague somente na entrega</strong><span>após receber o seu pedido</span></div></article>
  </section>`;
}

function applyHomeParity() {
  const page = document.querySelector('.home-page');
  if (!page || page.dataset.visualParityApplied === 'true') return;

  page.classList.add('home-clean', 'home-funnel');
  page.querySelector('.home-hero')?.remove();
  page.querySelector('.purchase-journey')?.remove();

  const sections = [...page.querySelectorAll(':scope > .content-section')];
  const findSection = fragment => sections.find(section => sectionTitle(section).includes(fragment));
  const offers = findSection('ofertas de hoje');
  const baskets = findSection('cestas básicas');
  const kits = findSection('kits promocionais');
  const categories = findSection('categorias');
  const personalized = findSection('escolhidos para você');
  const recent = findSection('vistos recentemente');
  const buyAgain = findSection('compre novamente');

  const quickLinks = page.querySelector('.quick-links');
  if (quickLinks) {
    quickLinks.classList.add('home-deal-grid');
    quickLinks.innerHTML = discountShortcutsHtml();
  }
  offers?.remove();

  if (quickLinks && !page.querySelector('.payment-notices')) quickLinks.insertAdjacentHTML('afterend', paymentNoticesHtml());
  const payment = page.querySelector('.payment-notices');

  [quickLinks, payment, baskets, kits, categories, personalized, recent, buyAgain]
    .filter(Boolean)
    .forEach(element => page.appendChild(element));
  page.dataset.visualParityApplied = 'true';
}

function applyOtherOffersPage() {
  const hash = String(location.hash || '');
  if (!hash.startsWith('#/ofertas') || !hash.includes('faixa=outras')) return;
  const page = document.querySelector('.page-container');
  if (!page || page.dataset.otherOffersApplied === 'true') return;
  const title = page.querySelector('.page-header h1');
  const subtitle = page.querySelector('.page-header p');
  if (title) title.textContent = 'Todas as ofertas';
  if (subtitle) subtitle.textContent = 'Outras ofertas abaixo de 40%, do maior desconto para o menor.';
  page.querySelectorAll('.product-grid .product-card').forEach(card => {
    const match = String(card.querySelector('.discount-badge')?.textContent || '').match(/(\d+)/);
    if (Number(match?.[1] || 0) >= 40) card.remove();
  });
  page.dataset.otherOffersApplied = 'true';
}

function scheduleParity() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    applyHomeParity();
    applyOtherOffersPage();
  });
}

const observer = new MutationObserver(scheduleParity);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('hashchange', scheduleParity);
window.addEventListener('DOMContentLoaded', scheduleParity);
scheduleParity();
