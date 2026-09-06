const STORAGE_KEY = 'dona_antonia_atendimento_cart_v1';
const PREVIEW_KEY = 'dona_antonia_atendimento_preview_v1';
const CATALOG_URL = './data/catalogo.json';
const CONFIG_URL = './data/site-config.json';

const state = {
  catalog: null,
  config: null,
  basket: null,
  cart: null,
  activeCategory: null,
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const els = {
  siteEyebrow: document.querySelector('#siteEyebrow'),
  siteTitle: document.querySelector('#siteTitle'),
  siteIntro: document.querySelector('#siteIntro'),
  basketTitle: document.querySelector('#basketTitle'),
  basketDescription: document.querySelector('#basketDescription'),
  basketSubtotal: document.querySelector('#basketSubtotal'),
  basketItemsTitle: document.querySelector('#basketItemsTitle'),
  basketItemsSubtitle: document.querySelector('#basketItemsSubtitle'),
  basketItems: document.querySelector('#basketItems'),
  offersSection: document.querySelector('#offersSection'),
  offersTitle: document.querySelector('#offersTitle'),
  offersSubtitle: document.querySelector('#offersSubtitle'),
  categoryTabs: document.querySelector('#categoryTabs'),
  offersList: document.querySelector('#offersList'),
  summaryTitle: document.querySelector('#summaryTitle'),
  summaryItems: document.querySelector('#summaryItems'),
  summaryNotice: document.querySelector('#summaryNotice'),
  orderCode: document.querySelector('#orderCode'),
  grandTotal: document.querySelector('#grandTotal'),
  bottomTotal: document.querySelector('#bottomTotal'),
  sendWhatsapp: document.querySelector('#sendWhatsapp'),
  resetCart: document.querySelector('#resetCart'),
  toast: document.querySelector('#toast'),
};

function uid() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `DA-${part}`;
}

function loadStoredCart() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveCart() {
  state.cart.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart));
}

function createCart(basket) {
  return {
    id: uid(),
    basketSlug: basket.slug,
    basketName: basket.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: basket.items.map(item => ({ ...item, source: 'cesta' })),
  };
}

function selectBasket(catalog) {
  const params = new URLSearchParams(location.search);
  const fallback = state.config?.site?.defaultBasket || catalog.baskets[0]?.slug;
  const slug = params.get('cesta') || fallback;
  return catalog.baskets.find(item => item.slug === slug) || catalog.baskets[0];
}

function hydrateCart(basket) {
  const stored = loadStoredCart();
  if (stored && stored.basketSlug === basket.slug && Array.isArray(stored.items)) return stored;
  return createCart(basket);
}

function total(items = state.cart.items) {
  return items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
}

function basketSubtotal() {
  return total(state.cart.items.filter(item => item.source === 'cesta'));
}

function findCartItem(sku) {
  return state.cart.items.find(item => item.sku === sku);
}

function changeQty(sku, delta, fallbackProduct = null) {
  let item = findCartItem(sku);
  if (!item && fallbackProduct && delta > 0) {
    item = { ...fallbackProduct, qty: 0, source: 'adicional' };
    state.cart.items.push(item);
  }
  if (!item) return;
  item.qty = Math.max(0, Number(item.qty || 0) + delta);
  saveCart();
  render();
  showToast(item.qty === 0 ? 'Item removido' : 'Pedido atualizado');
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 1500);
}

function productCard(item, options = {}) {
  const wrap = document.createElement('article');
  wrap.className = 'product';

  const main = document.createElement('div');
  main.className = 'product-main';
  main.innerHTML = `<span class="product-name"></span><div class="product-meta"></div><div class="price"></div>`;
  main.querySelector('.product-name').textContent = item.name;
  main.querySelector('.product-meta').textContent = item.sku;
  main.querySelector('.price').textContent = money.format(item.price);

  const controls = document.createElement('div');
  const current = options.cartItem || item;

  if (options.offer && Number(current?.qty || 0) === 0) {
    const add = document.createElement('button');
    add.className = 'offer-add';
    add.type = 'button';
    add.textContent = '+ Adicionar';
    add.addEventListener('click', () => changeQty(item.sku, 1, item));
    controls.append(add);
  } else {
    controls.className = 'qty';
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.setAttribute('aria-label', `Diminuir ${item.name}`);
    minus.textContent = '−';
    minus.addEventListener('click', () => changeQty(item.sku, -1, item));

    const amount = document.createElement('span');
    amount.textContent = Number(current?.qty || 0);

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.setAttribute('aria-label', `Aumentar ${item.name}`);
    plus.textContent = '+';
    plus.addEventListener('click', () => changeQty(item.sku, 1, item));

    controls.append(minus, amount, plus);
  }

  wrap.append(main, controls);
  return wrap;
}

function applyConfig() {
  const site = state.config?.site || {};
  const whatsapp = state.config?.whatsapp || {};
  if (site.eyebrow) els.siteEyebrow.textContent = site.eyebrow;
  if (site.title) {
    els.siteTitle.textContent = site.title;
    document.title = `${site.title} | ${site.eyebrow || 'Dona Antônia'}`;
  }
  if (site.intro) els.siteIntro.textContent = site.intro;
  if (site.basketSectionTitle) els.basketItemsTitle.textContent = site.basketSectionTitle;
  if (site.basketSectionSubtitle) els.basketItemsSubtitle.textContent = site.basketSectionSubtitle;
  if (site.offersTitle) els.offersTitle.textContent = site.offersTitle;
  if (site.offersSubtitle) els.offersSubtitle.textContent = site.offersSubtitle;
  if (site.summaryTitle) els.summaryTitle.textContent = site.summaryTitle;
  if (site.notice) els.summaryNotice.textContent = site.notice;
  els.offersSection.hidden = site.showOffers === false;
  if (whatsapp.buttonLabel) els.sendWhatsapp.textContent = whatsapp.buttonLabel;
}

function renderBasket() {
  els.basketTitle.textContent = state.basket.name;
  els.basketDescription.textContent = state.basket.description || 'Personalize os itens da cesta.';
  els.basketSubtotal.textContent = money.format(basketSubtotal());
  els.basketItems.replaceChildren();

  const basketItems = state.cart.items.filter(item => item.source === 'cesta');
  basketItems.forEach(item => els.basketItems.append(productCard(item)));
}

function renderCategories() {
  const categories = [...new Set(state.catalog.offers.map(item => item.category).filter(Boolean))];
  if (!state.activeCategory || !categories.includes(state.activeCategory)) state.activeCategory = categories[0] || null;

  els.categoryTabs.replaceChildren();
  categories.forEach(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `chip${category === state.activeCategory ? ' active' : ''}`;
    button.textContent = category;
    button.addEventListener('click', () => {
      state.activeCategory = category;
      renderCategories();
      renderOffers();
    });
    els.categoryTabs.append(button);
  });
}

function renderOffers() {
  els.offersList.replaceChildren();
  const offers = state.catalog.offers.filter(item => !state.activeCategory || item.category === state.activeCategory);
  if (!offers.length) {
    els.offersList.innerHTML = '<div class="empty">Nenhuma oferta nesta categoria.</div>';
    return;
  }
  offers.forEach(item => {
    const cartItem = findCartItem(item.sku);
    els.offersList.append(productCard(item, { offer: true, cartItem }));
  });
}

function renderSummary() {
  const activeItems = state.cart.items.filter(item => Number(item.qty) > 0);
  els.summaryItems.replaceChildren();

  if (!activeItems.length) {
    els.summaryItems.innerHTML = '<div class="empty">Seu pedido está vazio.</div>';
  } else {
    activeItems.forEach(item => {
      const line = document.createElement('div');
      line.className = 'summary-line';
      const label = document.createElement('span');
      label.textContent = `${item.qty}× ${item.name}`;
      const value = document.createElement('strong');
      value.textContent = money.format(item.qty * item.price);
      line.append(label, value);
      els.summaryItems.append(line);
    });
  }

  const amount = total(activeItems);
  els.orderCode.textContent = `Código ${state.cart.id}`;
  els.grandTotal.textContent = money.format(amount);
  els.bottomTotal.textContent = money.format(amount);
  els.sendWhatsapp.disabled = activeItems.length === 0;
}

function buildWhatsappMessage() {
  const activeItems = state.cart.items.filter(item => Number(item.qty) > 0);
  const wa = state.config?.whatsapp || {};
  const lines = [wa.messageHeader || '🧺 *Meu pedido Dona Antônia*'];
  if (wa.includeCartCode !== false) lines.push(`Código: *${state.cart.id}*`);
  lines.push(`Cesta: *${state.basketName}*`, '');

  activeItems.forEach(item => {
    const sku = wa.includeSku ? ` [${item.sku}]` : '';
    const subtotal = wa.includeItemSubtotal === false ? '' : ` — ${money.format(item.qty * item.price)}`;
    lines.push(`${item.qty}x ${item.name}${sku}${subtotal}`);
  });

  lines.push('', `*Total calculado: ${money.format(total(activeItems))}*`, '', wa.messageFooter || 'Finalizei a montagem e quero continuar meu atendimento por aqui.');
  return lines.join('\n');
}

function openWhatsapp() {
  const number = String(state.config?.whatsapp?.number || state.catalog.whatsapp || '').replace(/\D/g, '');
  if (!number) {
    showToast('WhatsApp ainda não configurado');
    return;
  }
  const message = buildWhatsappMessage();
  const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  window.location.href = url;
}

function resetCart() {
  const ok = confirm('Recomeçar esta cesta e apagar as alterações atuais?');
  if (!ok) return;
  state.cart = createCart(state.basket);
  saveCart();
  render();
  showToast('Cesta reiniciada');
}

function render() {
  applyConfig();
  renderBasket();
  renderCategories();
  renderOffers();
  renderSummary();
}

async function loadData() {
  const params = new URLSearchParams(location.search);
  if (params.get('preview') === '1') {
    try {
      const preview = JSON.parse(localStorage.getItem(PREVIEW_KEY) || 'null');
      if (preview?.catalog && preview?.config) return preview;
    } catch {}
  }

  const [catalogResponse, configResponse] = await Promise.all([
    fetch(CATALOG_URL, { cache: 'no-store' }),
    fetch(CONFIG_URL, { cache: 'no-store' }),
  ]);
  if (!catalogResponse.ok) throw new Error(`Catálogo indisponível (${catalogResponse.status})`);
  const catalog = await catalogResponse.json();
  const config = configResponse.ok ? await configResponse.json() : { site: {}, whatsapp: {} };
  return { catalog, config };
}

async function init() {
  try {
    const data = await loadData();
    state.catalog = data.catalog;
    state.config = data.config;
    state.basket = selectBasket(state.catalog);
    if (!state.basket) throw new Error('Nenhuma cesta cadastrada');

    const params = new URLSearchParams(location.search);
    state.activeCategory = params.get('categoria') || null;
    state.cart = hydrateCart(state.basket);
    saveCart();
    render();

    if (params.get('secao') === 'ofertas' && state.config?.site?.showOffers !== false) {
      requestAnimationFrame(() => els.offersSection.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  } catch (error) {
    console.error(error);
    document.querySelector('main').innerHTML = `<section class="card"><h2>Não foi possível carregar o catálogo</h2><p>Tente novamente em alguns instantes.</p></section>`;
    els.sendWhatsapp.disabled = true;
  }
}

els.sendWhatsapp.addEventListener('click', openWhatsapp);
els.resetCart.addEventListener('click', resetCart);
init();
