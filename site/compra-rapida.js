(function () {
  'use strict';

  const VERSION = '2026-07-17-v1';
  const CART_KEY = 'da_carrinho_v1';
  const PROFILE_KEY = 'da_compra_rapida_perfil_v1';
  const OPEN_CART_KEY = 'da_compra_rapida_abrir_carrinho_v1';
  const CONFIG_URLS = [
    'https://cedar-chemist-310801-default-rtdb.firebaseio.com/config_compra_rapida.json',
    'site/compra-rapida.json'
  ];
  const CATALOG_URLS = ['site/produtos-home.json', 'produtos-home.json'];
  const app = document.getElementById('app');

  const runtime = {
    config: null,
    catalog: [],
    maps: new Map(),
    profile: localStorage.getItem(PROFILE_KEY) || '3-4',
    baseCart: {},
    baseOrder: [],
    selections: {},
    savedEnvelope: null,
    loaded: false,
    rendering: false
  };

  function norm(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function money(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function parseMoney(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const text = String(value || '').trim();
    if (!text) return 0;
    if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text) || 0;
    const normalized = text.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
    return Number(normalized) || 0;
  }

  function productImage(raw) {
    const images = Array.isArray(raw?.imagens) ? raw.imagens : Array.isArray(raw?.images) ? raw.images : [];
    return String(
      raw?.url_imagem || raw?.imagem_url || raw?.imagem || raw?.img || images[0] || 'img/logoantonia5.png'
    ).trim();
  }

  function normalizeProduct(raw, key) {
    const id = String(raw?.codigo || raw?.id || raw?.firebaseKey || key || '').trim();
    return {
      id,
      codigo: String(raw?.codigo || id),
      firebaseKey: String(raw?.firebaseKey || key || raw?.id || id),
      ean: String(raw?.gtin || raw?.ean || ''),
      nome: String(raw?.nome || raw?.name || raw?.descricao || 'Produto'),
      marca: String(raw?.marca || ''),
      embalagem: String(raw?.embalagem || ''),
      categoria: String(raw?.categoria || raw?.category || ''),
      subcategoria: String(raw?.subcategoria || ''),
      preco: parseMoney(raw?.preco ?? raw?.price ?? raw?.valor),
      estoque: Math.max(0, parseInt(raw?.estoque ?? raw?.stock, 10) || 0),
      situacao: String(raw?.situacao || ''),
      imagem: productImage(raw)
    };
  }

  function cacheBust(url) {
    return `${url}${String(url).includes('?') ? '&' : '?'}v=${encodeURIComponent(VERSION)}-${Date.now()}`;
  }

  async function fetchJson(url, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout || 7000);
    try {
      const response = await fetch(cacheBust(url), {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function firstJson(urls, validator) {
    let lastError = null;
    for (const url of urls) {
      try {
        const data = await fetchJson(url, 8000);
        if (!validator || validator(data)) return data;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Dados indisponíveis');
  }

  function catalogEntries(raw) {
    if (Array.isArray(raw)) return raw.map((value, index) => [String(index), value]).filter(([, value]) => value);
    return Object.entries(raw || {}).filter(([, value]) => value && typeof value === 'object');
  }

  function buildCatalog(raw) {
    runtime.catalog = catalogEntries(raw).map(([key, value]) => normalizeProduct(value, key));
    runtime.maps = new Map();
    runtime.catalog.forEach(product => {
      [product.id, product.codigo, product.firebaseKey, product.ean].forEach(ref => {
        const clean = norm(ref);
        if (clean && !runtime.maps.has(clean)) runtime.maps.set(clean, product);
      });
    });
  }

  function allItems() {
    return (runtime.config?.secoes || [])
      .filter(section => section?.ativo !== false)
      .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
      .flatMap(section => (section.itens || [])
        .filter(item => item?.ativo !== false)
        .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0)));
  }

  function liveProduct(snapshot) {
    const refs = [snapshot?.id, snapshot?.codigo, snapshot?.firebaseKey, snapshot?.ean];
    for (const ref of refs) {
      const found = runtime.maps.get(norm(ref));
      if (found) return { ...snapshot, ...found, id: found.id || snapshot.id };
    }
    return normalizeProduct(snapshot || {}, snapshot?.firebaseKey || snapshot?.id);
  }

  function itemOptions(item) {
    return (item?.produtos || []).map(liveProduct).filter(product => product?.id);
  }

  function productAvailable(product) {
    return product && String(product.situacao || '').toUpperCase() !== 'I' && Number(product.estoque || 0) > 0 && Number(product.preco || 0) > 0;
  }

  function readCartEnvelope() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CART_KEY) || 'null');
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_) {}
    return { cart: {}, cartOrder: [], basketCustomizations: {}, basketDrafts: {} };
  }

  function initializeCartDraft() {
    runtime.savedEnvelope = readCartEnvelope();
    runtime.baseCart = { ...(runtime.savedEnvelope.cart || {}) };
    runtime.baseOrder = Array.isArray(runtime.savedEnvelope.cartOrder)
      ? runtime.savedEnvelope.cartOrder.map(String)
      : Object.keys(runtime.baseCart);
    runtime.selections = {};

    allItems().forEach(item => {
      const options = itemOptions(item);
      const selected = options.find(product => Number(runtime.baseCart[String(product.id)] || 0) > 0);
      if (!selected) return;
      const qty = Math.max(0, parseInt(runtime.baseCart[String(selected.id)], 10) || 0);
      delete runtime.baseCart[String(selected.id)];
      runtime.selections[item.id] = { productId: String(selected.id), qty };
    });
  }

  function selectionFor(item) {
    const selection = runtime.selections[item.id];
    if (!selection) return null;
    const product = itemOptions(item).find(option => String(option.id) === String(selection.productId));
    return product ? { ...selection, product } : null;
  }

  function mergedCart() {
    const cart = {};
    Object.entries(runtime.baseCart || {}).forEach(([id, qty]) => {
      const amount = Math.max(0, parseInt(qty, 10) || 0);
      if (amount > 0) cart[String(id)] = amount;
    });
    Object.values(runtime.selections).forEach(selection => {
      const amount = Math.max(0, parseInt(selection?.qty, 10) || 0);
      if (selection?.productId && amount > 0) cart[String(selection.productId)] = amount;
    });
    return cart;
  }

  function mergedOrder(cart) {
    const order = [];
    [...runtime.baseOrder, ...Object.keys(cart)].forEach(id => {
      const key = String(id);
      if (Number(cart[key] || 0) > 0 && !order.includes(key)) order.push(key);
    });
    return order;
  }

  function productByAnyId(id) {
    const found = runtime.maps.get(norm(id));
    if (found) return found;
    for (const item of allItems()) {
      const product = itemOptions(item).find(option => String(option.id) === String(id));
      if (product) return product;
    }
    return null;
  }

  function cartStats(cart) {
    let count = 0;
    let total = 0;
    Object.entries(cart).forEach(([id, qty]) => {
      const amount = Math.max(0, parseInt(qty, 10) || 0);
      if (!amount) return;
      count += amount;
      const product = productByAnyId(id);
      if (product) total += amount * Number(product.preco || 0);
    });
    return { count, total };
  }

  function persistCart() {
    const cart = mergedCart();
    const envelope = {
      ...(runtime.savedEnvelope || {}),
      savedAt: Date.now(),
      cart,
      cartOrder: mergedOrder(cart),
      basketCustomizations: runtime.savedEnvelope?.basketCustomizations || {},
      basketDrafts: runtime.savedEnvelope?.basketDrafts || {}
    };
    runtime.savedEnvelope = envelope;
    localStorage.setItem(CART_KEY, JSON.stringify(envelope));
    updateExternalCartUI(cart);
    return envelope;
  }

  function updateExternalCartUI(cart) {
    const stats = cartStats(cart || mergedCart());
    const countText = String(stats.count);
    const totalText = money(stats.total);
    const countLabel = `${stats.count} ${stats.count === 1 ? 'item' : 'itens'}`;
    const setText = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };
    setText('bottom-total', totalText);
    setText('header-cart-total', totalText);
    setText('menu-cart-total', totalText);
    setText('drawer-subtitle', countLabel);
    setText('menu-cart-count', countLabel);
    ['cart-badge', 'header-cart-count'].forEach(id => {
      const element = document.getElementById(id);
      if (!element) return;
      element.textContent = countText;
      element.style.display = stats.count > 0 ? 'flex' : 'none';
    });
    const bottom = document.getElementById('bottom-cta');
    if (bottom) {
      bottom.disabled = stats.count <= 0;
      const small = bottom.querySelector('small');
      if (small) small.textContent = stats.count > 0 ? 'Ver compra' : 'Monte a compra';
    }
  }

  function selectedStats() {
    let items = 0;
    let units = 0;
    let total = 0;
    allItems().forEach(item => {
      const selection = selectionFor(item);
      if (!selection || selection.qty <= 0) return;
      items += 1;
      units += selection.qty;
      total += selection.qty * Number(selection.product.preco || 0);
    });
    return { items, units, total };
  }

  function suggestedQty(item) {
    return Math.max(1, parseInt(item?.quantidadesSugeridas?.[runtime.profile], 10) || 1);
  }

  function chooseProduct(itemId, productId, quantity) {
    const item = allItems().find(entry => String(entry.id) === String(itemId));
    if (!item) return;
    const product = itemOptions(item).find(option => String(option.id) === String(productId));
    if (!product || !productAvailable(product)) return;
    const stock = Math.max(0, Number(product.estoque || 0));
    const qty = Math.min(stock, Math.max(1, parseInt(quantity, 10) || suggestedQty(item)));
    runtime.selections[item.id] = { productId: String(product.id), qty };
    persistCart();
    renderQuickPage({ preserveScroll: true, focusItem: item.id });
  }

  function changeQty(itemId, delta) {
    const item = allItems().find(entry => String(entry.id) === String(itemId));
    const selection = item ? selectionFor(item) : null;
    if (!item || !selection) return;
    const max = Math.max(0, Number(selection.product.estoque || 0));
    const next = Math.max(0, Math.min(max, Number(selection.qty || 0) + Number(delta || 0)));
    if (next <= 0) delete runtime.selections[item.id];
    else runtime.selections[item.id] = { productId: selection.productId, qty: next };
    persistCart();
    renderQuickPage({ preserveScroll: true, focusItem: item.id });
  }

  function addEssentialSuggestion() {
    allItems().forEach(item => {
      if (item.essencial === false) return;
      const options = itemOptions(item).filter(productAvailable);
      const preferred = options.find(product => String(product.id) === String(item.produtoPadraoId)) || options[0];
      if (!preferred) return;
      runtime.selections[item.id] = {
        productId: String(preferred.id),
        qty: Math.min(Number(preferred.estoque || 0), suggestedQty(item))
      };
    });
    persistCart();
    renderQuickPage({ preserveScroll: false });
  }

  function clearQuickSelections() {
    runtime.selections = {};
    persistCart();
    renderQuickPage({ preserveScroll: false });
  }

  function profileHtml() {
    const profiles = runtime.config?.perfis || [];
    return `<div class="da-quick-profiles" role="radiogroup" aria-label="Tamanho da casa">
      ${profiles.map(profile => `<button type="button" class="da-quick-profile${String(profile.id) === String(runtime.profile) ? ' active' : ''}" data-quick-profile="${escapeHtml(profile.id)}" role="radio" aria-checked="${String(profile.id) === String(runtime.profile)}"><strong>${escapeHtml(profile.titulo)}</strong><span>${escapeHtml(profile.descricao || '')}</span></button>`).join('')}
    </div>`;
  }

  function productOptionHtml(item, product, selected) {
    const unavailable = !productAvailable(product);
    const selectedClass = selected && String(selected.productId) === String(product.id) ? ' selected' : '';
    const selectedQty = selectedClass ? Number(selected.qty || 0) : suggestedQty(item);
    return `<article class="da-quick-option${selectedClass}${unavailable ? ' unavailable' : ''}">
      <div class="da-quick-option-image"><img loading="lazy" decoding="async" src="${escapeHtml(product.imagem || 'img/logoantonia5.png')}" alt="${escapeHtml(product.nome)}" onerror="this.onerror=null;this.src='img/logoantonia5.png'"></div>
      <div class="da-quick-option-copy">
        <strong>${escapeHtml(product.nome)}</strong>
        <span>${escapeHtml([product.marca, product.embalagem].filter(Boolean).join(' · '))}</span>
        <div class="da-quick-option-price">${money(product.preco)}</div>
        <small>${unavailable ? 'Indisponível agora' : `${product.estoque} em estoque`}</small>
      </div>
      <button type="button" data-quick-choose="${escapeHtml(item.id)}" data-product-id="${escapeHtml(product.id)}" data-qty="${selectedQty}" ${unavailable ? 'disabled' : ''}>${selectedClass ? 'Escolhido' : 'Escolher'}</button>
    </article>`;
  }

  function itemHtml(item, index) {
    const selected = selectionFor(item);
    const options = itemOptions(item);
    const availableOptions = options.filter(productAvailable);
    const summary = selected
      ? `<span class="da-quick-item-current"><strong>${escapeHtml(selected.product.nome)}</strong><small>${selected.qty} un. · ${money(selected.qty * Number(selected.product.preco || 0))}</small></span>`
      : `<span class="da-quick-item-current empty"><strong>Ainda não escolhido</strong><small>${availableOptions.length} ${availableOptions.length === 1 ? 'opção disponível' : 'opções disponíveis'}</small></span>`;
    return `<details class="da-quick-item" data-quick-item="${escapeHtml(item.id)}" ${index === 0 ? 'open' : ''}>
      <summary>
        <span class="da-quick-item-number">${index + 1}</span>
        <span class="da-quick-item-title"><strong>${escapeHtml(item.titulo)}</strong><small>${escapeHtml(item.descricao || '')}</small></span>
        ${summary}
        <span class="da-quick-item-arrow" aria-hidden="true">⌄</span>
      </summary>
      <div class="da-quick-item-body">
        ${selected ? `<div class="da-quick-selected-row"><span>Quantidade escolhida</span><div class="da-quick-qty"><button type="button" data-quick-qty="-1" data-item-id="${escapeHtml(item.id)}" aria-label="Diminuir">−</button><strong>${selected.qty}</strong><button type="button" data-quick-qty="1" data-item-id="${escapeHtml(item.id)}" aria-label="Aumentar">+</button></div></div>` : ''}
        <div class="da-quick-options">${options.map(product => productOptionHtml(item, product, selected)).join('')}</div>
      </div>
    </details>`;
  }

  function sectionHtml(section) {
    const items = (section.itens || []).filter(item => item?.ativo !== false).sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
    const chosen = items.filter(item => selectionFor(item)).length;
    return `<section class="da-quick-section">
      <div class="da-quick-section-head"><div><h2>${escapeHtml(section.titulo)}</h2><p>${escapeHtml(section.descricao || '')}</p></div><span>${chosen}/${items.length}</span></div>
      <div class="da-quick-items">${items.map(itemHtml).join('')}</div>
    </section>`;
  }

  function quickPageHtml() {
    const sections = (runtime.config?.secoes || []).filter(section => section?.ativo !== false).sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
    const stats = selectedStats();
    const totalItems = allItems().length;
    return `<div class="container da-quick-page">
      <header class="da-quick-header">
        <a href="#/" class="da-quick-back" data-quick-leave="#/" aria-label="Voltar para o início">‹</a>
        <div><span>COMPRA DO MÊS</span><h1>${escapeHtml(runtime.config?.titulo || 'Compra Rápida')}</h1><p>${escapeHtml(runtime.config?.subtitulo || 'Escolha só o que precisa.')}</p></div>
      </header>
      <section class="da-quick-intro">
        <div class="da-quick-intro-copy"><strong>Para quantas pessoas?</strong><span>Usamos isso apenas para sugerir quantidades. Você pode alterar tudo.</span></div>
        ${profileHtml()}
        <div class="da-quick-intro-actions"><button type="button" class="primary" data-quick-suggest>Adicionar sugestão essencial</button><button type="button" data-quick-clear>Limpar esta lista</button></div>
      </section>
      <div class="da-quick-progress"><div><span style="width:${totalItems ? Math.min(100, Math.round(stats.items / totalItems * 100)) : 0}%"></span></div><small>${stats.items} de ${totalItems} tipos escolhidos. Finalize quando quiser.</small></div>
      ${sections.map(sectionHtml).join('')}
      <div class="da-quick-bottom-space" aria-hidden="true"></div>
      <aside class="da-quick-sticky" aria-label="Resumo da compra rápida">
        <div><small>${stats.items} tipos · ${stats.units} unidades</small><strong>${money(stats.total)}</strong></div>
        <button type="button" data-quick-cart ${stats.units ? '' : 'disabled'}>Ver sacola</button>
        <button type="button" class="primary" data-quick-checkout ${stats.units ? '' : 'disabled'}>Finalizar compra</button>
      </aside>
    </div>`;
  }

  function renderLoading() {
    if (!app || !isQuickRoute()) return;
    app.innerHTML = `<div class="container da-quick-loading"><div class="da-quick-spinner"></div><strong>Preparando sua compra rápida…</strong><span>Carregando produtos e quantidades.</span></div>`;
  }

  function renderError(message) {
    if (!app || !isQuickRoute()) return;
    app.innerHTML = `<div class="container da-quick-loading"><strong>Não foi possível abrir a Compra Rápida</strong><span>${escapeHtml(message || 'Tente novamente.')}</span><button type="button" onclick="location.reload()">Tentar novamente</button><a href="#/">Voltar ao início</a></div>`;
  }

  function renderQuickPage(options) {
    if (!app || !isQuickRoute() || !runtime.loaded || runtime.rendering) return;
    runtime.rendering = true;
    const previousScroll = app.scrollTop;
    const openIds = new Set(Array.from(app.querySelectorAll('.da-quick-item[open]')).map(element => element.dataset.quickItem));
    app.innerHTML = quickPageHtml();
    openIds.forEach(id => {
      const element = app.querySelector(`[data-quick-item="${CSS.escape(id)}"]`);
      if (element) element.open = true;
    });
    if (options?.focusItem) {
      const element = app.querySelector(`[data-quick-item="${CSS.escape(options.focusItem)}"]`);
      if (element) element.open = true;
    }
    if (options?.preserveScroll) app.scrollTop = previousScroll;
    else app.scrollTop = 0;
    runtime.rendering = false;
  }

  function isQuickRoute() {
    const clean = String(location.hash || '#/')
      .replace(/^#\/?/, '')
      .split('?')[0]
      .replace(/^\/+|\/+$/g, '');
    return clean === 'compra-rapida';
  }

  function leaveQuick(target, openCart) {
    persistCart();
    if (openCart) sessionStorage.setItem(OPEN_CART_KEY, '1');
    history.replaceState(null, '', target || '#/');
    location.reload();
  }

  function updateHomeEntry() {
    if (!app || isQuickRoute()) return;
    const home = app.querySelector('.da-home-profit');
    if (!home) return;

    const existingLink = home.querySelector('a[href="#/rotina/compra-mes"]');
    if (existingLink) {
      existingLink.setAttribute('href', '#/compra-rapida');
      const title = existingLink.querySelector('strong');
      const copy = existingLink.querySelector('span:not(.quick-thumb), small');
      if (title) title.textContent = 'Compra rápida';
      if (copy) copy.textContent = 'Monte sua lista em poucos minutos';
    }

    if (home.querySelector('[data-da-quick-home]')) return;
    const section = document.createElement('section');
    section.className = 'da-quick-home-card';
    section.setAttribute('data-da-quick-home', '');
    section.innerHTML = `<div class="da-quick-home-copy"><span>COMPRA DO MÊS SEM ENROLAÇÃO</span><h2>Faça sua Compra Rápida</h2><p>Escolha arroz, feijão, limpeza, higiene e outros itens em uma lista simples. Você pode finalizar a qualquer momento.</p><a href="#/compra-rapida">Começar minha compra</a></div><div class="da-quick-home-steps"><strong>1</strong><span>Escolha o tamanho da casa</span><strong>2</strong><span>Marque produtos e quantidades</span><strong>3</strong><span>Finalize pelo mesmo checkout</span></div>`;
    const anchor = home.querySelector('.da-payment-notices') || home.querySelector('[data-home-section="purchase-journey"]');
    if (anchor?.parentNode) anchor.insertAdjacentElement('afterend', section);
    else home.prepend(section);
  }

  function injectStyles() {
    if (document.getElementById('da-quick-styles')) return;
    const style = document.createElement('style');
    style.id = 'da-quick-styles';
    style.textContent = `
      .da-quick-home-card{margin-top:18px;padding:22px;border-radius:26px;background:linear-gradient(135deg,#123d28,#1b6b42);color:#fff;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(240px,.75fr);gap:24px;box-shadow:0 18px 45px rgba(20,83,45,.18);overflow:hidden}.da-quick-home-copy>span{display:block;font-size:11px;font-weight:950;letter-spacing:.12em;color:#bbf7d0;margin-bottom:8px}.da-quick-home-copy h2{font-size:27px;line-height:1.05;letter-spacing:-.04em}.da-quick-home-copy p{margin-top:10px;max-width:640px;color:rgba(255,255,255,.82);font-size:14px;line-height:1.5;font-weight:650}.da-quick-home-copy a{display:inline-flex;margin-top:16px;min-height:44px;align-items:center;padding:0 18px;border-radius:999px;background:#fff;color:#14532d;font-size:14px;font-weight:950}.da-quick-home-steps{display:grid;grid-template-columns:34px 1fr;gap:10px;align-content:center}.da-quick-home-steps strong{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.24)}.da-quick-home-steps span{align-self:center;font-size:13px;font-weight:800;color:rgba(255,255,255,.9)}
      .da-quick-page{max-width:980px}.da-quick-header{display:flex;gap:14px;align-items:flex-start;margin:2px 0 14px}.da-quick-back{width:42px;height:42px;display:flex;align-items:center;justify-content:center;border:1px solid var(--line,#e5e7eb);border-radius:50%;background:#fff;font-size:30px;line-height:1}.da-quick-header>div>span{display:block;color:#15803d;font-size:10px;font-weight:950;letter-spacing:.12em}.da-quick-header h1{font-size:27px;line-height:1.05;letter-spacing:-.045em;margin-top:3px}.da-quick-header p{margin-top:5px;color:var(--muted,#667085);font-size:13px;font-weight:700}.da-quick-intro{padding:18px;border:1px solid var(--line,#e5e7eb);border-radius:24px;background:#fff;box-shadow:0 8px 24px rgba(16,24,40,.06)}.da-quick-intro-copy{display:flex;flex-direction:column;gap:3px}.da-quick-intro-copy strong{font-size:17px}.da-quick-intro-copy span{font-size:12px;color:var(--muted,#667085);font-weight:650}.da-quick-profiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.da-quick-profile{padding:11px;border:1px solid #d0d5dd;border-radius:15px;background:#fff;text-align:left}.da-quick-profile strong,.da-quick-profile span{display:block}.da-quick-profile strong{font-size:13px}.da-quick-profile span{margin-top:3px;color:#667085;font-size:10.5px;line-height:1.25}.da-quick-profile.active{border-color:#15803d;background:#ecfdf3;box-shadow:0 0 0 2px rgba(22,163,74,.12)}.da-quick-intro-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.da-quick-intro-actions button,.da-quick-loading button{min-height:40px;padding:0 14px;border:1px solid #d0d5dd;border-radius:12px;background:#fff;font-size:12px;font-weight:900}.da-quick-intro-actions button.primary{border-color:#14532d;background:#14532d;color:#fff}.da-quick-progress{margin:14px 2px 8px}.da-quick-progress>div{height:7px;border-radius:999px;background:#e5e7eb;overflow:hidden}.da-quick-progress>div span{display:block;height:100%;border-radius:inherit;background:#16a34a}.da-quick-progress small{display:block;margin-top:6px;color:#667085;font-size:11px;font-weight:750}.da-quick-section{margin-top:15px}.da-quick-section-head{display:flex;justify-content:space-between;align-items:flex-end;padding:0 3px 8px;gap:12px}.da-quick-section-head h2{font-size:19px;letter-spacing:-.03em}.da-quick-section-head p{margin-top:3px;color:#667085;font-size:12px;font-weight:650}.da-quick-section-head>span{padding:5px 9px;border-radius:999px;background:#ecfdf3;color:#166534;font-size:11px;font-weight:900}.da-quick-items{display:grid;gap:8px}.da-quick-item{border:1px solid #e5e7eb;border-radius:18px;background:#fff;overflow:hidden}.da-quick-item[open]{border-color:#bbd9c5;box-shadow:0 8px 24px rgba(16,24,40,.055)}.da-quick-item summary{list-style:none;display:grid;grid-template-columns:32px minmax(125px,1fr) minmax(135px,.9fr) 20px;gap:10px;align-items:center;padding:12px;cursor:pointer}.da-quick-item summary::-webkit-details-marker{display:none}.da-quick-item-number{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#f2f4f7;color:#475467;font-size:11px;font-weight:950}.da-quick-item-title strong,.da-quick-item-title small,.da-quick-item-current strong,.da-quick-item-current small{display:block}.da-quick-item-title strong{font-size:14px}.da-quick-item-title small{margin-top:3px;color:#667085;font-size:10.5px;line-height:1.25}.da-quick-item-current{text-align:right}.da-quick-item-current strong{font-size:11.5px;line-height:1.2}.da-quick-item-current small{margin-top:3px;color:#15803d;font-size:10.5px;font-weight:850}.da-quick-item-current.empty strong{color:#667085}.da-quick-item-current.empty small{color:#98a2b3}.da-quick-item-arrow{font-size:20px;color:#98a2b3;transition:transform .2s}.da-quick-item[open] .da-quick-item-arrow{transform:rotate(180deg)}.da-quick-item-body{padding:0 12px 12px;border-top:1px solid #f0f2f5}.da-quick-selected-row{display:flex;align-items:center;justify-content:space-between;padding:10px 1px 7px;color:#475467;font-size:11px;font-weight:850}.da-quick-qty{display:flex;align-items:center;gap:9px}.da-quick-qty button{width:30px;height:30px;border-radius:50%;background:#14532d;color:#fff;font-size:18px;font-weight:900}.da-quick-qty strong{min-width:22px;text-align:center;color:#101828;font-size:14px}.da-quick-options{display:flex;gap:8px;overflow-x:auto;padding:3px 1px 4px;scroll-snap-type:x proximity}.da-quick-options::-webkit-scrollbar{display:none}.da-quick-option{min-width:215px;flex:0 0 215px;scroll-snap-align:start;display:grid;grid-template-columns:62px 1fr;grid-template-rows:auto auto;gap:8px;padding:9px;border:1px solid #e5e7eb;border-radius:15px;background:#fff}.da-quick-option.selected{border-color:#16a34a;background:#f0fdf4}.da-quick-option.unavailable{opacity:.55}.da-quick-option-image{width:62px;height:62px;border-radius:12px;background:#f8fafc;display:flex;align-items:center;justify-content:center}.da-quick-option-image img{width:100%;height:100%;object-fit:contain;padding:5px}.da-quick-option-copy{min-width:0}.da-quick-option-copy strong{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:11.5px;line-height:1.25}.da-quick-option-copy span,.da-quick-option-copy small{display:block;margin-top:3px;color:#667085;font-size:9.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.da-quick-option-price{margin-top:5px;font-size:15px;font-weight:950}.da-quick-option>button{grid-column:1/-1;min-height:34px;border-radius:10px;background:#14532d;color:#fff;font-size:11px;font-weight:950}.da-quick-option.selected>button{background:#16a34a}.da-quick-option>button:disabled{background:#98a2b3}.da-quick-bottom-space{height:104px}.da-quick-sticky{position:fixed;left:50%;bottom:calc(var(--bottom-h,78px) + env(safe-area-inset-bottom) + 8px);z-index:35;transform:translateX(-50%);width:min(950px,calc(100% - 24px));display:grid;grid-template-columns:minmax(130px,1fr) auto auto;gap:8px;align-items:center;padding:10px;border:1px solid #d0d5dd;border-radius:19px;background:rgba(255,255,255,.96);backdrop-filter:blur(18px);box-shadow:0 16px 44px rgba(16,24,40,.18)}.da-quick-sticky>div small,.da-quick-sticky>div strong{display:block}.da-quick-sticky>div small{color:#667085;font-size:10.5px;font-weight:800}.da-quick-sticky>div strong{margin-top:2px;font-size:19px}.da-quick-sticky button{height:42px;padding:0 14px;border:1px solid #d0d5dd;border-radius:12px;background:#fff;font-size:12px;font-weight:950}.da-quick-sticky button.primary{border-color:#14532d;background:#14532d;color:#fff}.da-quick-sticky button:disabled{opacity:.45}.da-quick-loading{min-height:55vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:8px}.da-quick-loading strong{font-size:18px}.da-quick-loading span{color:#667085;font-size:13px}.da-quick-loading a{color:#14532d;font-weight:900}.da-quick-spinner{width:32px;height:32px;border:3px solid #d1fae5;border-top-color:#15803d;border-radius:50%;animation:daQuickSpin .8s linear infinite}@keyframes daQuickSpin{to{transform:rotate(360deg)}}
      @media(max-width:700px){.da-quick-home-card{grid-template-columns:1fr;padding:18px}.da-quick-home-steps{display:none}.da-quick-profiles{grid-template-columns:1fr}.da-quick-profile{display:grid;grid-template-columns:105px 1fr;align-items:center}.da-quick-profile span{margin-top:0}.da-quick-item summary{grid-template-columns:30px minmax(0,1fr) 18px}.da-quick-item-current{grid-column:2/3;text-align:left;margin-top:-4px}.da-quick-item-arrow{grid-column:3;grid-row:1/3}.da-quick-sticky{grid-template-columns:1fr 1fr;bottom:calc(var(--bottom-h,78px) + env(safe-area-inset-bottom) + 6px)}.da-quick-sticky>div{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between}.da-quick-sticky>div strong{margin-top:0}.da-quick-sticky button{padding:0 8px}.da-quick-option{min-width:205px;flex-basis:205px}}
      @media(min-width:1000px){.da-quick-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));overflow:visible}.da-quick-option{min-width:0;flex:none}}
    `;
    document.head.appendChild(style);
  }

  function bindEvents() {
    document.addEventListener('click', event => {
      const profile = event.target.closest('[data-quick-profile]');
      if (profile) {
        runtime.profile = profile.dataset.quickProfile;
        localStorage.setItem(PROFILE_KEY, runtime.profile);
        renderQuickPage({ preserveScroll: true });
        return;
      }
      const choose = event.target.closest('[data-quick-choose]');
      if (choose) {
        chooseProduct(choose.dataset.quickChoose, choose.dataset.productId, choose.dataset.qty);
        return;
      }
      const qty = event.target.closest('[data-quick-qty]');
      if (qty) {
        changeQty(qty.dataset.itemId, Number(qty.dataset.quickQty || 0));
        return;
      }
      if (event.target.closest('[data-quick-suggest]')) {
        addEssentialSuggestion();
        return;
      }
      if (event.target.closest('[data-quick-clear]')) {
        clearQuickSelections();
        return;
      }
      if (event.target.closest('[data-quick-cart], [data-quick-checkout]')) {
        leaveQuick('#/', true);
        return;
      }
    });

    document.addEventListener('click', event => {
      if (!isQuickRoute()) return;
      const cartButton = event.target.closest('#bottom-cta,#nav-cart,#header-cart-btn,#menu-open-checkout');
      if (cartButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        leaveQuick('#/', true);
        return;
      }
      const link = event.target.closest('a[href^="#/"]');
      if (!link || link.closest('.da-quick-item')) return;
      const target = link.getAttribute('href');
      if (!target || target === '#/compra-rapida') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      leaveQuick(target, false);
    }, true);
  }

  async function boot() {
    if (!app) return;
    injectStyles();
    bindEvents();

    const observer = new MutationObserver(() => {
      if (isQuickRoute()) {
        if (runtime.loaded && !app.querySelector('.da-quick-page') && !runtime.rendering) renderQuickPage();
      } else {
        updateHomeEntry();
      }
    });
    observer.observe(app, { childList: true, subtree: true });

    window.addEventListener('hashchange', () => {
      setTimeout(() => {
        if (isQuickRoute()) {
          if (runtime.loaded) renderQuickPage();
          else renderLoading();
        } else updateHomeEntry();
      }, 0);
    });

    if (isQuickRoute()) renderLoading();

    try {
      const [config, catalog] = await Promise.all([
        firstJson(CONFIG_URLS, data => data && Array.isArray(data.secoes)),
        firstJson(CATALOG_URLS, data => data && typeof data === 'object').catch(() => ({}))
      ]);
      runtime.config = config;
      buildCatalog(catalog);
      if (!(runtime.config?.perfis || []).some(profile => String(profile.id) === String(runtime.profile))) {
        runtime.profile = runtime.config?.perfilPadrao || '3-4';
      }
      initializeCartDraft();
      runtime.loaded = true;
      persistCart();

      if (isQuickRoute()) renderQuickPage();
      else updateHomeEntry();

      if (sessionStorage.getItem(OPEN_CART_KEY) === '1') {
        sessionStorage.removeItem(OPEN_CART_KEY);
        setTimeout(() => {
          const button = document.getElementById('nav-cart') || document.getElementById('bottom-cta');
          if (button) button.click();
        }, 250);
      }
    } catch (error) {
      console.error('Compra Rápida:', error);
      renderError(error?.message || 'Configuração indisponível.');
    }
  }

  boot();
})();
