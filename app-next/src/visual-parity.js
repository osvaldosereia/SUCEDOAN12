function sectionTitle(section) {
  return section?.querySelector('.section-heading h2')?.textContent?.trim().toLowerCase() || '';
}

function productImageFromCard(card) {
  const image = card?.querySelector('.product-card-media img');
  return image ? {
    src: image.getAttribute('src') || '',
    fallback: image.getAttribute('data-fallback') || ''
  } : { src: '../img/logoantonia5.png', fallback: '' };
}

function bindDealImageFallbacks(root) {
  root?.querySelectorAll?.('.home-deal-product-img:not([data-deal-fallback-bound])').forEach(image => {
    image.dataset.dealFallbackBound = 'true';
    image.addEventListener('error', () => {
      const candidates = String(image.dataset.fallback || '')
        .split('|')
        .map(value => value.trim())
        .filter(Boolean);
      const next = candidates.shift();
      image.dataset.fallback = candidates.join('|');
      image.src = next || '../img/logoantonia5.png';
    });
  });
}

function discountCardsHtml(offerSection) {
  const cards = [...(offerSection?.querySelectorAll('.product-card') || [])];
  const definitions = [
    { badge: '50% OFF', title: 'Metade do preço', copy: 'Produtos selecionados com desconto máximo.', href: '#/ofertas/50', cls: 'deal-50' },
    { badge: '40% OFF', title: 'Economize mais', copy: 'Ofertas fortes para reduzir o valor da compra.', href: '#/ofertas/40', cls: 'deal-40' },
    { badge: 'ATÉ R$ 5', title: 'Achadinhos', copy: 'Itens baratos para completar o seu pedido.', href: '#/ofertas/ate-5', cls: 'deal-5' }
  ];
  return definitions.map((definition, index) => {
    const card = cards[index] || cards[0];
    const image = productImageFromCard(card);
    const fallback = image.fallback ? ` data-fallback="${image.fallback.replace(/"/g, '&quot;')}"` : '';
    return `<a class="home-deal-card ${definition.cls}" href="${definition.href}" aria-label="${definition.badge}: ${definition.title}">
      <span class="home-deal-media"><img class="home-deal-product-img" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async" src="${image.src}"${fallback} alt=""></span>
      <span class="home-deal-copy">
        <span class="home-deal-badge">${definition.badge}</span>
        <strong>${definition.title}</strong>
        <small>${definition.copy}</small>
        <span class="home-deal-cta">Ver ofertas <b aria-hidden="true">→</b></span>
      </span>
    </a>`;
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
    bindDealImageFallbacks(quickLinks);
  }
  offers?.remove();

  if (quickLinks && !page.querySelector('.payment-notices')) quickLinks.insertAdjacentHTML('afterend', paymentNoticesHtml());
  const payment = page.querySelector('.payment-notices');

  if (payment && categories && !page.querySelector('.purchase-journey')) payment.insertAdjacentHTML('afterend', journeyHtml(categories));
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