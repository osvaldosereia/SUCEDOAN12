import { request, loadHome, loadBasket, loadProducts, loadDeliveryDates, submitOrder } from './api.js';
import { cartTotalCents, orderLines, orderPayload } from './cart.js';
import { normalizeWhatsapp, addressSummary } from './customer.js';
import { mergeProductPages, nextPageOffset } from './products.js';
import { CATEGORY_SHORTCUTS } from './category-shortcuts.js';

const $ = selector => document.querySelector(selector);
const content = $('#content');
const dialogRoot = $('#dialogRoot');
const state = { home: null, cart: readCart(), activeCategory: 'baskets', search: '', deliveryDates: [], viewToken: 0, productContext: null, products: [], nextProductOffset: null, customer: { status: 'idle', phone: '', data: null, complete: false } };
const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents || 0) / 100);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const ICONS = { search:'<circle cx="11" cy="11" r="7.5"/><path d="m16.5 16.5 5 5"/>', cart:'<path d="M2 3h2l2.2 12.2a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 1.9-1.4L22 8H5"/><circle cx="9" cy="21" r="1"/><circle cx="18" cy="21" r="1"/>', pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>', arrow:'<path d="M5 12h14M13 5l7 7-7 7"/>', basket:'<path d="M3 10h18l-1.5 11h-15L3 10Z"/><path d="m7 10 5-7 5 7M8 14v3m4-3v3m4-3v3"/>', spray:'<path d="M8 6h8l2 3v12H6V9l2-3Zm0 0V3h8M14 3h5l2 2"/><path d="M19 8h3M18 5l2-2"/>', bottle:'<path d="M9 3h6v4l2 2v12H7V9l2-2V3Z"/><path d="M9 7h6"/>', soap:'<path d="M8 5c0-2 2-3 4-3s4 1 4 3v2l2 2v11H6V9l2-2V5Z"/><path d="M9 13h6"/>', tube:'<path d="M8 3h8l-1 4-2 2-2 12H7l2-12-2-2 1-4Z"/><path d="M8 7h7"/>', home:'<path d="m3 11 9-8 9 8v10h-7v-7h-4v7H3V11Z"/>', paw:'<ellipse cx="12" cy="16" rx="6" ry="4.5"/><circle cx="5" cy="9" r="2"/><circle cx="10" cy="6" r="2"/><circle cx="15" cy="6" r="2"/><circle cx="19" cy="9" r="2"/>', plus:'<path d="M12 5v14M5 12h14"/>', check:'<path d="m5 12 4 4L19 6"/>', back:'<path d="m15 18-6-6 6-6"/>' };
function icon(name, cls='') { return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.basket}</svg>`; }
function readCart() {
  try {
    const current = localStorage.getItem('da_site_cart_v1');
    const legacy = current ? null : localStorage.getItem('da_simple_storefront_cart_v2');
    const value = JSON.parse(current || legacy || '[]');
    return Array.isArray(value) ? value.filter(item => item && ['basket', 'product'].includes(item.type) && item.id).map(item => ({ ...item, qty: Math.max(1, Number(item.qty) || 1) })) : [];
  } catch { return []; }
}
function saveCart() { localStorage.setItem('da_site_cart_v1', JSON.stringify(state.cart)); paintCartCount(); }
function paintCartCount() { const count=state.cart.reduce((sum, item) => sum + Number(item.qty || 1), 0); $('#cartCount').textContent=String(count); $('#cartCountBottom').textContent=String(count); const total=$('#floatingTotal'), label=$('#floatingCount'); if(total) total.textContent=money(cartTotalCents(state.cart)); if(label) label.textContent=`Seu pedido · ${count} ${count===1?'item':'itens'}`; }
function toast(message) { const notice = $('#notice'); notice.textContent = message; notice.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => notice.classList.remove('show'), 2800); }
function image(url, name) { const safeUrl = /^https:\/\//i.test(String(url || '')) ? url : '/img/logoantonia5.png'; return `<img src="${esc(safeUrl)}" alt="${esc(name)}" loading="lazy" decoding="async" width="500" height="360">`; }
function basketPrice(basket) { return Number(basket.display_price_cents ?? basket.price_cents ?? (Number(basket.price || 0) * 100)); }
function setCategory(key) { state.activeCategory = key; document.querySelectorAll('[data-category]').forEach(button => button.classList.toggle('selected', button.dataset.category === key)); }
function renderCategoryNav() {
  $('#categoryNav').innerHTML = CATEGORY_SHORTCUTS.map(category => `<button class="category-shortcut" data-category="${esc(category.key)}">${icon(category.icon)}<span>${esc(category.label)}</span></button>`).join('');
}
function renderBaskets() {
  const baskets = state.home?.baskets || [];
  content.innerHTML = `<div class="section-title"><h2>Nossas cestas</h2><p>Produtos essenciais com qualidade e economia.</p></div>${baskets.length ? `<div class="basket-grid">${baskets.map(basket => `<article class="basket-card">${image(basket.image_url || basket.photo_url || basket.image, `Cesta ${basket.name}`)}<div class="basket-card-body"><h3>${esc(basket.name)}</h3><small class="starting-price">A partir de</small><div class="basket-price">${money(basketPrice(basket))}</div><button class="primary" type="button" data-open-basket="${esc(basket.card_key || basket.id)}">Ver e montar</button></div></article>`).join('')}</div>` : `<div class="error-box">Ainda não há cestas disponíveis para pedir. Atualize a página ou fale com a nossa equipe pelo WhatsApp.</div>`}`;
  paintCartCount();
}
async function openBasket(id) {
  openDrawer('Carregando cesta…', '<div class="empty">Preparando os produtos desta cesta.</div>', '');
  try {
    const data = await loadBasket(id);
    if (!data.basket || !Array.isArray(data.items)) throw new Error('Cesta inválida');
    const items = data.items.map(item => ({ ...item, base_quantity: Number(item.base_quantity ?? item.quantity ?? 0), quantity: Number(item.quantity ?? item.base_quantity ?? 0) }));
    const basket = { ...data.basket, id: String(data.basket.id || id), name: data.basket.name || 'Cesta básica' };
    const price = basketPrice(basket);
    const body = `<p class="subtle">Escolha as opções para montar sua cesta.</p><div class="basket-offer"><span>A partir de</span><strong>${money(price)}</strong><span class="basket-illustration">🧺</span></div><div class="basket-items">${items.map((item, index) => `<section class="basket-component"><div class="basket-component-title"><span class="basket-type-icon">${icon(/arroz|feijão|feijao|grão/i.test(item.name)?'basket':/óleo|oleo/i.test(item.name)?'bottle':'soap')}</span><div class="component-main"><strong>${esc(item.name)} <small>· ${item.base_quantity} unidade${item.base_quantity===1?'':'s'}</small></strong><small>Escolha a quantidade para sua cesta.</small></div><span class="component-chevron">⌄</span></div><div class="basket-product-strip"><article class="basket-choice">${image(item.image_url, item.name)}<span>${esc(item.name)}</span><strong>Incluído</strong><i>${icon('check')}</i></article></div><div class="basket-quantity"><span>Quantidade</span><div class="qty"><button type="button" aria-label="Diminuir ${esc(item.name)}" data-component-qty="${index}" data-delta="-1">−</button><b>${item.quantity}</b><button type="button" aria-label="Aumentar ${esc(item.name)}" data-component-qty="${index}" data-delta="1">+</button></div><small>Deslize para ver outras marcas</small></div></section>`).join('')}</div><div class="drawer-total"><span>Total da cesta</span><span id="basketTotal">${money(price)}</span></div>`;
    openDrawer(`Cesta ${basket.name}`, body, '<button class="primary" id="addBasket" type="button">Adicionar ao pedido</button>');
    let quoted = false, quoteRevision = 0;
    dialogRoot.querySelectorAll('[data-component-qty]').forEach(button => button.addEventListener('click', async () => {
      const item = items[Number(button.dataset.componentQty)];
      const revision = ++quoteRevision;
      item.quantity = Math.max(0, item.quantity + Number(button.dataset.delta));
      button.parentElement.querySelector('b').textContent = String(item.quantity);
      if (items.every(row => row.quantity === Number(row.base_quantity))) {
        basket.price_cents = price; $('#basketTotal').textContent = money(price); quoted = true; return;
      }
      quoted = false;
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
  state.products = products;
  content.innerHTML = `<div class="section-title"><h2>${esc(title || 'Mercearia')}</h2><p>O essencial para o seu dia a dia, com qualidade e variedade.</p></div><div class="product-toolbar"><span>${products.length ? 'Produtos disponíveis' : 'Nenhum produto encontrado'}</span><label>Ordenar <select id="productSort" aria-label="Ordenar produtos"><option value="default">Recomendados</option><option value="name">Nome</option><option value="price">Menor preço</option></select></label></div>${products.length ? `<div class="product-grid" id="productGrid">${products.map(productCardHtml).join('')}</div>${state.nextProductOffset == null ? '' : '<button class="outline more-products" id="loadMore" type="button">Mostrar mais produtos</button>'}` : `<div class="empty">${esc(emptyText)}</div>`}`;
}
function productCardHtml(product) { return `<article class="product-card">${image(product.image_url, product.name)}<div class="product-card-body"><h3>${esc(product.name)}</h3><p>${esc(product.packaging || product.unit || product.category || '')}</p><div class="product-price">${money(productPrice(product))}</div><small class="availability"><i></i> Disponível</small><button class="add-product" type="button" aria-label="Adicionar ${esc(product.name)}" data-add-product="${esc(product.product_id || product.id)}">${icon('plus')}</button></div></article>`; }
async function loadProductPage(category = '', query = '') {
  const token = ++state.viewToken;
  content.innerHTML = `<div class="section-title"><p class="eyebrow">MERCADO DONA ANTÔNIA</p><h2>${esc(query || category || 'Produtos')}</h2><p>Carregando opções…</p></div><div class="loading-cards"><i></i><i></i></div>`;
  try {
    const data = await loadProducts(category, 0, query);
    state.productContext = { category, query, title: query ? `Busca: ${query}` : (CATEGORY_SHORTCUTS.find(item => item.key === category)?.label || category), token };
    state.nextProductOffset = nextPageOffset(data);
    renderProducts(state.productContext.title, data.products || [], token, 'Não encontramos. Tente outra palavra.');
  }
  catch { if (token === state.viewToken) content.innerHTML = '<div class="error-box">Não consegui carregar os produtos agora. Confira sua conexão e tente novamente.</div>'; }
}
async function loadMoreProducts() {
  const context = state.productContext, offset = state.nextProductOffset, button = $('#loadMore');
  if (!context || offset == null || !button) return;
  button.disabled = true; button.textContent = 'Carregando…';
  try {
    const page = await loadProducts(context.category, offset, context.query);
    if (context.token !== state.viewToken) return;
    state.products = mergeProductPages(state.products, page.products || []);
    state.nextProductOffset = nextPageOffset(page);
    const grid = $('#productGrid');
    if (grid) grid.innerHTML = state.products.map(productCardHtml).join('');
    if (state.nextProductOffset == null) button.remove();
    else { button.disabled = false; button.textContent = 'Mostrar mais produtos'; }
  } catch {
    if (context.token === state.viewToken && button.isConnected) { button.disabled = false; button.textContent = 'Tentar carregar mais'; }
  }
}
function openDrawer(title, body, action) {
  dialogRoot.innerHTML = `<div class="drawer-backdrop" id="drawerBackdrop"><section class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawerTitle"><header class="drawer-head"><h2 id="drawerTitle">${esc(title)}</h2><button class="icon-button" type="button" id="closeDrawer" aria-label="Fechar">×</button></header><div id="drawerBody">${body}</div>${action ? `<div class="drawer-action">${action}</div>` : ''}</section></div>`;
  $('#closeDrawer').onclick = closeDrawer; $('#drawerBackdrop').addEventListener('click', event => { if (event.target.id === 'drawerBackdrop') closeDrawer(); });
  $('#backToShop')?.addEventListener('click', () => { closeDrawer(); renderBaskets(); });
}
function closeDrawer() { dialogRoot.innerHTML = ''; }
function cartContent() {
  if (!state.cart.length) return openDrawer('Seu pedido', '<div class="empty">Seu pedido ainda está vazio.<br>Escolha uma cesta ou procure produtos.</div>', '<button class="primary" type="button" id="backToShop">Ver cestas e produtos</button>');
  const lines = orderLines(state.cart);
  const customerPanel = () => {
    const customer = state.customer.data || {};
    if (state.customer.complete && state.customer.status === 'found') return `<div class="minimum"><strong>Endereço cadastrado</strong><br>${esc(addressSummary(customer) || 'Endereço confirmado')}<br><button class="outline" id="editCustomer" type="button">Trocar endereço</button></div>`;
    if (!['new', 'found'].includes(state.customer.status)) return `<p class="subtle" id="customerHint">Informe seu WhatsApp e consulte seu cadastro para continuar.</p>`;
    const address = customer.address || {};
    return `<div class="checkout-form"><label>Nome completo<input id="customerName" maxlength="180" autocomplete="name" value="${esc(customer.display_name || '')}" required></label><label>CPF ou CNPJ<input id="customerDocument" inputmode="numeric" maxlength="18" autocomplete="off" value="${esc(customer.document || '')}" required></label><label>Rua<input id="customerStreet" maxlength="180" autocomplete="address-line1" value="${esc(address.street || '')}" required></label><div class="action-row"><label>Número<input id="customerNumber" maxlength="40" value="${esc(address.number || '')}" required></label><label>Bairro<input id="customerNeighborhood" maxlength="120" value="${esc(address.neighborhood || address.district || '')}" required></label></div><label>Cidade<select id="customerCity" required><option value="">Selecione</option><option ${address.city === 'Cuiabá' ? 'selected' : ''}>Cuiabá</option><option ${address.city === 'Várzea Grande' ? 'selected' : ''}>Várzea Grande</option></select></label><label>CEP (opcional)<input id="customerPostal" inputmode="numeric" maxlength="9" value="${esc(address.postal_code || '')}"></label><label>Complemento (opcional)<input id="customerComplement" maxlength="180" value="${esc(address.complement || '')}"></label><label>Referência (opcional)<input id="customerReference" maxlength="220" value="${esc(address.reference || '')}"></label><button id="saveCustomer" class="outline" type="button">Salvar cadastro e endereço</button></div>`;
  };
  const markup = `<div class="checkout-list">${lines.map(line => {
    if (line.type === 'component') return `<div class="checkout-row">${image(line.image_url, line.name)}<div class="component-main"><strong>${esc(line.name)}</strong><small>Incluído na cesta</small></div><span>× ${Number(line.quantity || 1)}</span></div>`;
    const isBasket = line.type === 'basket';
    return `<div class="cart-section"><div class="checkout-row">${image(line.image_url, line.name)}<div class="component-main"><strong>${esc(line.name)}</strong><small>${isBasket ? 'Cesta completa' : esc(line.packaging || 'Produto avulso')}</small></div><span class="checkout-price">${money(Number(line.price_cents) * Number(line.qty || 1))}</span></div>${isBasket && line.components?.length ? `<div class="component-list">${esc(line.components.map(component => `${component.quantity || 1} × ${component.name}`).join(' · '))}</div>` : ''}<div class="action-row"><button class="outline" data-remove="${esc(line.id)}" data-kind="${line.type}" type="button">Remover</button>${!isBasket ? `<div class="qty"><button data-cart-qty="${esc(line.id)}" data-delta="-1" type="button" aria-label="Diminuir">−</button><b>${Number(line.qty || 1)}</b><button data-cart-qty="${esc(line.id)}" data-delta="1" type="button" aria-label="Aumentar">+</button></div>` : `<span class="subtle">${Number(line.qty || 1)} cesta(s)</span>`}</div></div>`;
  }).join('')}</div><div class="drawer-total"><span>Total aproximado</span><span>${money(cartTotalCents(state.cart))}</span></div><div class="minimum">Pedido mínimo: R$ 75,00. O pedido será confirmado pela equipe.</div><section aria-labelledby="customerTitle"><h3 id="customerTitle">Seus dados para entrega</h3><label class="checkout-form">WhatsApp com DDD<input id="customerPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(65) 99999-9999" value="${esc(state.customer.phone)}"></label><button class="outline" id="lookupCustomer" type="button">Consultar cadastro</button><div id="customerPanel">${customerPanel()}</div></section><form id="checkoutForm" class="checkout-form"><label>Data disponível para entrega<select name="deliveryDate" required><option value="">Selecione uma data</option>${state.deliveryDates.map(date => `<option value="${esc(date.date)}">${esc(date.label)}</option>`).join('')}</select></label><label>Como pretende pagar?<select name="payment"><option value="">Escolher depois</option><option>PIX</option><option>Dinheiro</option><option>Cartão de crédito</option><option>Cartão alimentação/refeição</option></select></label><p class="subtle">Pagamento na entrega. Nenhum dado de cartão é solicitado.</p><button class="primary" type="submit">Enviar pedido para confirmação</button></form>`;
  openDrawer('Confira seu pedido', markup, '');
  function renderCustomerPanel() {
    $('#customerPanel').innerHTML = customerPanel();
    $('#editCustomer')?.addEventListener('click', () => { state.customer.complete = false; renderCustomerPanel(); });
    bindSaveCustomer();
  }
  function bindSaveCustomer() { $('#saveCustomer')?.addEventListener('click', async () => {
    const payload = { source: 'checkout', phone: state.customer.phone, name: $('#customerName')?.value || '', document: $('#customerDocument')?.value || '', street: $('#customerStreet')?.value || '', number: $('#customerNumber')?.value || '', neighborhood: $('#customerNeighborhood')?.value || '', city: $('#customerCity')?.value || '', postal_code: $('#customerPostal')?.value || '', complement: $('#customerComplement')?.value || '', reference: $('#customerReference')?.value || '', marketing_opt_in: false };
    const required = ['name', 'document', 'street', 'number', 'neighborhood', 'city']; if (required.some(key => !payload[key].trim())) return toast('Preencha nome, documento e endereço para entrega.');
    const button = $('#saveCustomer'); button.disabled = true; button.textContent = 'Salvando cadastro…';
    try { const result = await request('customer_register', {}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); state.customer.data = result.customer; state.customer.status = 'found'; state.customer.complete = result.customer?.registration_complete === true; renderCustomerPanel(); if (state.customer.complete) toast('Cadastro e endereço salvos.'); else toast('Confira os dados e tente novamente.'); }
    catch (error) { button.disabled = false; button.textContent = 'Salvar cadastro e endereço'; const messages = { invalid_document: 'CPF/CNPJ inválido.', unsupported_city: 'Atendemos somente Cuiabá e Várzea Grande.', document_mismatch: 'O CPF/CNPJ não confere com este cadastro.', identity_mismatch: 'O nome não confere com este cadastro.', document_already_in_use: 'CPF/CNPJ já usado em outro cadastro.' }; toast(messages[error.message] || 'Não consegui salvar. Confira os dados e tente novamente.'); }
  }); }
  renderCustomerPanel();
  $('#checkoutForm').addEventListener('submit', async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const amount = cartTotalCents(state.cart);
    if (amount < 7500) return toast(`Faltam ${money(7500 - amount)} para o pedido mínimo.`);
    const phone = normalizeWhatsapp(state.customer.phone); if (!phone) return toast('Confira o WhatsApp com DDD.');
    if (state.customer.status !== 'found' || !state.customer.complete) return toast('Consulte e salve seu cadastro e endereço antes de enviar.');
    const submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true; submit.textContent = 'Registrando pedido…';
    try {
      const result = await submitOrder(orderPayload(state.cart, { phone, deliveryDate: form.get('deliveryDate'), payment: form.get('payment') }));
      state.cart = []; saveCart(); const publicUrl = /^https:\/\/donaantonia\.com\.br\//i.test(String(result.public_url || '')) ? result.public_url : ''; openDrawer('Pedido recebido', `<div class="empty"><strong>Seu pedido foi enviado.</strong><br>A equipe Dona Antônia vai confirmar a disponibilidade e a entrega pelo WhatsApp.</div>${publicUrl ? `<p><a href="${esc(publicUrl)}">Acompanhar pedido</a></p>` : ''}`, '<button class="primary" id="finishOrder" type="button">Continuar comprando</button>'); $('#finishOrder').onclick = () => { closeDrawer(); renderBaskets(); };
    } catch (error) { submit.disabled = false; submit.textContent = 'Enviar pedido para confirmação'; toast(['insufficient_stock', 'product_unavailable', 'basket_unavailable'].includes(error.message) ? 'O estoque mudou. Atualize seu pedido e tente novamente.' : 'Não consegui registrar. Tente novamente.'); }
  });
  $('#customerPhone').addEventListener('input', event => { state.customer.phone = event.target.value; state.customer = { status: 'idle', phone: event.target.value, data: null, complete: false }; $('#customerPanel').innerHTML = '<p class="subtle">Consulte seu cadastro para continuar.</p>'; });
  $('#lookupCustomer').addEventListener('click', async () => {
    const phone = normalizeWhatsapp($('#customerPhone').value); if (!phone) return toast('Informe um WhatsApp válido com DDD.');
    state.customer = { status: 'loading', phone, data: null, complete: false }; $('#lookupCustomer').disabled = true; $('#lookupCustomer').textContent = 'Consultando…'; $('#customerPanel').innerHTML = '<p class="subtle">Consultando seu cadastro…</p>';
    try { const result = await request('customer_lookup', { phone }, { cache: 'no-store' }); const found = result.found === true; const data = result.customer || null; state.customer = { status: found ? 'found' : 'new', phone, data, complete: found && data?.registration_complete === true }; }
    catch { state.customer = { status: 'error', phone: $('#customerPhone').value, data: null, complete: false }; $('#customerPanel').innerHTML = '<p class="subtle">Não consegui consultar agora. Verifique sua conexão e tente novamente.</p>'; }
    finally { $('#lookupCustomer').disabled = false; $('#lookupCustomer').textContent = 'Consultar cadastro'; if (['new', 'found'].includes(state.customer.status)) renderCustomerPanel(); }
  });
  dialogRoot.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => { state.cart = state.cart.filter(item => !(item.id === button.dataset.remove && item.type === button.dataset.kind)); saveCart(); cartContent(); }));
  dialogRoot.querySelectorAll('[data-cart-qty]').forEach(button => button.addEventListener('click', () => { const item = state.cart.find(row => row.id === button.dataset.cartQty); if (!item) return; item.qty = Math.max(1, Number(item.qty || 1) + Number(button.dataset.delta)); saveCart(); cartContent(); }));
}
async function showCart() {
  try { const dates = await loadDeliveryDates(); state.deliveryDates = Array.isArray(dates.options) ? dates.options : []; } catch { state.deliveryDates = []; }
  cartContent();
}
async function start() {
  document.querySelectorAll('[data-icon]').forEach(node => { node.outerHTML = icon(node.dataset.icon); });
  paintCartCount();
  $('#openCart').addEventListener('click', showCart);
  $('#openCartBottom').addEventListener('click', showCart);
  $('#categoryNav').addEventListener('click', event => { const button = event.target.closest('[data-category]'); if (!button) return; setCategory(button.dataset.category); if (button.dataset.category === 'baskets') renderBaskets(); else loadProductPage(button.dataset.category); });
  content.addEventListener('click', event => {
    const basketButton = event.target.closest('[data-open-basket]'); if (basketButton) return openBasket(basketButton.dataset.openBasket);
    if (event.target.closest('#loadMore')) return loadMoreProducts();
    const addButton = event.target.closest('[data-add-product]'); if (!addButton) return;
    const product = state.products.find(row => String(row.product_id || row.id) === addButton.dataset.addProduct); if (!product) return;
    const id = String(product.product_id || product.id);
    const existing = state.cart.find(row => row.type === 'product' && row.id === id);
    if (existing) existing.qty += 1;
    else state.cart.push({ type: 'product', id, name: product.name, image_url: product.image_url, packaging: product.packaging, price_cents: productPrice(product), stock_quantity: Number(product.stock_quantity || product.stock || 30), qty: 1 });
    saveCart(); toast(`${product.name} adicionado.`);
  });
  content.addEventListener('change', event => { if(event.target.id !== 'productSort') return; const products=state.products.slice(); const mode=event.target.value; if(mode==='name') products.sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR')); if(mode==='price') products.sort((a,b)=>productPrice(a)-productPrice(b)); const grid=$('#productGrid'); if(grid) grid.innerHTML=products.map(productCardHtml).join(''); });
  $('#searchForm').addEventListener('submit', event => { event.preventDefault(); const query = $('#searchInput').value.trim(); if (query) { setCategory(''); loadProductPage('', query); } });
  try {
    let cached = null; try { cached = JSON.parse(localStorage.getItem('da_site_home_v1') || 'null'); } catch {}
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
  catch { if (!state.home?.baskets?.length) content.innerHTML = '<div class="error-box">Não conseguimos carregar as cestas agora. Verifique sua conexão e tente novamente. <button class="outline" id="retryHome" type="button">Tentar novamente</button></div>'; if (state.home) renderCategoryNav(); $('#retryHome')?.addEventListener('click', () => location.reload()); }
}
start();
