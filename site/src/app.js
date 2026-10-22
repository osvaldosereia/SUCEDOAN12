import { request, loadHome, loadBasket, loadProducts, loadDeliveryDates, submitOrder } from './api.js';
import { cartTotalCents, orderLines, orderPayload } from './cart.js';

const $ = selector => document.querySelector(selector);
const content = $('#content');
const dialogRoot = $('#dialogRoot');
const state = { home: null, cart: readCart(), activeCategory: 'baskets', search: '', deliveryDates: [], viewToken: 0 };
const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents || 0) / 100);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
function readCart() { try { const value = JSON.parse(localStorage.getItem('da_site_cart_v1') || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
function saveCart() { localStorage.setItem('da_site_cart_v1', JSON.stringify(state.cart)); paintCartCount(); }
function paintCartCount() { $('#cartCount').textContent = String(state.cart.reduce((sum, item) => sum + Number(item.qty || 1), 0)); }
function toast(message) { const notice = $('#notice'); notice.textContent = message; notice.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => notice.classList.remove('show'), 2800); }
function image(url, name) { const safeUrl = /^https:\/\//i.test(String(url || '')) ? url : '/img/logoantonia5.png'; return `<img src="${esc(safeUrl)}" alt="${esc(name)}" loading="lazy" decoding="async" width="500" height="360">`; }
function basketPrice(basket) { return Number(basket.display_price_cents ?? basket.price_cents ?? (Number(basket.price || 0) * 100)); }
function setCategory(key) { state.activeCategory = key; document.querySelectorAll('[data-category]').forEach(button => button.classList.toggle('selected', button.dataset.category === key)); }
function renderCategoryNav() {
  const categories = Array.isArray(state.home?.categories) ? state.home.categories : [];
  $('#categoryNav').innerHTML = `<button class="pill ${state.activeCategory === 'baskets' ? 'selected' : ''}" data-category="baskets">Cestas básicas</button>${categories.map(category => `<button class="pill ${state.activeCategory === category.key ? 'selected' : ''}" data-category="${esc(category.key)}">${esc(category.label)}</button>`).join('')}`;
}
function renderBaskets() {
  const baskets = state.home?.baskets || [];
  content.innerHTML = `<div class="section-title"><p class="eyebrow">FEITAS PARA A SUA CASA</p><h2>Escolha o tamanho da cesta</h2><p>Veja o que vem em cada opção. Você pode ajustar antes de pedir.</p></div>${baskets.length ? `<div class="basket-grid">${baskets.map(basket => `<article class="basket-card">${image(basket.image_url || basket.photo_url || basket.image, `Cesta ${basket.name}`)}<div class="basket-card-body"><h3>${esc(basket.name)}</h3><p>${esc(basket.description || 'Uma seleção prática para o dia a dia.')}</p><div class="basket-price"><small>Valor aproximado</small>${money(basketPrice(basket))}</div><button class="primary" type="button" data-open-basket="${esc(basket.card_key || basket.id)}">Ver produtos da cesta</button></div></article>`).join('')}</div>` : `<div class="error-box">Ainda não há cestas disponíveis para pedir. Atualize a página ou fale com a nossa equipe pelo WhatsApp.</div>`}`;
}
async function openBasket(id) {
  openDrawer('Carregando cesta…', '<div class="empty">Preparando os produtos desta cesta.</div>', '');
  try {
    const data = await loadBasket(id);
    if (!data.basket || !Array.isArray(data.items)) throw new Error('Cesta inválida');
    const items = data.items.map(item => ({ ...item, base_quantity: Number(item.base_quantity ?? item.quantity ?? 0), quantity: Number(item.quantity ?? item.base_quantity ?? 0) }));
    const basket = { ...data.basket, id: String(data.basket.id || id), name: data.basket.name || 'Cesta básica' };
    const price = basketPrice(basket);
    const body = `<p class="subtle">Confira os produtos incluídos. A cesta aparece como um único item no seu pedido.</p><div class="basket-items">${items.map((item, index) => `<div class="basket-component">${image(item.image_url, item.name)}<div class="component-main"><strong>${esc(item.name)}</strong><small>${esc(item.packaging || '')}</small></div><div class="qty"><button type="button" aria-label="Diminuir ${esc(item.name)}" data-component-qty="${index}" data-delta="-1">−</button><b>${item.quantity}</b><button type="button" aria-label="Aumentar ${esc(item.name)}" data-component-qty="${index}" data-delta="1">+</button></div></div>`).join('')}</div><div class="drawer-total"><span>Valor da cesta</span><span id="basketTotal">${money(price)}</span></div>`;
    openDrawer(`Cesta ${basket.name}`, body, '<button class="primary" id="addBasket" type="button">Adicionar ao pedido</button>');
    let quoted = false, quoteRevision = 0;
    dialogRoot.querySelectorAll('[data-component-qty]').forEach(button => button.addEventListener('click', async () => {
      const item = items[Number(button.dataset.componentQty)];
      item.quantity = Math.max(0, item.quantity + Number(button.dataset.delta));
      button.parentElement.querySelector('b').textContent = String(item.quantity);
      const revision = ++quoteRevision;
      $('#basketTotal').textContent = 'Calculando…';
      try {
        const quoteInput = basket.split_mode
          ? { basket_id: basket.id, food_lot_id: basket.food_lot_id, hygiene_lot_id: basket.hygiene_lot_id, food_lot_code: basket.food_lot_code, hygiene_lot_code: basket.hygiene_lot_code, items: items.map(row => ({ product_id: row.product_id, quantity: row.quantity, component_group: row.component_group })) }
          : { basket_id: basket.id, lot_id: basket.lot_id || null, items: items.map(row => ({ product_id: row.product_id, quantity: row.quantity })) };
        const quote = await request('basket_quote', {}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(quoteInput) });
        if (revision !== quoteRevision) return;
        basket.price_cents = Number(quote.total_cents); $('#basketTotal').textContent = money(basket.price_cents); quoted = true;
      } catch { if (revision !== quoteRevision) return; $('#basketTotal').textContent = 'Recalcule para confirmar'; quoted = false; }
    }));
    $('#addBasket').addEventListener('click', () => {
      if (!items.some(item => item.quantity > 0)) return toast('Mantenha pelo menos um produto na cesta.');
      if (items.some(item => item.quantity !== Number(item.base_quantity)) && !quoted) return toast('Aguarde o cálculo do novo valor.');
      const item = { type: 'basket', id: basket.id, name: basket.name, qty: 1, price_cents: Number(basket.price_cents ?? price), components: items };
      state.cart = [...state.cart.filter(row => row.id !== item.id), item]; saveCart(); closeDrawer(); toast('Cesta adicionada ao pedido.');
    });
  } catch (error) { openDrawer('Cesta indisponível', `<div class="error-box">Não consegui carregar esta cesta. Verifique sua conexão e tente novamente.<br><br>${esc(error.message)}</div>`, '<button class="outline" type="button" id="retryBasket">Tentar novamente</button>'); $('#retryBasket').onclick = () => openBasket(id); }
}
function productPrice(product) { return Number(product.price_cents ?? product.sale_price_cents ?? Math.round(Number(product.price || 0) * 100)); }
function renderProducts(title, products, token, emptyText = 'Não encontramos produtos nesta categoria.') {
  if (token !== state.viewToken) return;
  content.innerHTML = `<div class="section-title"><p class="eyebrow">MERCADO DONA ANTÔNIA</p><h2>${esc(title)}</h2><p>Adicione os itens avulsos ao mesmo pedido.</p></div>${products.length ? `<div class="product-grid">${products.map(product => `<article class="product-card">${image(product.image_url, product.name)}<div class="product-card-body"><h3>${esc(product.name)}</h3><p>${esc(product.packaging || product.unit || product.category || '')}</p><div class="product-price">${money(productPrice(product))}</div><button class="primary" type="button" data-add-product="${esc(product.id)}">Adicionar</button></div></article>`).join('')}</div>` : `<div class="empty">${esc(emptyText)}</div>`}`;
  content.querySelectorAll('[data-add-product]').forEach(button => button.addEventListener('click', () => {
    const product = products.find(row => String(row.id) === button.dataset.addProduct); if (!product) return;
    const existing = state.cart.find(row => row.type === 'product' && row.id === String(product.id));
    if (existing) existing.qty += 1;
    else state.cart.push({ type: 'product', id: String(product.id), name: product.name, image_url: product.image_url, packaging: product.packaging, price_cents: productPrice(product), stock_quantity: Number(product.stock_quantity || product.stock || 30), qty: 1 });
    saveCart(); toast(`${product.name} adicionado.`);
  }));
}
async function loadProductPage(category = '', query = '') {
  const token = ++state.viewToken;
  content.innerHTML = `<div class="section-title"><p class="eyebrow">MERCADO DONA ANTÔNIA</p><h2>${esc(query || category || 'Produtos')}</h2><p>Carregando opções…</p></div><div class="loading-cards"><i></i><i></i></div>`;
  try { const data = await loadProducts(category, 0, query); renderProducts(query ? `Busca: ${query}` : category, data.products || [], token, 'Não encontramos. Tente outra palavra.'); }
  catch { if (token === state.viewToken) content.innerHTML = '<div class="error-box">Não consegui carregar os produtos agora. Confira sua conexão e tente novamente.</div>'; }
}
function openDrawer(title, body, action) {
  dialogRoot.innerHTML = `<div class="drawer-backdrop" id="drawerBackdrop"><section class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawerTitle"><header class="drawer-head"><h2 id="drawerTitle">${esc(title)}</h2><button class="icon-button" type="button" id="closeDrawer" aria-label="Fechar">×</button></header><div id="drawerBody">${body}</div>${action ? `<div class="drawer-action">${action}</div>` : ''}</section></div>`;
  $('#closeDrawer').onclick = closeDrawer; $('#drawerBackdrop').addEventListener('click', event => { if (event.target.id === 'drawerBackdrop') closeDrawer(); });
}
function closeDrawer() { dialogRoot.innerHTML = ''; }
function cartContent() {
  if (!state.cart.length) return openDrawer('Seu pedido', '<div class="empty">Seu pedido ainda está vazio.<br>Escolha uma cesta ou procure produtos.</div>', '<button class="primary" type="button" id="backToShop">Ver cestas e produtos</button>');
  const lines = orderLines(state.cart);
  const markup = `<div class="checkout-list">${lines.map(line => {
    if (line.type === 'component') return `<div class="checkout-row">${image(line.image_url, line.name)}<div class="component-main"><strong>${esc(line.name)}</strong><small>Incluído na cesta</small></div><span>× ${Number(line.quantity || 1)}</span></div>`;
    const isBasket = line.type === 'basket';
    return `<div class="cart-section"><div class="checkout-row">${image(line.image_url, line.name)}<div class="component-main"><strong>${esc(line.name)}</strong><small>${isBasket ? 'Cesta completa' : esc(line.packaging || 'Produto avulso')}</small></div><span class="checkout-price">${money(Number(line.price_cents) * Number(line.qty || 1))}</span></div>${isBasket && line.components?.length ? `<div class="component-list">${esc(line.components.map(component => `${component.quantity || 1} × ${component.name}`).join(' · '))}</div>` : ''}<div class="action-row"><button class="outline" data-remove="${esc(line.id)}" data-kind="${line.type}" type="button">Remover</button>${!isBasket ? `<div class="qty"><button data-cart-qty="${esc(line.id)}" data-delta="-1" type="button" aria-label="Diminuir">−</button><b>${Number(line.qty || 1)}</b><button data-cart-qty="${esc(line.id)}" data-delta="1" type="button" aria-label="Aumentar">+</button></div>` : `<span class="subtle">${Number(line.qty || 1)} cesta(s)</span>`}</div></div>`;
  }).join('')}</div><div class="drawer-total"><span>Total aproximado</span><span>${money(cartTotalCents(state.cart))}</span></div><div class="minimum">Pedido mínimo: R$ 75,00. O pedido será confirmado pela equipe.</div><form id="checkoutForm" class="checkout-form"><label>WhatsApp com DDD<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(65) 99999-9999" required></label><label>Data disponível para entrega<select name="deliveryDate" required><option value="">Selecione uma data</option>${state.deliveryDates.map(date => `<option value="${esc(date.date)}">${esc(date.label)}</option>`).join('')}</select></label><label>Como pretende pagar?<select name="payment"><option value="">Escolher depois</option><option>PIX</option><option>Dinheiro</option><option>Cartão de crédito</option><option>Cartão alimentação/refeição</option></select></label><p class="subtle">Pagamento na entrega. Nenhum dado de cartão é solicitado. Cadastro e endereço completo serão aprimorados na próxima etapa.</p><button class="primary" type="submit">Enviar pedido para confirmação</button></form>`;
  openDrawer('Confira seu pedido', markup, '');
  $('#checkoutForm').addEventListener('submit', async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const amount = cartTotalCents(state.cart);
    if (amount < 7500) return toast(`Faltam ${money(7500 - amount)} para o pedido mínimo.`);
    const phone = String(form.get('phone') || '').replace(/\D/g, ''); if (phone.length < 10 || phone.length > 13) return toast('Confira o WhatsApp com DDD.');
    const submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true; submit.textContent = 'Registrando pedido…';
    try {
      const result = await submitOrder(orderPayload(state.cart, { phone: phone.startsWith('55') ? `+${phone}` : `+55${phone}`, deliveryDate: form.get('deliveryDate'), payment: form.get('payment') }));
      state.cart = []; saveCart(); openDrawer('Pedido recebido', `<div class="empty"><strong>Seu pedido foi enviado.</strong><br>A equipe Dona Antônia vai confirmar a disponibilidade e a entrega pelo WhatsApp.</div>${result.public_url ? `<p><a href="${esc(result.public_url)}">Acompanhar pedido</a></p>` : ''}`, '<button class="primary" id="finishOrder" type="button">Continuar comprando</button>'); $('#finishOrder').onclick = () => { closeDrawer(); renderBaskets(); };
    } catch (error) { submit.disabled = false; submit.textContent = 'Enviar pedido para confirmação'; toast(['insufficient_stock', 'product_unavailable', 'basket_unavailable'].includes(error.message) ? 'O estoque mudou. Atualize seu pedido e tente novamente.' : 'Não consegui registrar. Tente novamente.'); }
  });
  dialogRoot.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => { state.cart = state.cart.filter(item => !(item.id === button.dataset.remove && item.type === button.dataset.kind)); saveCart(); cartContent(); }));
  dialogRoot.querySelectorAll('[data-cart-qty]').forEach(button => button.addEventListener('click', () => { const item = state.cart.find(row => row.id === button.dataset.cartQty); if (!item) return; item.qty = Math.max(1, Number(item.qty || 1) + Number(button.dataset.delta)); saveCart(); cartContent(); }));
}
async function showCart() {
  try { const dates = await loadDeliveryDates(); state.deliveryDates = Array.isArray(dates.options) ? dates.options : []; } catch { state.deliveryDates = []; }
  cartContent();
}
async function start() {
  paintCartCount();
  $('#openCart').addEventListener('click', showCart);
  $('#categoryNav').addEventListener('click', event => { const button = event.target.closest('[data-category]'); if (!button) return; setCategory(button.dataset.category); if (button.dataset.category === 'baskets') renderBaskets(); else loadProductPage(button.dataset.category); });
  content.addEventListener('click', event => { const button = event.target.closest('[data-open-basket]'); if (button) openBasket(button.dataset.openBasket); });
  $('#searchForm').addEventListener('submit', event => { event.preventDefault(); const query = $('#searchInput').value.trim(); if (query) { setCategory(''); loadProductPage('', query); } });
  try {
    const cached = JSON.parse(localStorage.getItem('da_site_home_v1') || 'null');
    if (cached?.baskets?.length) { state.home = cached; renderBaskets(); }
    const priority = cached?.baskets?.length ? Promise.resolve(null) : loadHome(true).catch(() => null);
    const full = loadHome();
    const fast = await priority;
    if (!state.home && fast?.baskets?.length) { state.home = fast; renderBaskets(); }
    if (state.home) renderCategoryNav();
    const latest = await full;
    state.home = latest;
    localStorage.setItem('da_site_home_v1', JSON.stringify(latest));
    renderCategoryNav();
    if (state.activeCategory === 'baskets') renderBaskets();
  }
  catch { if (!state.home?.baskets?.length) content.innerHTML = '<div class="error-box">Não conseguimos carregar as cestas agora. Verifique sua conexão e tente novamente. <button class="outline" id="retryHome" type="button">Tentar novamente</button></div>'; if (state.home) renderCategoryNav(); $('#retryHome')?.addEventListener('click', start); }
}
start();
