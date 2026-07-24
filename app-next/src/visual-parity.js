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

function companySummaryHtml() {
  return `<section class="home-company-info" aria-labelledby="home-company-title">
    <div class="home-company-copy">
      <small>Supermercado local</small>
      <h2 id="home-company-title">Dona Antônia em Cuiabá e Várzea Grande</h2>
      <p>Produtos, cestas básicas e kits com atendimento humano, conferência do pedido e entrega local. Pedido mínimo de R$ 75.</p>
    </div>
    <dl class="home-company-facts">
      <div><dt>Atendimento</dt><dd>Segunda a sábado, das 08h às 18h</dd></div>
      <div><dt>WhatsApp</dt><dd>(65) 99815-0975</dd></div>
      <div><dt>Endereço</dt><dd>R. Trinta, 105 — Jardim Nossa Sra. Aparecida, Cuiabá - MT</dd></div>
    </dl>
    <nav class="home-company-links" aria-label="Empresa e políticas">
      <a href="../sobre-nos.html">Conheça a empresa</a>
      <a href="../politica-de-entrega.html">Política de entrega</a>
      <a href="../politica-de-troca.html">Trocas e devoluções</a>
      <a href="../contato.html">Fale conosco</a>
    </nav>
  </section>`;
}

function publicFooterHtml() {
  return `<footer class="public-site-footer">
    <div class="public-site-footer-brand"><strong>Super Cestas Básicas Dona Antônia</strong><span>CNPJ 51.385.335/0001-06</span></div>
    <div class="public-site-footer-contact"><span>Cuiabá e Várzea Grande - MT</span><a href="https://wa.me/5565998150975" target="_blank" rel="noopener">WhatsApp (65) 99815-0975</a></div>
    <nav aria-label="Links institucionais">
      <a href="../sobre-nos.html">Sobre nós</a>
      <a href="../contato.html">Contato</a>
      <a href="../politica-de-entrega.html">Entrega</a>
      <a href="../politica-de-troca.html">Trocas e devoluções</a>
      <a href="../politica-de-privacidade.html">Privacidade</a>
      <a href="../termos-de-uso.html">Termos</a>
    </nav>
  </footer>`;
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
  if (!page.querySelector('.home-company-info')) page.insertAdjacentHTML('beforeend', companySummaryHtml());

  const payment = page.querySelector('.payment-notices');
  const offersBanner = page.querySelector('.home-offers-banner');
  const companyInfo = page.querySelector('.home-company-info');

  [payment, baskets, kits, offersBanner, categories, companyInfo, personalized, recent, buyAgain]
    .filter(Boolean)
    .forEach(element => page.appendChild(element));

  page.dataset.visualParityApplied = 'true';
}

function applyPublicFooter() {
  const page = document.querySelector('#app > .page-container');
  if (!page || page.querySelector(':scope > .public-site-footer')) return;
  page.insertAdjacentHTML('beforeend', publicFooterHtml());
}

function scheduleParity() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    document.getElementById('personalization-consent')?.remove();
    applyHomeParity();
    applyPublicFooter();
  });
}

const observer = new MutationObserver(scheduleParity);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('hashchange', scheduleParity);
window.addEventListener('DOMContentLoaded', scheduleParity);
scheduleParity();