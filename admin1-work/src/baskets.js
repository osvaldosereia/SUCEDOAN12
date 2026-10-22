const $ = (selector, root = document) => root.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const quantity = value => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const state = { root: null, api: null, isCurrent: () => true, sizes: [], types: [], products: [], tab: 'sizes', query: '', draft: null, timer: null, results: [], saving: false };

function picture(url, label = '') {
  return /^https:\/\//i.test(url || '') || /^data:image\/webp;base64,/i.test(url || '')
    ? `<img src="${escapeHtml(url)}" alt="" loading="lazy">`
    : `<span class="product-placeholder" aria-label="${escapeHtml(label)}">▦</span>`;
}

async function load() {
  if (!state.root || !state.isCurrent()) return;
  state.root.innerHTML = '<div class="loading-card"><span class="spinner" aria-hidden="true"></span><strong>Carregando configuração das cestas…</strong><small>Buscando tamanhos e tipos de produtos do Admin1.</small></div>';
  try {
    const [sizes, types] = await Promise.all([state.api('basket_sizes'), state.api('basket_types')]);
    if (!state.isCurrent()) return;
    state.sizes = sizes.sizes || [];
    state.types = types.types || [];
    render();
  } catch (error) {
    if (!state.isCurrent()) return;
    state.root.innerHTML = `<div class="empty-state"><strong>Não foi possível carregar a configuração</strong><span>${escapeHtml(error.message || 'Tente novamente.')}</span><button class="button secondary" id="retryBaskets" type="button">Tentar novamente</button></div>`;
    $('#retryBaskets', state.root)?.addEventListener('click', load);
  }
}

function renderSizes() {
  const ordered = [...state.sizes].sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
  return `<section class="panel basket-config-panel"><div class="basket-config-intro"><div><h2>Tamanhos de cesta</h2><p>Organize os tamanhos usados para definir a composição de cada cesta.</p></div><button class="button primary" id="newBasketSize" type="button">+ Novo tamanho</button></div>
    ${ordered.length ? `<div class="basket-size-list">${ordered.map((size, index) => `<article class="basket-size-row ${size.active ? '' : 'is-archived'}"><span class="basket-size-grip" aria-hidden="true">⠿</span><div class="basket-size-name"><strong>${escapeHtml(size.name)}</strong><small>${size.active ? 'Disponível para composição' : 'Arquivado · não aparece em novas composições'}</small></div><span class="status-pill ${size.active ? 'good' : 'muted'}"><i aria-hidden="true"></i>${size.active ? 'Ativo' : 'Arquivado'}</span><div class="basket-size-actions"><button class="icon-button" type="button" data-size-move="${escapeHtml(size.id)}" data-direction="-1" ${index === 0 ? 'disabled' : ''} aria-label="Mover ${escapeHtml(size.name)} para cima">↑</button><button class="icon-button" type="button" data-size-move="${escapeHtml(size.id)}" data-direction="1" ${index === ordered.length - 1 ? 'disabled' : ''} aria-label="Mover ${escapeHtml(size.name)} para baixo">↓</button><button class="text-button" type="button" data-size-edit="${escapeHtml(size.id)}">Editar</button><button class="text-button" type="button" data-size-toggle="${escapeHtml(size.id)}" data-next="${size.active ? 'false' : 'true'}">${size.active ? 'Remover' : 'Reativar'}</button></div></article>`).join('')}</div>` : '<div class="empty-state"><strong>Nenhum tamanho cadastrado</strong><span>Crie o primeiro tamanho para organizar as quantidades.</span></div>'}
    <div class="panel-foot"><span>Remover arquiva o tamanho e preserva as quantidades já configuradas.</span></div></section>`;
}

function productSummary(type) {
  const products = (type.products || []).map(link => link.product).filter(Boolean);
  return products.slice(0, 3).map(product => escapeHtml(product.name)).join(' · ') + (products.length > 3 ? ` · +${products.length - 3}` : '') || 'Nenhum produto vinculado';
}

function renderTypes() {
  const filtered = state.types.filter(type => !state.query || type.name.toLocaleLowerCase('pt-BR').includes(state.query.toLocaleLowerCase('pt-BR')) || (type.products || []).some(link => link.product?.name?.toLocaleLowerCase('pt-BR').includes(state.query.toLocaleLowerCase('pt-BR'))));
  return `<section class="panel basket-config-panel"><div class="basket-config-intro"><div><h2>Tipos de produtos</h2><p>Defina quais produtos pertencem a cada tipo e quantos entram em cada tamanho.</p></div><button class="button primary" id="newBasketType" type="button">+ Novo tipo</button></div>
    <div class="panel-toolbar products-toolbar"><label class="search-wrap"><span aria-hidden="true">⌕</span><input id="basketTypeSearch" type="search" placeholder="Buscar tipo ou produto" autocomplete="off" value="${escapeHtml(state.query)}" aria-label="Buscar tipos de produtos"></label></div>
    ${filtered.length ? `<div class="basket-type-list">${filtered.map(type => `<article class="basket-type-card"><div class="basket-type-heading"><div class="basket-type-mark" aria-hidden="true">≡</div><div class="basket-type-title"><strong>${escapeHtml(type.name)}</strong><small>${(type.products || []).length} ${(type.products || []).length === 1 ? 'produto' : 'produtos'} · ${type.active ? 'Ativo' : 'Arquivado'}</small></div><span class="status-pill ${type.active ? 'good' : 'muted'}"><i aria-hidden="true"></i>${type.active ? 'Ativo' : 'Arquivado'}</span><button class="button secondary basket-type-edit" type="button" data-type-edit="${escapeHtml(type.id)}">Editar configuração</button></div><div class="basket-type-products">${productSummary(type)}</div><div class="basket-type-quantities">${state.sizes.filter(size => size.active).map(size => `<span><small>${escapeHtml(size.name)}</small><b>${quantity(type.quantities?.[size.id] || 0)}</b></span>`).join('') || '<small>Cadastre um tamanho ativo para configurar quantidades.</small>'}</div></article>`).join('')}</div>` : `<div class="empty-state"><strong>${state.query ? 'Nenhum tipo encontrado' : 'Nenhum tipo de produto cadastrado'}</strong><span>${state.query ? 'Tente outro nome ou produto.' : 'Comece criando um tipo, como Arroz, Feijão ou Óleo.'}</span></div>`}
    <div class="panel-foot"><span>A ordem dos produtos dentro de cada tipo será usada quando a loja pública for construída.</span></div></section>`;
}

function render() {
  const activeSizes = state.sizes.filter(size => size.active).length;
  const activeTypes = state.types.filter(type => type.active).length;
  state.root.innerHTML = `<div class="page-heading"><div><span class="eyebrow">GESTÃO DE CESTAS</span><h1>Cestas</h1><p>Configure os tamanhos e os produtos que formam cada tipo.</p></div><button class="button secondary" id="refreshBasketConfig" type="button">↻ Atualizar</button></div>
    <section class="metric-row product-metrics basket-metrics"><article class="metric-card"><span>Tamanhos ativos</span><strong>${activeSizes}</strong><small>${state.sizes.length} cadastrados</small></article><article class="metric-card"><span>Tipos ativos</span><strong>${activeTypes}</strong><small>${state.types.length} cadastrados</small></article><article class="metric-card"><span>Produtos vinculados</span><strong>${new Set(state.types.flatMap(type => (type.products || []).map(link => link.product_id))).size}</strong><small>No catálogo Admin1</small></article></section>
    <nav class="basket-tabs" aria-label="Configuração de cestas"><button type="button" data-basket-tab="sizes" class="${state.tab === 'sizes' ? 'active' : ''}" aria-selected="${state.tab === 'sizes'}">Tamanhos <span>${activeSizes}</span></button><button type="button" data-basket-tab="types" class="${state.tab === 'types' ? 'active' : ''}" aria-selected="${state.tab === 'types'}">Tipos de produtos <span>${activeTypes}</span></button></nav>
    ${state.tab === 'sizes' ? renderSizes() : renderTypes()}`;
  $('#refreshBasketConfig', state.root).addEventListener('click', load);
  state.root.querySelectorAll('[data-basket-tab]').forEach(button => button.addEventListener('click', () => { state.tab = button.dataset.basketTab; state.query = ''; render(); }));
  $('#newBasketSize', state.root)?.addEventListener('click', () => openSizeEditor());
  state.root.querySelectorAll('[data-size-edit]').forEach(button => button.addEventListener('click', () => openSizeEditor(state.sizes.find(size => size.id === button.dataset.sizeEdit))));
  state.root.querySelectorAll('[data-size-toggle]').forEach(button => button.addEventListener('click', async () => {
    const size = state.sizes.find(item => item.id === button.dataset.sizeToggle); if (!size) return;
    button.disabled = true;
    try { await state.api('save_basket_size', { size: { ...size, active: button.dataset.next === 'true' } }); await load(); }
    catch (error) { alert(error.message || 'Não foi possível atualizar o tamanho.'); button.disabled = false; }
  }));
  state.root.querySelectorAll('[data-size-move]').forEach(button => button.addEventListener('click', () => moveSize(button.dataset.sizeMove, Number(button.dataset.direction))));
  $('#newBasketType', state.root)?.addEventListener('click', () => openTypeEditor());
  state.root.querySelectorAll('[data-type-edit]').forEach(button => button.addEventListener('click', async () => {
    try { const result = await state.api('basket_type_detail', { id: button.dataset.typeEdit }); openTypeEditor(result.type); }
    catch (error) { alert(error.message || 'Não foi possível abrir o tipo.'); }
  }));
  $('#basketTypeSearch', state.root)?.addEventListener('input', event => { state.query = event.currentTarget.value.trim(); renderTypesOnly(); });
}

function renderTypesOnly() {
  const pane = state.root.querySelector('.basket-config-panel'); if (!pane) return;
  const next = renderTypes();
  const wrapper = document.createElement('div'); wrapper.innerHTML = next;
  pane.replaceWith(wrapper.firstElementChild);
  state.root.querySelectorAll('[data-type-edit]').forEach(button => button.addEventListener('click', async () => {
    try { const result = await state.api('basket_type_detail', { id: button.dataset.typeEdit }); openTypeEditor(result.type); }
    catch (error) { alert(error.message || 'Não foi possível abrir o tipo.'); }
  }));
  $('#basketTypeSearch', state.root)?.addEventListener('input', event => { state.query = event.currentTarget.value.trim(); renderTypesOnly(); });
}

async function moveSize(id, direction) {
  const ordered = [...state.sizes].sort((a, b) => a.sort_order - b.sort_order);
  const index = ordered.findIndex(item => item.id === id), nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;
  [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
  try {
    await state.api('reorder_basket_sizes', { ids: ordered.map(item => item.id) });
    await load();
  } catch (error) { alert(error.message || 'Não foi possível reordenar os tamanhos.'); }
}

function openSizeEditor(size = {}) {
  const dialog = $('#productDialog');
  $('#productDialogTitle').textContent = size.id ? 'Editar tamanho' : 'Novo tamanho';
  $('#productDialogFoot').innerHTML = '<span class="readonly-badge"><i aria-hidden="true"></i>Admin1 · banco separado</span>';
  $('#productDialogContent').innerHTML = `<form id="basketSizeForm" class="product-editor-form"><div class="draft-warning"><strong>Tamanhos de cesta</strong><span>Os tamanhos definem as colunas de quantidade na configuração dos tipos.</span></div><label class="editor-field"><span>Nome do tamanho <b>*</b></span><input name="name" maxlength="60" required value="${escapeHtml(size.name || '')}" placeholder="Ex.: Econômica"></label><p id="basketSizeError" class="draft-save-error" role="alert" hidden></p><div class="draft-bottom"><span>Use nomes claros e fáceis de reconhecer.</span><div><button class="button secondary" type="button" id="cancelBasketSize">Cancelar</button> <button class="button primary" type="submit">Salvar tamanho</button></div></div></form>`;
  if (!dialog.open) dialog.showModal();
  $('#cancelBasketSize').addEventListener('click', () => dialog.close());
  $('#basketSizeForm').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, submit = form.querySelector('[type="submit"]'), error = $('#basketSizeError');
    submit.disabled = true; error.hidden = true;
    try {
      const ordered = [...state.sizes].sort((a, b) => a.sort_order - b.sort_order);
      await state.api('save_basket_size', { size: { id: size.id, name: new FormData(form).get('name'), sort_order: size.sort_order ?? ordered.length, active: size.active ?? true } });
      dialog.close(); await load();
    } catch (cause) { error.textContent = cause.message || 'Não foi possível salvar o tamanho.'; error.hidden = false; submit.disabled = false; }
  });
}

function renderSelectedProducts() {
  const root = $('#basketTypeSelected'); if (!root) return;
  root.innerHTML = state.draft.products.length ? state.draft.products.map((product, index) => `<article class="basket-selected-product"><span class="basket-selected-order">${index + 1}</span><span class="basket-selected-image">${picture(product.image_url, product.name)}</span><span class="basket-selected-name"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml([product.sku && `SKU ${product.sku}`, product.gtin && `EAN ${product.gtin}`, product.category].filter(Boolean).join(' · ') || 'Sem código')}</small></span><div class="basket-selected-actions"><button type="button" class="icon-button" data-product-move="${index}" data-dir="-1" ${index === 0 ? 'disabled' : ''} aria-label="Mover para cima">↑</button><button type="button" class="icon-button" data-product-move="${index}" data-dir="1" ${index === state.draft.products.length - 1 ? 'disabled' : ''} aria-label="Mover para baixo">↓</button><button type="button" class="text-button" data-product-remove="${index}">Remover</button></div></article>`).join('') : '<div class="empty-state basket-empty-composition"><strong>Nenhum produto selecionado</strong><span>Busque no catálogo Admin1 e adicione os produtos deste tipo.</span></div>';
  root.querySelectorAll('[data-product-move]').forEach(button => button.addEventListener('click', () => {
    const from = Number(button.dataset.productMove), to = from + Number(button.dataset.dir);
    if (to < 0 || to >= state.draft.products.length) return;
    [state.draft.products[from], state.draft.products[to]] = [state.draft.products[to], state.draft.products[from]]; renderSelectedProducts();
  }));
  root.querySelectorAll('[data-product-remove]').forEach(button => button.addEventListener('click', () => { state.draft.products.splice(Number(button.dataset.productRemove), 1); renderSelectedProducts(); }));
}

function renderQuantityMatrix() {
  const root = $('#basketQuantityMatrix'); if (!root) return;
  const sizes = state.sizes.filter(size => size.active);
  root.innerHTML = sizes.length ? `<div class="basket-quantity-grid-head"><strong>Tamanho</strong><strong>Quantidade deste tipo</strong></div>${sizes.map(size => `<label class="basket-quantity-grid-row"><span>${escapeHtml(size.name)}</span><input type="number" min="0" step="0.001" inputmode="decimal" data-size-quantity="${escapeHtml(size.id)}" value="${escapeHtml(state.draft.quantities[size.id] ?? 0)}" aria-label="Quantidade de ${escapeHtml(state.draft.name || 'este tipo')} na cesta ${escapeHtml(size.name)}"><small>produtos</small></label>`).join('')}` : '<div class="empty-state basket-empty-composition"><strong>Cadastre ao menos um tamanho ativo</strong><span>Volte à aba Tamanhos para adicionar os tamanhos das cestas.</span></div>';
  root.querySelectorAll('[data-size-quantity]').forEach(input => input.addEventListener('input', () => { state.draft.quantities[input.dataset.sizeQuantity] = input.value === '' ? 0 : Number(input.value); }));
}

async function searchProducts() {
  const query = $('#basketTypeProductSearch')?.value.trim() || '', root = $('#basketTypeProductResults');
  if (!query) { root.innerHTML = '<small>Digite o nome, SKU ou EAN para buscar no catálogo.</small>'; return; }
  root.innerHTML = '<small>Buscando produtos…</small>';
  try {
    const result = await state.api('search_products', { query, limit: 40 });
    if (!state.isCurrent() || !root?.isConnected) return;
    const selected = new Set(state.draft.products.map(product => product.id));
    state.results = (result.products || []).filter(product => !selected.has(product.id));
    root.innerHTML = state.results.length ? state.results.map(product => `<button type="button" class="basket-product-result" data-add-basket-product="${escapeHtml(product.id)}"><span class="basket-product-result-image">${picture(product.image_url, product.name)}</span><span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml([product.sku && `SKU ${product.sku}`, product.gtin && `EAN ${product.gtin}`, product.category].filter(Boolean).join(' · '))}</small></span><b>Adicionar</b></button>`).join('') : '<small>Nenhum produto encontrado com esse termo.</small>';
    root.querySelectorAll('[data-add-basket-product]').forEach(button => button.addEventListener('click', () => {
      const product = state.results.find(item => item.id === button.dataset.addBasketProduct);
      if (product && !state.draft.products.some(item => item.id === product.id)) state.draft.products.push(product);
      renderSelectedProducts(); searchProducts();
    }));
  } catch (error) { root.innerHTML = `<small class="component-unavailable">${escapeHtml(error.message || 'Não foi possível buscar produtos.')}</small>`; }
}

function openTypeEditor(type = {}) {
  state.draft = {
    id: type.id || '', name: type.name || '', sort_order: Number(type.sort_order || 0), active: type.active !== false,
    products: (type.products || []).map(link => link.product).filter(Boolean), quantities: { ...(type.quantities || {}) }
  };
  state.results = [];
  const dialog = $('#productDialog');
  $('#productDialogTitle').textContent = state.draft.id ? `Editar tipo · ${state.draft.name}` : 'Novo tipo de produtos';
  $('#productDialogFoot').innerHTML = '<span class="readonly-badge"><i aria-hidden="true"></i>Admin1 · banco separado</span><span class="local-storage-note">Configuração ainda não publicada na loja</span>';
  $('#productDialogContent').innerHTML = `<form id="basketTypeForm" class="product-editor-form basket-type-form">
    <div class="draft-warning"><strong>Configuração de composição</strong><span>Escolha os produtos, defina as quantidades por tamanho e organize a ordem de exibição futura.</span></div>
    <fieldset><legend>Identificação</legend><div class="product-editor-grid"><label class="editor-field field-wide"><span>Tipo de produto <b>*</b></span><input id="basketTypeName" name="name" maxlength="80" required value="${escapeHtml(state.draft.name)}" placeholder="Ex.: Arroz"></label></div></fieldset>
    <fieldset><legend>Produtos deste tipo</legend><p class="draft-hint">A ordem abaixo será a ordem dos produtos deste tipo na futura montagem da cesta no site.</p><div class="basket-selected-list" id="basketTypeSelected"></div><label class="editor-field"><span>Buscar produtos no catálogo Admin1</span><div class="basket-component-search"><input id="basketTypeProductSearch" type="search" autocomplete="off" placeholder="Nome, SKU ou EAN"><button class="button secondary" id="searchBasketTypeProducts" type="button">Buscar</button></div></label><div class="basket-component-results" id="basketTypeProductResults"><small>Digite nome, SKU ou EAN para buscar.</small></div></fieldset>
    <fieldset><legend>Quantidade por tamanho</legend><p class="draft-hint">Informe quantos produtos deste tipo compõem cada tamanho. Use zero quando não fizer parte daquela cesta.</p><div class="basket-quantity-matrix" id="basketQuantityMatrix"></div></fieldset>
    <fieldset><legend>Status</legend><label class="active-toggle"><input name="active" type="checkbox" ${state.draft.active ? 'checked' : ''}><span><strong>Tipo ativo</strong><small>Tipos arquivados ficam preservados para histórico e não aparecem em novas configurações.</small></span></label></fieldset>
    <p id="basketTypeError" class="draft-save-error" role="alert" hidden></p><div class="draft-bottom"><span>Nome, produtos e quantidades ficam no banco Admin1.</span><div><button class="button secondary" type="button" id="cancelBasketType">Cancelar</button> <button class="button primary" type="submit">Salvar tipo</button></div></div>
  </form>`;
  renderSelectedProducts(); renderQuantityMatrix();
  if (!dialog.open) dialog.showModal();
  $('#cancelBasketType').addEventListener('click', () => dialog.close());
  $('#searchBasketTypeProducts').addEventListener('click', searchProducts);
  $('#basketTypeProductSearch').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); searchProducts(); } });
  $('#basketTypeProductSearch').addEventListener('input', event => { clearTimeout(state.timer); state.timer = setTimeout(() => { if (event.currentTarget.value.trim().length >= 2) searchProducts(); }, 250); });
  $('#basketTypeForm').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, submit = form.querySelector('[type="submit"]'), error = $('#basketTypeError');
    submit.disabled = true; error.hidden = true;
    try {
      const formData = new FormData(form);
      const name = String(formData.get('name') || '').trim();
      if (!name) throw new Error('Informe o nome do tipo de produto.');
      if (!state.draft.products.length) throw new Error('Adicione ao menos um produto ao tipo.');
      await state.api('save_basket_type', { type: { ...state.draft, name, active: form.elements.active.checked, products: state.draft.products.map(product => ({ product_id: product.id })), quantities: state.draft.quantities } });
      dialog.close(); state.tab = 'types'; await load();
    } catch (cause) { error.textContent = cause.message || 'Não foi possível salvar o tipo.'; error.hidden = false; submit.disabled = false; }
  });
}

export async function renderBaskets(root, adminApi, isCurrent = () => true) {
  state.root = root; state.api = adminApi; state.isCurrent = isCurrent; state.query = ''; state.tab = 'sizes';
  $('#sessionLabel').textContent = 'Cestas'; $('#currentSection').textContent = 'Cestas';
  await load();
}
