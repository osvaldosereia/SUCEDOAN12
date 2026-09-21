import { clone, money, number, productCode, productImage, productKey, productName, text } from '../producao-v2/js/core/utils.js';
import { normalizeCollectionForPublish } from '../producao-v2/js/core/collections.js?admin_build=20260814-cestas-limites-v1';
import { adminProductsApi, ensureAdminAuthenticated } from '../admin/admin-secure-api-v1.js';

const STORAGE_KEY = 'da_admin_v2_config';
const DEFAULT_CONFIG = {
  writeMode: true,
  collectionsWriteMode: true,
};

const $ = selector => document.querySelector(selector);
const state = {
  config: {}, products: [], baskets: [], queue: [], items: [], editingId: '', original: null,
  detector: null, busy: false,
};
let searchTimer = 0;
let toastTimer = 0;

function loadConfig() {
  try { return { ...DEFAULT_CONFIG, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}) }; }
  catch { return { ...DEFAULT_CONFIG }; }
}

function saveConfig(patch) {
  state.config = { ...loadConfig(), ...(patch || {}), writeMode: true, collectionsWriteMode: true };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
}

function adaptSupabaseProduct(p = {}) {
  return {
    ...p,
    firebaseKey: '',
    codigo: text(p.sku || p.gtin || p.id),
    nome: text(p.name),
    preco: number(p.price),
    preco_custo: number(p.cost),
    estoque: number(p.stock),
    url_imagem: text(p.image_url),
    marca: text(p.brand),
    categoria: text(p.category),
    subcategoria: text(p.subcategory),
    subsubcategoria: text(p.subsubcategory),
    embalagem: text(p.packaging),
    gondola: text(p.gondola),
    prateleira: text(p.shelf),
    validade: text(p.validity_date),
    situacao: p.is_active === false ? 'I' : 'A',
    ativo: p.is_active !== false,
  };
}
async function loadProductsFromSupabase() {
  const data = await adminProductsApi('catalog', { limit: 2500 });
  return (data.products || []).map(adaptSupabaseProduct);
}

function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function normalized(value = '') {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

function digits(value = '') { return text(value).replace(/\D/g, ''); }
function round(value) { return Math.round(number(value) * 100) / 100; }
function slug(value = '') {
  return normalized(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function uniqueId() {
  return `cesta${Date.now()}${Math.floor(100 + Math.random() * 900)}`;
}

function productReferences(product) {
  return [productKey(product), productCode(product), product?.id, product?.firebaseKey, product?.sku, product?.gtin, product?.ean]
    .flatMap(value => [normalized(value), digits(value)]).filter(Boolean);
}

function activeProduct(product) {
  const status = normalized(product?.situacao ?? product?.status ?? 'A');
  return !['i', 'inativo', 'false', '0', 'excluido'].includes(status)
    && product?.ativo !== false && product?.visivel !== false;
}

function exactProduct(value) {
  const raw = normalized(value);
  const onlyDigits = digits(value);
  return state.products.find(product => {
    const references = productReferences(product);
    return references.includes(raw) || (onlyDigits && references.includes(onlyDigits));
  }) || null;
}

function searchProducts(value) {
  const query = normalized(value);
  const onlyDigits = digits(value);
  if (!query) return [];
  return state.products.filter(product => {
    const haystack = normalized([
      productName(product), productCode(product), product?.gtin, product?.ean, product?.marca, product?.categoria,
    ].join(' '));
    return haystack.includes(query) || (onlyDigits && productReferences(product).some(reference => reference.includes(onlyDigits)));
  }).slice(0, 12);
}

function productFromItem(item) {
  return state.products.find(product => productReferences(product).includes(normalized(item.codigo))) || null;
}

function productsTotal() {
  return round(state.items.reduce((sum, item) => sum + number(productFromItem(item)?.preco) * Math.max(1, number(item.qtd)), 0));
}

function productCapacity() {
  if (!state.items.length) return 0;
  const capacities = state.items.map(item => {
    const product = productFromItem(item);
    if (!product || !activeProduct(product) || number(product.preco) <= 0) return 0;
    return Math.floor(Math.max(0, number(product.estoque)) / Math.max(1, Math.floor(number(item.qtd))));
  });
  return Math.max(0, Math.min(...capacities));
}

function availableBaskets() {
  const capacity = productCapacity();
  if ($('#unlimitedLimit').checked) return capacity;
  return Math.min(capacity, Math.max(0, Math.floor(number($('#basketLimit').value))));
}

function showToast(message, kind = '') {
  const node = $('#toast');
  node.textContent = text(message);
  node.className = `toast show ${kind}`.trim();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.className = 'toast'; }, kind === 'error' ? 6000 : 3600);
}

function setBusy(active, title = 'Processando…', detail = 'Aguarde.') {
  state.busy = active;
  $('#busy').hidden = !active;
  $('#busyTitle').textContent = title;
  $('#busyText').textContent = detail;
  $('#saveButton').disabled = active;
}

function setConnection(message, kind = 'warn') {
  const node = $('#connectionStatus');
  node.textContent = message;
  node.className = `status-chip ${kind}`;
}

function renderSearchResults() {
  const query = $('#productSearch').value;
  const results = searchProducts(query);
  $('#searchResults').innerHTML = results.length ? results.map(product => {
    const available = activeProduct(product) && number(product.estoque) > 0 && number(product.preco) > 0;
    return `<button class="search-result" type="button" data-add-product="${escapeHtml(productKey(product))}">
      <strong>${escapeHtml(productName(product))}</strong>
      <small>${escapeHtml(productCode(product) || productKey(product))} · EAN ${escapeHtml(product.gtin || product.ean || 'não informado')} · estoque ${Math.floor(number(product.estoque))} · ${money(product.preco)}</small>
      <span>${available ? 'Adicionar' : 'Adicionar e revisar'}</span>
    </button>`;
  }).join('') : (text(query).length > 1 ? '<div class="empty-state">Nenhum produto encontrado.</div>' : '');
}

function renderItems() {
  $('#basketItems').innerHTML = state.items.length ? state.items.map((item, index) => {
    const product = productFromItem(item);
    const image = productImage(product) || '../img/logoantonia5.png';
    const subtotal = number(product?.preco) * Math.max(1, number(item.qtd));
    return `<article class="basket-item">
      <img src="${escapeHtml(image)}" alt="" onerror="this.src='../img/logoantonia5.png'">
      <div class="basket-item-copy"><strong>${escapeHtml(product ? productName(product) : item.codigo)}</strong><small>${escapeHtml(item.codigo)} · ${money(product?.preco)} cada · subtotal ${money(subtotal)}</small><small>Estoque: ${Math.floor(number(product?.estoque))}</small></div>
      <div class="item-controls"><input class="field" type="number" min="1" step="1" value="${Math.max(1, Math.floor(number(item.qtd)))}" data-item-qty="${index}" aria-label="Quantidade"><button type="button" data-item-add="${index}" aria-label="Aumentar">+</button><button class="remove" type="button" data-item-remove="${index}" aria-label="Remover">×</button></div>
    </article>`;
  }).join('') : '<div class="empty-state">Nenhum produto adicionado.</div>';
  renderFinancials();
}

function renderFinancials() {
  const products = productsTotal();
  const finalPrice = round($('#basketPrice').value);
  const adjustment = round(finalPrice - products);
  $('#productsTotal').textContent = money(products);
  $('#finalTotal').textContent = money(finalPrice);
  $('#hiddenAdjustment').textContent = `${adjustment > 0 ? '+' : ''}${money(adjustment)}`;
  $('#availableTotal').textContent = String(availableBaskets());
  $('#limitField').hidden = $('#unlimitedLimit').checked;
  $('#basketLimit').disabled = $('#unlimitedLimit').checked;
}

function addProduct(product) {
  if (!product) return;
  const code = productCode(product) || productKey(product);
  const existing = state.items.find(item => text(item.codigo) === text(code));
  if (existing) existing.qtd = Math.max(1, Math.floor(number(existing.qtd)) + 1);
  else state.items.push({ codigo: code, qtd: 1, trocas_permitidas: [] });
  $('#productSearch').value = '';
  $('#searchResults').innerHTML = '';
  renderItems();
  $('#productSearch').focus();
}

function addTypedProduct() {
  const query = $('#productSearch').value;
  const product = exactProduct(query) || searchProducts(query)[0];
  if (!product) {
    showToast('Produto não encontrado. Digite o EAN, código ou parte do nome.', 'error');
    renderSearchResults();
    return;
  }
  addProduct(product);
}

function basketDraft() {
  const unlimited = $('#unlimitedLimit').checked;
  const name = text($('#basketName').value);
  const id = state.editingId || uniqueId();
  return {
    ...(state.original || {}),
    id,
    nome: name,
    codigo: text($('#basketCode').value) || slug(name) || id,
    preco: round($('#basketPrice').value),
    descricao: text($('#basketDescription').value),
    ativo: $('#basketActive').checked,
    limite_ilimitado: unlimited,
    limite_cestas: unlimited ? 0 : Math.max(0, Math.floor(number($('#basketLimit').value))),
    produtos: state.items.map(item => ({ codigo: text(item.codigo), qtd: Math.max(1, Math.floor(number(item.qtd))), trocas_permitidas: Array.isArray(item.trocas_permitidas) ? item.trocas_permitidas : [] })),
    atualizado_em: new Date().toISOString(),
  };
}

function validateDraft(draft) {
  const errors = [];
  if (!draft.nome) errors.push('Informe o nome da cesta');
  if (!draft.produtos.length) errors.push('Adicione pelo menos um produto');
  if (draft.preco <= 0) errors.push('Informe o valor final da cesta');
  if (!draft.limite_ilimitado && draft.limite_cestas <= 0) errors.push('Informe a quantidade máxima ou marque ilimitado');
  return errors;
}

async function saveDraft() {
  if (state.busy) return;
  const draft = basketDraft();
  const errors = validateDraft(draft);
  if (errors.length) {
    $('#editorMessage').textContent = errors.join(' · ');
    $('#editorMessage').className = 'editor-message error';
    return;
  }
  await ensureAdminAuthenticated();
  const normalizedResult = normalizeCollectionForPublish(draft, 'basket', state.products, state.queue);
  if (normalizedResult.audit.errors.length) {
    $('#editorMessage').textContent = normalizedResult.audit.errors.join(' · ');
    $('#editorMessage').className = 'editor-message error';
    return;
  }
  setBusy(true, 'Salvando cesta…', 'Gravando a cesta no Supabase.');
  try {
    const saved = await adminProductsApi('save_basket', { basket: normalizedResult.normalized });
    state.baskets = saved.baskets || [];
    showToast(state.editingId ? 'Cesta atualizada no Supabase.' : 'Cesta criada no Supabase.', 'success');
    resetEditor();
    renderBasketList();
    updateCounts();
    activateWorkspace('list');
  } catch (error) {
    console.error(error);
    showToast(error?.message || String(error), 'error');
  } finally {
    setBusy(false);
  }
}

function resetEditor() {
  state.items = [];
  state.editingId = '';
  state.original = null;
  $('#basketName').value = '';
  $('#basketCode').value = '';
  $('#basketPrice').value = '';
  $('#basketDescription').value = '';
  $('#basketActive').checked = true;
  $('#unlimitedLimit').checked = true;
  $('#basketLimit').value = '';
  $('#editorMessage').textContent = '';
  $('#editorMessage').className = 'editor-message';
  $('#saveButton').textContent = 'Salvar cesta';
  renderItems();
}

function editBasket(id) {
  const basket = state.baskets.find(item => text(item.id) === text(id));
  if (!basket) return;
  state.editingId = text(basket.id);
  state.original = clone(basket);
  state.items = clone(Array.isArray(basket.produtos) ? basket.produtos : []);
  $('#basketName').value = basket.nome || '';
  $('#basketCode').value = basket.codigo || '';
  $('#basketPrice').value = number(basket.preco) || '';
  $('#basketDescription').value = basket.descricao || '';
  $('#basketActive').checked = basket.ativo !== false;
  const unlimited = basket.limite_ilimitado !== false && number(basket.limite_cestas) <= 0;
  $('#unlimitedLimit').checked = unlimited;
  $('#basketLimit').value = unlimited ? '' : Math.max(1, Math.floor(number(basket.limite_cestas)));
  $('#saveButton').textContent = 'Atualizar cesta';
  $('#editorMessage').textContent = `Editando ${basket.nome}.`;
  $('#editorMessage').className = 'editor-message';
  renderItems();
  activateWorkspace('editor');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function updateBasket(target, patch, actionLabel) {
  if (state.busy) return;
  await ensureAdminAuthenticated();
  const list = clone(state.baskets);
  const index = list.findIndex(item => text(item.id) === text(target.id));
  if (index < 0) return;
  const original = clone(list[index]);
  list[index] = { ...list[index], ...(patch || {}), atualizado_em: new Date().toISOString() };
  setBusy(true, `${actionLabel}…`, 'Atualizando cestas oficiais.');
  try {
    const saved = await adminProductsApi('save_basket', { basket: list[index] });
    state.baskets = saved.baskets || list;
    renderBasketList();
    updateCounts();
    showToast(`${actionLabel} concluído.`, 'success');
  } catch (error) {
    showToast(error?.message || String(error), 'error');
  } finally {
    setBusy(false);
  }
}

async function deleteBasket(target) {
  if (!window.confirm(`Arquivar/inativar a cesta “${target.nome || target.codigo}”? Ela continuará no histórico do Supabase.`)) return;
  await ensureAdminAuthenticated();
  setBusy(true, 'Arquivando cesta…', 'A cesta será inativada no Supabase, sem exclusão destrutiva.');
  try {
    const saved = await adminProductsApi('archive_basket', { id: text(target.id) });
    state.baskets = saved.baskets || [];
    renderBasketList();
    updateCounts();
    showToast('Cesta arquivada no Supabase.', 'success');
  } catch (error) {
    showToast(error?.message || String(error), 'error');
  } finally {
    setBusy(false);
  }
}

function basketSummary(basket) {
  const items = Array.isArray(basket.produtos) ? basket.produtos : [];
  const stock = items.length ? Math.max(0, Math.min(...items.map(item => {
    const product = productFromItem(item);
    return product ? Math.floor(Math.max(0, number(product.estoque)) / Math.max(1, number(item.qtd))) : 0;
  }))) : 0;
  const unlimited = basket.limite_ilimitado !== false && number(basket.limite_cestas) <= 0;
  const available = unlimited ? stock : Math.min(stock, Math.max(0, Math.floor(number(basket.limite_cestas))));
  return { items: items.length, unlimited, available };
}

function renderBasketList() {
  const query = normalized($('#basketFilter').value);
  const list = state.baskets.filter(basket => !query || normalized([basket.nome, basket.codigo, basket.id].join(' ')).includes(query));
  $('#basketList').innerHTML = list.length ? list.map(basket => {
    const summary = basketSummary(basket);
    const active = basket.ativo !== false;
    return `<article class="basket-list-card" data-basket-card="${escapeHtml(basket.id)}">
      <div class="basket-list-head"><div><h3>${escapeHtml(basket.nome || 'Sem nome')}</h3><small>${escapeHtml(basket.codigo || basket.id)}</small></div><span class="basket-badge ${active ? 'active' : 'inactive'}">${active ? 'Ativa' : 'Inativa'}</span></div>
      <div class="basket-card-metrics"><div><strong>${money(basket.preco)}</strong><span>Valor final</span></div><div><strong>${summary.items}</strong><span>Produtos</span></div><div><strong>${summary.available}</strong><span>Disponíveis</span></div><div><strong>${summary.unlimited ? 'Ilimitado' : Math.floor(number(basket.limite_cestas))}</strong><span>Limite</span></div></div>
      <div class="basket-card-actions"><button type="button" data-basket-edit="${escapeHtml(basket.id)}">Editar</button><button type="button" data-basket-toggle="${escapeHtml(basket.id)}">${active ? 'Desativar' : 'Ativar'}</button><button class="danger" type="button" data-basket-delete="${escapeHtml(basket.id)}">Arquivar</button></div>
    </article>`;
  }).join('') : '<div class="empty-state">Nenhuma cesta encontrada.</div>';
}

function updateCounts() {
  $('#productsStatus').textContent = `${state.products.length} produtos`;
  $('#basketsStatus').textContent = `${state.baskets.length} cestas`;
  $('#basketCount').textContent = String(state.baskets.length);
}

async function loadData() {
  if (state.busy) return;
  state.config = loadConfig();
  setConnection('Atualizando dados…', 'warn');
  try {
    await ensureAdminAuthenticated();
    const [products, collections] = await Promise.all([
      loadProductsFromSupabase(),
      adminProductsApi('basket_catalog'),
    ]);
    state.products = products || [];
    state.baskets = collections.baskets || [];
    state.queue = [];
    setConnection('Dados atualizados', 'ok');
    updateCounts();
    renderItems();
    renderBasketList();

  } catch (error) {
    console.error(error);
    setConnection('Falha ao carregar', 'danger');
    showToast(error?.message || String(error), 'error');
  }
}

function activateWorkspace(name) {
  const workspace = name === 'list' ? 'list' : 'editor';
  const listMode = workspace === 'list';
  const editor = $('#editorWorkspace');
  const list = $('#listWorkspace');

  editor.hidden = listMode;
  list.hidden = !listMode;
  editor.setAttribute('aria-hidden', String(listMode));
  list.setAttribute('aria-hidden', String(!listMode));

  document.querySelectorAll('[data-workspace]').forEach(button => {
    const active = button.dataset.workspace === workspace;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });

  if (listMode) {
    renderBasketList();
    $('#basketFilter')?.focus({ preventScroll: true });
  }
}

async function initDetector() {
  if (!('BarcodeDetector' in window)) return;
  try {
    const supported = await BarcodeDetector.getSupportedFormats();
    const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'itf'].filter(format => supported.includes(format));
    if (formats.length) state.detector = new BarcodeDetector({ formats });
  } catch (error) { console.warn('Leitura de EAN por foto indisponível.', error); }
}

async function scanPhoto(file) {
  if (!file) return;
  if (!state.detector) {
    showToast('Este navegador não permite ler EAN pela foto. Use o leitor ou digite o código.', 'error');
    return;
  }
  setBusy(true, 'Lendo EAN…', 'Analisando a foto no próprio aparelho.');
  try {
    const bitmap = await createImageBitmap(file);
    const codes = await state.detector.detect(bitmap);
    bitmap.close?.();
    const value = text(codes?.[0]?.rawValue);
    if (!value) throw new Error('Nenhum código foi identificado na foto.');
    $('#productSearch').value = value;
    addTypedProduct();
  } catch (error) {
    showToast(error?.message || String(error), 'error');
  } finally {
    setBusy(false);
    $('#photoInput').value = '';
  }
}

function openSettings() {
  $('#settingsBackdrop').hidden = false;
  $('#settingsDrawer').classList.add('open');
  $('#settingsDrawer').setAttribute('aria-hidden', 'false');
}

function closeSettings() {
  $('#settingsBackdrop').hidden = true;
  $('#settingsDrawer').classList.remove('open');
  $('#settingsDrawer').setAttribute('aria-hidden', 'true');
}

function bind() {
  $('.workspace-tabs').addEventListener('click', event => {
    const button = event.target.closest('[data-workspace]');
    if (!button) return;
    event.preventDefault();
    activateWorkspace(button.dataset.workspace);
  });
  $('#productSearch').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderSearchResults, 140);
  });
  $('#productSearch').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); addTypedProduct(); }
  });
  $('#addTypedButton').addEventListener('click', addTypedProduct);
  $('#searchResults').addEventListener('click', event => {
    const button = event.target.closest('[data-add-product]');
    if (!button) return;
    const product = state.products.find(candidate => text(productKey(candidate)) === text(button.dataset.addProduct));
    addProduct(product);
  });
  $('#basketItems').addEventListener('input', event => {
    const index = event.target.dataset.itemQty;
    if (index === undefined) return;
    state.items[Number(index)].qtd = Math.max(1, Math.floor(number(event.target.value)) || 1);
    renderFinancials();
  });
  $('#basketItems').addEventListener('click', event => {
    const add = event.target.closest('[data-item-add]');
    const remove = event.target.closest('[data-item-remove]');
    if (add) state.items[Number(add.dataset.itemAdd)].qtd = Math.max(1, Math.floor(number(state.items[Number(add.dataset.itemAdd)].qtd)) + 1);
    if (remove) state.items.splice(Number(remove.dataset.itemRemove), 1);
    if (add || remove) renderItems();
  });
  $('#basketName').addEventListener('input', () => {
    if (!state.editingId && !text($('#basketCode').value)) $('#basketCode').value = slug($('#basketName').value);
  });
  ['basketPrice', 'basketLimit'].forEach(id => $(`#${id}`).addEventListener('input', renderFinancials));
  $('#unlimitedLimit').addEventListener('change', renderFinancials);
  $('#saveButton').addEventListener('click', saveDraft);
  $('#resetButton').addEventListener('click', resetEditor);
  $('#basketFilter').addEventListener('input', renderBasketList);
  $('#basketList').addEventListener('click', event => {
    const edit = event.target.closest('[data-basket-edit]');
    const toggle = event.target.closest('[data-basket-toggle]');
    const remove = event.target.closest('[data-basket-delete]');
    const id = text(edit?.dataset.basketEdit || toggle?.dataset.basketToggle || remove?.dataset.basketDelete);
    const basket = state.baskets.find(item => text(item.id) === id);
    if (!basket) return;
    if (edit) editBasket(id);
    if (toggle) updateBasket(basket, { ativo: basket.ativo === false }, basket.ativo === false ? 'Ativação' : 'Desativação');
    if (remove) deleteBasket(basket);
  });
  $('#photoButton').addEventListener('click', () => $('#photoInput').click());
  $('#photoInput').addEventListener('change', () => scanPhoto($('#photoInput').files?.[0]));
  $('#reloadButton').addEventListener('click', loadData);
  $('#settingsButton').addEventListener('click', openSettings);
  $('#closeSettingsButton').addEventListener('click', closeSettings);
  $('#settingsBackdrop').addEventListener('click', closeSettings);
  $('#saveSettingsButton').addEventListener('click', () => {
    closeSettings();
    showToast('Cestas usam somente o Supabase; nenhuma configuração local é necessária.', 'success');
  });
}

async function start() {
  state.config = loadConfig();
  bind();
  renderItems();
  await initDetector();
  await ensureAdminAuthenticated();
  await loadData();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
