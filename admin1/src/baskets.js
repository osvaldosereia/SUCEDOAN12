import { compressProductImage } from './product-images.js?v=1';
import { parseProductAmount } from './product-management.js?v=5';

const $ = (selector, root = document) => root.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const money = cents => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const quantity = value => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

const state = { root: null, api: null, isCurrent: () => true, baskets: [], query: '', draft: null, results: [], imageUrl: '', busy: false, timer: null };

function productImage(url) {
  return /^https:\/\//i.test(url || '') || /^data:image\/webp;base64,/i.test(url || '')
    ? `<img src="${escapeHtml(url)}" alt="" loading="lazy">`
    : '<span class="product-placeholder" aria-hidden="true">▦</span>';
}

function render() {
  const active = state.baskets.filter(item => item.active).length;
  state.root.innerHTML = `
    <div class="page-heading">
      <div><span class="eyebrow">GESTÃO DE CESTAS</span><h1>Cestas</h1><p>Monte cada cesta com os produtos e quantidades do catálogo Admin1.</p></div>
      <div class="product-actions"><button class="button secondary" id="refreshBaskets" type="button">Atualizar</button><button class="button primary" id="newBasket" type="button">Nova cesta</button></div>
    </div>
    <section class="metric-row product-metrics" aria-label="Resumo das cestas">
      <article class="metric-card"><span>Cestas</span><strong>${state.baskets.length}</strong><small>Cadastros no Admin1</small></article>
      <article class="metric-card"><span>Ativas</span><strong>${active}</strong><small>Com composição pronta</small></article>
      <article class="metric-card"><span>Inativas</span><strong>${state.baskets.length - active}</strong><small>Em revisão ou indisponíveis</small></article>
    </section>
    <section class="panel products-panel" aria-label="Lista de cestas">
      <div class="panel-toolbar products-toolbar">
        <label class="search-wrap"><span aria-hidden="true">⌕</span><input id="basketSearch" type="search" autocomplete="off" placeholder="Buscar cesta por nome ou SKU" value="${escapeHtml(state.query)}" aria-label="Buscar cestas"></label>
        <button class="button secondary refresh-button" id="refreshBasketsToolbar" type="button"><span aria-hidden="true">↻</span> Atualizar</button>
      </div>
      <div class="list-summary"><span><strong>${state.baskets.length}</strong> ${state.baskets.length === 1 ? 'cesta cadastrada' : 'cestas cadastradas'}</span></div>
      ${state.baskets.length ? `<div class="table-scroll"><table class="data-table products-table"><thead><tr><th>Cesta</th><th>SKU</th><th>Composição</th><th>Preço</th><th>Status</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${state.baskets.map(basket => `<tr>
        <td><div class="product-cell">${productImage(basket.image_url)}<span><strong>${escapeHtml(basket.name)}</strong><small>${escapeHtml(basket.description || 'Cesta Dona Antônia')}</small></span></div></td>
        <td>${escapeHtml(basket.sku || '—')}</td><td>${basket.items.length} ${basket.items.length === 1 ? 'produto' : 'produtos'}</td>
        <td class="money-cell">${money(basket.price_cents)}</td><td><span class="status-pill ${basket.active ? 'good' : 'muted'}"><i aria-hidden="true"></i>${basket.active ? 'Ativa' : 'Inativa'}</span></td>
        <td><div class="product-row-actions"><button class="product-status-action ${basket.active ? 'is-active' : ''}" type="button" data-basket-toggle="${escapeHtml(basket.id)}" data-active="${basket.active ? 'false' : 'true'}">${basket.active ? 'Desativar' : 'Ativar'}</button><button class="text-button" type="button" data-basket-edit="${escapeHtml(basket.id)}">Editar</button></div></td>
      </tr>`).join('')}</tbody></table></div><div class="products-mobile-list">${state.baskets.map(basket => `<article class="product-mobile-card"><div class="product-mobile-image">${productImage(basket.image_url)}</div><div class="product-mobile-main"><span class="product-mobile-category">${basket.active ? 'Ativa' : 'Inativa'}</span><strong>${escapeHtml(basket.name)}</strong><small>SKU ${escapeHtml(basket.sku)} · ${basket.items.length} produtos</small><div class="product-mobile-meta"><b>${money(basket.price_cents)}</b></div><div class="product-mobile-actions"><button class="product-status-action ${basket.active ? 'is-active' : ''}" type="button" data-basket-toggle="${escapeHtml(basket.id)}" data-active="${basket.active ? 'false' : 'true'}">${basket.active ? 'Desativar' : 'Ativar'}</button><button class="text-button" type="button" data-basket-edit="${escapeHtml(basket.id)}">Editar</button></div></div></article>`).join('')}</div>`
      : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">◈</span><strong>${state.query ? 'Nenhuma cesta encontrada' : 'Nenhuma cesta cadastrada'}</strong><span>${state.query ? 'Tente outro nome ou SKU.' : 'Crie a primeira cesta e inclua os produtos da composição.'}</span></div>`}
      <div class="panel-foot products-footer"><span>As cestas usam produtos do catálogo próprio do Admin1.</span></div>
    </section>`;
  $('#basketSearch', state.root).addEventListener('input', event => {
    clearTimeout(state.timer);
    state.query = event.currentTarget.value.trim();
    state.timer = setTimeout(load, 250);
  });
  $('#refreshBaskets', state.root).addEventListener('click', load);
  $('#refreshBasketsToolbar', state.root).addEventListener('click', load);
  $('#newBasket', state.root).addEventListener('click', () => openEditor());
  state.root.querySelectorAll('[data-basket-edit]').forEach(button => button.addEventListener('click', async () => {
    try { const result = await state.api('basket_detail', { id: button.dataset.basketEdit }); openEditor(result.basket); }
    catch (error) { alert(error.message || 'Não foi possível abrir a cesta.'); }
  }));
  state.root.querySelectorAll('[data-basket-toggle]').forEach(button => button.addEventListener('click', async () => {
    const basket = state.baskets.find(item => item.id === button.dataset.basketToggle);
    if (!basket) return;
    button.disabled = true;
    try {
      await state.api('save_basket', { basket: { ...basket, active: button.dataset.active === 'true' } });
      await load();
    } catch (error) { alert(error.message || 'Não foi possível alterar o status da cesta.'); button.disabled = false; }
  }));
}

async function load() {
  if (!state.root || !state.isCurrent()) return;
  state.root.innerHTML = '<div class="loading-card"><span class="spinner" aria-hidden="true"></span><strong>Carregando cestas…</strong><small>Consultando o catálogo Admin1.</small></div>';
  try {
    const result = await state.api('baskets', { query: state.query });
    if (!state.isCurrent()) return;
    state.baskets = result.baskets || [];
    render();
  } catch (error) {
    if (!state.isCurrent()) return;
    state.root.innerHTML = `<div class="empty-state"><strong>Não foi possível carregar as cestas</strong><span>${escapeHtml(error.message || 'Tente novamente.')}</span><button class="button secondary" id="retryBaskets" type="button">Tentar novamente</button></div>`;
    $('#retryBaskets', state.root)?.addEventListener('click', load);
  }
}

function selectedItemsHtml() {
  return state.draft.items.map((item, index) => `<article class="basket-component-row">
    <div class="basket-component-image">${productImage(item.product?.image_url)}</div>
    <div class="basket-component-name"><strong>${escapeHtml(item.product?.name || 'Produto')}</strong><small>${escapeHtml([item.product?.sku && `SKU ${item.product.sku}`, item.product?.gtin && `EAN ${item.product.gtin}`, item.product?.category].filter(Boolean).join(' · '))}</small><small class="${item.product?.active && item.product.stock_quantity > 0 ? 'component-ready' : 'component-unavailable'}">${item.product?.active && item.product.stock_quantity > 0 ? `Estoque ${quantity(item.product.stock_quantity)}` : 'Produto inativo ou sem estoque'}</small></div>
    <label class="basket-quantity"><span>Qtd.</span><input type="number" min="0.001" step="0.001" value="${escapeHtml(item.quantity)}" data-component-quantity="${index}" aria-label="Quantidade de ${escapeHtml(item.product?.name)}"></label>
    <button class="text-button" type="button" data-component-remove="${index}">Remover</button>
  </article>`).join('') || '<div class="empty-state basket-empty-composition"><strong>Composição vazia</strong><span>Busque e adicione os produtos desta cesta.</span></div>';
}

async function searchProducts() {
  const query = $('#componentSearch')?.value.trim() || '';
  const root = $('#componentResults');
  if (!query) { root.innerHTML = '<small>Digite nome, SKU ou EAN para buscar no catálogo.</small>'; return; }
  root.innerHTML = '<small>Buscando produtos…</small>';
  try {
    const result = await state.api('search_products', { query, limit: 24 });
    if (!state.isCurrent() || !root?.isConnected) return;
    const already = new Set(state.draft.items.map(item => item.product_id));
    state.results = (result.products || []).filter(product => !already.has(product.id));
    root.innerHTML = state.results.length ? state.results.map(product => `<button class="basket-component-result" type="button" data-component-add="${escapeHtml(product.id)}"><span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml([product.sku && `SKU ${product.sku}`, product.gtin && `EAN ${product.gtin}`].filter(Boolean).join(' · '))}</small><small>${product.active && product.stock_quantity > 0 ? `Estoque ${quantity(product.stock_quantity)}` : 'Inativo ou sem estoque'}</small></span><b>Adicionar</b></button>`).join('') : '<small>Nenhum produto encontrado. Confira Produtos ou tente outra busca.</small>';
    root.querySelectorAll('[data-component-add]').forEach(button => button.addEventListener('click', () => addProduct(button.dataset.componentAdd)));
  } catch (error) { root.innerHTML = `<small class="component-unavailable">${escapeHtml(error.message || 'Não foi possível buscar produtos.')}</small>`; }
}

async function addProduct(id) {
  const item = state.results.find(product => product.id === id);
  if (!item || state.draft.items.some(current => current.product_id === id)) return;
  state.draft.items.push({ product_id: item.id, quantity: 1, product: item });
  renderEditor();
}

function renderEditor() {
  const dialog = $('#productDialog');
  const content = $('#productDialogContent');
  const draft = state.draft;
  const active = draft.active === true;
  content.innerHTML = `<form id="basketEditorForm" class="product-editor-form">
    <div class="draft-warning"><strong>Catálogo próprio do Admin1</strong><span>As alterações ficam no banco separado do Admin1 e não modificam a loja pública.</span></div>
    <fieldset><legend>Dados da cesta</legend><div class="product-editor-grid">
      <label class="editor-field image-upload field-wide"><span>Imagem da cesta</span><input id="basketImageFile" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG ou WebP. Conversão automática para WebP, até 1.200 px e 30 KB.</small><div class="image-preview" id="basketImagePreview">${draft.image_url ? `<img src="${escapeHtml(draft.image_url)}" alt="Prévia da cesta">` : '<span class="product-placeholder" aria-hidden="true">◈</span><span>Nenhuma imagem selecionada</span>'}</div><button type="button" class="text-button" id="removeBasketImage" ${draft.image_url ? '' : 'hidden'}>Remover imagem</button></label>
      <label class="editor-field field-wide"><span>Nome da cesta <b>*</b></span><input name="name" required maxlength="180" value="${escapeHtml(draft.name)}" placeholder="Ex.: Cesta Básica Pequena"></label>
      <label class="editor-field"><span>SKU / código interno <b>*</b></span><input name="sku" required maxlength="80" value="${escapeHtml(draft.sku)}" placeholder="Ex.: CESTA-PEQUENA"></label>
      <label class="editor-field"><span>Preço de venda (R$) <b>*</b></span><input name="price" required inputmode="decimal" type="number" step="0.01" min="0.01" value="${escapeHtml(draft.price?.toFixed?.(2) ?? '')}" placeholder="0,00"></label>
      <label class="editor-field field-wide"><span>Descrição</span><textarea name="description" rows="3" maxlength="2000" placeholder="Descrição simples para a cesta">${escapeHtml(draft.description || '')}</textarea></label>
    </div></fieldset>
    <fieldset><legend>Composição</legend><p class="draft-hint">Escolha produtos do catálogo Admin1 e informe quantos entram em cada cesta. Produtos inativos ou sem estoque são exibidos para conferência, mas impedem ativar a cesta.</p>
      <div class="basket-component-list">${selectedItemsHtml()}</div>
      <label class="editor-field"><span>Adicionar produto</span><div class="basket-component-search"><input id="componentSearch" type="search" autocomplete="off" placeholder="Nome, SKU ou EAN"><button class="button secondary" id="searchComponents" type="button">Buscar</button></div></label>
      <div class="basket-component-results" id="componentResults"><small>Digite nome, SKU ou EAN para buscar no catálogo.</small></div>
    </fieldset>
    <fieldset><legend>Disponibilidade</legend><label class="active-toggle"><input name="active" type="checkbox" ${active ? 'checked' : ''}><span><strong>Cesta ativa</strong><small>Para ativar, a cesta precisa de imagem, composição e produtos ativos com estoque.</small></span></label></fieldset>
    <p id="basketEditorError" class="draft-save-error" role="alert" hidden></p>
    <div class="draft-bottom"><span>Nome, SKU, preço e composição são necessários para ativar.</span><div><button class="button secondary" type="button" id="cancelBasketEdit">Cancelar</button> <button class="button primary" type="submit">Salvar cesta</button></div></div>
  </form>`;
  $('#productDialogTitle').textContent = draft.id ? `Editar · ${draft.name}` : 'Nova cesta';
  $('#productDialogFoot').innerHTML = '<span class="readonly-badge"><i aria-hidden="true"></i>Admin1 · banco separado</span><span class="local-storage-note">Imagem até 30 KB</span>';
  if (!dialog.open) dialog.showModal();
  const form = $('#basketEditorForm');
  $('#cancelBasketEdit').addEventListener('click', () => dialog.close());
  $('#searchComponents').addEventListener('click', searchProducts);
  $('#componentSearch').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); searchProducts(); } });
  $('#componentSearch').addEventListener('input', event => {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => { if (event.currentTarget.value.trim().length >= 2) searchProducts(); }, 250);
  });
  $('#removeBasketImage').addEventListener('click', () => { state.imageUrl = ''; draft.image_url = ''; renderEditor(); });
  $('#basketImageFile').addEventListener('change', async event => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    event.currentTarget.disabled = true;
    try {
      const image = await compressProductImage(file);
      state.imageUrl = image.dataUrl;
      draft.image_url = image.dataUrl;
      renderEditor();
    } catch (error) { const notice = $('#basketEditorError'); notice.textContent = error.message; notice.hidden = false; }
    finally { const input = $('#basketImageFile'); if (input) input.disabled = false; }
  });
  content.querySelectorAll('[data-component-quantity]').forEach(input => input.addEventListener('input', () => {
    const item = draft.items[Number(input.dataset.componentQuantity)];
    if (item) item.quantity = Number(input.value);
  }));
  content.querySelectorAll('[data-component-remove]').forEach(button => button.addEventListener('click', () => {
    draft.items.splice(Number(button.dataset.componentRemove), 1);
    renderEditor();
  }));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    const notice = $('#basketEditorError');
    notice.hidden = true;
    submit.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      const price = parseProductAmount(values.price);
      if (price === null || price <= 0) throw new Error('Informe um preço maior que zero.');
      if (!draft.items.length) throw new Error('Adicione ao menos um produto à composição.');
      if (draft.items.some(item => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)) throw new Error('Informe uma quantidade maior que zero para cada produto.');
      const saved = await state.api('save_basket', { basket: {
        id: draft.id,
        name: values.name.trim(), sku: values.sku.trim(), description: values.description,
        price, image_url: state.imageUrl || draft.image_url || '', active: form.elements.active.checked,
        items: draft.items.map(item => ({ product_id: item.product_id, quantity: Number(item.quantity) }))
      } });
      if (!state.isCurrent()) return;
      $('#productDialog').close();
      await load();
      if (!saved.basket.id) throw new Error('A cesta foi salva, mas o Admin1 não retornou o identificador. Atualize a lista.');
    } catch (error) { if (state.isCurrent()) { notice.textContent = error.message || 'Não foi possível salvar a cesta.'; notice.hidden = false; } }
    finally { submit.disabled = false; }
  });
}

function openEditor(basket = {}) {
  state.draft = {
    id: basket.id || '', name: basket.name || '', sku: basket.sku || '', description: basket.description || '',
    image_url: basket.image_url || '', price: Number(basket.price ?? Number(basket.price_cents || 0) / 100),
    active: basket.active === true,
    items: (basket.items || []).map(item => ({ product_id: item.product_id, quantity: Number(item.quantity || 1), product: item.product }))
  };
  state.imageUrl = state.draft.image_url;
  state.results = [];
  renderEditor();
}

export async function renderBaskets(root, adminApi, isCurrent = () => true) {
  state.root = root;
  state.api = adminApi;
  state.isCurrent = isCurrent;
  state.query = '';
  $('#sessionLabel').textContent = 'Cestas';
  $('#currentSection').textContent = 'Cestas';
  await load();
}
