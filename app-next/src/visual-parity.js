import { loadCatalog } from './catalog.js';
import { applyProductOffer, isAvailable } from './commerce.js';
import { escapeHtml } from './core.js';

let dealCatalogPromise;
let scheduled = false;

function sectionTitle(section) {
  return section?.querySelector('.section-heading h2')?.textContent?.trim().toLowerCase() || '';
}

function dealProducts() {
  if (!dealCatalogPromise) {
    dealCatalogPromise = loadCatalog().then(catalog => catalog.products
      .map(product => applyProductOffer(product))
      .filter(product => isAvailable(product)));
  }
  return dealCatalogPromise;
}

function imageData(product) {
  const candidates = [product?.img, ...(product?.images || [])]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  const unique = [...new Set(candidates)];
  return {
    src: unique.shift() || '../img/logoantonia5.png',
    fallback: unique.join('|')
  };
}

function randomProduct(pool, fallbackPool, usedIds) {
  const valid = pool.filter(product => product?.img && !usedIds.has(String(product.id)));
  const fallback = fallbackPool.filter(product => product?.img && !usedIds.has(String(product.id)));
  const candidates = valid.length ? valid : (fallback.length ? fallback : pool.length ? pool : fallbackPool);
  if (!candidates.length) return null;
  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  usedIds.add(String(selected.id));
  return selected;
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

function discountCardsHtml(products) {
  const offers = products
    .filter(product => Number(product.oldPrice || 0) > Number(product.price || 0) && Number(product.discountPercent || 0) > 0)
    .sort((a, b) => Number(b.discountPercent || 0) - Number(a.discountPercent || 0) || a.name.localeCompare(b.name, 'pt-BR'));
  const fifty = offers.filter(product => Number(product.discountPercent || 0) >= 50);
  const forty = offers.filter(product => Number(product.discountPercent || 0) >= 40 && Number(product.discountPercent || 0) < 50);
  const otherOffers = offers.filter(product => Number(product.discountPercent || 0) < 40);
  const cheap = products
    .filter(product => Number(product.price || 0) <= 5)
    .sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  const usedIds = new Set();
  const definitions = [
    {
      badge: '50% OFF', title: 'Metade do preço', copy: 'Produtos selecionados com desconto máximo.',
      href: '#/ofertas/50', cls: 'deal-50', product: randomProduct(fifty, offers, usedIds)
    },
    {
      badge: '40% OFF', title: 'Economize mais', copy: 'Ofertas fortes para reduzir o valor da compra.',
      href: '#/ofertas/40', cls: 'deal-40', product: randomProduct(forty, offers, usedIds)
    },
    {
      badge: 'OFERTAS', title: 'Todas as ofertas', copy: 'Outros descontos, organizados do maior para o menor.',
      href: '#/ofertas?faixa=outras', cls: 'deal-all', product: randomProduct(otherOffers, offers, usedIds)
    },
    {
      badge: 'ATÉ R$ 5', title: 'Achadinhos', copy: 'Itens baratos para completar o seu pedido.',
      href: '#/ofertas/ate-5', cls: 'deal-5', product: randomProduct(cheap, products, usedIds)
    }
  ];

  return definitions.map((definition, index) => {
    const image = imageData(definition.product);
    const fallback = image.fallback ? ` data-fallback="${escapeHtml(image.fallback)}"` : '';
    return `<a class="home-deal-card ${definition.cls}" href="${definition.href}" aria-label="${escapeHtml(`${definition.badge}: ${definition.title}`)}">
      <span class="home-deal-media"><img class="home-deal-product-img" loading="${index < 2 ? 'eager' : 'lazy'}" decoding="async" width="360" height="360" src="${escapeHtml(image.src)}"${fallback} alt=""></span>
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

async function applyHomeParity() {
  const page = document.querySelector('.home-page');
  if (!page || page.dataset.visualParityApplied === 'true' || page.dataset.visualParityPending === 'true') return;
  page.dataset.visualParityPending = 'true';

  try {
    const products = await dealProducts();
    if (!page.isConnected || !document.querySelector('.home-page')) return;
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
      quickLinks.innerHTML = discountCardsHtml(products);
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
    page.dataset.visualParityApplied = 'true';
  } catch (error) {
    console.warn('Não foi possível montar os atalhos de ofertas:', error);
  } finally {
    page?.removeAttribute('data-visual-parity-pending');
  }
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