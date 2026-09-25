import { normalizeCollectionForPublish } from '../producao-v2/js/core/collections.js';
import { money, number, productCode, productImage, productKey, productName, text } from '../producao-v2/js/core/utils.js';
import { adminProductsApi, ensureAdminAuthenticated } from '../admin/admin-secure-api-v1.js';

const STORAGE_KEY = 'da_admin_v2_config';
const CONTRACT_VERSION = '2026-08-05-kit-editor-v4';
const PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="100%" height="100%" fill="#f1f3f0"/><text x="50%" y="52%" text-anchor="middle" fill="#879087" font-family="Arial" font-size="28">capa ainda não gerada</text></svg>')}`;
const DEFAULT_CONFIG = {
  writeMode: true,
  collectionsWriteMode: true,
};

const $ = selector => document.querySelector(selector);
const state = {
  config: {},
  products: [],
  kits: [],
  queue: [],
  items: [],
  discount: 20,
  content: { id: '', code: '', createdAt: '', name: '', description: '', image: '', imagePath: '' },
  textSignature: '',
  imageSignature: '',
  busy: false,
  detector: null,
};
let toastTimer = null;

function getConfig() {
  try { return { ...DEFAULT_CONFIG, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}) }; }
  catch { return { ...DEFAULT_CONFIG }; }
}
function saveConfig(next) {
  state.config = { ...getConfig(), ...next };
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

function round(value) { return Math.round(number(value) * 100) / 100; }
function brl(value) { return round(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' '); }
function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function slug(value = '') {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'kit';
}
function uniqueCode() {
  const d = new Date();
  const stamp = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'), String(d.getHours()).padStart(2, '0'), String(d.getMinutes()).padStart(2, '0'), String(d.getSeconds()).padStart(2, '0')].join('');
  return `kit-mobile-${stamp}-${Math.floor(1000 + Math.random() * 9000)}`;
}
function token(value) { return text(value).toUpperCase(); }
function digits(value) { return text(value).replace(/\D/g, ''); }
function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}
function productTokens(product) {
  return [productKey(product), product.id, productCode(product), product.gtin, product.ean, product.sku]
    .flatMap(value => [token(value), digits(value)]).filter(Boolean);
}
function compositionSignature() {
  return JSON.stringify({ discount: state.discount, items: state.items.map(row => [productCode(row.product) || productKey(row.product), row.qty]) });
}
function coverSignature() {
  return JSON.stringify({ composition: compositionSignature(), name: text(state.content.name), description: text(state.content.description) });
}
function subtotal() { return round(state.items.reduce((sum, row) => sum + number(row.product.preco) * row.qty, 0)); }
function finalPrice() { return round(subtotal() * (1 - state.discount / 100)); }
function economy() { return round(subtotal() - finalPrice()); }
function availableKits() {
  if (!state.items.length) return 0;
  return Math.max(0, Math.min(...state.items.map(row => Math.floor(Math.max(0, number(row.product.estoque)) / Math.max(1, row.qty)))));
}
function configReady() { return true; }
function ensureIdentity() {
  if (!state.content.id) state.content.id = `kit${Date.now()}${Math.floor(100 + Math.random() * 900)}`;
  if (!state.content.code) state.content.code = uniqueCode();
  if (!state.content.createdAt) state.content.createdAt = new Date().toISOString();
}
function financials() {
  const original = subtotal();
  const promotional = finalPrice();
  const savings = economy();
  return {
    moeda: 'BRL',
    preco_original: original,
    preco_sem_desconto: original,
    preco_anterior: original,
    preco_promocional: promotional,
    preco_com_desconto: promotional,
    preco_novo: promotional,
    preco_final: promotional,
    economia: savings,
    valor_economia: savings,
    desconto_percentual: state.discount,
    percentual_desconto: state.discount,
    preco_original_formatado: brl(original),
    preco_sem_desconto_formatado: brl(original),
    preco_anterior_formatado: brl(original),
    preco_promocional_formatado: brl(promotional),
    preco_com_desconto_formatado: brl(promotional),
    preco_novo_formatado: brl(promotional),
    economia_formatada: brl(savings),
    valor_economia_formatado: brl(savings),
    desconto_formatado: `${state.discount}%`,
  };
}

function toast(message, kind = '') {
  const node = $('#toast');
  node.textContent = message;
  node.className = `toast show ${kind}`.trim();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.className = 'toast'; }, 3800);
}
function setBusy(active, title = 'Processando…', detail = 'Não feche esta tela.') {
  state.busy = active;
  $('#busy').classList.toggle('show', active);
  $('#busyTitle').textContent = title;
  $('#busyText').textContent = detail;
  renderActions();
  renderPublish();
}

async function initDetector() {
  const chip = $('#cameraChip');
  if (!('BarcodeDetector' in window)) {
    chip.textContent = 'EAN manual disponível';
    chip.className = 'chip warn';
    return;
  }
  try {
    const supported = await BarcodeDetector.getSupportedFormats();
    const wanted = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf'].filter(value => supported.includes(value));
    if (!wanted.length) throw new Error('EAN não suportado');
    state.detector = new BarcodeDetector({ formats: wanted });
    chip.textContent = 'Leitura por foto ativa';
    chip.className = 'chip ok';
  } catch (error) {
    console.warn(error);
    chip.textContent = 'EAN manual disponível';
    chip.className = 'chip warn';
  }
}

async function loadData() {
  state.config = getConfig();
  $('#connectionChip').textContent = 'Atualizando dados…';
  $('#connectionChip').className = 'chip warn';
  try {
    await ensureAdminAuthenticated();
    const [products, collections] = await Promise.all([
      loadProductsFromSupabase(),
      adminProductsApi('kit_catalog'),
    ]);
    state.products = products;
    state.kits = collections.kits || [];
    state.queue = [];
    $('#connectionChip').textContent = 'Dados atualizados';
    $('#connectionChip').className = 'chip ok';
    $('#productsChip').textContent = `${state.products.length} produtos`;
    $('#kitsChip').textContent = `${state.kits.length} kits`;
    renderAll();
    if (!configReady()) openSettings();
  } catch (error) {
    console.error(error);
    $('#connectionChip').textContent = 'Falha ao carregar';
    $('#connectionChip').className = 'chip danger';
    toast(error?.message || String(error), 'error');
  }
}

function findExact(value) {
  const raw = token(value), onlyDigits = digits(value);
  return state.products.find(product => {
    const values = productTokens(product);
    return values.includes(raw) || (onlyDigits && values.includes(onlyDigits));
  }) || null;
}
function searchProducts(query) {
  const wanted = token(query), wantedDigits = digits(query);
  if (!wanted) return [];
  return state.products.filter(product => {
    const hay = token([productName(product), productCode(product), product.gtin, product.ean, product.marca, product.categoria].join(' '));
    return hay.includes(wanted) || (wantedDigits && productTokens(product).some(value => value.includes(wantedDigits)));
  }).slice(0, 8);
}
function activeProduct(product) {
  const status = text(product?.situacao ?? product?.status ?? 'A').toLowerCase();
  return !['i', 'inativo', 'false', '0', 'excluido', 'excluído'].includes(status) && product?.ativo !== false && product?.visivel !== false;
}
function invalidateImage() {
  state.content.image = '';
  state.content.imagePath = '';
  state.imageSignature = '';
}
function compositionChanged() {
  invalidateImage();
  renderStaleNotice();
}
function addProduct(product) {
  if (!product) return;
  if (!activeProduct(product)) {
    toast('Este produto está inativo e não pode entrar no kit.', 'error');
    return;
  }
  const code = productCode(product) || productKey(product);
  const existing = state.items.find(row => (productCode(row.product) || productKey(row.product)) === code);
  if (existing) existing.qty += 1;
  else state.items.push({ product, qty: 1 });
  $('#productSearch').value = '';
  $('#searchResults').innerHTML = '';
  compositionChanged();
  renderAll();
  toast(existing ? 'Quantidade aumentada.' : 'Produto adicionado.', 'success');
}
function changeQty(index, delta) {
  const row = state.items[index];
  if (!row) return;
  row.qty = Math.max(1, Math.floor(number(row.qty) + delta));
  compositionChanged();
  renderAll();
}
function setQty(index, value) {
  const row = state.items[index];
  if (!row) return;
  row.qty = Math.max(1, Math.floor(number(value) || 1));
  compositionChanged();
  renderAll();
}
function removeItem(index) {
  state.items.splice(index, 1);
  compositionChanged();
  renderAll();
}

function themeFromProducts() {
  const source = state.items.map(row => `${productName(row.product)} ${row.product.categoria || ''} ${row.product.subcategoria || ''}`).join(' ').toLowerCase();
  const themes = [
    [/lava|amaciante|detergente|desinfetante|limpeza|sabão|alvejante|multiuso/, ['Casa Limpa', 'Brilho em Casa', 'Limpeza Completa']],
    [/shampoo|condicionador|cabelo|capilar|máscara capilar/, ['Cabelos em Dia', 'Cuidado Capilar', 'Ritual dos Cabelos']],
    [/sabonete|desodorante|higiene|creme dental|escova dental/, ['Cuidado Essencial', 'Higiene em Dia', 'Bem-Estar Diário']],
    [/hidratante|nivea|beleza|pele|facial|protetor/, ['Pele Bem Cuidada', 'Beleza em Dia', 'Ritual de Cuidado']],
    [/café|biscoito|bolacha|chocolate|chá|cappuccino/, ['Pausa Gostosa', 'Momento Café', 'Sabor da Tarde']],
    [/macarrão|molho|arroz|feijão|farinha|óleo|açúcar/, ['Mesa Completa', 'Despensa Prática', 'Sabores do Dia']],
    [/salgadinho|petisco|refrigerante|suco|pipoca/, ['Hora do Lanche', 'Sessão Petisco', 'Diversão em Casa']],
    [/fralda|bebê|infantil|lenço umedecido/, ['Carinho do Bebê', 'Cuidado do Bebê', 'Bebê Protegido']],
    [/ração|pet|cachorro|gato/, ['Carinho Pet', 'Pet Feliz', 'Cuidado Animal']],
  ];
  const match = themes.find(([regex]) => regex.test(source));
  if (match) return match[1][Math.abs(hashCode(state.content.code || compositionSignature())) % match[1].length];
  const brands = [...new Set(state.items.map(row => text(row.product.marca)).filter(Boolean))];
  if (brands.length === 1 && brands[0].length <= 20) return `Seleção ${titleCase(brands[0])}`;
  return ['Escolha Inteligente', 'Oferta Imperdível', 'Combinação Perfeita'][Math.abs(hashCode(state.content.code || compositionSignature())) % 3];
}
function hashCode(value) { return [...String(value || '')].reduce((hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0); }
function titleCase(value) { return text(value).toLocaleLowerCase('pt-BR').replace(/(^|\s|[-/])\p{L}/gu, char => char.toLocaleUpperCase('pt-BR')); }
function fallbackName() { return `Kit ${themeFromProducts()}`.slice(0, 48); }
function cleanAiName(value) {
  let name = text(value).replace(/^\s*(nome(?:\s+do\s+kit)?|título)\s*[:\-]\s*/i, '').replace(/["'`*_#]/g, '').split(/\r?\n/)[0].trim();
  name = name.replace(/\s+/g, ' ').replace(/[.!,:;\-]+$/, '').trim();
  const generic = /^(novo\s+)?kit(\s+promocional)?$|promoção|oferta especial|super kit/i;
  const words = name.split(/\s+/).filter(Boolean);
  if (!name || generic.test(name) || name.length < 7 || name.length > 52 || words.length > 8 || /R\$|\d+%/.test(name)) return fallbackName();
  if (!/^kit\b/i.test(name)) name = `Kit ${name}`;
  return titleCase(name).slice(0, 52);
}
function canonicalItemsText() { return state.items.map(row => `- ${row.qty} un ${productName(row.product)}`).join('\n'); }
function cleanNarrative(value) {
  let source = text(value).replace(/```(?:json)?|```/gi, '').trim();
  source = source.replace(/[^\n.!?]*(?:R\$|\d+[,.]?\d*\s*%|econom(?:ia|ize)|preço|valor avulso|valor original|desconto)[^\n.!?]*[.!?]?/gi, ' ');
  const lines = source.split(/\r?\n/).map(line => line.trim()).filter(line => line && !/^[-•*]\s*/.test(line) && !/^(inclui|contém|itens?)\s*:?$/i.test(line));
  let narrative = lines.join(' ').replace(/\s+/g, ' ').trim();
  if (narrative.length > 320) narrative = `${narrative.slice(0, 317).trim()}...`;
  if (narrative.length < 35) narrative = 'Uma combinação prática e vantajosa, reunindo produtos que se complementam para facilitar a compra e garantir mais economia.';
  return narrative;
}
function canonicalDescription(aiDescription) {
  const f = financials();
  return `${cleanNarrative(aiDescription)}\n\nEste kit contém:\n${canonicalItemsText()}\n\nValor dos produtos separados: ${f.preco_original_formatado}\nPreço promocional do kit: ${f.preco_promocional_formatado}\nVocê economiza: ${f.economia_formatada}\nDesconto aplicado: ${f.desconto_formatado}`;
}

function baseDraft() {
  ensureIdentity();
  const f = financials();
  return {
    id: state.content.id,
    nome: text(state.content.name) || fallbackName(),
    codigo: state.content.code,
    preco: f.preco_promocional,
    preco_novo: f.preco_promocional,
    preco_promocional: f.preco_promocional,
    preco_final: f.preco_promocional,
    preco_anterior: f.preco_original,
    preco_original: f.preco_original,
    preco_sem_desconto: f.preco_original,
    economia: f.economia,
    valor_economia: f.economia,
    desconto_percentual: state.discount,
    desconto_percentual_aplicado: state.discount,
    preco_anterior_formatado: f.preco_original_formatado,
    preco_original_formatado: f.preco_original_formatado,
    preco_novo_formatado: f.preco_promocional_formatado,
    preco_promocional_formatado: f.preco_promocional_formatado,
    economia_formatada: f.economia_formatada,
    desconto_formatado: f.desconto_formatado,
    imagem: state.content.image || '',
    imagem_path: state.content.imagePath || '',
    produtos: state.items.map(row => ({ qtd: row.qty, codigo: productCode(row.product) || productKey(row.product), substitutos: [] })),
    descricao: text(state.content.description),
    limite_kits: availableKits(),
    estoque_disponivel: availableKits(),
    data_inicio: localDate(),
    data_fim: '',
    ativo: true,
    ativo_ate_estoque_zero: true,
    origem: 'kit_mobile_dona_antonia',
    versao_contrato: CONTRACT_VERSION,
    criado_em: state.content.createdAt,
    atualizado_em: new Date().toISOString(),
    dados_financeiros: f,
  };
}
function buildKitContext() {
  const raw = baseDraft();
  const normalizedResult = normalizeCollectionForPublish(raw, 'kit', state.products, state.queue);
  const normalized = { ...normalizedResult.normalized, ...raw, produtos: normalizedResult.normalized.produtos };
  const f = financials();
  Object.assign(normalized, {
    preco: f.preco_promocional,
    preco_novo: f.preco_promocional,
    preco_promocional: f.preco_promocional,
    preco_final: f.preco_promocional,
    preco_anterior: f.preco_original,
    preco_original: f.preco_original,
    preco_sem_desconto: f.preco_original,
    economia: f.economia,
    valor_economia: f.economia,
    desconto_percentual: state.discount,
    desconto_percentual_aplicado: state.discount,
    preco_anterior_formatado: f.preco_original_formatado,
    preco_original_formatado: f.preco_original_formatado,
    preco_sem_desconto_formatado: f.preco_original_formatado,
    preco_novo_formatado: f.preco_promocional_formatado,
    preco_promocional_formatado: f.preco_promocional_formatado,
    preco_com_desconto_formatado: f.preco_promocional_formatado,
    economia_formatada: f.economia_formatada,
    valor_economia_formatado: f.economia_formatada,
    desconto_formatado: f.desconto_formatado,
    dados_financeiros: f,
    limite_kits: availableKits(),
    estoque_disponivel: availableKits(),
  });
  return {
    raw,
    normalized,
    audit: normalizedResult.audit,
    kit: normalized,
    financials: f,
  };
}
function productBrief() {
  return state.items.map((row, index) => ({
    indice: index + 1,
    quantidade: row.qty,
    nome: productName(row.product),
    marca: text(row.product.marca),
    categoria: text(row.product.categoria),
    subcategoria: text(row.product.subcategoria),
    embalagem: text(row.product.embalagem),
    preco_unitario: round(row.product.preco),
    preco_total: round(number(row.product.preco) * row.qty),
  }));
}
function textInstructions(context) {
  const productLines = productBrief().map(item => `${item.quantidade}x ${item.nome}${item.marca ? ` (${item.marca})` : ''}`).join('; ');
  const f = context.financials;
  return `Crie um nome curto, criativo, comercial e chamativo para um kit de supermercado. Analise os produtos reais e identifique a ocasião de uso ou benefício comum. O nome deve ter de 2 a 6 palavras além da palavra Kit, no máximo 48 caracteres, ser fácil de entender e não pode ser genérico. Não use preço, percentual, emoji, aspas, código ou a expressão Novo Kit Promocional. Produtos: ${productLines}. Para a descrição, escreva somente uma introdução comercial curta de 1 ou 2 frases. Não calcule nem mencione preços na introdução. Os valores oficiais, que não podem ser alterados, são: valor separado ${f.preco_original_formatado}; preço promocional ${f.preco_promocional_formatado}; economia ${f.economia_formatada}; desconto ${f.desconto_formatado}. Responda em JSON válido com os campos nome e descricao.`;
}
async function generateText() {
  throw new Error('A geração automática de texto está pausada. Escreva o título e a descrição manualmente; o kit pode ser salvo normalmente no Supabase.');
}

function syncEditorToState() {
  state.content.name = text($('#kitTitleInput').value).slice(0, 60);
  state.content.description = text($('#kitDescriptionInput').value).slice(0, 1600);
}
function syncStateToEditor() {
  $('#kitTitleInput').value = state.content.name || '';
  $('#kitDescriptionInput').value = state.content.description || '';
}
function contentReady() {
  return text(state.content.name).length >= 5 && text(state.content.description).length >= 20;
}
function coverInstructions(context) {
  const f = context.financials;
  const products = productBrief().map(item => `${item.quantidade}x ${item.nome}`).join('; ');
  return `Crie a imagem FINAL quadrada de e-commerce para este kit promocional da Dona Antônia. Use as fotos reais dos produtos e não invente embalagens. Produtos: ${products}. Título obrigatório e exato: "${state.content.name}". A descrição abaixo serve como contexto visual e não deve ser impressa inteira na arte: "${state.content.description}". Escreva na imagem exatamente, sem recalcular e sem alterar nenhum caractere dos valores: DE ${f.preco_original_formatado}; POR ${f.preco_promocional_formatado}; ECONOMIZE ${f.economia_formatada}; ${f.desconto_formatado} OFF. O preço promocional deve ser o maior destaque. Não use nenhum outro preço ou percentual. Não adicione textos promocionais além do título e desses quatro dados financeiros. Resultado final limpo, profissional, legível no celular, sem moldura ou máscara adicionada posteriormente.`;
}
async function generateCover() {
  throw new Error('A geração automática de capa está pausada. O kit pode ser salvo no Supabase sem executar Make ou IA.');
}

function operationalErrors() {
  const errors = [];
  if (!state.items.length) errors.push('Adicione ao menos um produto');
  state.items.forEach(row => {
    if (number(row.product.preco) <= 0) errors.push(`${productName(row.product)} está sem preço`);
    if (number(row.product.estoque) < row.qty) errors.push(`${productName(row.product)} sem estoque suficiente`);
  });
  return [...new Set(errors)];
}
function publishErrors() {
  const errors = operationalErrors();
  if (!text(state.content.name)) errors.push('Preencha o título do kit');
  if (!text(state.content.description)) errors.push('Preencha a descrição do kit');
  return [...new Set(errors)];
}
async function publish() {
  syncEditorToState();
  const errors = publishErrors();
  if (errors.length) throw new Error(errors.join(' · '));
  setBusy(true, 'Salvando kit…', 'Gravando composição e valores no Supabase.');
  try {
    await ensureAdminAuthenticated();
    const context = buildKitContext();
    const current = {
      ...context.normalized,
      nome: state.content.name,
      descricao: state.content.description,
      imagem: state.content.image,
      imagem_path: state.content.imagePath,
      atualizado_em: new Date().toISOString(),
    };
    const normalizedResult = normalizeCollectionForPublish(current, 'kit', state.products, []);
    if (normalizedResult.audit.errors.length) throw new Error(normalizedResult.audit.errors.join(' · '));
    const normalized = {
      ...normalizedResult.normalized,
      ...current,
      produtos: normalizedResult.normalized.produtos,
      dados_financeiros: financials(),
    };
    const saved = await adminProductsApi('save_kit', { kit: normalized });
    state.kits = saved.kits || [];
    $('#kitsChip').textContent = `${state.kits.length} kits`;
    toast(`Kit “${normalized.nome}” salvo no Supabase.`, 'success');
    reset();
  } finally {
    setBusy(false);
  }
}
function reset() {
  state.items = [];
  state.discount = 20;
  state.content = { id: '', code: '', createdAt: '', name: '', description: '', image: '', imagePath: '' };
  state.textSignature = '';
  state.imageSignature = '';
  syncStateToEditor();
  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function detectPhoto(file) {
  if (!file) return;
  if (!state.detector) throw new Error('Este navegador não lê EAN pela foto. Use a busca manual.');
  setBusy(true, 'Lendo o código EAN…', 'Centralize o código de barras na foto.');
  try {
    const bitmap = await createImageBitmap(file);
    const codes = await state.detector.detect(bitmap);
    bitmap.close?.();
    if (!codes.length) throw new Error('Não consegui localizar um código de barras nessa foto.');
    const value = text(codes[0].rawValue);
    const product = findExact(value);
    if (!product) throw new Error(`EAN ${value} não foi encontrado no Firebase.`);
    addProduct(product);
  } finally {
    setBusy(false);
    $('#photoInput').value = '';
  }
}

function renderSearch() {
  const query = $('#productSearch').value.trim();
  const host = $('#searchResults');
  if (query.length < 2) { host.innerHTML = ''; return; }
  const rows = searchProducts(query);
  host.innerHTML = rows.map(product => `<button class="result" type="button" data-result-key="${escapeHtml(productKey(product))}"><img src="${escapeHtml(productImage(product) || PLACEHOLDER)}" onerror="this.src='${PLACEHOLDER}'"><div><strong>${escapeHtml(productName(product))}</strong><small>${escapeHtml(productCode(product) || product.gtin || productKey(product))} · estoque ${number(product.estoque)} · ${escapeHtml(money(product.preco))}</small></div><span>Adicionar</span></button>`).join('') || (query.length > 2 ? '<div class="empty">Nenhum produto encontrado.</div>' : '');
}
function renderItems() {
  const host = $('#items');
  if (!state.items.length) { host.innerHTML = '<div class="empty">Nenhum produto adicionado.</div>'; return; }
  host.innerHTML = state.items.map((row, index) => {
    const stock = number(row.product.estoque);
    const insufficient = stock < row.qty;
    const cls = stock <= 0 ? 'zero' : insufficient ? 'low' : '';
    return `<article class="item ${cls}"><img src="${escapeHtml(productImage(row.product) || PLACEHOLDER)}" onerror="this.src='${PLACEHOLDER}'"><div><div class="itemtop"><strong>${escapeHtml(productName(row.product))}</strong><button class="remove" type="button" data-remove="${index}">Remover</button></div><div class="itemmeta"><span class="tag">${escapeHtml(productCode(row.product) || row.product.gtin || productKey(row.product))}</span><span class="tag ${stock <= 0 ? 'danger' : stock < row.qty ? 'warn' : ''}">Estoque ${stock}</span><span class="tag">${escapeHtml(money(row.product.preco))}</span></div><div class="itemcontrols"><div class="qty"><button type="button" data-minus="${index}">−</button><input type="number" min="1" step="1" value="${row.qty}" data-qty="${index}"><button type="button" data-plus="${index}">+</button></div><strong>${escapeHtml(money(number(row.product.preco) * row.qty))}</strong></div></div></article>`;
  }).join('');
}
function renderSummary() {
  document.querySelectorAll('[data-discount]').forEach(button => button.classList.toggle('active', number(button.dataset.discount) === state.discount));
  const f = financials();
  $('#summary').innerHTML = `<div class="metric"><strong>${escapeHtml(f.preco_original_formatado)}</strong><span>Valor sem desconto</span></div><div class="metric"><strong>${f.desconto_formatado}</strong><span>Desconto escolhido</span></div><div class="metric highlight"><strong>${escapeHtml(f.preco_promocional_formatado)}</strong><span>Preço final do kit</span></div><div class="metric"><strong>${escapeHtml(f.economia_formatada)}</strong><span>Economia correta</span></div>`;
  $('#financialCheck').textContent = state.items.length
    ? `A IA receberá: DE ${f.preco_original_formatado} · POR ${f.preco_promocional_formatado} · ECONOMIA ${f.economia_formatada} · ${f.desconto_formatado} OFF.`
    : 'Adicione produtos para calcular os valores.';
}
function renderPreview() {
  $('#coverPreview').src = state.content.image || PLACEHOLDER;
  $('#coverStatus').textContent = state.content.image ? 'Imagem final criada pela IA.' : 'Gere o título e a descrição, revise os textos e depois crie a capa.';
}
function renderStaleNotice() {
  const compositionStale = Boolean(state.textSignature && state.textSignature !== compositionSignature());
  const imageStale = Boolean(state.content.image && state.imageSignature !== coverSignature());
  const notice = $('#staleNotice');
  notice.classList.toggle('hidden', !(compositionStale || imageStale));
  if (compositionStale) notice.textContent = 'A composição ou o desconto mudou. Revise ou gere novamente o título e a descrição antes de criar outra capa.';
  else if (imageStale) notice.textContent = 'O título ou a descrição mudou. Gere a capa novamente para usar os textos editados.';
}
function renderActions() {
  $('#generateText').disabled = true;
  $('#generateCover').disabled = true;
  $('#generateText').title = 'Automação pausada';
  $('#generateCover').title = 'Automação pausada';
  $('#generateCover').textContent = 'Geração de capa pausada';
}
function renderPublish() {
  const errors = publishErrors();
  const button = $('#publishButton');
  button.disabled = Boolean(errors.length || state.busy);
  button.textContent = state.busy ? 'Processando…' : 'Salvar kit no Supabase';
  const notice = $('#publishNotice');
  if (errors.length) {
    notice.textContent = errors.join(' · ');
    notice.className = 'notice danger';
  } else {
    notice.textContent = `Pronto para salvar no Supabase. Estoque atual permite ${availableKits()} kit(s).`;
    notice.className = 'notice';
  }
}
function renderAll() {
  renderItems();
  renderSummary();
  renderPreview();
  renderStaleNotice();
  renderActions();
  renderPublish();
}

function openSettings() {
  $('#settingsDrawer').classList.add('open');
  $('#settingsDrawer').setAttribute('aria-hidden', 'false');
}
function closeSettings() {
  $('#settingsDrawer').classList.remove('open');
  $('#settingsDrawer').setAttribute('aria-hidden', 'true');
}
$('#settingsOpen').addEventListener('click', openSettings);
$('#settingsClose').addEventListener('click', closeSettings);
$('#settingsDrawer').addEventListener('click', event => { if (event.target.id === 'settingsDrawer') closeSettings(); });
$('#settingsSave').addEventListener('click', () => {
  closeSettings();
  toast('Kits usam somente o Supabase; não há credenciais locais para configurar.', 'success');
});
$('#photoButton').addEventListener('click', () => $('#photoInput').click());
$('#photoInput').addEventListener('change', event => detectPhoto(event.target.files?.[0]).catch(error => toast(error?.message || String(error), 'error')));
$('#reloadButton').addEventListener('click', loadData);
$('#productSearch').addEventListener('input', renderSearch);
$('#productSearch').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); $('#addTyped').click(); }
});
$('#addTyped').addEventListener('click', () => {
  const value = $('#productSearch').value.trim();
  const product = findExact(value) || searchProducts(value)[0];
  if (!product) toast('Produto não encontrado.', 'error');
  else addProduct(product);
});
$('#searchResults').addEventListener('click', event => {
  const button = event.target.closest('[data-result-key]');
  if (!button) return;
  addProduct(state.products.find(product => productKey(product) === button.dataset.resultKey));
});
$('#items').addEventListener('click', event => {
  const plus = event.target.closest('[data-plus]');
  const minus = event.target.closest('[data-minus]');
  const remove = event.target.closest('[data-remove]');
  if (plus) changeQty(Number(plus.dataset.plus), 1);
  if (minus) changeQty(Number(minus.dataset.minus), -1);
  if (remove) removeItem(Number(remove.dataset.remove));
});
$('#items').addEventListener('change', event => {
  const input = event.target.closest('[data-qty]');
  if (input) setQty(Number(input.dataset.qty), input.value);
});
$('#discounts').addEventListener('click', event => {
  const button = event.target.closest('[data-discount]');
  if (!button) return;
  state.discount = number(button.dataset.discount);
  compositionChanged();
  renderAll();
});
$('#kitTitleInput').addEventListener('input', () => {
  const before = state.content.name;
  syncEditorToState();
  if (before !== state.content.name) invalidateImage();
  renderAll();
});
$('#kitDescriptionInput').addEventListener('input', () => {
  const before = state.content.description;
  syncEditorToState();
  if (before !== state.content.description) invalidateImage();
  renderAll();
});
$('#generateText').addEventListener('click', async () => {
  setBusy(true, 'Gerando título e descrição…', 'Identificando a combinação dos produtos.');
  try {
    await generateText();
    toast('Título e descrição gerados. Revise e edite antes de criar a capa.', 'success');
    $('#kitTitleInput').focus();
  } catch (error) {
    toast(error?.message || String(error), 'error');
  } finally {
    setBusy(false);
  }
});
$('#generateCover').addEventListener('click', async () => {
  setBusy(true, 'Gerando a capa pela IA…', 'A imagem será usada exatamente como a IA devolver.');
  try {
    await generateCover();
    toast('Capa final gerada pela IA.', 'success');
  } catch (error) {
    toast(error?.message || String(error), 'error');
  } finally {
    setBusy(false);
  }
});
$('#publishButton').addEventListener('click', () => publish().catch(error => {
  setBusy(false);
  toast(error?.message || String(error), 'error');
}));

state.config = getConfig();
syncStateToEditor();
renderAll();
await initDetector();
await ensureAdminAuthenticated();
await loadData();
