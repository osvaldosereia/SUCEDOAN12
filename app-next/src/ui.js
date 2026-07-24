import { CONFIG, ROUTINES } from './config.js';
import {
  escapeHtml, fmt, formatDateBR, norm, parseDate, slug
} from './core.js';
import { findProductByReference, searchProducts } from './catalog.js';
import {
  applyProductOffer, calculateCartPricing, hasExpiryBulkDiscount, isAvailable,
  kitDiscountPercent, kitIsVisible, kitOriginalPrice, resolveBundleRows
} from './commerce.js';

function productRoute(product) {
  return encodeURIComponent(product.firebaseKey || product.id || product.codigo || slug(product.name));
}

function truncate(value, max = 46) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function effectiveProduct(product) {
  return applyProductOffer(product);
}

function productDisplay(state, product) {
  const offered = effectiveProduct(product);
  const coupon = state.coupons.find(item => norm(item.codigo) === norm(state.activeCouponCode));
  const original = Number(offered.oldPrice || offered.price || 0);
  let effective = Number(offered.price || 0);
  if (coupon?.ativo === true) {
    const categories = (coupon.categorias || []).map(norm);
    const brands = (coupon.marcas || []).map(norm);
    const keywords = (coupon.palavras_chave || []).map(norm);
    const text = norm([offered.name, offered.marca, offered.categoria, offered.subcategoria].join(' '));
    const matches = (!categories.length && !brands.length && !keywords.length)
      || categories.some(value => text.includes(value))
      || brands.some(value => norm(offered.marca) === value)
      || keywords.some(value => text.includes(value));
    if (matches && coupon.tipo === 'percentual') effective = Math.min(effective, original * (1 - Number(coupon.desconto || 0) / 100));
  }
  return {
    original,
    effective: Math.round((effective + Number.EPSILON) * 100) / 100,
    discountPercent: original > effective ? Math.round(((original - effective) / Math.max(original, 0.01)) * 100) : 0
  };
}

function quantityControl(state, product, mode = 'card') {
  const id = String(product.id);
  const qty = Number(state.cart[id] || 0);
  if (!isAvailable(product)) return '<button class="qty-add" disabled aria-label="Produto indisponível">×</button>';
  if (qty <= 0) return `<button class="qty-add" data-action="add" data-id="${escapeHtml(id)}" aria-label="Adicionar ${escapeHtml(product.name)}">+</button>`;
  return `<div class="qty-control ${mode === 'detail' ? 'qty-control-detail' : ''}" data-qty-control="${escapeHtml(id)}">
    <button data-action="dec" data-id="${escapeHtml(id)}" aria-label="Diminuir">−</button>
    <span>${qty}</span>
    <button data-action="inc" data-id="${escapeHtml(id)}" aria-label="Aumentar">+</button>
  </div>`;
}

function favoriteButton(state, id, kind = 'product') {
  const key = kind === 'kit' ? `kit:${id}` : String(id);
  const active = state.favorites.has(key);
  return `<button class="favorite-button ${active ? 'active' : ''}" data-action="favorite" data-id="${escapeHtml(id)}" data-kind="${kind}" aria-label="${active ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}" aria-pressed="${active}">♡</button>`;
}

function productCard(state, product, mode = '') {
  const display = productDisplay(state, product);
  const id = String(product.id);
  return `<article class="product-card ${mode}" data-product-card="${escapeHtml(id)}">
    <div class="product-card-media">
      <a href="#/produto/${productRoute(product)}" aria-label="Ver ${escapeHtml(product.name)}">
        <img loading="lazy" decoding="async" width="300" height="300" src="${escapeHtml(product.img)}" data-fallback="${escapeHtml(product.images?.slice(1).join('|') || '')}" alt="${escapeHtml(product.name)}">
      </a>
      ${favoriteButton(state, id)}
      ${display.discountPercent > 0 ? `<span class="discount-badge">-${display.discountPercent}%</span>` : ''}
    </div>
    <div class="product-card-body">
      ${product.embalagem ? `<div class="product-packaging">${escapeHtml(product.embalagem)}</div>` : ''}
      <a class="product-name" href="#/produto/${productRoute(product)}" title="${escapeHtml(product.name)}">${escapeHtml(truncate(product.name, mode === 'compact' ? 36 : 48))}</a>
      ${product.validade && formatDateBR(product.validade) ? `<div class="product-expiry">Val. ${formatDateBR(product.validade)}</div>` : ''}
      <div class="product-card-footer">
        <div class="product-price">${display.original > display.effective ? `<s>${fmt(display.original)}</s>` : ''}<strong>${fmt(display.effective)}</strong></div>
        <div data-control-slot="${escapeHtml(id)}">${quantityControl(state, product)}</div>
      </div>
    </div>
  </article>`;
}

function pageHeader(title, subtitle = '', back = '#/') {
  return `<header class="page-header">${back ? `<a class="back-button" href="${back}" aria-label="Voltar">←</a>` : ''}<div><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div></header>`;
}

function empty(title, text) {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`;
}

function section(title, caption, content, href = '') {
  if (!content) return '';
  return `<section class="content-section"><div class="section-heading"><div><h2>${escapeHtml(title)}</h2>${caption ? `<p>${escapeHtml(caption)}</p>` : ''}</div>${href ? `<a href="${href}">Ver todos</a>` : ''}</div>${content}</section>`;
}

function currentBanners(state, position, targets = []) {
  const now = new Date();
  const normalizedTargets = new Set(targets.map(norm).filter(Boolean));
  return state.banners.filter(banner => {
    if (!banner.active) return false;
    const start = parseDate(banner.start, false);
    const end = parseDate(banner.end, true);
    if ((start && now < start) || (end && now > end)) return false;
    const positionMatches = norm(banner.position) === norm(position) || norm(banner.position).startsWith(`${norm(position)}.`);
    const targetMatches = !normalizedTargets.size || !banner.target || normalizedTargets.has(norm(banner.target));
    return positionMatches && targetMatches;
  }).slice(0, 8);
}

function bannerZone(state, position, targets = []) {
  const banners = currentBanners(state, position, targets);
  if (!banners.length) return '';
  return `<section class="banner-zone" aria-label="Destaques"><div class="banner-track">${banners.map(banner => {
    let href = String(banner.link || '').trim();
    if (href && !/^https?:|^#/.test(href)) href = `#/${href.replace(/^\/+/, '')}`;
    const image = `<img loading="lazy" decoding="async" src="${escapeHtml(banner.image)}" alt="${escapeHtml(banner.alt)}">`;
    return href ? `<a class="banner-card" href="${escapeHtml(href)}">${image}</a>` : `<div class="banner-card">${image}</div>`;
  }).join('')}</div></section>`;
}

function categories(state) {
  const counts = new Map();
  state.products.filter(isAvailable).forEach(product => counts.set(product.categoria, Number(counts.get(product.categoria) || 0) + 1));
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
}

function categoryCards(state) {
  return `<div class="category-grid">${categories(state).map(([name, count]) => {
    const imageProduct = state.products.find(product => isAvailable(product) && product.categoria === name);
    return `<a class="category-card" href="#/categoria/${encodeURIComponent(name)}"><img loading="lazy" src="${escapeHtml(imageProduct?.img || '../img/logoantonia5.png')}" alt=""><span><strong>${escapeHtml(name)}</strong><small>${count} produtos</small></span></a>`;
  }).join('')}</div>`;
}

function basketCard(basket) {
  return `<article class="bundle-card"><a class="bundle-media" href="#/cesta/${encodeURIComponent(basket.id)}"><img loading="lazy" src="${escapeHtml(basket.imagem)}" alt="${escapeHtml(basket.nome)}"></a><div><a class="bundle-name" href="#/cesta/${encodeURIComponent(basket.id)}">${escapeHtml(basket.nome)}</a><p>${escapeHtml(truncate(basket.descricao, 90))}</p><div class="bundle-price">${basket.precoOriginal > basket.preco ? `<s>${fmt(basket.precoOriginal)}</s>` : ''}<strong>${basket.preco ? fmt(basket.preco) : 'Ver itens'}</strong></div><a class="secondary-button" href="#/cesta/${encodeURIComponent(basket.id)}">Ver produtos</a></div></article>`;
}

function kitCard(state, kit) {
  const original = kitOriginalPrice(state, kit);
  const discount = kitDiscountPercent(state, kit);
  return `<article class="bundle-card"><div class="bundle-media-wrap"><a class="bundle-media" href="#/kit/${encodeURIComponent(kit.id)}"><img loading="lazy" src="${escapeHtml(kit.imagem)}" alt="${escapeHtml(kit.nome)}"></a>${favoriteButton(state, kit.id, 'kit')}${discount ? `<span class="discount-badge">-${discount}%</span>` : ''}</div><div><a class="bundle-name" href="#/kit/${encodeURIComponent(kit.id)}">${escapeHtml(kit.nome)}</a><p>${escapeHtml(truncate(kit.descricao, 90))}</p><div class="bundle-price">${original > kit.preco ? `<s>${fmt(original)}</s>` : ''}<strong>${fmt(kit.preco)}</strong></div><div class="bundle-actions"><a class="secondary-button" href="#/kit/${encodeURIComponent(kit.id)}">Ver produtos</a><button class="primary-button" data-action="add-kit" data-id="${escapeHtml(kit.id)}">Adicionar</button></div></div></article>`;
}

function homePage(context) {
  const { state, personalization } = context;
  const products = state.products.filter(isAvailable);
  const offered = products.map(effectiveProduct).filter(product => Number(product.oldPrice) > Number(product.price)).sort((a, b) => Number(b.discountPercent) - Number(a.discountPercent)).slice(0, 12);
  const activeKits = state.kits.filter(kit => kitIsVisible(state, kit)).slice(0, 8);
  const selected = personalization.recommendations(8);
  const recent = personalization.recentProducts(8);
  const buyAgain = personalization.buyAgain(6);
  return `<div class="page-container home-page">
    <h1 class="sr-only">Dona Antônia - Supermercado e Cestas</h1>
    ${bannerZone(state, 'home.hero')}
    <section class="home-hero"><div><span>Supermercado online local</span><h2>Compra simples, rápida e enviada pelo WhatsApp.</h2><p>Produtos, cestas e kits para Cuiabá e Várzea Grande.</p><div class="hero-actions"><a class="primary-button" href="#/categorias">Ver categorias</a><a class="secondary-button" href="#/ofertas">Ver ofertas</a></div></div><img src="../img/logoantonia5.png" alt="Dona Antônia"></section>
    <div class="quick-links"><a href="#/rotina/compra-mes"><strong>Compra do mês</strong><span>Encontre os básicos</span></a><a href="#/cestas"><strong>Cestas básicas</strong><span>Prontas e editáveis</span></a><a href="#/kits"><strong>Kits promocionais</strong><span>Combos com desconto</span></a></div>
    ${section('Ofertas de hoje', 'Produtos com desconto disponível agora.', offered.length ? `<div class="product-grid">${offered.map(product => productCard(state, product)).join('')}</div>` : '', '#/ofertas')}
    ${section('Cestas básicas', 'Veja todos os produtos antes de escolher.', state.baskets.length ? `<div class="bundle-grid">${state.baskets.slice(0, 6).map(basketCard).join('')}</div>` : '', '#/cestas')}
    ${section('Kits promocionais', 'Combos ativos e limitados.', activeKits.length ? `<div class="bundle-grid">${activeKits.map(kit => kitCard(state, kit)).join('')}</div>` : '', '#/kits')}
    ${section('Escolhidos para você', 'Sugestões baseadas neste aparelho.', selected.length ? `<div class="product-grid">${selected.map(product => productCard(state, product)).join('')}</div>` : '')}
    ${section('Vistos recentemente', 'Continue de onde parou.', recent.length ? `<div class="horizontal-rail">${recent.map(product => productCard(state, product, 'compact')).join('')}</div>` : '')}
    ${section('Compre novamente', 'Itens disponíveis da última compra.', buyAgain.length ? `<div class="product-grid">${buyAgain.map(product => productCard(state, product)).join('')}</div>` : '')}
    ${section('Categorias', 'Escolha um setor.', categoryCards(state), '#/categorias')}
  </div>`;
}

function categoriesPage(context) {
  return `<div class="page-container">${pageHeader('Categorias', 'Escolha um setor para navegar.')}${bannerZone(context.state, 'categorias.topo')}${categoryCards(context.state)}</div>`;
}

function productGridPage(context, { title, subtitle, products, back = '#/categorias', bannerPosition = '', bannerTargets = [] }) {
  return `<div class="page-container">${pageHeader(title, subtitle, back)}${bannerPosition ? bannerZone(context.state, bannerPosition, bannerTargets) : ''}${products.length ? `<div class="product-grid">${products.map(product => productCard(context.state, product)).join('')}</div>` : empty('Nenhum produto disponível', 'Tente outra categoria ou use a busca.')}</div>`;
}

function categoryPage(context, name) {
  const decoded = decodeURIComponent(name || '');
  const all = context.state.products.filter(product => isAvailable(product) && norm(product.categoria) === norm(decoded));
  const canonical = all[0]?.categoria || decoded;
  const selectedSub = context.route.query.get('sub') || 'Todos';
  const subs = [...new Set(all.map(product => product.subcategoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const filtered = selectedSub === 'Todos' ? all : all.filter(product => norm(product.subcategoria) === norm(selectedSub));
  const chips = `<div class="chips"><a class="chip ${selectedSub === 'Todos' ? 'active' : ''}" href="#/categoria/${encodeURIComponent(canonical)}">Todos</a>${subs.map(sub => `<a class="chip ${sub === selectedSub ? 'active' : ''}" href="#/categoria/${encodeURIComponent(canonical)}?sub=${encodeURIComponent(sub)}">${escapeHtml(sub)}</a>`).join('')}</div>`;
  return `<div class="page-container">${pageHeader(canonical, `${filtered.length} produtos encontrados`, '#/categorias')}${bannerZone(context.state, 'categoria', [canonical, selectedSub])}${chips}${filtered.length ? `<div class="product-grid">${filtered.map(product => productCard(context.state, product)).join('')}</div>` : empty('Nenhum produto disponível', 'Tente outra subcategoria.')}</div>`;
}

function subcategoryPage(context, name) {
  const products = context.state.products.filter(product => isAvailable(product) && norm(product.subcategoria) === norm(name));
  return productGridPage(context, { title: products[0]?.subcategoria || name, subtitle: `${products.length} produtos encontrados`, products, bannerPosition: 'subcategoria', bannerTargets: [name] });
}

function brandPage(context, name) {
  const products = context.state.products.filter(product => isAvailable(product) && norm(product.marca) === norm(name));
  return productGridPage(context, { title: products[0]?.marca || name, subtitle: `${products.length} produtos encontrados`, products, back: '#/', bannerPosition: 'marca', bannerTargets: [name] });
}

function offersPage(context, mode = '') {
  let products = context.state.products.filter(isAvailable).map(effectiveProduct).filter(product => Number(product.oldPrice) > Number(product.price));
  let title = 'Ofertas';
  if (mode === '50') { title = '50% de desconto'; products = products.filter(product => product.discountPercent >= 50); }
  if (mode === '40') { title = '40% de desconto'; products = products.filter(product => product.discountPercent >= 40 && product.discountPercent < 50); }
  if (mode === 'ate-5') { title = 'Até 5 reais'; products = context.state.products.filter(isAvailable).filter(product => productDisplay(context.state, product).effective <= 5); }
  products.sort((a, b) => Number(b.discountPercent || 0) - Number(a.discountPercent || 0) || a.name.localeCompare(b.name, 'pt-BR'));
  return productGridPage(context, { title, subtitle: 'Produtos disponíveis agora.', products, back: '#/', bannerPosition: 'ofertas.topo' });
}

function favoritesPage(context) {
  const productIds = [...context.state.favorites].filter(key => !key.startsWith('kit:'));
  const products = productIds.map(id => context.state.productMap.get(id)).filter(product => product && isAvailable(product));
  const kits = [...context.state.favorites].filter(key => key.startsWith('kit:')).map(key => context.state.kits.find(kit => String(kit.id) === key.slice(4))).filter(kit => kit && kitIsVisible(context.state, kit));
  return `<div class="page-container">${pageHeader('Favoritos', `${products.length + kits.length} itens salvos`)}${products.length ? section('Produtos', '', `<div class="product-grid">${products.map(product => productCard(context.state, product)).join('')}</div>`) : ''}${kits.length ? section('Kits', '', `<div class="bundle-grid">${kits.map(kit => kitCard(context.state, kit)).join('')}</div>`) : ''}${!products.length && !kits.length ? empty('Nenhum favorito ainda', 'Toque no coração de produtos e kits para salvar aqui.') : ''}</div>`;
}

function productPage(context, reference) {
  const product = findProductByReference(context.state, reference);
  if (!product) return `<div class="page-container">${pageHeader('Produto não encontrado')}${empty('Produto indisponível', 'Volte para a loja e escolha outro item.')}</div>`;
  context.personalization.addRecentlyViewed(product);
  const display = productDisplay(context.state, product);
  const related = context.state.products.filter(item => isAvailable(item) && item.id !== product.id && (norm(item.categoria) === norm(product.categoria) || norm(item.marca) === norm(product.marca))).slice(0, 16);
  return `<div class="page-container">${pageHeader('Produto', '', '#/')}${bannerZone(context.state, 'produto', [product.id, product.codigo, product.firebaseKey, product.name])}<article class="product-detail"><div class="product-detail-media"><img id="product-main-image" src="${escapeHtml(product.img)}" data-fallback="${escapeHtml(product.images?.slice(1).join('|') || '')}" alt="${escapeHtml(product.name)}">${product.images?.length > 1 ? `<div class="image-thumbs">${product.images.slice(0, 6).map((image, index) => `<button data-action="image" data-src="${escapeHtml(image)}"><img src="${escapeHtml(image)}" alt="Imagem ${index + 1}"></button>`).join('')}</div>` : ''}</div><div class="product-detail-copy">${product.validade && formatDateBR(product.validade) ? `<div class="product-expiry">Validade: ${formatDateBR(product.validade)}</div>` : ''}<h1>${escapeHtml(product.name)}</h1>${hasExpiryBulkDiscount(product) ? '<div class="offer-note">Leve 3 ou mais unidades e ganhe descontos adicionais no checkout.</div>' : ''}<div class="detail-price">${display.original > display.effective ? `<s>${fmt(display.original)}</s>` : ''}<strong>${fmt(display.effective)}</strong></div>${favoriteButton(context.state, product.id)}<div data-control-slot="${escapeHtml(product.id)}">${quantityControl(context.state, product, 'detail')}</div>${product.descricao ? `<p class="product-description">${escapeHtml(product.descricao)}</p>` : ''}<div class="detail-tags">${[product.categoria, product.subcategoria, product.marca].filter(Boolean).map(value => `<span>${escapeHtml(value)}</span>`).join('')}</div></div></article>${section('Produtos relacionados', 'Itens da mesma categoria ou marca.', `<div class="product-grid">${related.map(item => productCard(context.state, item)).join('')}</div>`)}</div>`;
}

function basketsPage(context) {
  return `<div class="page-container">${pageHeader('Cestas básicas', 'Escolha uma cesta pronta e editável.')}${bannerZone(context.state, 'cestas.topo')}${context.state.baskets.length ? `<div class="bundle-grid">${context.state.baskets.map(basketCard).join('')}</div>` : empty('Nenhuma cesta disponível', 'O arquivo de cestas ainda não possui itens.')}</div>`;
}

function basketPage(context, id) {
  const basket = context.state.baskets.find(item => String(item.id) === String(id));
  if (!basket) return `<div class="page-container">${pageHeader('Cesta não encontrada', '', '#/cestas')}${empty('Cesta indisponível', 'Escolha outra cesta.')}</div>`;
  const rows = resolveBundleRows(context.state, basket);
  const draft = context.state.basketDrafts[`basket:${basket.id}`] || Object.fromEntries(rows.map(row => [row.product.id, row.qty]));
  const total = Object.entries(draft).reduce((sum, [productId, qty]) => sum + Number(context.state.productMap.get(productId)?.price || 0) * Number(qty), 0);
  return `<div class="page-container">${pageHeader(basket.nome, '', '#/cestas')}${bannerZone(context.state, 'cesta', [basket.id, basket.nome])}<article class="bundle-detail-hero"><img src="${escapeHtml(basket.imagem)}" alt="${escapeHtml(basket.nome)}"><div><span>Cesta básica</span><h1>${escapeHtml(basket.nome)}</h1><p>${escapeHtml(basket.descricao)}</p><strong>${basket.preco ? fmt(basket.preco) : fmt(total)}</strong><button class="primary-button" data-action="add-basket" data-id="${escapeHtml(basket.id)}">Adicionar cesta padrão</button></div></article><section class="content-section"><div class="section-heading"><div><h2>Produtos da cesta</h2><p>Ajuste as quantidades antes de adicionar.</p></div></div><div class="bundle-lines">${rows.map(row => {
    const qty = Number(draft[row.product.id] ?? row.qty);
    return `<div class="bundle-line"><a href="#/produto/${productRoute(row.product)}"><img src="${escapeHtml(row.product.img)}" alt="${escapeHtml(row.product.name)}"></a><div><a href="#/produto/${productRoute(row.product)}">${escapeHtml(row.product.name)}</a><small>${fmt(row.product.price)} cada</small></div><div class="qty-control"><button data-action="basket-dec" data-basket-id="${escapeHtml(basket.id)}" data-id="${escapeHtml(row.product.id)}">−</button><span>${qty}</span><button data-action="basket-inc" data-basket-id="${escapeHtml(basket.id)}" data-id="${escapeHtml(row.product.id)}">+</button></div></div>`;
  }).join('')}</div></section><section class="bundle-total"><span>Total estimado da seleção</span><strong>${fmt(total)}</strong><button class="primary-button" data-action="add-basket-custom" data-id="${escapeHtml(basket.id)}">Adicionar cesta editada</button></section></div>`;
}

function kitsPage(context) {
  const kits = context.state.kits.filter(kit => kitIsVisible(context.state, kit));
  return `<div class="page-container">${pageHeader('Kits promocionais', 'Combos com desconto e estoque limitado.')}${bannerZone(context.state, 'kits.topo')}${kits.length ? `<div class="bundle-grid">${kits.map(kit => kitCard(context.state, kit)).join('')}</div>` : empty('Nenhum kit ativo', 'Volte mais tarde para conferir novas ofertas.')}</div>`;
}

function kitPage(context, id) {
  const kit = context.state.kits.find(item => String(item.id) === String(id) || String(item.codigo) === String(id));
  if (!kit || !kitIsVisible(context.state, kit)) return `<div class="page-container">${pageHeader('Kit indisponível', '', '#/kits')}${empty('Kit não encontrado', 'Escolha outro kit promocional.')}</div>`;
  const rows = resolveBundleRows(context.state, kit);
  const original = kitOriginalPrice(context.state, kit);
  return `<div class="page-container">${pageHeader(kit.nome, '', '#/kits')}${bannerZone(context.state, 'kit', [kit.id, kit.codigo, kit.nome])}<article class="bundle-detail-hero"><img src="${escapeHtml(kit.imagem)}" alt="${escapeHtml(kit.nome)}"><div><span>Kit promocional</span><h1>${escapeHtml(kit.nome)}</h1><p>${escapeHtml(kit.descricao)}</p><div class="bundle-price">${original > kit.preco ? `<s>${fmt(original)}</s>` : ''}<strong>${fmt(kit.preco)}</strong></div><button class="primary-button" data-action="add-kit" data-id="${escapeHtml(kit.id)}">Adicionar kit promocional</button></div></article>${section('Produtos do kit', '', `<div class="bundle-lines">${rows.map(row => `<a class="bundle-line bundle-line-link" href="#/produto/${productRoute(row.product)}"><img src="${escapeHtml(row.product.img)}" alt="${escapeHtml(row.product.name)}"><div><strong>${escapeHtml(row.product.name)}</strong><small>${row.qty} ${row.qty === 1 ? 'unidade' : 'unidades'} no kit</small></div><span>${fmt(row.product.price)}</span></a>`).join('')}</div>`)}</div>`;
}

function searchPage(context, query) {
  const products = searchProducts(context.state.products, query, isAvailable);
  return productGridPage(context, { title: query ? `Busca: ${query}` : 'Busca', subtitle: query ? `${products.length} resultado(s)` : 'Digite um produto na busca acima.', products, back: '#/', bannerPosition: 'busca.topo' });
}

function routinePage(context, key) {
  const routine = ROUTINES[key] || ROUTINES['compra-mes'];
  const products = context.state.products.filter(product => isAvailable(product) && routine.terms.some(term => norm([product.name, product.categoria, product.subcategoria].join(' ')).includes(norm(term))));
  return productGridPage(context, { title: routine.title, subtitle: `${products.length} produtos encontrados`, products, back: '#/' });
}

function infoPage() {
  return `<div class="page-container">${pageHeader('Informações da loja')}<article class="info-card"><h2>Super Cestas Básicas Dona Antônia</h2><p>Supermercado online, cestas básicas, combos e produtos alimentícios com atendimento em Cuiabá e Várzea Grande.</p><dl><div><dt>Endereço</dt><dd>R. Trinta, 105 - Jardim Nossa Sra. Aparecida, Cuiabá - MT</dd></div><div><dt>WhatsApp</dt><dd>(65) 99815-0975</dd></div><div><dt>Atendimento</dt><dd>Segunda a sábado, das 08h às 18h</dd></div><div><dt>Pedido mínimo</dt><dd>${fmt(CONFIG.MIN_ORDER)}</dd></div></dl><div class="policy-links"><a href="../sobre-nos.html">Sobre nós</a><a href="../contato.html">Contato</a><a href="../politica-de-entrega.html">Política de entrega</a><a href="../politica-de-troca.html">Trocas e devoluções</a><a href="../politica-de-privacidade.html">Privacidade</a><a href="../termos-de-uso.html">Termos de uso</a></div></article></div>`;
}

export function createUI({ store, cart, events, personalization }) {
  const app = document.getElementById('app');
  const checkoutDrawer = document.getElementById('checkout-drawer');
  const menuDrawer = document.getElementById('menu-drawer');
  const overlay = document.getElementById('drawer-overlay');
  const toast = document.getElementById('toast');

  function context(route) {
    return { state: store.getState(), route, cart, events, personalization };
  }

  function renderRoute(route) {
    store.mutate(state => { state.route = route; }, 'route');
    const ctx = context(route);
    const segment = route.params.segments[0] || '';
    const pages = {
      home: () => homePage(ctx),
      categories: () => categoriesPage(ctx),
      category: () => categoryPage(ctx, segment),
      subcategory: () => subcategoryPage(ctx, segment),
      brand: () => brandPage(ctx, segment),
      offers: () => offersPage(ctx, segment),
      favorites: () => favoritesPage(ctx),
      product: () => productPage(ctx, segment),
      baskets: () => basketsPage(ctx),
      basket: () => basketPage(ctx, segment),
      kits: () => kitsPage(ctx),
      kit: () => kitPage(ctx, segment),
      search: () => searchPage(ctx, route.params.segments.join(' ')),
      routine: () => routinePage(ctx, segment),
      campaignCoupon: () => {
        const result = cart.activateCoupon(segment);
        if (result.ok) {
          const group = result.coupon.grupo;
          if (group === 'beleza') return routinePage(ctx, 'higiene');
          if (group === 'cafe_da_manha') return routinePage(ctx, 'cafe');
        }
        return homePage(ctx);
      },
      info: () => infoPage(ctx)
    };
    app.innerHTML = (pages[route.name] || pages.home)();
    app.scrollTop = 0;
    updateShell();
    bindImageFallbacks(app);
    updateMeta(route, ctx);
    events.emit('route:rendered', { route });
  }

  function updateMeta(route, ctx) {
    const names = { home: 'Supermercado e Cestas', categories: 'Categorias', offers: 'Ofertas', favorites: 'Favoritos', baskets: 'Cestas básicas', kits: 'Kits promocionais', info: 'Informações da loja' };
    document.title = `${names[route.name] || route.params.segments[0] || 'Dona Antônia'} - Dona Antônia`;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = `${CONFIG.SITE_BASE_URL}/${route.hash === '#/' ? '' : route.hash}`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = route.name === 'product' ? `Compre ${ctx.state.productMap.get(route.params.segments[0])?.name || 'produtos'} com entrega em Cuiabá e Várzea Grande.` : 'Supermercado online, cestas básicas, ofertas e entrega em Cuiabá e Várzea Grande.';
  }

  function bindImageFallbacks(root = document) {
    root.querySelectorAll('img[data-fallback]').forEach(image => {
      image.addEventListener('error', () => {
        const fallbacks = String(image.dataset.fallback || '').split('|').filter(Boolean);
        const next = fallbacks.shift();
        image.dataset.fallback = fallbacks.join('|');
        image.src = next || '../img/logoantonia5.png';
      }, { once: false });
    });
  }

  function updateShell() {
    const state = store.getState();
    const pricing = calculateCartPricing(state);
    const count = pricing.items.filter(item => !item.product.isFee).reduce((sum, item) => sum + item.qty, 0);
    document.querySelectorAll('[data-cart-count]').forEach(element => { element.textContent = String(count); element.hidden = count <= 0; });
    document.querySelectorAll('[data-cart-total]').forEach(element => { element.textContent = fmt(pricing.total); });
    document.querySelectorAll('[data-favorite-count]').forEach(element => { element.textContent = String(state.favorites.size); element.hidden = state.favorites.size <= 0; });
    document.querySelectorAll('[data-control-slot]').forEach(slot => {
      const product = state.productMap.get(slot.dataset.controlSlot);
      if (product) slot.innerHTML = quantityControl(state, product, slot.closest('.product-detail') ? 'detail' : 'card');
    });
    document.querySelectorAll('.favorite-button').forEach(button => {
      const key = button.dataset.kind === 'kit' ? `kit:${button.dataset.id}` : button.dataset.id;
      const active = state.favorites.has(key);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function openDrawer(drawer) {
    closeDrawers();
    overlay.classList.add('show');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');
  }

  function closeDrawers() {
    overlay.classList.remove('show');
    [checkoutDrawer, menuDrawer].forEach(drawer => { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); });
    document.body.classList.remove('drawer-open');
  }

  function renderMenu() {
    const state = store.getState();
    document.getElementById('menu-content').innerHTML = `<section class="menu-card"><strong>Compra fácil para Cuiabá e Várzea Grande.</strong><p>Escolha produtos, cestas e kits e envie o pedido pelo WhatsApp.</p></section><nav class="menu-links"><a href="#/">Início</a><a href="#/categorias">Categorias</a><a href="#/ofertas">Ofertas</a><a href="#/cestas">Cestas básicas</a><a href="#/kits">Kits promocionais</a><a href="#/favoritos">Favoritos (${state.favorites.size})</a><a href="#/informacoes">Empresa e políticas</a></nav><section class="menu-card"><strong>Privacidade e personalização</strong><p>${personalization.enabled() ? 'Ativada neste navegador.' : 'Desativada ou ainda não escolhida.'}</p><button class="secondary-button" data-action="personalization-settings">Configurar</button></section>`;
    openDrawer(menuDrawer);
  }

  events.on('cart:changed', updateShell);
  events.on('favorite:changed', updateShell);
  events.on('personalization:changed', () => renderRoute(store.getState().route));

  return { renderRoute, updateShell, showToast, openDrawer, closeDrawers, renderMenu, checkoutDrawer, bindImageFallbacks };
}
