function sectionTitle(section) {
  return section?.querySelector('.section-heading h2')?.textContent?.trim().toLowerCase() || '';
}

function productImageFromCard(card) {
  const image = card?.querySelector('.product-card-media img');
  return image ? {
    src: image.getAttribute('src') || '',
    alt: image.getAttribute('alt') || '',
    fallback: image.getAttribute('data-fallback') || ''
  } : { src: '../img/logoantonia5.png', alt: '', fallback: '' };
}

function productLinkFromCard(card, fallback) {
  return card?.querySelector('.product-card-media a')?.getAttribute('href') || fallback;
}

function discountCardsHtml(offerSection) {
  const cards = [...(offerSection?.querySelectorAll('.product-card') || [])];
  const definitions = [
    { title: '50% DE DESCONTO', copy: 'Produtos selecionados pela metade do preço', href: '#/ofertas/50', cls: 'deal-50' },
    { title: '40% DE DESCONTO', copy: 'Economize em produtos com desconto especial', href: '#/ofertas/40', cls: 'deal-40' },
    { title: 'ATÉ 5 REAIS', copy: 'Achadinhos baratos para completar a compra', href: '#/ofertas/ate-5', cls: 'deal-5' }
  ];
  return definitions.map((definition, index) => {
    const card = cards[index] || cards[0];
    const image = productImageFromCard(card);
    const href = productLinkFromCard(card, definition.href);
    const fallback = image.fallback ? ` data-fallback="${image.fallback.replace(/"/g, '&quot;')}"` : '';
    return `<a class="home-deal-card ${definition.cls}" href="${href}"><span class="home-deal-copy"><strong>${definition.title}</strong><small>${definition.copy}</small></span><img class="home-deal-product-img" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async" src="${image.src}"${fallback} alt="${image.alt.replace(/"/g, '&quot;')}"></a>`;
  }).join('');
}

function paymentNoticesHtml() {
  return `<section class="payment-notices" aria-label="Condições de pagamento">
    <article class="payment-notice"><span class="payment-notice-mark">4x</span><div><small>Pagamento facilitado</small><strong>Parcele em até 4x sem juros</strong><span>no Cartão de Crédito</span></div></article>
    <article class="payment-notice"><span class="payment-notice-mark">OK</span><div><small>Compra com segurança</small><strong>Pague somente na entrega</strong><span>após receber o seu pedido</span></div></article>
  </section>`;
}

function journeyHtml(categorySection) {
  const cards = [...(categorySection?.querySelectorAll('.category-card') || [])].slice(0, 6);
  if (!cards.length) return '';
  return `<section class="content-section purchase-journey"><div class="section-heading"><div><h2>Faça sua compra do mês</h2><p>Um caminho rápido pelos setores que normalmente entram na compra básica.</p></div></div><div class="purchase-journey-grid">${cards.map(card => {
    const href = card.getAttribute('href') || '#/categorias';
    const name = card.querySelector('strong')?.textContent?.trim() || 'Ver produtos';
    const count = card.querySelector('small')?.textContent?.trim() || '';
    const image = card.querySelector('img');
    return `<a class="purchase-journey-card" href="${href}"><span><strong>${name}</strong><small>Veja produtos para completar sua compra.</small><em>${count}</em></span>${image ? `<span class="purchase-journey-media"><img loading="lazy" src="${image.getAttribute('src') || ''}" alt=""></span>` : ''}</a>`;
  }).join('')}</div></section>`;
}

function applyHomeParity() {
  const page = document.querySelector('.home-page');
  if (!page || page.dataset.visualParityApplied === 'true') return;
  page.dataset.visualParityApplied = 'true';
  page.classList.add('home-clean', 'home-funnel');

  page.querySelector('.home-hero')?.remove();

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
    quickLinks.innerHTML = discountCardsHtml(offers);
  }
  offers?.remove();

  if (quickLinks && !page.querySelector('.payment-notices')) {
    quickLinks.insertAdjacentHTML('afterend', paymentNoticesHtml());
  }
  const payment = page.querySelector('.payment-notices');

  if (payment && categories && !page.querySelector('.purchase-journey')) {
    payment.insertAdjacentHTML('afterend', journeyHtml(categories));
  }
  const journey = page.querySelector('.purchase-journey');

  [quickLinks, payment, journey, baskets, kits, categories, personalized, recent, buyAgain]
    .filter(Boolean)
    .forEach(element => page.appendChild(element));
}

let scheduled = false;
function scheduleParity() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    applyHomeParity();
  });
}

const observer = new MutationObserver(scheduleParity);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('hashchange', scheduleParity);
window.addEventListener('DOMContentLoaded', scheduleParity);
scheduleParity();
