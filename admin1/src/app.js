import { adminApi } from './api.js?v=6';
import { filterProducts, getProductStockState, listProductCategories } from './products.js';
import { createProductDraft, findCatalogMatch, getFiscalChecklist, parseNfeXml, readProductDrafts, saveProductDraft } from './product-drafts.js?v=6';
import { findIdentifierConflicts, PRODUCT_CATEGORY_OPTIONS } from './product-management.js?v=1';

const $ = (selector, root = document) => root.querySelector(selector);
const state = { products: [], nextOffset: null, total: 0, categories: [], query: '', category: '', stock: 'all', status: 'all', xmlItems: [], xmlMatches: [] };
const workspace = $('#workspace');
const productDialog = $('#productDialog');
const productDialogContent = $('#productDialogContent');
let searchTimer;
let requestVersion = 0;
let detailRequestVersion = 0;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function formatMoney(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatQuantity(quantity) {
  return Number(quantity || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function productImage(product) {
  const imageUrl = String(product.image_url || '');
  if (/^https:\/\//i.test(imageUrl)) {
    return `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  }
  return '<span class="product-placeholder" aria-hidden="true">▦</span>';
}

function stockBadge(product) {
  const status = getProductStockState(product.stock_quantity);
  const className = status.key === 'available' ? 'good' : status.key === 'low' ? 'attention' : 'muted';
  return `<span class="status-pill ${className}"><i aria-hidden="true"></i>${status.label}</span>`;
}

function productRow(product) {
  const secondary = [product.brand, product.packaging].filter(Boolean).join(' · ');
  return `<tr>
    <td><div class="product-cell">${productImage(product)}<span><strong>${escapeHtml(product.name || 'Produto sem nome')}</strong><small>${escapeHtml(secondary || '—')}</small></span></div></td>
    <td>${escapeHtml(product.category || 'Sem categoria')} ${product.active ? '' : '<span class="status-pill muted">Inativo</span>'}</td>
    <td>${escapeHtml(product.sku || '—')}</td>
    <td class="money-cell">${formatMoney(product.sale_price_cents)}</td>
    <td><div class="stock-cell"><strong>${formatQuantity(product.stock_quantity)}</strong>${stockBadge(product)}</div></td>
    <td><button class="text-button detail-button" type="button" data-product-detail="${escapeHtml(product.id)}">Ver detalhes</button></td>
  </tr>`;
}

function productCard(product) {
  const secondary = [product.brand, product.packaging].filter(Boolean).join(' · ');
  return `<article class="product-mobile-card">
    <div class="product-mobile-image">${productImage(product)}</div>
    <div class="product-mobile-main">
      <span class="product-mobile-category">${escapeHtml(product.category || 'Sem categoria')}</span>
      <strong>${escapeHtml(product.name || 'Produto sem nome')}</strong>
      <small>${escapeHtml(secondary || product.sku || '—')}</small>
      <div class="product-mobile-meta"><b>${formatMoney(product.sale_price_cents)}</b><span>Estoque ${formatQuantity(product.stock_quantity)}</span></div>
      ${product.active ? '' : '<span class="status-pill muted">Inativo</span>'} ${stockBadge(product)}
      <button class="text-button detail-button" type="button" data-product-detail="${escapeHtml(product.id)}">Ver detalhes</button>
    </div>
  </article>`;
}

function getVisibleProducts() {
  return filterProducts(state.products, { query: '', category: state.category, stock: state.stock, status: state.status });
}

function renderProducts() {
  const visibleProducts = getVisibleProducts();
  const categories = state.categories.length ? state.categories : listProductCategories(state.products);
  const lowStock = state.products.filter(product => ['low', 'out'].includes(getProductStockState(product.stock_quantity).key)).length;
  const hasFilters = Boolean(state.category || state.stock !== 'all' || state.status !== 'all');

  workspace.innerHTML = `
    <div class="page-heading">
      <div><span class="eyebrow">CATÁLOGO COMPLETO</span><h1>Produtos</h1><p>Consulte produtos ativos, inativos e sem estoque em um só lugar.</p></div>
      <div class="product-actions"><button class="button secondary" id="openDrafts" type="button">Rascunhos <span class="draft-count">${readProductDrafts().length}</span></button><button class="button primary" id="importXml" type="button"><span aria-hidden="true">＋</span> Conferir XML</button><input id="xmlFile" type="file" accept=".xml,text/xml,application/xml" hidden><span class="readonly-badge"><i aria-hidden="true"></i>Leitura segura</span></div>
    </div>
    <section class="metric-row product-metrics" aria-label="Resumo dos produtos carregados">
      <article class="metric-card"><span>Catálogo</span><strong>${state.total.toLocaleString('pt-BR')}</strong><small>Produtos no cadastro</small></article>
      <article class="metric-card"><span>Estoque baixo</span><strong>${lowStock}</strong><small>Até 5 unidades</small></article>
      <article class="metric-card"><span>Categorias</span><strong>${categories.length}</strong><small>Categorias cadastradas</small></article>
    </section>
    <section class="panel products-panel" aria-label="Lista de produtos">
      <div class="panel-toolbar products-toolbar">
        <label class="search-wrap"><span aria-hidden="true">⌕</span><input id="productSearch" type="search" autocomplete="off" placeholder="Buscar nome, SKU, EAN ou marca" value="${escapeHtml(state.query)}" aria-label="Buscar produtos"></label>
        <label class="filter-field"><span>Categoria</span><select id="categoryFilter" aria-label="Filtrar por categoria"><option value="">Todas as categorias</option>${categories.map(category => `<option value="${escapeHtml(category)}" ${state.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select></label>
        <label class="filter-field"><span>Status</span><select id="statusFilter" aria-label="Filtrar por status"><option value="all" ${state.status === 'all' ? 'selected' : ''}>Todos</option><option value="active" ${state.status === 'active' ? 'selected' : ''}>Ativos</option><option value="inactive" ${state.status === 'inactive' ? 'selected' : ''}>Inativos</option></select></label>
        <label class="filter-field"><span>Estoque</span><select id="stockFilter" aria-label="Filtrar por estoque"><option value="all" ${state.stock === 'all' ? 'selected' : ''}>Todos</option><option value="available" ${state.stock === 'available' ? 'selected' : ''}>Com estoque</option><option value="out" ${state.stock === 'out' ? 'selected' : ''}>Sem estoque</option></select></label>
        <button class="button secondary refresh-button" id="refreshProducts" type="button"><span aria-hidden="true">↻</span> Atualizar</button>
      </div>
      <div class="list-summary"><span><strong>${visibleProducts.length}</strong> ${visibleProducts.length === 1 ? 'produto exibido' : 'produtos exibidos'}${hasFilters ? ' com os filtros atuais' : ''}</span>${hasFilters ? '<button class="text-button" id="clearFilters" type="button">Limpar filtros</button>' : ''}</div>
      ${visibleProducts.length ? `
        <div class="table-scroll"><table class="data-table products-table"><thead><tr><th scope="col">Produto</th><th scope="col">Categoria</th><th scope="col">SKU</th><th scope="col">Preço</th><th scope="col">Estoque</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>${visibleProducts.map(productRow).join('')}</tbody></table></div>
        <div class="products-mobile-list">${visibleProducts.map(productCard).join('')}</div>
      ` : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">⌕</span><strong>${state.products.length ? 'Nenhum produto encontrado' : 'Nenhum produto disponível'}</strong><span>${state.products.length ? 'Tente ajustar os filtros ou a busca.' : 'Atualize a lista para consultar novamente.'}</span></div>`}
      <div class="panel-foot products-footer"><span>${state.products.length} carregados nesta consulta</span>${state.nextOffset !== null ? '<button class="quiet-button" id="loadMore" type="button">Carregar mais produtos <span aria-hidden="true">→</span></button>' : ''}</div>
    </section>
    <p class="readonly-note">Catálogo Supabase em somente leitura. A conferência de XML gera rascunhos salvos apenas neste navegador.</p>`;

  $('#productSearch').addEventListener('input', event => {
    clearTimeout(searchTimer);
    const query = event.currentTarget.value.trim();
    searchTimer = setTimeout(() => {
      state.query = query;
      loadProducts();
    }, 250);
  });
  $('#categoryFilter').addEventListener('change', event => { state.category = event.currentTarget.value; loadProducts(); });
  $('#stockFilter').addEventListener('change', event => { state.stock = event.currentTarget.value; loadProducts(); });
  $('#statusFilter').addEventListener('change', event => { state.status = event.currentTarget.value; loadProducts(); });
  $('#refreshProducts').addEventListener('click', () => loadProducts());
  $('#importXml').addEventListener('click', () => $('#xmlFile').click());
  $('#xmlFile').addEventListener('change', async event => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('O XML passou do limite de 10 MB.');
      state.xmlItems = parseNfeXml(await file.text());
      state.xmlMatches = [];
      try {
        const result = await adminApi('product_matches', { items: state.xmlItems });
        state.xmlMatches = state.xmlItems.map(item => findCatalogMatch(item, result.products));
      } catch { state.xmlMatches = state.xmlItems.map(item => findCatalogMatch(item, state.products)); }
      renderXmlReview(file.name);
      if (!productDialog.open) productDialog.showModal();
    } catch (error) {
      productDialogContent.innerHTML = `<div class="detail-error"><strong>Não consegui ler este XML</strong><span>${escapeHtml(error.message || 'Confira se o arquivo é uma NF-e válida.')}</span><button class="button secondary" id="retryXml" type="button">Escolher outro arquivo</button></div>`;
      $('#productDialogTitle').textContent = 'Conferir XML de entrada';
      $('#productDialogFoot').innerHTML = '<span class="readonly-badge"><i aria-hidden="true"></i>Arquivo processado somente neste navegador</span>';
      if (!productDialog.open) productDialog.showModal();
      $('#retryXml').addEventListener('click', () => $('#xmlFile').click());
    } finally { input.value = ''; }
  });
  $('#openDrafts').addEventListener('click', renderDraftList);
  $('#clearFilters')?.addEventListener('click', () => {
    state.category = '';
    state.stock = 'all';
    state.status = 'all';
    state.query = '';
    loadProducts();
  });
  $('#loadMore')?.addEventListener('click', () => loadProducts({ append: true }));
}

function renderXmlReview(fileName) {
  const items = state.xmlItems;
  productDialogContent.innerHTML = `
    <div class="draft-intro"><span class="eyebrow">CONFERÊNCIA LOCAL</span><strong>${escapeHtml(fileName)}</strong><p>${items.length} ${items.length === 1 ? 'produto encontrado' : 'produtos encontrados'}. O XML não foi enviado. O vínculo por SKU/GTIN consulta o catálogo completo.</p></div>
    <div class="xml-review-list">${items.map((item, index) => {
      const match = state.xmlMatches[index] || null;
      const matchDisplay = match?.ambiguous
        ? `<span class="status-pill attention"><i aria-hidden="true"></i>Mais de uma correspondência</span>${match.candidates.map(candidate => `<button class="text-button" data-select-match="${index}" data-product-id="${escapeHtml(candidate.id)}" type="button">Vincular: ${escapeHtml(candidate.name)}</button>`).join('')}`
        : match
          ? `<span class="status-pill good"><i aria-hidden="true"></i>Encontrado por ${escapeHtml(match.matched_by)}</span><small>${escapeHtml(match.name)}</small>`
          : '<span class="status-pill attention"><i aria-hidden="true"></i>Não localizado</span><small>Confira os identificadores antes de iniciar o cadastro.</small>';
      return `<article class="xml-review-card"><div class="xml-review-main"><span class="eyebrow">ITEM ${item.item_number || index + 1} · ${escapeHtml(item.supplier_item_code || 'SEM CÓDIGO')}</span><strong>${escapeHtml(item.description)}</strong><small>${escapeHtml([item.purchase_unit && `${item.purchase_quantity ?? '—'} ${item.purchase_unit}`, item.supplier_name].filter(Boolean).join(' · ') || 'Dados da NF-e')}</small><div class="xml-tags"><span>NCM ${escapeHtml(item.ncm || 'pendente')}</span><span>GTIN ${escapeHtml(item.commercial_gtin || 'sem GTIN')}</span>${item.cest ? `<span>CEST ${escapeHtml(item.cest)}</span>` : ''}</div></div><div class="xml-review-action">${matchDisplay}<button class="button secondary" data-create-draft="${index}" type="button">Revisar rascunho</button></div></article>`;
    }).join('')}</div>`;
  $('#productDialogTitle').textContent = 'Conferir produtos do XML';
  $('#productDialogFoot').innerHTML = '<span class="readonly-badge"><i aria-hidden="true"></i>Sem gravação no Supabase</span><span class="local-storage-note">Rascunhos ficam neste navegador</span>';
}

function renderDraftList() {
  const drafts = readProductDrafts().sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));
  productDialogContent.innerHTML = drafts.length ? `<div class="draft-intro"><span class="eyebrow">SALVOS NESTE NAVEGADOR</span><strong>${drafts.length} ${drafts.length === 1 ? 'rascunho' : 'rascunhos'}</strong><p>Rascunhos não alteram o catálogo da loja. Abra um para continuar a conferência.</p></div><div class="xml-review-list">${drafts.map(draft => `<article class="xml-review-card"><div class="xml-review-main"><span class="eyebrow">${escapeHtml(draft.catalog_product_id ? `VINCULADO · ${draft.matched_by || 'CATÁLOGO'}` : 'CADASTRO A CONFIRMAR')}</span><strong>${escapeHtml(draft.name || 'Produto sem nome')}</strong><small>${escapeHtml([draft.sku, draft.supplier_name].filter(Boolean).join(' · ') || 'Dados fiscais pendentes')}</small><div class="xml-tags"><span>${getFiscalChecklist(draft).length} pendências fiscais</span><span>NCM ${escapeHtml(draft.ncm || 'pendente')}</span></div></div><div class="xml-review-action"><span class="status-pill attention"><i aria-hidden="true"></i>Rascunho local</span><button class="button secondary" data-edit-draft="${escapeHtml(draft.id)}" type="button">Continuar</button></div></article>`).join('')}</div>` : '<div class="empty-state"><span class="empty-icon" aria-hidden="true">▤</span><strong>Nenhum rascunho ainda</strong><span>Selecione “Conferir XML” para criar uma revisão local.</span></div>';
  $('#productDialogTitle').textContent = 'Rascunhos de produtos';
  $('#productDialogFoot').innerHTML = '<span class="readonly-badge"><i aria-hidden="true"></i>Armazenamento local</span><span class="local-storage-note">Visível apenas neste navegador</span>';
  if (!productDialog.open) productDialog.showModal();
}

function renderDraftEditor(draft) {
  const checklist = getFiscalChecklist(draft);
  const input = (key, label, value = '', placeholder = '') => {
    const inputMode = ['ncm', 'cest', 'commercial_gtin', 'tax_gtin'].includes(key) ? 'numeric' : ['sale_price', 'tax_quantity'].includes(key) ? 'decimal' : 'text';
    return `<label><span>${label}</span><input name="${key}" inputmode="${inputMode}" value="${escapeHtml(value)}" placeholder="${placeholder}" autocomplete="off"></label>`;
  };
  const select = (key, label, value, options) => `<label><span>${label}</span><select name="${key}"><option value="">Selecione</option>${options.map(([code, name]) => `<option value="${code}" ${String(value) === String(code) ? 'selected' : ''}>${code} · ${name}</option>`).join('')}</select></label>`;
  productDialogContent.innerHTML = `<form id="productDraftForm" class="draft-form" data-draft-id="${escapeHtml(draft.id)}">
    <div class="draft-warning"><strong>Rascunho local · não altera o produto do site</strong><span>O preço de custo veio da nota. Preço de venda, estoque e publicação não são alterados.</span></div>
    <fieldset><legend>Identificação</legend><div class="draft-fields">${input('name','Nome do produto',draft.name)}${input('sku','SKU / código interno',draft.sku)}${input('brand','Marca',draft.brand)}${input('packaging','Embalagem',draft.packaging)}<label><span>Categoria do site</span><select name="category"><option value="">Selecione</option>${PRODUCT_CATEGORY_OPTIONS.map(category => `<option value="${escapeHtml(category)}" ${draft.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select></label>${input('sale_price','Preço de venda (R$)',draft.sale_price,'0,00')}</div></fieldset>
    <fieldset><legend>Dados fiscais para conferência</legend><div class="draft-fields">${input('ncm','NCM',draft.ncm,'8 dígitos')}${input('cest','CEST',draft.cest,'7 dígitos, se aplicável')}${select('origin_code','Origem da mercadoria',draft.origin_code,[['0','Nacional'],['1','Importação direta'],['2','Importação adquirida no mercado interno'],['3','Nacional com conteúdo de importação acima de 40%'],['4','Nacional conforme processo produtivo básico'],['5','Nacional com conteúdo de importação até 40%'],['6','Importação direta sem similar nacional'],['7','Importação adquirida sem similar nacional'],['8','Nacional com conteúdo de importação acima de 70%']])}${input('commercial_gtin','GTIN comercial / principal',draft.commercial_gtin,'Use SEM GTIN quando aplicável')}${input('tax_gtin','GTIN tributável',draft.tax_gtin,'Pode ser diferente do comercial')}${input('commercial_unit','Unidade comercial',draft.commercial_unit,'UN, CX, FD…')}${input('tax_unit','Unidade tributável',draft.tax_unit,'UN, KG, L…')}${input('tax_quantity','Quantidade tributável',draft.tax_quantity)}</div></fieldset>
    <fieldset><legend>Origem do XML</legend><div class="xml-source-grid"><div><small>Fornecedor</small><strong>${escapeHtml(draft.supplier_name || '—')}</strong></div><div><small>NF-e</small><strong>${escapeHtml(draft.invoice_number || '—')}</strong></div><div><small>Código do produto no fornecedor</small><strong>${escapeHtml(draft.supplier_item_code || '—')}</strong></div><div><small>GTIN comercial no XML</small><strong>${escapeHtml(draft.xml_commercial_gtin || 'Sem GTIN no XML')}</strong></div><div><small>Unidade e quantidade de compra</small><strong>${escapeHtml([draft.purchase_quantity, draft.purchase_unit].filter(x => x !== null && x !== '').join(' ') || '—')}</strong></div><div><small>Unidade tributável e quantidade</small><strong>${escapeHtml([draft.tax_quantity, draft.tax_unit].filter(x => x !== null && x !== '').join(' ') || '—')}</strong></div><div><small>NCM / CEST no XML</small><strong>${escapeHtml([draft.ncm || 'sem NCM', draft.cest || 'sem CEST'].join(' · '))}</strong></div><div><small>CST / CSOSN na nota</small><strong>${escapeHtml(draft.tax_code_from_xml || '—')}</strong></div><div><small>Custo unitário informado no XML</small><strong>${draft.cost === null || draft.cost === '' ? '—' : formatMoney(Math.round(Number(draft.cost) * 100))}</strong></div><div><small>Conversão calculada</small><strong>${draft.units_per_purchase_unit ? `${formatQuantity(draft.units_per_purchase_unit)} ${escapeHtml(draft.tax_unit)} por ${escapeHtml(draft.purchase_unit)} · custo estimado ${formatMoney(Math.round(Number(draft.cost_per_tax_unit) * 100)} / ${escapeHtml(draft.tax_unit)}` : 'Não calculada: confira quantidades e unidades'}</strong></div><div><small>CFOP informado nesta nota</small><strong>${escapeHtml(draft.cfop_from_xml || '—')}</strong></div></div><p class="draft-hint">O código do fornecedor não será usado automaticamente como SKU. CFOP e CST/CSOSN são dados desta operação e não viram regra fixa do produto. Confirme classificação e unidades com o responsável fiscal antes de emitir.</p></fieldset>
    <div class="draft-bottom"><span>${checklist.length ? `${checklist.length} campos para completar` : 'Campos básicos preenchidos'}${checklist.length ? ` · ${checklist.map(item => item.label).join(', ')}` : ''}</span><button class="button primary" type="submit">Salvar rascunho local</button></div>
  </form>`;
  $('#productDialogTitle').textContent = draft.catalog_product_id ? 'Revisar produto relacionado' : 'Rascunho de cadastro';
  $('#productDialogFoot').innerHTML = '<span class="readonly-badge"><i aria-hidden="true"></i>Não salva no Supabase</span><span class="local-storage-note">Este rascunho fica neste navegador</span>';
  $('#productDraftForm').addEventListener('submit', async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const button = event.currentTarget.querySelector('[type="submit"]');
      button.disabled = true;
      button.textContent = 'Conferindo identificadores…';
      const candidate = { ...draft, ...values, gtin: values.commercial_gtin };
      const lookup = await adminApi('product_matches', { items: [{ sku: values.sku, commercial_gtin: values.commercial_gtin, tax_gtin: values.tax_gtin }] });
      const conflicts = findIdentifierConflicts(candidate, lookup.products);
      if (conflicts.length) throw new Error(conflicts.map(issue => issue.label).join(' '));
      const drafts = saveProductDraft(candidate);
      const count = $('.draft-count', workspace);
      if (count) count.textContent = String(drafts.length);
      renderDraftList();
    } catch (error) {
      let notice = $('#draftSaveError');
      if (!notice) {
        notice = document.createElement('p');
        notice.id = 'draftSaveError';
        notice.className = 'draft-save-error';
        event.currentTarget.append(notice);
      }
      notice.textContent = error.message || 'Não foi possível salvar o rascunho neste navegador.';
      const button = event.currentTarget.querySelector('[type="submit"]');
      if (button) { button.disabled = false; button.textContent = 'Salvar rascunho local'; }
    }
  });
}

productDialogContent.addEventListener('click', event => {
  const selectMatch = event.target.closest('[data-select-match]');
  if (selectMatch) {
    const index = Number(selectMatch.dataset.selectMatch);
    const current = state.xmlMatches[index];
    const candidate = current?.candidates?.find(item => String(item.id) === selectMatch.dataset.productId);
    if (candidate) state.xmlMatches[index] = { ...candidate, matched_by: current.matched_by };
    renderXmlReview('XML da nota');
    return;
  }
  const createButton = event.target.closest('[data-create-draft]');
  if (createButton) {
    const item = state.xmlItems[Number(createButton.dataset.createDraft)];
    const match = state.xmlMatches[Number(createButton.dataset.createDraft)] || null;
    renderDraftEditor(createProductDraft(item, new Date(), match));
    return;
  }
  const editButton = event.target.closest('[data-edit-draft]');
  if (editButton) {
    const draft = readProductDrafts().find(item => item.id === editButton.dataset.editDraft);
    if (draft) renderDraftEditor(draft);
  }
});

function renderProductDetail(product) {
  const attributes = Array.isArray(product.characteristics) ? product.characteristics : [];
  const fallbackAttributes = [
    { label: 'Marca', value: product.brand },
    { label: 'Embalagem', value: product.packaging },
    { label: 'Categoria', value: product.category }
  ];
  const visibleAttributes = (attributes.length ? attributes : fallbackAttributes).filter(item => item?.value);
  const description = product.description || 'A vitrine não informa uma descrição para este produto.';
  const image = product.image_url && /^https:\/\//i.test(product.image_url)
    ? `<img src="${escapeHtml(product.image_url)}" alt="Imagem de ${escapeHtml(product.name)}" referrerpolicy="no-referrer">`
    : '<span class="product-placeholder" aria-hidden="true">▦</span>';
  productDialogContent.innerHTML = `
    <div class="detail-product-hero">
      <div class="detail-product-image">${image}</div>
      <div class="detail-product-primary">
        <span class="eyebrow">${escapeHtml(product.category || 'PRODUTO')}</span>
        <h3>${escapeHtml(product.name || 'Produto sem nome')}</h3>
        <p>${escapeHtml([product.brand, product.packaging].filter(Boolean).join(' · ') || 'Produto do catálogo da loja')}</p>
        <strong class="detail-price">${formatMoney(product.sale_price_cents)}</strong>
        <div class="detail-stock">${stockBadge(product)} <span>${formatQuantity(product.stock_quantity)} em estoque</span></div>
      </div>
    </div>
    <section class="detail-section"><h3>Informações do produto</h3><dl class="detail-attributes">
      <div><dt>SKU</dt><dd>${escapeHtml(product.sku || '—')}</dd></div>
      <div><dt>EAN</dt><dd>${escapeHtml(product.gtin || '—')}</dd></div>
      <div><dt>NCM cadastrado</dt><dd>${escapeHtml(product.ncm || 'Não informado')}</dd></div>
      <div><dt>Unidade</dt><dd>${escapeHtml(product.unit || '—')}</dd></div>
      <div><dt>Status na loja</dt><dd>${product.active ? 'Ativo' : 'Inativo'}</dd></div>
      <div><dt>Estoque mínimo</dt><dd>${formatQuantity(product.min_stock)}</dd></div>
      ${visibleAttributes.map(item => `<div><dt>${escapeHtml(item.label || 'Informação')}</dt><dd>${escapeHtml(item.value)}</dd></div>`).join('')}
    </dl></section>
    <section class="detail-section"><h3>Descrição</h3><p class="detail-description">${escapeHtml(description)}</p></section>`;
  $('#productDialogTitle').textContent = product.name || 'Detalhes do produto';
}

async function openProductDetail(productId) {
  const product = state.products.find(item => String(item.id) === String(productId));
  if (!product) return;
  const currentVersion = ++detailRequestVersion;
  productDialogContent.innerHTML = '<div class="detail-loading"><span class="spinner" aria-hidden="true"></span><strong>Carregando detalhes do produto…</strong></div>';
  $('#productDialogFoot').innerHTML = '<span class="readonly-badge"><i aria-hidden="true"></i>Consulta somente leitura</span>';
  $('#productDialogTitle').textContent = product.name || 'Detalhes do produto';
  if (!productDialog.open) productDialog.showModal();
  try {
    const result = await adminApi('product_detail', { id: productId });
    if (currentVersion !== detailRequestVersion || !productDialog.open) return;
    renderProductDetail(result.product);
  } catch (error) {
    if (currentVersion !== detailRequestVersion || !productDialog.open) return;
    productDialogContent.innerHTML = `<div class="detail-error"><strong>Não foi possível carregar os detalhes</strong><span>${escapeHtml(error.message || 'Tente novamente.')}</span><button class="button secondary" id="retryProductDetail" type="button">Tentar novamente</button></div>`;
    $('#retryProductDetail').addEventListener('click', () => openProductDetail(productId));
  }
}

workspace.addEventListener('click', event => {
  const button = event.target.closest('[data-product-detail]');
  if (button) openProductDetail(button.dataset.productDetail);
});
$('#closeProductDialog').addEventListener('click', () => productDialog.close());
productDialog.addEventListener('click', event => {
  if (event.target === productDialog) productDialog.close();
});
productDialog.addEventListener('close', () => { detailRequestVersion += 1; });

function renderLoading() {
  workspace.innerHTML = '<div class="loading-card"><span class="spinner" aria-hidden="true"></span><strong>Carregando produtos…</strong><small>Consultando o catálogo da loja.</small></div>';
}

async function loadProducts({ append = false } = {}) {
  const currentVersion = ++requestVersion;
  if (!append) renderLoading();
  try {
    const result = await adminApi('products', {
      limit: 36,
      offset: append ? state.nextOffset : 0,
      q: state.query, category: state.category, status: state.status, stock: state.stock
    });
    if (currentVersion !== requestVersion) return;
    state.products = append ? [...state.products, ...result.products] : result.products;
    state.nextOffset = result.next_offset;
    state.total = Number(result.total || 0);
    renderProducts();
  } catch (error) {
    if (currentVersion !== requestVersion) return;
    workspace.innerHTML = `<div class="empty-state error-state"><strong>Não foi possível carregar os produtos</strong><span>${escapeHtml(error.message || 'Verifique a conexão e tente novamente.')}</span><button class="button secondary" id="retryProducts" type="button">Tentar novamente</button></div>`;
    $('#retryProducts').addEventListener('click', () => loadProducts());
  }
}

adminApi('categories').then(result => { state.categories = result.categories || []; if (state.products.length) renderProducts(); }).catch(() => {});
$('#sessionLabel').textContent = 'Somente leitura';
$('#currentSection').textContent = 'Produtos';
loadProducts();


