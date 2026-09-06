const STORAGE_KEY = 'dona_antonia_atendimento_cart_v2';
const PREVIEW_KEY = 'dona_antonia_atendimento_preview_v1';
const CATALOG_URL = './data/catalogo.json';
const CONFIG_URL = './data/site-config.json';

const state = { catalog:null, config:null, view:'baskets', basket:null, cart:null, category:null };
const money = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' });
const $ = selector => document.querySelector(selector);

const els = {
  basketGridScreen: $('#basketGridScreen'),
  basketEditScreen: $('#basketEditScreen'),
  productsScreen: $('#productsScreen'),
  basketGrid: $('#basketGrid'),
  basketImage: $('#basketImage'),
  basketTitle: $('#basketTitle'),
  basketPrice: $('#basketPrice'),
  basketItems: $('#basketItems'),
  productsTitle: $('#productsTitle'),
  categoryGrid: $('#categoryGrid'),
  productGrid: $('#productGrid'),
  bottomLabel: $('#bottomLabel'),
  bottomTotal: $('#bottomTotal'),
  sendWhatsapp: $('#sendWhatsapp'),
  resetCart: $('#resetCart'),
  toast: $('#toast')
};

const clone = value => JSON.parse(JSON.stringify(value));
const asNumber = value => Number(value || 0) || 0;

function uid(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'DA-' + Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
}

function imageUrl(path){
  const value = String(path || '').trim();
  if (!value) return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><rect width="800" height="800" fill="#fff4ea"/><text x="400" y="410" text-anchor="middle" font-family="Arial" font-size="42" fill="#d8680c">Dona Antônia</text></svg>');
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  return '/' + value.replace(/^\.\//, '');
}

function loadCart(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}

function saveCart(){
  if (!state.cart) return;
  state.cart.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart));
}

function createCart(basket){
  return {
    id: uid(),
    basketSlug: basket?.slug || null,
    basketName: basket?.name || '',
    basketBasePrice: asNumber(basket?.priceBase ?? basket?.price),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    basketItems: (basket?.items || []).map(item => ({...item, baseQty: asNumber(item.qty), qty: asNumber(item.qty)})),
    extras: []
  };
}

function ensureCart(basket = null){
  const stored = loadCart();
  if (stored && Array.isArray(stored.basketItems) && Array.isArray(stored.extras)) {
    if (!basket || stored.basketSlug === basket.slug) return stored;
  }
  return createCart(basket);
}

function basketDelta(){
  if (!state.cart) return 0;
  return state.cart.basketItems.reduce((sum, item) => sum + (asNumber(item.qty) - asNumber(item.baseQty)) * asNumber(item.unitPrice ?? item.price), 0);
}

function basketTotal(){
  if (!state.cart?.basketSlug) return 0;
  return Math.max(0, asNumber(state.cart.basketBasePrice) + basketDelta());
}

function extrasTotal(){
  return (state.cart?.extras || []).reduce((sum, item) => sum + asNumber(item.qty) * asNumber(item.price), 0);
}

function orderTotal(){ return basketTotal() + extrasTotal(); }
function itemCount(){
  const basketCount = (state.cart?.basketItems || []).reduce((sum, item) => sum + asNumber(item.qty), 0);
  const extrasCount = (state.cart?.extras || []).reduce((sum, item) => sum + asNumber(item.qty), 0);
  return basketCount + extrasCount;
}

function show(view){
  state.view = view;
  els.basketGridScreen.hidden = view !== 'baskets';
  els.basketEditScreen.hidden = view !== 'basket-edit';
  els.productsScreen.hidden = view !== 'products';
}

function toast(message){
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove('show'), 1200);
}

function basketBySlug(slug){ return state.catalog.baskets.find(item => item.slug === slug || item.id === slug || item.codigo === slug); }

function openBasket(slug){
  const basket = basketBySlug(slug);
  if (!basket) return;
  state.basket = basket;
  state.cart = ensureCart(basket);
  saveCart();
  history.replaceState(null, '', `?cesta=${encodeURIComponent(basket.slug)}`);
  render();
}

function openProducts(category = null){
  state.cart = ensureCart();
  state.category = category;
  const query = category ? `?secao=produtos&categoria=${encodeURIComponent(category)}` : '?secao=produtos';
  history.replaceState(null, '', query);
  render();
}

function qtyControl(current, onMinus, onPlus){
  const wrap = document.createElement('div');
  wrap.className = 'qty';
  const minus = document.createElement('button');
  minus.type = 'button';
  minus.textContent = '−';
  minus.addEventListener('click', onMinus);
  const amount = document.createElement('span');
  amount.textContent = asNumber(current);
  const plus = document.createElement('button');
  plus.type = 'button';
  plus.textContent = '+';
  plus.addEventListener('click', onPlus);
  wrap.append(minus, amount, plus);
  return wrap;
}

function renderBasketGrid(){
  els.basketGrid.replaceChildren();
  state.catalog.baskets.forEach(basket => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'select-card';
    card.innerHTML = `<img src="${imageUrl(basket.image)}" alt=""><div class="card-info"><h2></h2><strong></strong></div>`;
    card.querySelector('h2').textContent = basket.name;
    card.querySelector('strong').textContent = money.format(asNumber(basket.priceBase ?? basket.price));
    card.addEventListener('click', () => openBasket(basket.slug));
    els.basketGrid.append(card);
  });
}

function renderBasketEdit(){
  if (!state.basket) return;
  els.basketImage.src = imageUrl(state.basket.image);
  els.basketImage.alt = state.basket.name;
  els.basketTitle.textContent = state.basket.name;
  els.basketPrice.textContent = money.format(basketTotal());
  els.basketItems.replaceChildren();
  state.cart.basketItems.forEach((item, index) => {
    const line = document.createElement('article');
    line.className = 'basket-item';
    const name = document.createElement('span');
    name.textContent = item.name;
    const controls = qtyControl(item.qty, () => changeBasketQty(index, -1), () => changeBasketQty(index, 1));
    line.append(name, controls);
    els.basketItems.append(line);
  });
}

function changeBasketQty(index, delta){
  const item = state.cart.basketItems[index];
  if (!item) return;
  item.qty = Math.max(0, asNumber(item.qty) + delta);
  saveCart();
  render();
}

function categories(){
  return [...new Set((state.catalog.offers || []).map(item => item.category).filter(Boolean))];
}

function renderProducts(){
  const cats = categories();
  els.categoryGrid.replaceChildren();
  els.productGrid.replaceChildren();

  if (!state.category) {
    els.productsTitle.textContent = 'Categorias';
    cats.forEach(category => {
      const sample = state.catalog.offers.find(item => item.category === category);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'select-card';
      card.innerHTML = `<img src="${imageUrl(sample?.image)}" alt=""><div class="card-info"><h2></h2></div>`;
      card.querySelector('h2').textContent = category;
      card.addEventListener('click', () => openProducts(category));
      els.categoryGrid.append(card);
    });
    return;
  }

  els.productsTitle.textContent = state.category;
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'select-card';
  back.innerHTML = '<div class="card-info"><h2>← Categorias</h2></div>';
  back.addEventListener('click', () => openProducts(null));
  els.categoryGrid.append(back);

  const offers = state.catalog.offers.filter(item => item.category === state.category);
  if (!offers.length) {
    els.productGrid.innerHTML = '<div class="empty">Sem produtos</div>';
    return;
  }
  offers.forEach(offer => {
    const current = state.cart.extras.find(item => item.sku === offer.sku)?.qty || 0;
    const card = document.createElement('article');
    card.className = 'product-card';
    card.innerHTML = `<img src="${imageUrl(offer.image)}" alt=""><div class="card-info"><h3></h3><strong></strong></div>`;
    card.querySelector('h3').textContent = offer.name;
    card.querySelector('strong').textContent = money.format(asNumber(offer.price));
    card.append(qtyControl(current, () => changeExtra(offer, -1), () => changeExtra(offer, 1)));
    els.productGrid.append(card);
  });
}

function changeExtra(product, delta){
  let item = state.cart.extras.find(row => row.sku === product.sku);
  if (!item && delta > 0) {
    item = {...product, qty:0};
    state.cart.extras.push(item);
  }
  if (!item) return;
  item.qty = Math.max(0, asNumber(item.qty) + delta);
  state.cart.extras = state.cart.extras.filter(row => asNumber(row.qty) > 0);
  saveCart();
  render();
}

function renderBottom(){
  const count = itemCount();
  els.bottomTotal.textContent = money.format(orderTotal());
  els.bottomLabel.textContent = count ? `${count} itens` : 'Pedido';
  els.sendWhatsapp.disabled = state.view === 'baskets' || count === 0;
  els.sendWhatsapp.textContent = state.view === 'basket-edit' ? 'Enviar cesta' : 'Finalizar pedido';
}

function buildWhatsappMessage(){
  const wa = state.config?.whatsapp || {};
  const lines = [wa.messageHeader || '🧺 *Meu pedido Dona Antônia*'];
  lines.push(`Código: *${state.cart.id}*`);
  if (state.cart.basketSlug) {
    lines.push('', `*${state.cart.basketName}*`, `Valor da cesta personalizada: *${money.format(basketTotal())}*`);
    state.cart.basketItems.filter(item => asNumber(item.qty)>0).forEach(item => lines.push(`${item.qty}x ${item.name}`));
  }
  const extras = state.cart.extras.filter(item => asNumber(item.qty)>0);
  if (extras.length) {
    lines.push('', '*Produtos adicionais*');
    extras.forEach(item => lines.push(`${item.qty}x ${item.name} — ${money.format(asNumber(item.qty)*asNumber(item.price))}`));
  }
  lines.push('', `*Total: ${money.format(orderTotal())}*`, '', wa.messageFooter || 'Quero continuar pelo WhatsApp.');
  return lines.join('\n');
}

function openWhatsapp(){
  const number = String(state.config?.whatsapp?.number || state.catalog.whatsapp || '').replace(/\D/g, '');
  if (!number) return toast('WhatsApp não configurado');
  window.location.href = `https://wa.me/${number}?text=${encodeURIComponent(buildWhatsappMessage())}`;
}

function resetCart(){
  localStorage.removeItem(STORAGE_KEY);
  state.cart = state.basket ? createCart(state.basket) : null;
  render();
}

function render(){
  const params = new URLSearchParams(location.search);
  const secao = params.get('secao');
  const cesta = params.get('cesta');
  const categoria = params.get('categoria');

  if (secao === 'produtos' || secao === 'ofertas') {
    state.category = categoria || state.category || null;
    state.cart = ensureCart();
    show('products');
    renderProducts();
  } else if (cesta) {
    state.basket = basketBySlug(cesta) || state.catalog.baskets[0];
    state.cart = ensureCart(state.basket);
    show('basket-edit');
    renderBasketEdit();
  } else {
    show('baskets');
    renderBasketGrid();
  }
  renderBottom();
}

async function loadData(){
  const params = new URLSearchParams(location.search);
  if (params.get('preview') === '1') {
    try {
      const preview = JSON.parse(localStorage.getItem(PREVIEW_KEY) || 'null');
      if (preview?.catalog && preview?.config) return preview;
    } catch {}
  }
  const [catalogRes, configRes] = await Promise.all([fetch(CATALOG_URL,{cache:'no-store'}), fetch(CONFIG_URL,{cache:'no-store'})]);
  if (!catalogRes.ok) throw new Error('Catálogo indisponível');
  return { catalog: await catalogRes.json(), config: configRes.ok ? await configRes.json() : {} };
}

async function init(){
  try {
    const data = await loadData();
    state.catalog = data.catalog;
    state.config = data.config;
    render();
  } catch (error) {
    console.error(error);
    document.querySelector('main').innerHTML = '<div class="empty">Catálogo indisponível</div>';
    els.sendWhatsapp.disabled = true;
  }
}

els.sendWhatsapp.addEventListener('click', openWhatsapp);
els.resetCart.addEventListener('click', resetCart);
window.addEventListener('popstate', render);
init();
