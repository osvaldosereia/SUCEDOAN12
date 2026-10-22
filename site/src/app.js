import { request, loadHome, loadBasket, loadProducts, loadDeliveryDates, submitOrder, loadBasketAlternatives } from './api.js';
import { cartTotalCents, orderLines, orderPayload, minimumOrderStatus, basketQuoteRequest } from './cart.js';
import { normalizeWhatsapp, addressSummary } from './customer.js';
import { mergeProductPages, nextPageOffset, sortProducts } from './products.js';
import { CATEGORY_SHORTCUTS } from './category-shortcuts.js';

const $ = selector => document.querySelector(selector);
const content = $('#content');
const dialogRoot = $('#dialogRoot');
const state = { home: null, cart: readCart(), activeCategory: 'baskets', search: '', deliveryDates: [], deliveryDateStatus: 'idle', customerDraft: {}, productSort: 'default', viewToken: 0, productContext: null, products: [], nextProductOffset: null, customer: { status: 'idle', phone: '', data: null, complete: false } };
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
function moldChoiceHtml(option, selectedId, index) { const selected = String(option.product_id) === String(selectedId); return `<button class="basket-choice ${selected ? 'selected' : ''}" type="button" aria-pressed="${selected}" data-select-mold-product="${esc(option.product_id)}" data-position-index="${index}">${image(option.image_url, option.name)}<span>${esc(option.name)}</span><strong>${money(option.price_cents)}</strong>${selected ? `<i>${icon('check')}</i>` : ''}</button>`; }
function basketPrice(basket) { return Number(basket.display_price_cents ?? basket.price_cents ?? (Number(basket.price || 0) * 100)); }
function setCategory(key) { state.activeCategory = key; document.querySelectorAll('[data-category]').forEach(button => { const selected = button.dataset.category === key; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); }); }
function renderCategoryNav() {
  $('#categoryNav').innerHTML = CATEGORY_SHORTCUTS.map(category => `<button class="category-shortcut" data-category="${esc(category.key)}" aria-pressed="${String(category.key === state.activeCategory)}">${icon(category.icon)}<span>${esc(category.label)}</span></button>`).join('');
}
function renderBaskets() {
  const baskets = state.home?.baskets || [];
  content.innerHTML = `<div class="section-title"><h2>Nossas cestas</h2><p>Produtos essenciais com qualidade e economia.</p></div>${baskets.length ? `<div class="basket-grid">${baskets.map(basket => `<article class="basket-card">${image(basket.image_url || basket.photo_url || basket.image, `Cesta ${basket.name}`)}<div class="basket-card-body"><h3>${esc(basket.name)}</h3><small class="starting-price">A partir de</small><div class="basket-price">${money(basketPrice(basket))}</div><button class="primary" type="button" data-open-basket="${esc(basket.card_key || basket.id)}">Ver e montar</button></div></article>`).join('')}</div>` : `<div class="error-box">Ainda não há cestas disponíveis para pedir. Atualize a página ou fale com a nossa equipe pelo WhatsApp.</div>`}`;
  paintCartCount();
}
async function openBasket(id, existing = null) {
  openDrawer('Carregando cesta…', '<div class="empty">Preparando os produtos desta cesta.</div>', '');
  try {
    const data = await loadBasket(id);
    if (!data.basket || !Array.isArray(data.items)) throw new Error('Cesta inválida');
    const basket = { ...data.basket, id: String(data.basket.id || id), name: data.basket.name || 'Cesta básica' };
    const saved = new Map((existing?.components || []).map(item => [String(basket.mold_mode ? item.position_id : item.product_id || item.id), item]));
    const items = data.items.map(item => {
      const previous = saved.get(String(basket.mold_mode ? item.position_id : item.product_id || item.id));
      return { ...item, ...(basket.mold_mode && previous ? previous : {}), base_quantity: Number(item.base_quantity ?? item.quantity ?? 0), quantity: Number(previous?.quantity ?? item.quantity ?? item.base_quantity ?? 0), alternatives: [], next_offset: 0, alternatives_loading: false };
    });
    const price = basketPrice(basket);
    const body = `<p class="subtle">Escolha as opções para montar sua cesta.</p><div class="basket-offer"><span>A partir de</span><strong>${money(price)}</strong><span class="basket-illustration">🧺</span></div><div class="basket-items">${items.map((item, index) => `<section class="basket-component" data-basket-position="${index}"><div class="basket-component-title"><span class="basket-type-icon">${icon(/arroz|feijão|feijao|grão/i.test(item.name)?'basket':/óleo|oleo/i.test(item.name)?'bottle':'soap')}</span><div class="component-main"><strong>${esc(item.name)} <small>· <span data-item-qty-label>${item.quantity} unidade${item.quantity===1?'':'s'}</span></small></strong><small>${basket.mold_mode ? 'Escolha uma marca; o total acompanha sua seleção.' : 'Escolha a quantidade para sua cesta.'}</small></div><span class="component-chevron" aria-hidden="true">⌄</span></div><div class="basket-product-strip" data-options-strip>${moldChoiceHtml(item, item.product_id, index)}</div><div class="basket-quantity"><span>Quantidade</span><div class="qty"><button type="button" aria-label="Diminuir ${esc(item.name)}" data-component-qty="${index}" data-delta="-1">−</button><b data-quantity-value>${item.quantity}</b><button type="button" aria-label="Aumentar ${esc(item.name)}" data-component-qty="${index}" data-delta="1">+</button></div></div></section>`).join('')}</div><p id="basketQuoteStatus" class="subtle" role="status"></p><button class="outline" id="retryBasketQuote" type="button" hidden>Tentar calcular novamente</button>`;
    openDrawer(`Cesta ${basket.name}`, body, `<div class="basket-sticky-total"><span>Total da cesta<strong id="basketTotal">${money(existing?.price_cents ?? price)}</strong></span><button class="primary" id="addBasket" type="button">${existing ? 'Salvar e ver pedido' : 'Adicionar ao pedido'}</button><button class="basket-view-order" id="viewBasketOrder" type="button">Ver pedido</button></div>`);
    const drawer = $('#dialogRoot .drawer');
    let quoted = !basket.mold_mode && !items.some(item => item.quantity !== Number(item.base_quantity)) && !existing, quoteRevision = 0;
    const quoteInput = () => basketQuoteRequest(basket, items);
    const updateQuote = async () => {
      const revision = ++quoteRevision; quoted = false; $('#basketQuoteStatus').textContent = 'Calculando novo valor…'; $('#retryBasketQuote').hidden = true; $('#addBasket').disabled = true; $('#basketTotal').textContent = 'Calculando…';
      try { const input = quoteInput(); const quote = await request(input.action, {}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input.payload) }); if (revision !== quoteRevision || !drawer.isConnected) return; basket.price_cents = Number(quote.total_cents); $('#basketTotal').textContent = money(basket.price_cents); $('#basketQuoteStatus').textContent = ''; quoted = true; $('#addBasket').disabled = false; }
      catch (error) { if (revision !== quoteRevision || !drawer.isConnected) return; console.error('Falha ao cotar cesta', error); $('#basketTotal').textContent = 'Valor não calculado'; $('#basketQuoteStatus').textContent = 'Não foi possível confirmar o valor. Tente novamente.'; $('#retryBasketQuote').hidden = false; }
    };
    const loadOptions = async (item, offset = 0) => {
      if (item.alternatives_loading || item.next_offset == null && item.alternatives_loaded) return;
      item.alternatives_loading = true;
      const strip = drawer.querySelector(`[data-basket-position="${items.indexOf(item)}"] [data-options-strip]`);
      if (offset === 0 && !item.alternatives_loaded) strip.insertAdjacentHTML('beforeend', '<span class="subtle options-loading">Carregando marcas…</span>');
      try {
        const result = await loadBasketAlternatives(basket.id, basket.composition_number, item.position_id, item.product_id, item.quantity, offset);
        if (!drawer.isConnected) return;
        item.alternatives = offset ? [...item.alternatives, ...(result.alternatives || [])] : (result.alternatives || []);
        item.alternatives_loaded = true; item.next_offset = result.next_offset;
        strip.querySelector('.options-loading')?.remove();
        if (offset === 0) strip.innerHTML = '';
        strip.insertAdjacentHTML('beforeend', item.alternatives.slice(offset).map(option => moldChoiceHtml(option, item.product_id, items.indexOf(item))).join(''));
        if (item.next_offset != null && !strip.querySelector('[data-load-next-options]')) strip.insertAdjacentHTML('beforeend', '<button class="basket-load-more" type="button" data-load-next-options>Carregar mais opções</button>');
        if (item.next_offset == null) strip.querySelector('[data-load-next-options]')?.remove();
      } catch {
        strip.querySelector('.options-loading')?.remove();
        if (!item.alternatives_loaded) strip.insertAdjacentHTML('beforeend', '<button class="outline" type="button" data-retry-options>Toque para carregar as marcas</button>');
      } finally { item.alternatives_loading = false; }
    };
    $('#retryBasketQuote').onclick = updateQuote;
    $('#viewBasketOrder').onclick = () => showCart();
    if (existing || basket.mold_mode) updateQuote();
    const optionObserver = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { const item = items[Number(entry.target.dataset.basketPosition)]; if (item && basket.mold_mode) loadOptions(item, 0); optionObserver.unobserve(entry.target); } }), { root: drawer, rootMargin: '180px 0px' });
    if (basket.mold_mode) drawer.querySelectorAll('[data-basket-position]').forEach(section => optionObserver.observe(section));
    drawer.querySelectorAll('[data-options-strip]').forEach(strip => strip.addEventListener('scroll', () => {
      const section = strip.closest('[data-basket-position]'), item = items[Number(section.dataset.basketPosition)];
      if (item?.alternatives_loaded && item.next_offset != null && strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 100) loadOptions(item, item.next_offset);
    }, { passive: true }));
    drawer.addEventListener('click', event => {
      const more = event.target.closest('[data-load-next-options]');
      if (more) { const section = more.closest('[data-basket-position]'), item = items[Number(section.dataset.basketPosition)]; more.remove(); return loadOptions(item, item.next_offset); }
      const retry = event.target.closest('[data-retry-options]');
      if (retry) { const section = retry.closest('[data-basket-position]'), item = items[Number(section.dataset.basketPosition)]; retry.remove(); return loadOptions(item, 0); }
      const choice = event.target.closest('[data-select-mold-product]');
      if (choice) {
        const item = items[Number(choice.dataset.positionIndex)], selected = item?.alternatives?.find(option => String(option.product_id) === choice.dataset.selectMoldProduct); if (!item || !selected) return;
        Object.assign(item, selected, { quantity: Number(item.quantity) });
        const section = choice.closest('[data-basket-position]'), strip = section.querySelector('[data-options-strip]');
        strip.querySelectorAll('.basket-choice').forEach(card => card.classList.toggle('selected', card.dataset.selectMoldProduct === String(item.product_id)));
        section.querySelector('[data-item-qty-label]').textContent = `${item.quantity} unidade${item.quantity === 1 ? '' : 's'}`;
        section.querySelector('[data-quantity-value]').textContent = String(item.quantity);
        updateQuote();
        return;
      }
      const qtyButton = event.target.closest('[data-component-qty]');
      if (qtyButton) {
        const item = items[Number(qtyButton.dataset.componentQty)], next = item.quantity + Number(qtyButton.dataset.delta), max = basket.mold_mode ? Number(item.stock_quantity || 0) : Number(item.stock_quantity || 30);
        if (next < 1 || next > Math.max(1, max)) return;
        item.quantity = next;
        const section = qtyButton.closest('[data-basket-position]'); section.querySelector('[data-quantity-value]').textContent = String(next); section.querySelector('[data-item-qty-label]').textContent = `${next} unidade${next === 1 ? '' : 's'}`;
        updateQuote();
      }
    });
    $('#addBasket').addEventListener('click', () => {
      if (!items.some(item => item.quantity > 0)) return toast('Mantenha pelo menos um produto na cesta.');
      if ((basket.mold_mode || items.some(item => item.quantity !== Number(item.base_quantity))) && !quoted) return toast('Confirme o valor da cesta antes de adicionar.');
      const item = { ...existing, type: 'basket', id: basket.id, mold_mode: basket.mold_mode === true, composition_number: Number(basket.composition_number || 1), name: basket.name, qty: Number(existing?.qty || 1), price_cents: Number(basket.price_cents ?? price), split_mode: basket.split_mode === true, lot_id: basket.lot_id || null, food_lot_id: basket.food_lot_id || null, hygiene_lot_id: basket.hygiene_lot_id || null, components: items.map(({ alternatives, alternatives_loading, next_offset, ...component }) => component), basket_request_id: basket.mold_mode ? `${basket.id}@${Number(basket.composition_number || 1)}` : id };
      state.cart = [...state.cart.filter(row => !(row.id === item.id && row.type === 'basket')), item]; saveCart(); closeDrawer(); toast('Cesta adicionada ao pedido.');
    });
  } catch (error) { openDrawer('Cesta indisponível', `<div class="error-box">Não consegui carregar esta cesta. Verifique sua conexão e tente novamente.<br><br>${esc(error.message)}</div>`, '<button class="outline" type="button" id="retryBasket">Tentar novamente</button>'); $('#retryBasket').onclick = () => openBasket(id); }
}
function productPrice(product) { return Number(product.price_cents ?? product.sale_price_cents ?? Math.round(Number(product.price || 0) * 100)); }
function renderProducts(title, products, token, emptyText = 'Não encontramos produtos nesta categoria.') {
  if (token !== state.viewToken) return;
  state.products = products;
  state.productSort = 'default';
  content.innerHTML = `<div class="section-title"><h2>${esc(title || 'Mercearia')}</h2><p>O essencial para o seu dia a dia, com qualidade e variedade.</p></div><div class="product-toolbar"><span>${products.length ? 'Produtos disponíveis' : 'Nenhum produto encontrado'}</span><label>Ordenar <select id="productSort" aria-label="Ordenar produtos"><option value="default">Recomendados</option><option value="name">Nome</option><option value="price">Menor preço entre os carregados</option></select></label></div>${products.length ? `<div class="product-grid" id="productGrid">${sortProducts(products, state.productSort, productPrice).map(productCardHtml).join('')}</div>${state.nextProductOffset == null ? '' : '<button class="outline more-products" id="loadMore" type="button">Mostrar mais produtos</button>'}` : `<div class="empty">${esc(emptyText)}</div>`}`;
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
    if (grid) grid.innerHTML = sortProducts(state.products, state.productSort, productPrice).map(productCardHtml).join('');
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
  const previousScroll = $('#dialogRoot .drawer')?.scrollTop || 0;
  const lines = orderLines(state.cart);
  const customerDraft = state.customerDraft;
  const draftValue = (key, fallback = '') => esc(customerDraft[key] ?? fallback);
  const customerPanel = () => {
    const customer = state.customer.data || {};
    if (state.customer.complete && state.customer.status === 'found') return `<div class="minimum"><strong>Endereço cadastrado</strong><br>${esc(addressSummary(customer) || 'Endereço confirmado')}<br><button class="outline" id="editCustomer" type="button">Trocar endereço</button></div>`;
    if (!['new', 'found'].includes(state.customer.status)) return `<p class="subtle" id="customerHint">Informe seu WhatsApp e consulte seu cadastro para continuar.</p>`;
    const address = customer.address || {};
    return `<div class="checkout-form"><label>Nome completo<input id="customerName" maxlength="180" autocomplete="name" value="${draftValue('customerName', customer.display_name || '')}" required></label><label>CPF ou CNPJ<input id="customerDocument" inputmode="numeric" maxlength="18" autocomplete="off" value="${draftValue('customerDocument', customer.document || '')}" required></label><label>Rua<input id="customerStreet" maxlength="180" autocomplete="address-line1" value="${draftValue('customerStreet', address.street || '')}" required></label><div class="action-row"><label>Número<input id="customerNumber" maxlength="40" value="${draftValue('customerNumber', address.number || '')}" required></label><label>Bairro<input id="customerNeighborhood" maxlength="120" value="${draftValue('customerNeighborhood', address.neighborhood || address.district || '')}" required></label></div><label>Cidade<select id="customerCity" required><option value="">Selecione</option><option ${draftValue('customerCity', address.city) === 'Cuiabá' ? 'selected' : ''}>Cuiabá</option><option ${draftValue('customerCity', address.city) === 'Várzea Grande' ? 'selected' : ''}>Várzea Grande</option></select></label><label>CEP (opcional)<input id="customerPostal" inputmode="numeric" maxlength="9" value="${draftValue('customerPostal', address.postal_code || '')}"></label><label>Complemento (opcional)<input id="customerComplement" maxlength="180" value="${draftValue('customerComplement', address.complement || '')}"></label><label>Referência (opcional)<input id="customerReference" maxlength="220" value="${draftValue('customerReference', address.reference || '')}"></label><button id="saveCustomer" class="outline" type="button">Salvar cadastro e endereço</button></div>`;
  };
  const markup = `<div class="checkout-view"><div class="checkout-list">${lines.map(line => {
    if (line.type === 'component') return `<div class="checkout-row">${image(line.image_url, line.name)}<div class="component-main"><strong>${esc(line.name)}</strong><small>Incluído na cesta</small></div><span>× ${Number(line.quantity || 1)}</span></div>`;
    const isBasket = line.type === 'basket';
    return `<div class="cart-section"><div class="checkout-row">${image(line.image_url, line.name)}<div class="component-main"><strong>${esc(line.name)}</strong><small>${isBasket ? 'Cesta completa' : esc(line.packaging || 'Produto avulso')}</small></div><span class="checkout-price">${money(Number(line.price_cents) * Number(line.qty || 1))}</span></div><div class="action-row"><button class="outline" data-remove="${esc(line.id)}" data-kind="${line.type}" type="button">Remover</button>${isBasket ? `<button class="outline" data-edit-basket="${esc(line.id)}" type="button">Editar cesta</button>` : ''}${!isBasket ? `<div class="qty"><button data-cart-qty="${esc(line.id)}" data-delta="-1" type="button" aria-label="Diminuir">−</button><b>${Number(line.qty || 1)}</b><button data-cart-qty="${esc(line.id)}" data-delta="1" type="button" aria-label="Aumentar">+</button></div>` : `<span class="subtle">${Number(line.qty || 1)} cesta(s)</span>`}</div></div>`;
  }).join('')}</div><div class="drawer-total"><span>Total estimado</span><span>${money(cartTotalCents(state.cart))}</span></div><div class="minimum" id="minimumStatus" role="status"></div><section aria-labelledby="customerTitle"><h3 id="customerTitle">Seus dados para entrega</h3><label class="checkout-form">WhatsApp com DDD<input id="customerPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(65) 99999-9999" value="${esc(state.customer.phone)}"></label><button class="outline" id="lookupCustomer" type="button">Consultar cadastro</button><div id="customerPanel">${customerPanel()}</div></section><form id="checkoutForm" class="checkout-form"><label>Data disponível para entrega<select name="deliveryDate" required><option value="">${state.deliveryDateStatus === 'loading' ? 'Carregando datas…' : state.deliveryDateStatus === 'error' ? 'Não foi possível carregar as datas' : 'Selecione uma data'}</option>${state.deliveryDates.map(date => `<option value="${esc(date.date)}">${esc(date.label)}</option>`).join('')}</select></label><label>Como pretende pagar?<select name="payment"><option value="">Escolher depois</option><option>PIX</option><option>Dinheiro</option><option>Cartão de crédito</option><option>Cartão alimentação/refeição</option></select></label><p class="subtle">Pagamento na entrega. Nenhum dado de cartão é solicitado.</p><button class="primary" type="submit" ${cartTotalCents(state.cart) < 7500 ? 'disabled' : ''}>Enviar pedido para confirmação</button><button class="outline" type="button" id="continueShopping">Continuar escolhendo</button></form></div>`;
  openDrawer('Revisar pedido', markup, '');
  $('#dialogRoot .drawer').classList.add('checkout-drawer');
  $('#dialogRoot .drawer').scrollTop = previousScroll;
  const minimum = minimumOrderStatus(cartTotalCents(state.cart), 7500);
  $('#minimumStatus').textContent = minimum.meetsMinimum ? 'Pedido mínimo atingido. A equipe confirma disponibilidade e horário.' : `Pedido mínimo: ${money(7500)}. Faltam ${money(minimum.remainingCents)}.`;
  $('#continueShopping').onclick = closeDrawer;
  $('#customerPanel').addEventListener('input', event => { if (event.target.id) state.customerDraft[event.target.id] = event.target.value; });
  $('#customerPanel').addEventListener('change', event => { if (event.target.id) state.customerDraft[event.target.id] = event.target.value; });
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
    if (amount < 7500) return toast(`Faltam ${money(minimumOrderStatus(amount, 7500).remainingCents)} para o pedido mínimo.`);
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
  $('#checkoutForm').querySelector('[type=submit]').disabled = cartTotalCents(state.cart) < 7500;
  dialogRoot.querySelectorAll('[data-edit-basket]').forEach(button => button.addEventListener('click', () => { const item = state.cart.find(row => row.type === 'basket' && row.id === button.dataset.editBasket); if (item) openBasket(item.basket_request_id || (item.mold_mode ? `${item.id}@${Number(item.composition_number || 1)}` : item.id), item); }));
  dialogRoot.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => { state.cart = state.cart.filter(item => !(item.id === button.dataset.remove && item.type === button.dataset.kind)); saveCart(); cartContent(); }));
  dialogRoot.querySelectorAll('[data-cart-qty]').forEach(button => button.addEventListener('click', () => { const item = state.cart.find(row => row.id === button.dataset.cartQty); if (!item) return; item.qty = Math.max(1, Number(item.qty || 1) + Number(button.dataset.delta)); saveCart(); cartContent(); }));
}
function showCart() {
  state.deliveryDateStatus = 'loading';
  cartContent();
  loadDeliveryDates().then(dates => { state.deliveryDates = Array.isArray(dates.options) ? dates.options : []; state.deliveryDateStatus = 'ready'; updateDeliveryDates(); }).catch(() => { state.deliveryDates = []; state.deliveryDateStatus = 'error'; updateDeliveryDates(); });
}
function updateDeliveryDates() {
  const select = $('#checkoutForm [name=deliveryDate]'); if (!select) return;
  const selected = select.value;
  select.innerHTML = `<option value="">${state.deliveryDates.length ? 'Selecione uma data' : state.deliveryDateStatus === 'loading' ? 'Carregando datas…' : 'Não foi possível carregar. Reabra o pedido para tentar novamente.'}</option>${state.deliveryDates.map(date => `<option value="${esc(date.date)}">${esc(date.label)}</option>`).join('')}`;
  if (state.deliveryDates.some(date => date.date === selected)) select.value = selected;
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
  content.addEventListener('change', event => { if(event.target.id !== 'productSort') return; state.productSort = event.target.value; const grid=$('#productGrid'); if(grid) grid.innerHTML=sortProducts(state.products,state.productSort,productPrice).map(productCardHtml).join(''); });
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
