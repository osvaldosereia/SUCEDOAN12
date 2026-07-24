let scheduled = false;

function sectionTitle(section) {
  return section?.querySelector('.section-heading h2')?.textContent?.trim().toLowerCase() || '';
}

function dealIcon(kind) {
  const icons = {
    fifty: `<svg class="home-deal-icon" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="deal-red-tag" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff6b86"/><stop offset="1" stop-color="#b51235"/></linearGradient>
        <linearGradient id="deal-red-coin" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff7b2"/><stop offset="1" stop-color="#f5a524"/></linearGradient>
      </defs>
      <ellipse cx="80" cy="137" rx="48" ry="10" fill="#9d1731" opacity=".16"/>
      <path d="M39 38c0-8 6-14 14-14h44l28 28v54c0 9-7 16-16 16H53c-8 0-14-6-14-14V38z" fill="url(#deal-red-tag)"/>
      <path d="M97 24v22c0 7 6 13 13 13h15" fill="#ff9bac" opacity=".75"/>
      <circle cx="58" cy="48" r="8" fill="#fff" opacity=".9"/>
      <text x="80" y="91" text-anchor="middle" font-size="34" font-weight="900" fill="#fff" font-family="Arial, sans-serif">50%</text>
      <circle cx="117" cy="112" r="25" fill="url(#deal-red-coin)" stroke="#f3a31e" stroke-width="4"/>
      <path d="M108 112h18M117 103v18" stroke="#9d5a00" stroke-width="5" stroke-linecap="round"/>
    </svg>`,
    forty: `<svg class="home-deal-icon" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="deal-blue-box" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#70b7ff"/><stop offset="1" stop-color="#1d4f91"/></linearGradient>
        <linearGradient id="deal-blue-top" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a8d5ff"/><stop offset="1" stop-color="#4b87c8"/></linearGradient>
      </defs>
      <ellipse cx="80" cy="137" rx="48" ry="10" fill="#194d88" opacity=".16"/>
      <path d="M35 55l45-25 45 25v53l-45 25-45-25V55z" fill="url(#deal-blue-box)"/>
      <path d="M35 55l45 25 45-25-45-25-45 25z" fill="url(#deal-blue-top)"/>
      <path d="M80 80v53" stroke="#17487f" stroke-width="5" opacity=".45"/>
      <circle cx="63" cy="76" r="25" fill="#fff" opacity=".96"/>
      <circle cx="96" cy="108" r="25" fill="#fff" opacity=".96"/>
      <text x="63" y="85" text-anchor="middle" font-size="25" font-weight="900" fill="#245f9b" font-family="Arial, sans-serif">4</text>
      <text x="96" y="117" text-anchor="middle" font-size="25" font-weight="900" fill="#245f9b" font-family="Arial, sans-serif">0</text>
      <path d="M73 112l17-42" stroke="#245f9b" stroke-width="7" stroke-linecap="round"/>
    </svg>`,
    all: `<svg class="home-deal-icon" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="deal-purple-main" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#c88bea"/><stop offset="1" stop-color="#71318f"/></linearGradient>
        <linearGradient id="deal-purple-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe39a"/><stop offset="1" stop-color="#f0a11b"/></linearGradient>
      </defs>
      <ellipse cx="80" cy="137" rx="49" ry="10" fill="#6d3187" opacity=".15"/>
      <path d="M31 69c0-8 6-14 14-14h59l27 17-27 17H45c-8 0-14-6-14-14v-6z" fill="url(#deal-purple-main)"/>
      <path d="M44 47c0-7 6-13 13-13h49l22 14-22 14H57c-7 0-13-6-13-13v-2z" fill="#b06bd2"/>
      <path d="M44 91c0-7 6-13 13-13h49l22 14-22 14H57c-7 0-13-6-13-13v-2z" fill="#8441a4"/>
      <circle cx="50" cy="72" r="7" fill="#fff" opacity=".95"/>
      <circle cx="111" cy="112" r="22" fill="url(#deal-purple-gold)" stroke="#e69a18" stroke-width="4"/>
      <path d="M102 112h18M111 103v18" stroke="#8c5800" stroke-width="5" stroke-linecap="round"/>
      <path d="M61 48h35M61 92h30" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".92"/>
    </svg>`,
    cheap: `<svg class="home-deal-icon" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="deal-green-basket" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#69d79b"/><stop offset="1" stop-color="#117044"/></linearGradient>
        <linearGradient id="deal-green-coin" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff1a8"/><stop offset="1" stop-color="#f3a31c"/></linearGradient>
      </defs>
      <ellipse cx="80" cy="137" rx="48" ry="10" fill="#127246" opacity=".16"/>
      <path d="M37 62h86l-9 57c-1 7-7 12-14 12H60c-7 0-13-5-14-12l-9-57z" fill="url(#deal-green-basket)"/>
      <path d="M58 66c3-26 41-26 44 0" fill="none" stroke="#176a47" stroke-width="9" stroke-linecap="round"/>
      <path d="M58 77v36M80 77v42M102 77v36" stroke="#d6ffe8" stroke-width="5" stroke-linecap="round" opacity=".8"/>
      <circle cx="112" cy="52" r="27" fill="url(#deal-green-coin)" stroke="#e49a18" stroke-width="4"/>
      <text x="112" y="63" text-anchor="middle" font-size="30" font-weight="900" fill="#805100" font-family="Arial, sans-serif">5</text>
      <text x="82" y="151" text-anchor="middle" font-size="13" font-weight="800" fill="#126d43" font-family="Arial, sans-serif">R$</text>
    </svg>`
  };
  return icons[kind] || icons.all;
}

function discountShortcutsHtml() {
  const definitions = [
    { badge: '50% OFF', title: 'Metade do preço', copy: 'Produtos selecionados com desconto máximo.', href: '#/ofertas/50', cls: 'deal-50', icon: 'fifty' },
    { badge: '40% OFF', title: 'Economize mais', copy: 'Ofertas fortes para reduzir o valor da compra.', href: '#/ofertas/40', cls: 'deal-40', icon: 'forty' },
    { badge: 'OFERTAS', title: 'Todas as ofertas', copy: 'Outros descontos, organizados do maior para o menor.', href: '#/ofertas?faixa=outras', cls: 'deal-all', icon: 'all' },
    { badge: 'ATÉ R$ 5', title: 'Achadinhos', copy: 'Itens baratos para completar o seu pedido.', href: '#/ofertas/ate-5', cls: 'deal-5', icon: 'cheap' }
  ];

  return definitions.map(definition => `<a class="home-deal-shortcut ${definition.cls}" href="${definition.href}" aria-label="${definition.badge}: ${definition.title}">
    <span class="home-deal-icon-shell">${dealIcon(definition.icon)}</span>
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