import { adminApi } from './api.js?v=9';
import { filterProducts, getProductStockState, listProductCategories } from './products.js?v=3';
import { createProductDraft, findCatalogMatch, getFiscalChecklist, getNfeItemReviewIssues, parseNfeXml, readProductDrafts, saveProductDraft } from './product-drafts.js?v=8';
import { findIdentifierConflicts, getProductListEmptyState, getProductReadinessIssues, PRODUCT_CATEGORY_OPTIONS } from './product-management.js?v=4';
import { getProductAvailability } from './product-availability.js?v=1';
import { compressProductImage } from './product-images.js?v=1';
import { getProductWorkspaceStorage, mergeWorkspaceProducts, readProductWorkspace, saveProductWorkspaceProduct } from './product-workspace.js?v=1';

const $ = (selector, root = document) => root.querySelector(selector);
const state = { products: [], catalogProducts: [], workspaceProducts: readProductWorkspace(), nextOffset: null, total: 0, categories: [], query: '', category: '', stock: 'all', status: 'all', xmlItems: [], xmlMatches: [], xmlMatchStatus: 'unchecked', catalogError: '' };
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

function formatProductStock(product) {
  return product.stock_known === false ? '—' : formatQuantity(product.stock_quantity);
}

function productImage(product) {
  const imageUrl = String(product.image_url || '');
  if (/^https:\/\//i.test(imageUrl) || /^data:image\/webp;base64,/i.test(imageUrl)) {
    return `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  }
  return '<span class="product-placeholder" aria-hidden="true">▦</span>';
}

function stockBadge(product) {
  const status = getProductStockState(product.stock_quantity, product.min_stock, product.stock_known !== false);
  const className = status.key === 'available' ? 'good' : status.key === 'low' ? 'attention' : 'muted';
  return `<span class="status-pill ${className}"><i aria-hidden="true"></i>${status.label}</span>`;
}

function productStatusAction(product) {
  const availability = getProductAvailability(product);
  const activeInStore = product.active === true;
  const label = activeInStore ? 'Desativar' : 'Ativar';
  const disabled = !activeInStore && !availability.canActivate;
  const title = product.stock_known === false
    ? 'Estoque vendável ainda não confirmado'
    : 'Produto sem estoque não pode ser ativado';
  return `<button class="product-status-action ${activeInStore ? 'is-active' : ''}" type="button" data-toggle-product-active="${escapeHtml(product.id)}" data-next-active="${activeInStore ? 'false' : 'true'}" ${disabled ? `disabled title="${title}"` : ''}>${label}</button>`;
}

function productRow(product) {
  const secondary = [product.brand, product.packaging].filter(Boolean).join(' · ');
  const availability = getProductAvailability(product);
  return `<tr>
    <td><div class="product-cell">${productImage(product)}<span><strong>${escapeHtml(product.name || 'Produto sem nome')}</strong><small>${escapeHtml(secondary || '—')}</small></span></div></td>
    <td>${escapeHtml(product.category || 'Sem categoria')} ${availability.active ? '' : `<span class="status-pill muted">${escapeHtml(availability.label)}</span>`}</td>
    <td>${escapeHtml(product.sku || '—')}<small class="table-secondary-code">GTIN ${escapeHtml(product.gtin || '—')}</small></td>
    <td class="money-cell">${formatMoney(product.sale_price_cents)}</td>
    <td><div class="stock-cell"><strong>${formatProductStock(product)}</strong>${stockBadge(product)}</div></td>
    <td><div class="product-row-actions">${productStatusAction(product)}<button class="text-button" type="button" data-edit-product="${escapeHtml(product.id)}">Editar</button><button class="text-button detail-button" type="button" data-product-detail="${escapeHtml(product.id)}">Detalhes</button></div></td>
  </tr>`;
}

function productCard(product) {
  const secondary = [product.brand, product.packaging].filter(Boolean).join(' · ');
  const availability = getProductAvailability(product);
  return `<article class="product-mobile-card">
    <div class="product-mobile-image">${productImage(product)}</div>
    <div class="product-mobile-main">
      <span class="product-mobile-category">${escapeHtml(product.category || 'Sem categoria')}</span>
      <strong>${escapeHtml(product.name || 'Produto sem nome')}</strong>
      <small>${escapeHtml([secondary, product.sku && `SKU ${product.sku}`, product.gtin && `GTIN ${product.gtin}`].filter(Boolean).join(' · ') || '—')}</small>
      <div class="product-mobile-meta"><b>${formatMoney(product.sale_price_cents)}</b><span>Estoque ${formatProductStock(product)}</span></div>
      ${availability.active ? '' : `<span class="status-pill muted">${escapeHtml(availability.label)}</span>`} ${stockBadge(product)}
      <div class="product-mobile-actions">${productStatusAction(product)}<button class="text-button" type="button" data-edit-product="${escapeHtml(product.id)}">Editar</button><button class="text-button detail-button" type="button" data-product-detail="${escapeHtml(product.id)}">Detalhes</button></div>
    </div>
  </article>`;
}

function getVisibleProducts() {
  return filterProducts(state.products, { query: state.query, category: state.category, stock: state.stock, status: state.status });
}

function renderProducts() {
  const visibleProducts = getVisibleProducts();
  const categories = state.categories.length ? state.categories : listProductCategories(state.products);
  const lowStock = state.products.filter(product => ['low', 'out'].includes(getProductStockState(product.stock_quantity, product.min_stock, product.stock_known !== false).key)).length;
  const emptyState = getProductListEmptyState(state);
  const hasFilters = emptyState.hasFilters;
  const localCount = state.products.filter(product => product.workspace_source === 'local').length;

  workspace.innerHTML = `
    <div class="page-heading">
      <div><span class="eyebrow">GESTÃO DE PRODUTOS</span><h1>Produtos</h1><p>Consulte o catálogo e prepare produtos para operação sem alterar a loja publicada.</p></div>
      <div class="product-actions"><button class="button secondary" id="openDrafts" type="button">Rascunhos <span class="draft-count">${readProductDrafts().length}</span></button><button class="button secondary" id="importXml" type="button">Conferir XML</button><button class="button primary" id="newProduct" type="button">Novo produto</button><input id="xmlFile" type="file" accept=".xml,text/xml,application/xml" hidden></div>
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
      <div class="list-summary"><span><strong>${visibleProducts.length}</strong> ${visibleProducts.length === 1 ? 'produto exibido' : 'produtos exibidos'}${hasFilters ? ' com os filtros atuais' : ''} · ${localCount} local(is)</span>${hasFilters ? '<button class="text-button" id="clearFilters" type="button">Limpar filtros</button>' : ''}</div>
      ${visibleProducts.length ? `
        <div class="table-scroll"><table class="data-table products-table"><thead><tr><th scope="col">Produto</th><th scope="col">Categoria</th><th scope="col">SKU</th><th scope="col">Preço</th><th scope="col">Estoque</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>${visibleProducts.map(productRow).join('')}</tbody></table></div>
        <div class="products-mobile-list">${visibleProducts.map(productCard).join('')}</div>
      ` : `<div class="empty-state"><span class="empty-icon" aria-hidden="true">⌕</span><strong>${emptyState.title}</strong><span>${emptyState.description}</span></div>`}
      <div class="panel-foot products-footer"><span>${state.products.length} carregados · edição local</span>${state.nextOffset !== null ? '<button class="quiet-button" id="loadMore" type="button">Carregar mais produtos <span aria-hidden="true">→</span></button>' : ''}</div>
    </section>
    <p class="readonly-note">Supabase somente leitura. Cadastros, edições, imagens e status ficam neste navegador; nada é publicado no site.</p>`;
  if (state.catalogError) {
    const notice = document.createElement('div');
    notice.className = 'workspace-notice';
    notice.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = `Catálogo online indisponível: ${state.catalogError}. Você pode continuar testando os produtos locais.`;
    const retry = document.createElement('button');
    retry.className = 'text-button'; retry.type = 'button'; retry.textContent = 'Tentar novamente';
    retry.addEventListener('click', () => loadProducts());
    notice.append(text, retry);
    workspace.prepend(notice);
  }

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
        if (!Array.isArray(result?.products)) throw new Error('Resposta inválida ao consultar o catálogo.');
        state.xmlMatches = state.xmlItems.map(item => findCatalogMatch(item, result.products));
        state.xmlMatchStatus = 'available';
      } catch { state.xmlMatches = state.xmlItems.map(() => null); state.xmlMatchStatus = 'unavailable'; }
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
  $('#newProduct').addEventListener('click', () => renderProductEditor());
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
  const matchingNotice = state.xmlMatchStatus === 'available'
    ? 'O vínculo por SKU/GTIN consultou o catálogo completo.'
    : 'A consulta do catálogo completo falhou. Os vínculos ainda não foram conferidos; o rascunho local pode ser preparado, mas não considere o item como novo.';
  productDialogContent.innerHTML = `
    <div class="draft-intro"><span class="eyebrow">CONFERÊNCIA LOCAL</span><strong>${escapeHtml(fileName)}</strong><p>${items.length} ${items.length === 1 ? 'produto encontrado' : 'produtos encontrados'}. O XML não foi enviado. ${escapeHtml(matchingNotice)}</p></div>
    <div class="xml-review-list">${items.map((item, index) => {
      const match = state.xmlMatches[index] || null;
      const matchDisplay = match?.ambiguous
        ? `<span class="status-pill attention"><i aria-hidden="true"></i>Mais de uma correspondência</span>${match.candidates.map(candidate => `<button class="text-button" data-select-match="${index}" data-product-id="${escapeHtml(candidate.id)}" type="button">Vincular: ${escapeHtml(candidate.name)}</button>`).join('')}`
        : match
          ? `<span class="status-pill good"><i aria-hidden="true"></i>Encontrado por ${escapeHtml(match.matched_by)}</span><small>${escapeHtml(match.name)}</small>`
          : state.xmlMatchStatus === 'available'
            ? '<span class="status-pill attention"><i aria-hidden="true"></i>Não localizado</span><small>Conferido no catálogo por SKU/GTIN exatos.</small>'
            : '<span class="status-pill attention"><i aria-hidden="true"></i>Vínculo não conferido</span><small>Consulta completa indisponível.</small>';
      const reviewIssues = getNfeItemReviewIssues(item);
      return `<article class="xml-review-card"><div class="xml-review-main"><span class="eyebrow">ITEM ${item.item_number || index + 1} · ${escapeHtml(item.supplier_item_code || 'SEM CÓDIGO')}</span><strong>${escapeHtml(item.description)}</strong><small>${escapeHtml([item.purchase_unit && `${item.purchase_quantity ?? '—'} ${item.purchase_unit}`, item.supplier_name].filter(Boolean).join(' · ') || 'Dados da NF-e')}</small><div class="xml-tags"><span>NCM ${escapeHtml(item.ncm || 'pendente')}</span><span>GTIN ${escapeHtml(item.commercial_gtin || 'revisar')}</span>${item.cest ? `<span>CEST ${escapeHtml(item.cest)}</span>` : ''}<span>${reviewIssues.length ? `${reviewIssues.length} pontos da nota para conferir` : 'Dados principais da nota conferidos'}</span></div>${reviewIssues.length ? `<small class="review-issue-list">${reviewIssues.map(issue => escapeHtml(issue.label)).join(' ')}</small>` : ''}</div><div class="xml-review-action">${matchDisplay}<button class="button secondary" data-create-draft="${index}" type="button">Revisar dados da nota</button><button class="button primary" data-create-product="${index}" type="button">Preparar produto</button></div></article>`;
    }).join('')}</div>`;
  $('#productDialogTitle').textContent = 'Conferir produtos do XML';
  $('#productDialogFoot').innerHTML = '<span class="readonly-badge"><i aria-hidden="true"></i>Sem gravação no Supabase</span><span class="local-storage-note">Rascunhos ficam neste navegador</span>';
}

function renderDraftList() {
  const drafts = readProductDrafts().sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));
  productDialogContent.innerHTML = drafts.length ? `<div class="draft-intro"><span class="eyebrow">SALVOS NESTE NAVEGADOR</span><strong>${drafts.length} ${drafts.length === 1 ? 'rascunho' : 'rascunhos'}</strong><p>Rascunhos não alteram o catálogo da loja. Abra um para continuar a conferência.</p></div><div class="xml-review-list">${drafts.map(draft => `<article class="xml-review-card"><div class="xml-review-main"><span class="eyebrow">${escapeHtml(draft.catalog_product_id ? `VINCULADO · ${draft.matched_by || 'CATÁLOGO'}` : 'CADASTRO A CONFIRMAR')}</span><strong>${escapeHtml(draft.name || 'Produto sem nome')}</strong><small>${escapeHtml([draft.sku, draft.supplier_name].filter(Boolean).join(' · ') || 'Dados fiscais pendentes')}</small><div class="xml-tags"><span>${getFiscalChecklist(draft).length} campos do produto pendentes</span><span>NCM ${escapeHtml(draft.ncm || 'pendente')}</span>${draft.identifier_check_status === 'unavailable' ? '<span>Duplicidade não conferida</span>' : ''}</div></div><div class="xml-review-action"><span class="status-pill attention"><i aria-hidden="true"></i>Rascunho local</span><button class="button secondary" data-edit-draft="${escapeHtml(draft.id)}" type="button">Continuar</button></div></article>`).join('')}</div>` : '<div class="empty-state"><span class="empty-icon" aria-hidden="true">▤</span><strong>Nenhum rascunho ainda</strong><span>Selecione “Conferir XML” para criar uma revisão local.</span></div>';
  $('#productDialogTitle').textContent = 'Rascunhos de produtos';
  $('#productDialogFoot').innerHTML = '<span class="readonly-badge"><i aria-hidden="true"></i>Armazenamento local</span><span class="local-storage-note">Visível apenas neste navegador</span>';
  if (!productDialog.open) productDialog.showModal();
}

function renderDraftEditor(draft) {
  const checklist = getFiscalChecklist(draft);
  const xmlReviewIssues = getNfeItemReviewIssues({
    raw_ncm: draft.raw_ncm_from_xml || draft.ncm, cfop: draft.cfop_from_xml,
    origin_code: draft.origin_code_from_xml ?? draft.origin_code, purchase_unit: draft.purchase_unit,
    purchase_quantity: draft.purchase_quantity, purchase_unit_price: draft.purchase_unit_price,
    tax_unit: draft.tax_unit_from_xml ?? draft.tax_unit, tax_quantity: draft.tax_quantity, tax_unit_price: draft.tax_unit_price,
    raw_commercial_gtin: draft.raw_commercial_gtin, raw_tax_gtin: draft.raw_tax_gtin
  });
  const input = (key, label, value = '', placeholder = '') => {
    const inputMode = ['ncm', 'cest'].includes(key) ? 'numeric' : ['sale_price', 'tax_quantity'].includes(key) ? 'decimal' : 'text';
    return `<label><span>${label}</span><input name="${key}" inputmode="${inputMode}" value="${escapeHtml(value)}" placeholder="${placeholder}" autocomplete="off"></label>`;
  };
  const select = (key, label, value, options) => `<label><span>${label}</span><select name="${key}"><option value="">Selecione</option>${options.map(([code, name]) => `<option value="${code}" ${String(value) === String(code) ? 'selected' : ''}>${code} · ${name}</option>`).join('')}</select></label>`;
  productDialogContent.innerHTML = `<form id="productDraftForm" class="draft-form" data-draft-id="${escapeHtml(draft.id)}">
    <div class="draft-warning"><strong>Rascunho local · não altera o produto do site</strong><span>O preço de custo veio da nota. Preço de venda, estoque e publicação não são alterados.</span></div>
    <fieldset><legend>Identificação do produto</legend><div class="draft-fields">${input('name','Nome do produto no catálogo',draft.name)}${input('sku','SKU / código interno',draft.sku)}${input('brand','Marca',draft.brand)}${input('packaging','Embalagem de venda',draft.packaging)}<label><span>Categoria do site</span><select name="category"><option value="">Selecione</option>${PRODUCT_CATEGORY_OPTIONS.map(category => `<option value="${escapeHtml(category)}" ${draft.category === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select></label>${input('sale_price','Preço de venda (R$)',draft.sale_price,'0,00')}${input('commercial_unit','Unidade usada no catálogo',draft.commercial_unit,'UN, KG, L…')}${input('tax_unit','Unidade tributável do produto',draft.tax_unit,'UN, KG, L…')}</div><p class="draft-hint">O código do fornecedor e o GTIN do XML ficam como referência. Eles não viram SKU interno automaticamente. O nome original da nota aparece abaixo.</p></fieldset>
    <fieldset><legend>Dados fiscais do produto para conferência</legend><div class="draft-fields">${input('ncm','NCM',draft.ncm,'8 dígitos')}${input('cest','CEST',draft.cest,'7 dígitos, se aplicável')}${select('origin_code','Origem da mercadoria',draft.origin_code,[['0','Nacional'],['1','Importação direta'],['2','Importação adquirida no mercado interno'],['3','Nacional com conteúdo de importação acima de 40%'],['4','Nacional conforme processo produtivo básico'],['5','Nacional com conteúdo de importação até 40%'],['6','Importação direta sem similar nacional'],['7','Importação adquirida sem similar nacional'],['8','Nacional com conteúdo de importação acima de 70%']])}${input('commercial_gtin','GTIN principal / comercial',draft.commercial_gtin,'Use SEM GTIN quando aplicável')}${input('tax_gtin','GTIN tributável',draft.tax_gtin,'Pode ser diferente do comercial')}</div></fieldset>
    <fieldset><legend>Dados da nota de entrada (somente referência)</legend><div class="xml-source-grid"><div><small>Descrição original da NF-e</small><strong>${escapeHtml(draft.description_from_xml || '—')}</strong></div><div><small>Fornecedor · CNPJ/CPF</small><strong>${escapeHtml([draft.supplier_name, draft.supplier_cnpj || draft.supplier_cpf].filter(Boolean).join(' · ') || '—')}</strong></div><div><small>NF-e · série · emissão</small><strong>${escapeHtml([draft.invoice_number && `nº ${draft.invoice_number}`, draft.invoice_series && `série ${draft.invoice_series}`, draft.invoice_date].filter(Boolean).join(' · ') || '—')}</strong></div><div><small>Chave de acesso</small><strong>${escapeHtml(draft.invoice_key || '—')}</strong></div><div><small>Código do produto no fornecedor</small><strong>${escapeHtml(draft.supplier_item_code || '—')}</strong></div><div><small>GTIN comercial / tributável no XML</small><strong>${escapeHtml([draft.raw_commercial_gtin || draft.xml_commercial_gtin || '—', draft.raw_tax_gtin || '—'].join(' · '))}</strong></div><div><small>Valor e quantidade comercial (uCom, qCom, vUnCom)</small><strong>${escapeHtml([draft.purchase_quantity, draft.purchase_unit, draft.purchase_unit_price !== null && draft.purchase_unit_price !== undefined ? formatMoney(Math.round(Number(draft.purchase_unit_price) * 100)) : null].filter(x => x !== null && x !== '').join(' · ') || '—')}</strong></div><div><small>Valor e quantidade tributável da nota (uTrib, qTrib, vUnTrib)</small><strong>${escapeHtml([draft.tax_quantity, draft.tax_unit_from_xml ?? draft.tax_unit, draft.tax_unit_price !== null && draft.tax_unit_price !== undefined ? formatMoney(Math.round(Number(draft.tax_unit_price) * 100)) : null].filter(x => x !== null && x !== '').join(' · ') || '—')}</strong></div><div><small>Total dos produtos desta linha (vProd)</small><strong>${draft.product_line_total === null || draft.product_line_total === '' ? '—' : formatMoney(Math.round(Number(draft.product_line_total) * 100))}</strong></div><div><small>Frete · seguro · desconto · outras despesas</small><strong>${escapeHtml([['frete', draft.product_line_freight], ['seguro', draft.product_line_insurance], ['desconto', draft.product_line_discount], ['outras', draft.product_line_other_expenses]].filter(([, value]) => value !== null && value !== undefined).map(([label, value]) => `${label}: ${formatMoney(Math.round(Number(value) * 100))}`).join(' · ') || '—')}</strong></div><div><small>NCM / CEST / CFOP da nota</small><strong>${escapeHtml([draft.raw_ncm_from_xml || draft.ncm || 'sem NCM', draft.raw_cest_from_xml || draft.cest || 'sem CEST', draft.cfop_from_xml || 'sem CFOP'].join(' · '))}</strong></div><div><small>Origem / escala / fabricante</small><strong>${escapeHtml([draft.origin_code_from_xml ?? draft.origin_code ?? 'origem ausente', draft.scale_indicator && `escala ${draft.scale_indicator}`, draft.extipi && `EX TIPI ${draft.extipi}`, draft.manufacturer_cnpj && `CNPJ fabricante ${draft.manufacturer_cnpj}`].filter(Boolean).join(' · ') || '—')}</strong></div><div><small>Conversão informada na nota</small><strong>${draft.units_per_purchase_unit ? `${formatQuantity(draft.units_per_purchase_unit)} ${escapeHtml(draft.tax_unit_from_xml ?? draft.tax_unit)} por ${escapeHtml(draft.purchase_unit)}` : 'Não calculada a partir de qCom/qTrib'}</strong></div><div><small>Custo por unidade tributável</small><strong>${draft.cost_per_tax_unit === null || draft.cost_per_tax_unit === '' ? '—' : formatMoney(Math.round(Number(draft.cost_per_tax_unit) * 100))}</strong></div><div><small>ICMS · CST / CSOSN</small><strong>${escapeHtml([draft.tax_codes_from_xml?.icms_cst && `CST ${draft.tax_codes_from_xml.icms_cst}`, draft.tax_codes_from_xml?.icms_csosn && `CSOSN ${draft.tax_codes_from_xml.icms_csosn}`].filter(Boolean).join(' · ') || '—')}</strong></div><div><small>PIS · COFINS · IPI CST</small><strong>${escapeHtml([draft.tax_codes_from_xml?.pis_cst && `PIS ${draft.tax_codes_from_xml.pis_cst}`, draft.tax_codes_from_xml?.cofins_cst && `COFINS ${draft.tax_codes_from_xml.cofins_cst}`, draft.tax_codes_from_xml?.ipi_cst && `IPI ${draft.tax_codes_from_xml.ipi_cst}`].filter(Boolean).join(' · ') || '—')}</strong></div><div><small>IBS/CBS CST · classificação</small><strong>${escapeHtml([draft.tax_codes_from_xml?.ibs_cbs_cst, draft.tax_codes_from_xml?.ibs_cbs_classification].filter(Boolean).join(' · ') || '—')}</strong></div><div><small>Benefício fiscal (cBenef)</small><strong>${escapeHtml(draft.cbenef_from_xml || '—')}</strong></div><div><small>Item incluso no total da NF-e</small><strong>${escapeHtml(draft.included_in_invoice_total || '—')}</strong></div>${draft.item_additional_info ? `<div><small>Informações adicionais do item</small><strong>${escapeHtml(draft.item_additional_info)}</strong></div>` : ''}</div><p class="draft-hint">Valores e códigos fiscais acima são os da operação de compra. Não devem ser copiados automaticamente como regra de venda. O custo base da nota é de compra; o custo por unidade tributável vem de vUnTrib quando presente. Frete, descontos e outras despesas são exibidos sem rateio automático.</p></fieldset>
    <div class="draft-bottom"><span>${checklist.length ? `${checklist.length} campos do produto para completar` : 'Campos básicos do produto preenchidos'}${checklist.length ? ` · ${checklist.map(item => item.label).join(', ')}` : ''}${xmlReviewIssues.length ? `<small class="review-issue-list">${xmlReviewIssues.length} pontos da nota para conferir: ${xmlReviewIssues.map(issue => escapeHtml(issue.label)).join(' ')}</small>` : ''}${draft.identifier_check_status === 'unavailable' ? '<small class="review-issue-list">A consulta de identificadores não concluiu. Confirme duplicidades antes de qualquer cadastro.</small>' : ''}</span><button class="button primary" type="submit">Salvar rascunho local</button></div>
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
      let lookup;
      try {
        lookup = await adminApi('product_matches', { items: [{ sku: values.sku, commercial_gtin: values.commercial_gtin, tax_gtin: values.tax_gtin }] });
        if (!Array.isArray(lookup?.products)) throw new Error('Resposta inválida do catálogo.');
      } catch { candidate.identifier_check_status = 'unavailable'; }
      if (lookup) {
        const conflicts = findIdentifierConflicts(candidate, lookup.products);
        if (conflicts.length) throw new Error(conflicts.map(issue => issue.label).join(' '));
        candidate.identifier_check_status = 'complete';
      }
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

function renderProductEditor(product = {}, sourceDraft = null) {
  const isExisting = Boolean(product.id);
  let selectedImageUrl = product.image_url || '';
  const field = (key, label, value = '', options = {}) => `<label class="editor-field ${options.wide ? 'field-wide' : ''}"><span>${label}${options.required ? ' <b>*</b>' : ''}</span><input name="${key}" type="${options.type || 'text'}" ${options.inputmode ? `inputmode="${options.inputmode}"` : ''} ${options.step ? `step="${options.step}"` : ''} ${options.min ? `min="${options.min}"` : ''} value="${escapeHtml(value)}" placeholder="${escapeHtml(options.placeholder || '')}" ${options.required ? 'required' : ''} autocomplete="off"></label>`;
  const category = product.category || sourceDraft?.category || '';
  const origin = product.origin_code ?? sourceDraft?.origin_code ?? '';
  const price = product.price ?? (Number.isFinite(Number(product.sale_price_cents)) ? (Number(product.sale_price_cents) / 100).toFixed(2) : sourceDraft?.sale_price ?? '');
  const stock = product.stock_quantity ?? product.stock ?? 0;
  const wasActive = product.active === true || product.is_active === true;
  const issues = getProductReadinessIssues({ ...product, price, stock, category, commercial_unit: product.commercial_unit || product.unit || sourceDraft?.commercial_unit, tax_unit: product.tax_unit || sourceDraft?.tax_unit });
  productDialogContent.innerHTML = `<form id="productEditorForm" class="product-editor-form">
    <div class="draft-warning"><strong>Área de teste · gravação local</strong><span>Salvar mantém os dados neste navegador. Nada é enviado ao Supabase, ao site ou ao Bling.</span></div>
    <fieldset><legend>Produto</legend><div class="product-editor-grid">
      <label class="editor-field image-upload field-wide"><span>Imagem do produto</span><input id="productImageFile" type="file" accept="image/jpeg,image/png,image/webp"><small>JPG, PNG ou WebP. O Admin1 converte para WebP, até 1.200 px e no máximo 30 KB.</small><div class="image-preview" id="productImagePreview">${selectedImageUrl ? `<img src="${escapeHtml(selectedImageUrl)}" alt="Prévia da imagem">` : '<span class="product-placeholder" aria-hidden="true">▦</span><span>Nenhuma imagem selecionada</span>'}</div><button type="button" class="text-button" id="removeProductImage" ${selectedImageUrl ? '' : 'hidden'}>Remover imagem</button></label>
      ${field('name','Nome do produto',product.name || sourceDraft?.name || '',{required:true,wide:true})}
      ${field('sku','SKU / código interno',product.sku || sourceDraft?.sku || '',{required:true})}
      ${field('brand','Marca',product.brand || sourceDraft?.brand || '')}
      ${field('packaging','Apresentação / embalagem',product.packaging || sourceDraft?.packaging || '')}
      <label class="editor-field"><span>Categoria <b>*</b></span><select name="category" required><option value="">Selecione</option>${[...new Set([...PRODUCT_CATEGORY_OPTIONS, ...state.categories])].map(item => `<option value="${escapeHtml(item)}" ${category === item ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}</select></label>
      ${field('price','Preço de venda (R$)',price,{required:true,inputmode:'decimal',step:'0.01',min:'0.01',placeholder:'0,00'})}
      ${field('cost','Custo (R$)',product.cost ?? sourceDraft?.cost_per_tax_unit ?? '',{inputmode:'decimal',step:'0.0001',min:'0',placeholder:'0,00'})}
      ${field('stock','Estoque atual',stock,{required:true,inputmode:'decimal',step:'0.001',min:'0'})}
      ${field('min_stock','Estoque mínimo',product.min_stock ?? 0,{inputmode:'decimal',step:'0.001',min:'0'})}
      ${field('validity_date','Validade',product.validity_date || '',{type:'date'})}
      ${field('gondola','Gôndola',product.gondola || '')}
      ${field('shelf','Prateleira',product.shelf || '')}
      ${field('supplier','Fornecedor principal',product.supplier || sourceDraft?.supplier_name || '')}
      ${field('description_short','Descrição curta',product.description_short || '',{wide:true})}
      <label class="editor-field field-wide"><span>Descrição completa</span><textarea name="description_long" rows="3">${escapeHtml(product.description_long || product.description || '')}</textarea></label>
    </div></fieldset>
    <fieldset><legend>Identificação fiscal e unidades</legend><div class="product-editor-grid">
      ${field('ncm','NCM',product.ncm || sourceDraft?.ncm || '',{inputmode:'numeric',placeholder:'8 dígitos'})}
      ${field('cest','CEST',product.cest || sourceDraft?.cest || '',{inputmode:'numeric',placeholder:'7 dígitos, se aplicável'})}
      <label class="editor-field"><span>Origem da mercadoria</span><select name="origin_code"><option value="">Selecione</option>${[['0','Nacional'],['1','Importação direta'],['2','Importada, adquirida no mercado interno'],['3','Nacional, conteúdo importado acima de 40%'],['4','Nacional, processo produtivo básico'],['5','Nacional, conteúdo importado até 40%'],['6','Importação direta sem similar nacional'],['7','Importada sem similar nacional'],['8','Nacional, conteúdo importado acima de 70%']].map(([code,label]) => `<option value="${code}" ${String(origin) === code ? 'selected' : ''}>${code} · ${label}</option>`).join('')}</select></label>
      ${field('commercial_gtin','GTIN comercial',product.commercial_gtin || product.gtin || sourceDraft?.commercial_gtin || '',{placeholder:'EAN ou SEM GTIN'})}
      ${field('tax_gtin','GTIN tributável',product.tax_gtin || sourceDraft?.tax_gtin || '',{placeholder:'EAN ou SEM GTIN'})}
      ${field('commercial_unit','Unidade comercial',product.commercial_unit || product.unit || sourceDraft?.commercial_unit || '',{placeholder:'UN, KG, L…'})}
      ${field('tax_unit','Unidade tributável',product.tax_unit || sourceDraft?.tax_unit || '',{placeholder:'UN, KG, L…'})}
    </div><p class="draft-hint">CFOP e CST/CSOSN pertencem à operação da nota e ficam preservados na conferência do XML, não como regra fiscal padrão do produto.</p></fieldset>
    <fieldset><legend>Disponibilidade</legend><label class="active-toggle"><input name="active" type="checkbox" ${wasActive ? 'checked' : ''}><span><strong>Produto ativo</strong><small>Produtos sem estoque ficam automaticamente inativos. Repor o estoque não reativa o produto sozinho.</small></span></label></fieldset>
    <div class="editor-readiness"><strong>Conferência fiscal</strong><span>${issues.length ? `${issues.length} campo(s) para revisar: ${issues.map(issue => escapeHtml(issue.label)).join(', ')}` : 'Campos fiscais principais preenchidos.'}</span></div>
    <p id="productEditorError" class="draft-save-error" role="alert" hidden></p>
    <div class="draft-bottom"><span>Campos obrigatórios: nome, SKU, categoria, preço e estoque.</span><div><button class="button secondary" type="button" id="cancelProductEdit">Cancelar</button> <button class="button primary" type="submit">Salvar neste navegador</button></div></div>
  </form>`;
  $('#productDialogTitle').textContent = isExisting ? `Editar · ${product.name || 'produto'}` : 'Novo produto';
  $('#productDialogFoot').innerHTML = '<span class="readonly-badge"><i aria-hidden="true"></i>Somente neste navegador</span><span class="local-storage-note">Até 30 KB por imagem</span>';
  if (!productDialog.open) productDialog.showModal();
  const form = $('#productEditorForm');
  const imagePreview = $('#productImagePreview');
  const imageInput = $('#productImageFile');
  $('#removeProductImage').addEventListener('click', () => {
    selectedImageUrl = '';
    imagePreview.innerHTML = '<span class="product-placeholder" aria-hidden="true">▦</span><span>Nenhuma imagem selecionada</span>';
    $('#removeProductImage').hidden = true;
    imageInput.value = '';
  });
  $('#cancelProductEdit').addEventListener('click', () => productDialog.close());
  imageInput.addEventListener('change', async () => {
    const imageFile = imageInput.files?.[0];
    if (!imageFile) return;
    const button = imageInput;
    button.disabled = true;
    try {
      const image = await compressProductImage(imageFile);
      selectedImageUrl = image.dataUrl;
      imagePreview.innerHTML = `<img src="${escapeHtml(image.dataUrl)}" alt="Prévia da imagem"><span>${Math.ceil(image.size / 1024)} KB · WebP</span>`;
      $('#removeProductImage').hidden = false;
    } catch (error) {
      const notice = $('#productEditorError');
      notice.textContent = error.message;
      notice.hidden = false;
    } finally { button.disabled = false; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    const notice = $('#productEditorError');
    notice.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Salvando localmente…';
    try {
      const values = Object.fromEntries(new FormData(form));
      const record = { ...product, ...values, id: product.id, image_url: selectedImageUrl, active: form.elements.active.checked };
      let matchedProducts = [];
      try {
        const result = await adminApi('product_matches', { items: [{ sku: values.sku, commercial_gtin: values.commercial_gtin, tax_gtin: values.tax_gtin }] });
        matchedProducts = result.products || [];
      } catch { /* edição continua local; a checagem online fica limitada ao catálogo já carregado */ }
      const conflict = findIdentifierConflicts(record, [...state.products, ...matchedProducts]);
      if (conflict.length) throw new Error(conflict.map(issue => issue.label).join(' '));
      const saved = saveProductWorkspaceProduct(record, getProductWorkspaceStorage(), { catalogProducts: [...state.products, ...matchedProducts] });
      state.workspaceProducts = saved.products;
      state.products = mergeWorkspaceProducts(state.catalogProducts, state.workspaceProducts);
      state.total = Math.max(state.total, state.products.length);
      productDialog.close();
      renderProducts();
    } catch (error) {
      notice.textContent = error.message || 'Não foi possível salvar o produto neste navegador.';
      notice.hidden = false;
    } finally { submit.disabled = false; submit.textContent = 'Salvar neste navegador'; }
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
  const prepareProductButton = event.target.closest('[data-create-product]');
  if (prepareProductButton) {
    const index = Number(prepareProductButton.dataset.createProduct);
    const item = state.xmlItems[index];
    const match = state.xmlMatches[index] || null;
    const draft = createProductDraft(item, new Date(), match);
    const existing = match && !match.ambiguous ? state.products.find(candidate => String(candidate.id) === String(match.id)) || match : {};
    renderProductEditor(existing || {}, draft);
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
  const image = product.image_url && (/^https:\/\//i.test(product.image_url) || /^data:image\/webp;base64,/i.test(product.image_url))
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
        <div class="detail-stock">${stockBadge(product)} <span>${formatProductStock(product)} vendável</span></div>
      </div>
    </div>
    <section class="detail-section"><h3>Informações do produto</h3><dl class="detail-attributes">
      <div><dt>SKU</dt><dd>${escapeHtml(product.sku || '—')}</dd></div>
      <div><dt>EAN</dt><dd>${escapeHtml(product.gtin || '—')}</dd></div>
      <div><dt>NCM cadastrado</dt><dd>${escapeHtml(product.ncm || 'Não informado')}</dd></div>
      <div><dt>Unidade</dt><dd>${escapeHtml(product.unit || '—')}</dd></div>
      <div><dt>Status na loja</dt><dd>${escapeHtml(getProductAvailability(product).label)}</dd></div>
      <div><dt>Estoque mínimo</dt><dd>${formatQuantity(product.min_stock)}</dd></div>
      <div><dt>Custo</dt><dd>${product.cost === null || product.cost === undefined ? '—' : formatMoney(Math.round(Number(product.cost) * 100))}</dd></div>
      <div><dt>Validade</dt><dd>${escapeHtml(product.validity_date || '—')}</dd></div>
      <div><dt>Gôndola</dt><dd>${escapeHtml(product.gondola || '—')}</dd></div>
      <div><dt>Prateleira</dt><dd>${escapeHtml(product.shelf || '—')}</dd></div>
      <div><dt>Fornecedor</dt><dd>${escapeHtml(product.supplier || '—')}</dd></div>
      ${visibleAttributes.map(item => `<div><dt>${escapeHtml(item.label || 'Informação')}</dt><dd>${escapeHtml(item.value)}</dd></div>`).join('')}
    </dl></section>
    <section class="detail-section"><h3>Dados fiscais</h3><dl class="detail-attributes"><div><dt>NCM</dt><dd>${escapeHtml(product.ncm || '—')}</dd></div><div><dt>CEST</dt><dd>${escapeHtml(product.cest || '—')}</dd></div><div><dt>Origem</dt><dd>${escapeHtml(product.origin_code || '—')}</dd></div><div><dt>GTIN tributável</dt><dd>${escapeHtml(product.tax_gtin || '—')}</dd></div><div><dt>Unidade comercial</dt><dd>${escapeHtml(product.commercial_unit || product.unit || '—')}</dd></div><div><dt>Unidade tributável</dt><dd>${escapeHtml(product.tax_unit || '—')}</dd></div></dl></section>
    <section class="detail-section"><h3>Descrição</h3><p class="detail-description">${escapeHtml(description)}</p></section>
    <div class="detail-actions"><span class="local-storage-note">${product.workspace_source === 'local' ? 'Alterações locais neste navegador' : 'Produto do catálogo, somente leitura'}</span><button type="button" class="button primary" data-edit-product="${escapeHtml(product.id)}">Editar localmente</button></div>`;
  $('#productDialogTitle').textContent = product.name || 'Detalhes do produto';
  productDialogContent.querySelector('[data-edit-product]')?.addEventListener('click', () => renderProductEditor(product));
}

async function openProductDetail(productId) {
  const product = state.products.find(item => String(item.id) === String(productId));
  if (!product) return;
  const currentVersion = ++detailRequestVersion;
  productDialogContent.innerHTML = '<div class="detail-loading"><span class="spinner" aria-hidden="true"></span><strong>Carregando detalhes do produto…</strong></div>';
  $('#productDialogFoot').innerHTML = '<span class="readonly-badge"><i aria-hidden="true"></i>Consulta do catálogo</span>';
  $('#productDialogTitle').textContent = product.name || 'Detalhes do produto';
  if (!productDialog.open) productDialog.showModal();
  if (product.workspace_source === 'local') {
    renderProductDetail(product);
    return;
  }
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
  const statusButton = event.target.closest('[data-toggle-product-active]');
  if (statusButton) {
    const product = state.products.find(item => String(item.id) === statusButton.dataset.toggleProductActive);
    if (!product || statusButton.disabled) return;
    const nextActive = statusButton.dataset.nextActive === 'true';
    try {
      const saved = saveProductWorkspaceProduct({ ...product, active: nextActive }, getProductWorkspaceStorage(), { catalogProducts: state.catalogProducts, statusOnly: true });
      state.workspaceProducts = saved.products;
      state.products = mergeWorkspaceProducts(state.catalogProducts, state.workspaceProducts);
      renderProducts();
    } catch (error) { window.alert(error.message || 'Não foi possível salvar a situação local.'); }
    return;
  }
  const edit = event.target.closest('[data-edit-product]');
  if (edit) {
    const product = state.products.find(item => String(item.id) === edit.dataset.editProduct);
    if (product) renderProductEditor(product);
    return;
  }
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
      q: state.query, category: state.category, status: 'all', stock: 'all'
    });
    if (currentVersion !== requestVersion) return;
    state.catalogProducts = append ? [...state.catalogProducts, ...result.products] : result.products;
    state.workspaceProducts = readProductWorkspace();
    state.products = mergeWorkspaceProducts(state.catalogProducts, state.workspaceProducts);
    state.nextOffset = result.next_offset;
    state.total = Math.max(Number(result.total || 0), state.products.length);
    state.catalogError = '';
    renderProducts();
  } catch (error) {
    if (currentVersion !== requestVersion) return;
    state.catalogError = error.message || 'Verifique a conexão e tente novamente.';
    state.catalogProducts = [];
    state.workspaceProducts = readProductWorkspace();
    state.products = mergeWorkspaceProducts([], state.workspaceProducts);
    state.total = state.products.length;
    state.nextOffset = null;
    renderProducts();
  }
}

adminApi('categories').then(result => { state.categories = result.categories || []; if (state.products.length) renderProducts(); }).catch(() => {});
$('#sessionLabel').textContent = 'Produtos';
$('#currentSection').textContent = 'Produtos';
loadProducts();



