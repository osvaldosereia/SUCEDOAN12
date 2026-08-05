import { normalizeCollectionForPublish } from '../producao-v2/js/core/collections.js';
import { money, number, productCode, productImage, productKey, productName, text } from '../producao-v2/js/core/utils.js';
import { loadCollections, saveCollectionList } from '../producao-v2/js/services/collections.js';
import { callMake, compactKitForMake, extractMakeImage, unwrapMakeResult } from '../producao-v2/js/services/make.js?build=20260805-kit-editor-v4';
import { upsertBase64File } from '../producao-v2/js/services/github-binary.js';

const STORAGE_KEY = 'da_admin_v2_config';
const CONTRACT_VERSION = '2026-08-05-kit-editor-v4';
const PLACEHOLDER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="100%" height="100%" fill="#f1f3f0"/><text x="50%" y="52%" text-anchor="middle" fill="#879087" font-family="Arial" font-size="28">capa ainda não gerada</text></svg>')}`;
const DEFAULT_CONFIG = {
  firebaseUrl: 'https://cedar-chemist-310801-default-rtdb.firebaseio.com',
  productsNode: 'produtos',
  writeMode: true,
  collectionsWriteMode: true,
  githubToken: '',
  githubOwner: 'osvaldosereia',
  githubRepo: 'SUCEDOAN12',
  githubBranch: 'main',
  kitsPath: 'site/kits.json',
  basketsPath: 'site/produtos-cesta-basica.json',
  kitQueuePath: 'carrosseis-kits/fila.json',
  catalogVersionPath: 'catalog-version.json',
  githubKitImagesPath: 'site/img/kits',
  makeTextWebhookUrl: '',
  makeImageWebhookUrl: '',
  makeAiWebhookUrl: '',
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
function configReady() {
  return Boolean(text(state.config.githubToken) && text(state.config.makeTextWebhookUrl || state.config.makeAiWebhookUrl) && text(state.config.makeImageWebhookUrl || state.config.makeAiWebhookUrl));
}
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
    const firebaseBase = text(state.config.firebaseUrl).replace(/\/+$/, '');
    const response = await fetch(`${firebaseBase}/${encodeURIComponent(state.config.productsNode || 'produtos')}.json?_=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Firebase retornou ${response.status}`);
    const raw = await response.json();
    state.products = Object.entries(raw || {}).map(([firebaseKey, value]) => ({ ...(value || {}), firebaseKey, _key: firebaseKey }));
    if (text(state.config.githubToken)) {
      const collections = await loadCollections(state.config);
      state.kits = collections.kits || [];
      state.queue = collections.queue || [];
    } else {
      state.kits = [];
      state.queue = [];
    }
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
    kit: compactKitForMake(normalized, state.products),
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
  const errors = operationalErrors({ requireGithub: false, requireTextWebhook: true, requireImageWebhook: false });
  if (errors.length) throw new Error(errors.join(' · '));
  const context = buildKitContext();
  const payload = {
    acao: 'gerar_descricao_kit',
    origem: 'kit_mobile_dona_antonia',
    versao_contrato: CONTRACT_VERSION,
    kit: context.kit,
    kit_detalhado: context.normalized,
    dados_financeiros: context.financials,
    produtos_identificados: productBrief(),
    regras_nome: {
      obrigatorio: true, curto: true, criativo: true, comercial: true,
      maximo_caracteres: 48, maximo_palavras_sem_kit: 6,
      proibidos: ['Novo kit promocional', 'Kit promocional', 'preços', 'percentuais', 'emojis'],
    },
    instrucoes: textInstructions(context),
    resposta_obrigatoria: { formato: 'json', campos: ['nome', 'descricao'] },
  };
  const result = unwrapMakeResult(await callMake(state.config, 'text', payload));
  const returnedDescription = result.descricao || result.description || result.texto || result.copy || '';
  const returnedName = result.nome_sugerido || result.nome_curto || result.nome || result.name || result.titulo || '';
  state.content.name = cleanAiName(returnedName);
  state.content.description = canonicalDescription(returnedDescription);
  state.textSignature = compositionSignature();
  invalidateImage();
  syncStateToEditor();
  renderAll();
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
  syncEditorToState();
  if (!contentReady()) throw new Error('Gere ou preencha o título e a descrição antes de criar a capa.');
  const errors = operationalErrors({ requireGithub: true, requireTextWebhook: false, requireImageWebhook: true });
  if (errors.length) throw new Error(errors.join(' · '));
  const context = buildKitContext();
  if (!context.kit.referencias_imagens.length) throw new Error('Os produtos precisam ter imagens públicas para gerar a capa.');
  const finalPath = `${text(state.config.githubKitImagesPath || 'site/img/kits').replace(/\/+$/, '')}/${slug(context.normalized.codigo)}.webp`;
  const prompt = coverInstructions(context);
  const result = await callMake(state.config, 'image', {
    acao: 'gerar_capa_kit',
    origem: 'kit_mobile_dona_antonia',
    versao_contrato: CONTRACT_VERSION,
    quantidade_imagens: 1,
    kit: context.kit,
    kit_detalhado: { ...context.normalized, nome: state.content.name, descricao: state.content.description },
    dados_financeiros: context.financials,
    titulo_final: state.content.name,
    descricao_final: state.content.description,
    imagem_path: finalPath,
    storage_destino: 'github',
    layout_sem_texto: false,
    renderizar_precos: true,
    renderizar_textos: true,
    usar_imagem_ia_sem_mascara: true,
    instrucoes: prompt,
    prompt,
  });
  const aiImage = extractMakeImage(result);
  if (!aiImage) throw new Error('O Make não retornou a imagem final do kit.');
  if (/^data:image\//i.test(aiImage)) {
    const uploaded = await upsertBase64File(state.config, finalPath, aiImage, `Cria capa por IA do kit ${state.content.name} pelo Kit Mobile`);
    state.content.image = uploaded.url;
    state.content.imagePath = finalPath;
  } else {
    state.content.image = aiImage;
    state.content.imagePath = text(result.imagem_path || result.image_path || result.path || finalPath);
  }
  state.imageSignature = coverSignature();
  renderAll();
}

function operationalErrors({ requireGithub = true, requireTextWebhook = true, requireImageWebhook = true } = {}) {
  const errors = [];
  if (!state.items.length) errors.push('Adicione ao menos um produto');
  state.items.forEach(row => {
    if (number(row.product.preco) <= 0) errors.push(`${productName(row.product)} está sem preço`);
    if (number(row.product.estoque) < row.qty) errors.push(`${productName(row.product)} sem estoque suficiente`);
  });
  if (requireGithub && !text(state.config.githubToken)) errors.push('Configure o token GitHub');
  if (requireTextWebhook && !text(state.config.makeTextWebhookUrl || state.config.makeAiWebhookUrl)) errors.push('Configure o webhook de textos do Make');
  if (requireImageWebhook && !text(state.config.makeImageWebhookUrl || state.config.makeAiWebhookUrl)) errors.push('Configure o webhook de imagens do Make');
  return [...new Set(errors)];
}
function publishErrors() {
  const errors = operationalErrors({ requireGithub: true, requireTextWebhook: false, requireImageWebhook: false });
  if (!contentReady()) errors.push('Gere ou preencha o título e a descrição');
  if (!text(state.content.image)) errors.push('Gere a capa pela IA');
  if (state.imageSignature && state.imageSignature !== coverSignature()) errors.push('A capa está desatualizada; gere novamente');
  return [...new Set(errors)];
}
async function publish() {
  syncEditorToState();
  const errors = publishErrors();
  if (errors.length) throw new Error(errors.join(' · '));
  setBusy(true, 'Publicando o kit pronto…', 'Salvando exatamente o título, a descrição e a imagem exibidos nesta tela.');
  try {
    const context = buildKitContext();
    const current = {
      ...context.normalized,
      nome: state.content.name,
      descricao: state.content.description,
      imagem: state.content.image,
      imagem_path: state.content.imagePath,
      atualizado_em: new Date().toISOString(),
    };
    const normalizedResult = normalizeCollectionForPublish(current, 'kit', state.products, state.queue);
    if (normalizedResult.audit.errors.length) throw new Error(normalizedResult.audit.errors.join(' · '));
    const normalized = {
      ...normalizedResult.normalized,
      ...current,
      produtos: normalizedResult.normalized.produtos,
      dados_financeiros: financials(),
    };
    const list = state.kits.filter(kit => text(kit.id) !== text(normalized.id));
    list.push(normalized);
    const saved = await saveCollectionList(state.config, 'kit', list, state.products, state.queue, {
      preserveInvalidExisting: true,
      changedId: normalized.id,
      changedFields: Object.keys(normalized),
    });
    state.kits = saved.list || list;
    $('#kitsChip').textContent = `${state.kits.length} kits`;
    toast(`Kit “${normalized.nome}” publicado com sucesso.`, 'success');
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
  const textErrors = operationalErrors({ requireGithub: false, requireTextWebhook: true, requireImageWebhook: false });
  $('#generateText').disabled = Boolean(state.busy || textErrors.length);
  const coverErrors = operationalErrors({ requireGithub: true, requireTextWebhook: false, requireImageWebhook: true });
  $('#generateCover').disabled = Boolean(state.busy || coverErrors.length || !contentReady());
  $('#generateCover').textContent = state.content.image ? 'Gerar nova capa com os textos atuais' : 'Gerar capa com os textos atuais';
}
function renderPublish() {
  const errors = publishErrors();
  const button = $('#publishButton');
  button.disabled = Boolean(errors.length || state.busy);
  button.textContent = state.busy ? 'Processando…' : 'Publicar kit pronto';
  const notice = $('#publishNotice');
  if (errors.length) {
    notice.textContent = errors.join(' · ');
    notice.className = 'notice danger';
  } else {
    notice.textContent = `Tudo pronto para publicar. Estoque atual permite ${availableKits()} kit(s).`;
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
  const config = getConfig();
  $('#cfgToken').value = config.githubToken || '';
  $('#cfgTextWebhook').value = config.makeTextWebhookUrl || config.makeAiWebhookUrl || '';
  $('#cfgImageWebhook').value = config.makeImageWebhookUrl || config.makeAiWebhookUrl || '';
  $('#cfgOwner').value = config.githubOwner || 'osvaldosereia';
  $('#cfgRepo').value = config.githubRepo || 'SUCEDOAN12';
  $('#cfgBranch').value = config.githubBranch || 'main';
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
$('#settingsSave').addEventListener('click', async () => {
  saveConfig({
    githubToken: $('#cfgToken').value.trim(),
    makeTextWebhookUrl: $('#cfgTextWebhook').value.trim(),
    makeImageWebhookUrl: $('#cfgImageWebhook').value.trim(),
    githubOwner: $('#cfgOwner').value.trim() || 'osvaldosereia',
    githubRepo: $('#cfgRepo').value.trim() || 'SUCEDOAN12',
    githubBranch: $('#cfgBranch').value.trim() || 'main',
    writeMode: true,
    collectionsWriteMode: true,
  });
  closeSettings();
  toast('Configurações salvas.', 'success');
  await loadData();
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
await loadData();
