import { adminApi, adminWrite } from './api.js';
import { clearSession, ensureSession } from './auth.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { view: 'products', products: [], basketProducts: [], nextProductsOffset: null, productFacets: { categories: [], subcategories: [] }, baskets: [], basket: null, editorProduct: null, search: '', status: '', loading: false, bling: null, blingCheck: null, blingChecking: false };
const workspace = $('#workspace');
const dialog = $('#editorDialog');
let toastTimer;
let productFetchVersion = 0;

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function formatMoney(value, cents = false) {
  const amount = Number(value || 0) / (cents ? 100 : 1);
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function toast(message, kind = '') {
  const el = $('#toast');
  el.textContent = message;
  el.className = 'toast show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3200);
}
function showError(error) {
  const labels = {
    admin_not_authorized: 'Seu usuário ainda não tem acesso ao catálogo.',
    forbidden: 'Seu perfil permite consulta, mas não alteração.',
    admin_session_invalid: 'Sua sessão expirou. Atualize a página para entrar novamente.',
    name_required: 'Informe o nome do produto.',
    gtin_already_exists: 'Este EAN já está vinculado a outro produto.',
    sku_already_exists: 'Este SKU já está em uso.',
    product_unavailable: 'Ative o produto antes de incluí-lo na cesta.'
  };
  toast(labels[error.message] || error.message || 'Não foi possível concluir a ação.', 'error');
}
function setLoading(title = 'Carregando catálogo…') {
  workspace.innerHTML = '<div class="loading-card"><span class="spinner"></span><strong>' + escape(title) + '</strong><small>Os dados vêm do catálogo oficial da loja.</small></div>';
}
function setView(view) {
  state.view = view;
  $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  const names = { products: 'Produtos', baskets: 'Cestas', bling: 'Integração Bling' };
  $('#currentSection').textContent = names[view] || 'Catálogo';
  if (view === 'products') loadProducts();
  if (view === 'baskets') loadBaskets();
  if (view === 'bling') loadBling();
}

async function loadProducts({ quiet = false, append = false } = {}) {
  const focusedSearch = quiet && document.activeElement?.id === 'productSearch';
  const cursor = focusedSearch ? document.activeElement.selectionStart : null;
  const fetchVersion = ++productFetchVersion;
  if (!quiet) setLoading('Carregando produtos…');
  try {
    const [result, facets] = await Promise.all([
      adminApi('products', { limit: 80, offset: append ? state.nextProductsOffset : 0, q: state.search, active: state.status }),
      adminApi('product_facets')
    ]);
    if (fetchVersion !== productFetchVersion) return;
    state.products = append ? [...state.products, ...(result.products || [])] : (result.products || []);
    state.nextProductsOffset = result.next_offset ?? null;
    state.productFacets = facets || state.productFacets;
    renderProducts();
    if (focusedSearch) {
      const input = $('#productSearch');
      input?.focus();
      if (input && cursor !== null) input.setSelectionRange(cursor, cursor);
    }
  } catch (error) { showError(error); renderError('products'); }
}
function renderProducts() {
  const all = state.products;
  const active = all.filter(product => product.active === true).length;
  const inStock = all.filter(product => Number(product.stock_quantity || 0) > 0).length;
  workspace.innerHTML = '<div class="page-heading"><div><span class="eyebrow">CATÁLOGO DA LOJA</span><h1>Produtos</h1><p>Cadastre e mantenha os produtos que alimentam a vitrine pública.</p></div><button class="button primary" id="newProduct"><span>＋</span> Novo produto</button></div>' +
    '<div class="metric-row"><article class="metric-card"><span>Produtos nesta página</span><strong>' + all.length + '</strong><small>Lista atual</small></article><article class="metric-card"><span>Ativos</span><strong>' + active + '</strong><small>Marcados para venda</small></article><article class="metric-card"><span>Com estoque</span><strong>' + inStock + '</strong><small>Estoque maior que zero</small></article></div>' +
    '<section class="panel"><div class="panel-toolbar"><div class="search-wrap"><span>⌕</span><input id="productSearch" type="search" placeholder="Buscar por nome, SKU ou EAN" value="' + escape(state.search) + '"></div><select id="productStatus" aria-label="Filtrar por status"><option value="">Todos os status</option><option value="true" ' + (state.status === 'true' ? 'selected' : '') + '>Ativos</option><option value="false" ' + (state.status === 'false' ? 'selected' : '') + '>Inativos</option></select><button class="button secondary" id="refreshProducts">Atualizar</button></div>' +
    '<div class="table-scroll"><table class="data-table"><thead><tr><th>Produto</th><th>SKU / EAN</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Status</th><th></th></tr></thead><tbody>' + (all.length ? all.map(productRow).join('') : '<tr><td colspan="7"><div class="empty-state"><strong>Nenhum produto encontrado</strong><span>Experimente outro termo de busca ou cadastre um produto.</span></div></td></tr>') + '</tbody></table></div><div class="panel-foot">' + all.length + ' produtos carregados nesta consulta. A disponibilidade no site também depende de estoque, validade e preço maior que zero.' + (state.nextProductsOffset !== null ? ' <button class="quiet-button" id="loadMoreProducts" type="button">Carregar mais produtos →</button>' : '') + '</div></section>';
  $('#newProduct').onclick = () => openProductEditor();
  $('#refreshProducts').onclick = loadProducts;
  if ($('#loadMoreProducts')) $('#loadMoreProducts').onclick = () => loadProducts({ append: true });
  $('#productStatus').onchange = event => { state.status = event.target.value; loadProducts(); };
  let timer;
  $('#productSearch').oninput = event => { clearTimeout(timer); timer = setTimeout(() => { state.search = event.target.value.trim(); loadProducts({ quiet: true }); }, 320); };
  $$('.edit-product').forEach(button => button.onclick = () => openProductEditor(all.find(item => item.id === button.dataset.id)));
}
function productRow(product) {
  const today = new Date();
  const todayLocal = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const notExpired = !product.expiration_date || String(product.expiration_date).slice(0, 10) >= todayLocal;
  const available = product.active === true && Number(product.stock_quantity || 0) > 0 && Number(product.sale_price_cents || 0) > 0 && notExpired;
  const category = product.category || product.sales_category || product.storefront_category || 'Sem categoria';
  return '<tr><td><div class="product-cell">' + (product.image_url ? '<img src="' + escape(product.image_url) + '" alt="" loading="lazy">' : '<span class="product-placeholder">□</span>') + '<span><strong>' + escape(product.name) + '</strong><small>' + escape(product.brand || product.packaging || 'Produto') + '</small></span></div></td><td><strong>' + escape(product.sku || '—') + '</strong><small class="subline">' + escape(product.gtin || 'Sem EAN') + '</small></td><td>' + escape(category) + '</td><td class="money-cell">' + formatMoney(product.sale_price_cents, true) + '</td><td>' + escape(product.stock_quantity ?? 0) + '</td><td><span class="status-pill ' + (available ? 'good' : product.active ? 'attention' : 'muted') + '"><i></i>' + (available ? 'Disponível' : product.active ? 'Revisar venda' : 'Inativo') + '</span></td><td><button class="icon-button edit-product" data-id="' + escape(product.id) + '" aria-label="Editar ' + escape(product.name) + '">•••</button></td></tr>';
}
function options(values, selected) {
  const unique = [...new Set((values || []).map(value => typeof value === 'string' ? value : (value?.value || value?.name || value?.label)).filter(Boolean))];
  return '<option value="">Selecione</option>' + unique.map(value => '<option value="' + escape(value) + '" ' + (value === selected ? 'selected' : '') + '>' + escape(value) + '</option>').join('');
}
function openProductEditor(product = null) {
  const item = product || {};
  state.editorProduct = item;
  $('#dialogEyebrow').textContent = 'PRODUTOS';
  $('#dialogTitle').textContent = product ? 'Editar produto' : 'Novo produto';
  const categories = state.productFacets.categories || [];
  const subs = state.productFacets.subcategories || [];
  $('#dialogContent').innerHTML = '<input type="hidden" name="id" value="' + escape(item.id || '') + '"><div class="form-grid"><label class="field full"><span>Nome do produto *</span><input name="name" required maxlength="300" value="' + escape(item.name || '') + '"></label><label class="field"><span>SKU</span><input name="sku" maxlength="120" value="' + escape(item.sku || '') + '"></label><label class="field"><span>EAN / GTIN</span><input name="gtin" inputmode="numeric" maxlength="30" value="' + escape(item.gtin || '') + '"></label><label class="field"><span>Marca</span><input name="brand" maxlength="160" value="' + escape(item.brand || '') + '"></label><label class="field"><span>Embalagem</span><input name="packaging" maxlength="120" placeholder="Ex.: 500 g, 1 L" value="' + escape(item.packaging || '') + '"></label><label class="field"><span>Preço de venda (R$)</span><input name="price" inputmode="decimal" value="' + escape((Number(item.sale_price_cents || 0) / 100).toFixed(2).replace('.', ',')) + '"></label><label class="field"><span>Preço de custo (R$)</span><input name="cost" inputmode="decimal" value="' + escape((Number(item.cost_cents || 0) / 100).toFixed(2).replace('.', ',')) + '"></label><label class="field"><span>Categoria</span><select name="category">' + options(categories, item.category || item.sales_category || item.storefront_category || '') + '</select></label><label class="field"><span>Subcategoria</span><select name="subcategory">' + options(subs, item.subcategory || '') + '</select></label><label class="field full"><span>Imagem (URL)</span><input name="image_url" type="url" value="' + escape(item.image_url || '') + '"></label><label class="field full"><span>Descrição curta</span><textarea name="description" rows="3" maxlength="1000">' + escape(item.description || '') + '</textarea></label><label class="check-field full"><input name="active" type="checkbox" ' + (item.active === true ? 'checked' : '') + '><span><strong>Produto ativo</strong><small>Para aparecer na loja também precisa de preço válido, estoque e validade em dia.</small></span></label></div>';
  $('#dialogFooter').innerHTML = '<button class="button secondary" value="cancel">Cancelar</button><button class="button primary" id="saveProduct" type="button">Salvar produto</button>';
  $('#saveProduct').onclick = saveProduct;
  dialog.showModal();
}
function parseMoney(value) {
  const normalized = String(value || '').trim().replace(/\./g, '').replace(',', '.');
  const result = Number(normalized);
  return Number.isFinite(result) && result >= 0 ? Math.round(result * 100) : 0;
}
async function saveProduct() {
  const product = state.editorProduct || {};
  const form = $('#dialogContent');
  const get = name => $('[name="' + name + '"]', form);
  const payload = {
    id: get('id').value || undefined,
    name: get('name').value.trim(), sku: get('sku').value.trim(), gtin: get('gtin').value.trim(), brand: get('brand').value.trim(),
    packaging: get('packaging').value.trim(), sale_price_cents: parseMoney(get('price').value), cost_cents: parseMoney(get('cost').value),
    category: get('category').value, subcategory: get('subcategory').value, image_url: get('image_url').value.trim(),
    description: get('description').value.trim(), active: get('active').checked,
    expiration_date: product.expiration_date || '', stock_quantity: Number(product.stock_quantity || 0),
    auto_expiry_offer_enabled: product.auto_expiry_offer_enabled === true,
    is_whatsapp_active: product.is_whatsapp_active === true, whatsapp_category: product.whatsapp_category || '',
    storefront_featured: product.storefront_featured === true, is_upsell: product.is_upsell === true,
    subsubcategory: product.subsubcategory || product.detailed_subcategory || '', unit: product.unit || '', supplier: product.supplier || '',
    min_stock: product.min_stock ?? '', tags: Array.isArray(product.tags) ? product.tags : [],
    purchase_xml_stock_update: product.purchase_xml_stock_update !== false
  };
  if (!payload.name) { get('name').focus(); toast('Informe o nome do produto.', 'error'); return; }
  const button = $('#saveProduct'); button.disabled = true; button.textContent = 'Salvando…';
  try { await adminWrite('product_save', payload); dialog.close(); toast('Produto salvo com sucesso.'); await loadProducts(); }
  catch (error) { showError(error); button.disabled = false; button.textContent = 'Salvar produto'; }
}

async function loadBaskets() {
  setLoading('Carregando cestas…');
  try {
    const result = await adminApi('baskets_admin');
    state.baskets = result.baskets || [];
    renderBaskets(result.summary || {});
  } catch (error) { showError(error); renderError('baskets'); }
}
function renderBaskets(summary) {
  workspace.innerHTML = '<div class="page-heading"><div><span class="eyebrow">VITRINE PÚBLICA</span><h1>Cestas</h1><p>Edite modelos, preços e itens que compõem cada cesta.</p></div><button class="button secondary" id="refreshBaskets">Atualizar</button></div><div class="metric-row"><article class="metric-card"><span>Modelos cadastrados</span><strong>' + (summary.templates ?? state.baskets.length) + '</strong><small>Composição configurada</small></article><article class="metric-card"><span>Ativos</span><strong>' + (summary.active ?? 0) + '</strong><small>Disponíveis para a loja</small></article><article class="metric-card"><span>Unidades prontas</span><strong>' + (summary.ready_units ?? 0) + '</strong><small>Estoque montado</small></article></div><section class="basket-grid">' + (state.baskets.length ? state.baskets.map(basketCard).join('') : '<div class="empty-state">Nenhuma cesta encontrada.</div>') + '</section>';
  $('#refreshBaskets').onclick = loadBaskets;
  $$('.basket-edit').forEach(button => button.onclick = () => openBasketEditor(button.dataset.id));
}
function basketCard(basket) {
  return '<article class="basket-card"><div class="basket-image">' + (basket.image_url ? '<img src="' + escape(basket.image_url) + '" alt="" loading="lazy">' : '<span>◈</span>') + '<span class="status-pill ' + (basket.is_active ? 'good' : 'muted') + '"><i></i>' + (basket.is_active ? 'Ativa' : 'Inativa') + '</span></div><div class="basket-card-body"><div><span class="eyebrow">' + escape(basket.sku || 'CESTA') + '</span><h3>' + escape(basket.name) + '</h3><p>' + escape(basket.template_item_count || 0) + ' itens na composição</p></div><div class="basket-card-foot"><strong>' + formatMoney(basket.base_price_cents, true) + '</strong><button class="button secondary basket-edit" data-id="' + escape(basket.id) + '">Editar</button></div></div></article>';
}
async function openBasketEditor(id) {
  $('#dialogEyebrow').textContent = 'CESTAS';
  $('#dialogTitle').textContent = 'Editar cesta';
  $('#dialogContent').innerHTML = '<div class="loading-inline"><span class="spinner"></span>Carregando composição…</div>';
  $('#dialogFooter').innerHTML = '<button class="button secondary" value="cancel">Fechar</button>';
  dialog.showModal();
  try {
    const result = await adminApi('basket_admin', { id });
    state.basket = result;
    await loadProductsForBasket();
    renderBasketEditor(result);
  } catch (error) { showError(error); $('#dialogContent').innerHTML = '<div class="empty-state">Não foi possível abrir esta cesta.</div>'; }
}
async function loadProductsForBasket() {
  if (state.basketProducts.length) return;
  const products = [];
  let offset = 0;
  for (let page = 0; page < 25; page += 1) {
    const result = await adminApi('products', { limit: 100, offset, active: 'true' });
    products.push(...(result.products || []));
    if (result.next_offset == null) break;
    offset = result.next_offset;
  }
  state.basketProducts = products;
}
function renderBasketEditor(result) {
  const basket = result.basket || {};
  const items = result.items || [];
  const productOptions = '<option value="">Selecione um produto ativo</option>' + state.basketProducts.map(product => '<option value="' + escape(product.id) + '">' + escape(product.name + (product.packaging ? ' · ' + product.packaging : '')) + '</option>').join('');
  $('#dialogContent').innerHTML = '<input type="hidden" name="basketId" value="' + escape(basket.id) + '"><div class="form-grid"><label class="field full"><span>Nome da cesta</span><input name="basketName" maxlength="220" value="' + escape(basket.name || '') + '"></label><label class="field"><span>Preço de venda (R$)</span><input name="basketPrice" inputmode="decimal" value="' + escape((Number(basket.base_price_cents || 0) / 100).toFixed(2).replace('.', ',')) + '"></label><label class="field"><span>Imagem (URL)</span><input name="basketImage" value="' + escape(basket.image_url || '') + '"></label><label class="check-field full"><input name="basketActive" type="checkbox" ' + (basket.is_active !== false ? 'checked' : '') + '><span><strong>Cesta ativa</strong><small>Desative para ocultar este modelo da vitrine.</small></span></label></div><div class="composition-heading"><div><span class="eyebrow">COMPOSIÇÃO</span><h3>Produtos da cesta</h3></div><span class="count-badge">' + items.length + ' itens</span></div><div class="composition-list">' + (items.length ? items.map(item => compositionRow(item)).join('') : '<div class="empty-state">Esta cesta ainda não tem produtos definidos.</div>') + '</div><div class="add-composition"><select id="addCompositionProduct">' + productOptions + '</select><input id="addCompositionQuantity" type="number" min="0.001" step="0.001" value="1" aria-label="Quantidade"><button class="button secondary" id="addComposition">Adicionar item</button></div>';
  $('#dialogFooter').innerHTML = '<button class="button secondary" value="cancel">Fechar</button><button class="button primary" id="saveBasket" type="button">Salvar cesta</button>';
  $('#saveBasket').onclick = saveBasket;
  $('#addComposition').onclick = addBasketItem;
  $$('.save-composition').forEach(button => button.onclick = () => saveBasketItem(button.dataset.id));
  $$('.remove-composition').forEach(button => button.onclick = () => removeBasketItem(button.dataset.id));
}
function compositionRow(item) {
  const product = Array.isArray(item.product) ? item.product[0] : (item.product || {});
  return '<div class="composition-row" data-item="' + escape(item.id) + '"><span class="composition-product"><strong>' + escape(product.name || 'Produto') + '</strong><small>' + escape(product.sku || product.gtin || '') + '</small></span><label class="qty-field"><span>Qtd.</span><input type="number" min="0.001" step="0.001" value="' + escape(item.quantity || 1) + '" data-quantity></label><button class="icon-button save-composition" data-id="' + escape(item.id) + '" aria-label="Salvar quantidade">✓</button><button class="icon-button remove remove-composition" data-id="' + escape(item.id) + '" aria-label="Remover produto">×</button></div>';
}
function basketPayload() {
  const get = name => $('[name="' + name + '"]', $('#dialogContent'));
  const basket = state.basket?.basket || {};
  return { id: get('basketId').value, name: get('basketName').value.trim(), base_price_cents: parseMoney(get('basketPrice').value), image_url: get('basketImage').value.trim(), is_active: get('basketActive').checked, is_whatsapp_active: basket.is_whatsapp_active !== false, is_featured: basket.is_featured === true, sort_order: Number(basket.sort_order || 0), internal_notes: basket.internal_notes || '', operator: 'Administração do catálogo' };
}
async function saveBasket() {
  const button = $('#saveBasket'); button.disabled = true; button.textContent = 'Salvando…';
  try { await adminWrite('basket_save', basketPayload()); toast('Cesta atualizada.'); await loadBaskets(); const result = await adminApi('basket_admin', { id: basketPayload().id }); state.basket = result; renderBasketEditor(result); }
  catch (error) { showError(error); button.disabled = false; button.textContent = 'Salvar cesta'; }
}
async function saveBasketItem(itemId) {
  const row = $('[data-item="' + itemId + '"]', $('#dialogContent'));
  try {
    await adminWrite('basket_item_save', { id: itemId, basket_id: basketPayload().id, product_id: state.basket.items.find(item => item.id === itemId).product_id, quantity: Number($('[data-quantity]', row).value), operator: 'Administração do catálogo' });
    toast('Quantidade atualizada.'); await refreshBasketEditor();
  } catch (error) { showError(error); }
}
async function addBasketItem() {
  const productId = $('#addCompositionProduct').value;
  const quantity = Number($('#addCompositionQuantity').value);
  if (!productId || !Number.isFinite(quantity) || quantity <= 0) { toast('Escolha um produto e informe a quantidade.', 'error'); return; }
  try {
    await adminWrite('basket_item_save', { basket_id: basketPayload().id, product_id: productId, quantity, operator: 'Administração do catálogo' });
    toast('Produto adicionado à composição.'); await refreshBasketEditor();
  } catch (error) { showError(error); }
}
async function removeBasketItem(itemId) {
  if (!confirm('Remover este produto da composição da cesta?')) return;
  try { await adminWrite('basket_item_delete', { id: itemId, basket_id: basketPayload().id, operator: 'Administração do catálogo' }); toast('Produto removido.'); await refreshBasketEditor(); }
  catch (error) { showError(error); }
}
async function refreshBasketEditor() {
  const result = await adminApi('basket_admin', { id: basketPayload().id });
  state.basket = result; renderBasketEditor(result);
}

async function loadBling() {
  setLoading('Consultando integração Bling…');
  try { const result = await adminApi('bling_status'); state.bling = result.bling || result; renderBling(); }
  catch (error) { showError(error); renderError('bling'); }
}
function renderBling() {
  const data = state.bling || {};
  const healthy = data.connected === true || data.ready === true || data.ok === true || data.status === 'connected';
  const result = state.blingCheck;
  const summary = result ? (result.summary && typeof result.summary === 'object' ? result.summary : result) : null;
  const details = summary ? Object.entries(summary).filter(([, value]) => value === null || ['string', 'number', 'boolean'].includes(typeof value) || Array.isArray(value)).slice(0, 10).map(([key, value]) => '<div><span>' + escape(key.replaceAll('_', ' ')) + '</span><strong>' + escape(Array.isArray(value) ? value.length + ' registros' : String(value ?? '—')) + '</strong></div>').join('') : '';
  workspace.innerHTML = '<div class="page-heading"><div><span class="eyebrow">INTEGRAÇÃO</span><h1>Bling</h1><p>Confira o vínculo entre o catálogo da loja e a conta Bling.</p></div><button class="button secondary" id="refreshBling">Atualizar status</button></div><section class="integration-card"><div class="integration-icon">↔</div><div class="integration-copy"><span class="eyebrow">ERP E CATÁLOGO</span><h2>Conexão com o Bling</h2><p>O painel usa a integração já configurada no projeto principal. Chaves e tokens permanecem no servidor.</p><span class="status-pill ' + (healthy ? 'good' : 'attention') + '"><i></i>' + (healthy ? 'Conexão disponível' : 'Requer verificação') + '</span></div><div class="integration-details"><div><span>Projeto conectado</span><strong>Supabase canônico</strong></div><div><span>Operações desta tela</span><strong>Consulta e conferência somente leitura</strong></div><div><span>Retorno</span><strong>' + escape(data.mode || data.message || data.status || 'Status consultado no servidor') + '</strong></div></div></section><section class="panel bling-check-panel"><div><span class="eyebrow">CATÁLOGO</span><h2>Conferir vínculos de produtos</h2><p>Compara os produtos ativos do site com os vínculos encontrados no Bling. Esta conferência é somente leitura.</p></div><button class="button primary" id="runBlingCheck" ' + (state.blingChecking ? 'disabled' : '') + '>' + (state.blingChecking ? 'Conferindo…' : 'Conferir catálogo') + '</button>' + (details ? '<div class="bling-check-results">' + details + '</div>' : '') + '</section><section class="panel note-panel"><span class="note-icon">i</span><div><strong>Sincronização gradual</strong><p>A edição local já usa o catálogo canônico. Importação, criação e atualização de produtos no Bling ficam para uma etapa própria, com regras definidas para nome, categoria, preço, estoque e ativação.</p></div></section>';
  $('#refreshBling').onclick = loadBling;
  $('#runBlingCheck').onclick = runBlingCheck;
}
async function runBlingCheck() {
  state.blingChecking = true;
  renderBling();
  try {
    state.blingCheck = await adminWrite('bling_reconcile_catalog_readonly', {});
    toast('Conferência de catálogo concluída.');
  } catch (error) { showError(error); }
  finally { state.blingChecking = false; renderBling(); }
}
function renderError(view) {
  const retry = view === 'products' ? 'loadProducts' : view === 'baskets' ? 'loadBaskets' : 'loadBling';
  workspace.innerHTML = '<div class="empty-state error-state"><strong>Não foi possível carregar esta área</strong><span>Confira a conexão e tente novamente.</span><button class="button secondary" id="retryLoad">Tentar novamente</button></div>';
  $('#retryLoad').onclick = () => ({ loadProducts, loadBaskets, loadBling }[retry])();
}

$$('.nav-item').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
$('#logoutButton').addEventListener('click', () => { clearSession(); location.reload(); });
ensureSession().then(() => {
  $('#sessionDot').classList.add('online');
  $('#sessionLabel').textContent = 'Sessão protegida';
  setView('products');
}).catch(error => {
  $('#sessionDot').classList.add('offline');
  $('#sessionLabel').textContent = 'Acesso não validado';
  workspace.innerHTML = '<div class="empty-state error-state"><strong>Não foi possível validar o acesso administrativo</strong><span>' + escape(error.message) + '</span><button class="button secondary" id="retryAuth">Tentar novamente</button><a class="button text-link" href="/vitrine/admin/">Abrir Vitrine Admin</a></div>';
  $('#retryAuth').onclick = () => location.reload();
});
