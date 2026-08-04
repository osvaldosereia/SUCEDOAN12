import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const APPLY = process.argv.includes('--apply');
const stateIndex = process.argv.indexOf('--state');
const STATE_FILE = stateIndex >= 0 ? process.argv[stateIndex + 1] : '.automation/bling-sync-state.json';
const REPORT_FILE = process.env.BLING_REPORT_FILE || 'bling-sync-report.json';
const API_BASE = 'https://api.bling.com.br/Api/v3';
const MAX_PRODUCTS = Math.max(0, Number.parseInt(process.env.MAX_PRODUCTS || '0', 10) || 0);
const SYNC_STOCK = /^(1|true|yes|sim)$/i.test(String(process.env.SYNC_STOCK || '').trim());
const MIN_INTERVAL_MS = Math.max(360, Number(process.env.BLING_REQUEST_INTERVAL_MS || 420));
const SOFT_DELETE_STATUS = 'E';
let lastRequestAt = 0;
let accessToken = '';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const text = value => String(value ?? '').trim();
const normalized = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase();
const keyName = value => normalized(value).replace(/[^a-z0-9]/g, '');
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const sha256 = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function timestamp(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function number(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = text(value).replace(/[^0-9,.-]/g, '');
  if (!raw) return 0;
  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  const normalizedNumber = comma > dot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  return Number(normalizedNumber) || 0;
}

function sourceValue(source, ...names) {
  for (const name of names) {
    if (hasOwn(source, name) && source[name] !== undefined && source[name] !== null && text(source[name]) !== '') return source[name];
  }
  const wanted = new Set(names.map(keyName));
  for (const [key, value] of Object.entries(source || {})) {
    if (wanted.has(keyName(key)) && value !== undefined && value !== null && text(value) !== '') return value;
  }
  return undefined;
}
const sourceText = (source, ...names) => text(sourceValue(source, ...names));
const sourceNumber = (source, ...names) => {
  const value = sourceValue(source, ...names);
  return value === undefined ? undefined : number(value);
};
const sourceBoolean = (source, ...names) => {
  const value = sourceValue(source, ...names);
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  return /^(1|true|sim|yes|s)$/i.test(text(value));
};

function requiredEnv(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`A secret ${name} não foi configurada.`);
  return value;
}

function readState() {
  if (!existsSync(STATE_FILE)) return { version: 2, products: {} };
  try {
    const raw = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    return { version: 2, products: raw.products && typeof raw.products === 'object' ? raw.products : {} };
  } catch {
    return { version: 2, products: {} };
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function pace() {
  const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt));
  if (wait) await sleep(wait);
  lastRequestAt = Date.now();
}

async function apiFetch(path, options = {}, { label = path, attempts = 5, allow404 = false } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await pace();
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, options);
    } catch (error) {
      if (attempt === attempts) throw new Error(`${label}: falha de rede (${error.message})`);
      await sleep(attempt * 1000);
      continue;
    }
    if (response.ok || (allow404 && response.status === 404)) return response;
    const body = (await response.text()).slice(0, 1000);
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === attempts) throw new Error(`${label}: HTTP ${response.status} ${body}`);
    const retryAfter = Number(response.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : attempt * attempt * 1000);
  }
  throw new Error(`${label}: falha inesperada.`);
}

async function oauthToken() {
  const clientId = requiredEnv('BLING_CLIENT_ID');
  const clientSecret = requiredEnv('BLING_CLIENT_SECRET');
  const refreshToken = requiredEnv('BLING_REFRESH_TOKEN');
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await apiFetch('/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'enable-jwt': '1'
    },
    body
  }, { label: 'OAuth do Bling', attempts: 3 });
  const data = await response.json();
  if (!text(data.access_token)) throw new Error('OAuth do Bling não retornou access_token.');
  const refreshFile = text(process.env.BLING_REFRESH_TOKEN_FILE);
  if (refreshFile && text(data.refresh_token)) {
    writeFileSync(refreshFile, text(data.refresh_token), { encoding: 'utf8', mode: 0o600 });
  }
  return text(data.access_token);
}

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'enable-jwt': '1', ...extra };
}

async function firebaseProducts() {
  const base = requiredEnv('FIREBASE_DATABASE_URL').replace(/\/$/, '');
  const response = await fetch(`${base}/produtos.json`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Firebase: HTTP ${response.status} ${(await response.text()).slice(0, 500)}`);
  const data = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Firebase retornou /produtos em formato inválido.');
  return data;
}

function productStatus(source) {
  const raw = sourceText(source, 'situacao', 'status').toUpperCase();
  if (['E', 'EXCLUIDO', 'EXCLUÍDO', 'DELETED'].includes(raw)) return 'E';
  if (sourceValue(source, 'ativo') === false || sourceValue(source, 'visivel') === false) return 'I';
  if (['I', 'INATIVO', 'INACTIVE', '0', 'FALSE', 'BLOQUEADO'].includes(raw)) return 'I';
  return 'A';
}

function ncm(source) {
  const digits = sourceText(source, 'ncm', 'codigoNcm', 'codigo_ncm').replace(/\D/g, '');
  if (!digits) return undefined;
  if (digits.length !== 8) throw new Error(`NCM inválido (${sourceText(source, 'ncm')}): informe 8 dígitos.`);
  return digits;
}

function optional(target, key, value) {
  if (value !== undefined && value !== null && text(value) !== '') target[key] = value;
}

function categoryPath(source) {
  const direct = [sourceText(source, 'categoria'), sourceText(source, 'subcategoria'), sourceText(source, 'subsubcategoria')].filter(Boolean);
  if (direct.length) return direct;
  return sourceText(source, 'categoriaProduto', 'categoria do produto', 'departamento')
    .split(/\s*(?:>>|>)\s*/).map(text).filter(Boolean);
}

function supplierData(source) {
  const nome = sourceText(source, 'fornecedor', 'nomeFornecedor', 'supplier');
  if (!nome) return null;
  return {
    nome,
    codigo: sourceText(source, 'codigoFornecedor', 'codigo fornecedor', 'codigo_fornecedor'),
    descricao: sourceText(source, 'descricaoFornecedor', 'descricao do produto no fornecedor'),
    precoCusto: sourceNumber(source, 'precoCusto', 'preco_custo', 'preco de custo'),
    precoCompra: sourceNumber(source, 'precoCompra', 'preco_compra', 'preco de compra'),
    garantia: sourceNumber(source, 'garantiaFornecedor', 'meses garantia no fornecedor')
  };
}

function stockData(source) {
  const names = ['estoque', 'estoqueAtual', 'estoque_atual', 'saldoEstoque', 'saldo_estoque', 'quantidadeEstoque', 'quantidade_estoque', 'stock'];
  const key = names.find(name => hasOwn(source, name) && text(source[name]) !== '');
  if (!key) return { present: false, value: 0 };
  const value = number(source[key]);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Estoque inválido no campo ${key}.`);
  return { present: true, value };
}

function productFromFirebase(firebaseKey, source) {
  const codigo = sourceText(source, 'codigo', 'sku', 'id');
  const nome = sourceText(source, 'nome', 'descricao', 'name');
  if (!codigo || !nome) throw new Error('Produto sem código ou nome.');
  const patch = { codigo, nome, preco: number(sourceValue(source, 'preco')), unidade: sourceText(source, 'unidade') || 'UN' };
  optional(patch, 'descricaoCurta', sourceText(source, 'descricaoCurta', 'descricao_curta', 'descricao curta'));
  optional(patch, 'descricaoComplementar', sourceText(source, 'descricaoComplementar', 'descricao_complementar', 'descricao'));
  optional(patch, 'dataValidade', sourceText(source, 'dataValidade', 'data_validade'));
  optional(patch, 'pesoLiquido', sourceNumber(source, 'pesoLiquido', 'peso_liquido'));
  optional(patch, 'pesoBruto', sourceNumber(source, 'pesoBruto', 'peso_bruto'));
  optional(patch, 'volumes', sourceNumber(source, 'volumes'));
  optional(patch, 'itensPorCaixa', sourceNumber(source, 'itensPorCaixa', 'itens_por_caixa', 'quantidade_caixa'));
  optional(patch, 'gtin', sourceText(source, 'gtin', 'ean'));
  optional(patch, 'gtinEmbalagem', sourceText(source, 'gtinEmbalagem', 'gtin_embalagem', 'ean_embalagem'));
  optional(patch, 'tipoProducao', sourceText(source, 'tipoProducao', 'tipo_producao'));
  optional(patch, 'condicao', sourceNumber(source, 'condicao'));
  optional(patch, 'freteGratis', sourceBoolean(source, 'freteGratis', 'frete_gratis'));
  optional(patch, 'marca', sourceText(source, 'marca'));
  optional(patch, 'observacoes', sourceText(source, 'observacoes'));
  optional(patch, 'linkExterno', sourceText(source, 'linkExterno', 'link_externo'));

  const estoque = {};
  optional(estoque, 'minimo', sourceNumber(source, 'estoqueMinimo', 'estoque_minimo'));
  optional(estoque, 'maximo', sourceNumber(source, 'estoqueMaximo', 'estoque_maximo'));
  optional(estoque, 'crossdocking', sourceNumber(source, 'crossDocking', 'crossdocking'));
  optional(estoque, 'localizacao', sourceText(source, 'localizacao'));
  if (Object.keys(estoque).length) patch.estoque = estoque;

  const dimensoes = {};
  optional(dimensoes, 'largura', sourceNumber(source, 'largura'));
  optional(dimensoes, 'altura', sourceNumber(source, 'altura'));
  optional(dimensoes, 'profundidade', sourceNumber(source, 'profundidade', 'comprimento'));
  optional(dimensoes, 'unidadeMedida', sourceNumber(source, 'unidadeMedida', 'unidade_medida'));
  if (Object.keys(dimensoes).length) patch.dimensoes = dimensoes;

  const tributacao = {};
  optional(tributacao, 'ncm', ncm(source));
  optional(tributacao, 'origem', sourceNumber(source, 'origem', 'origem_tributaria'));
  optional(tributacao, 'cest', sourceText(source, 'cest'));
  if (Object.keys(tributacao).length) patch.tributacao = tributacao;

  const image = sourceText(source, 'urlImagensExternas', 'url_imagem', 'imagem_url');
  if (/^https?:\/\//i.test(image)) patch.midia = { imagens: { externas: [{ link: image }] } };

  const path = categoryPath(source);
  const supplier = supplierData(source);
  const status = productStatus(source);
  const stock = stockData(source);
  const fingerprint = { patch, status, categoryPath: path, supplier };
  const changedAt = Math.max(
    timestamp(sourceValue(source, 'updated_at', 'atualizado_em')),
    timestamp(sourceValue(source, 'last_update')),
    timestamp(sourceValue(source, 'stock_updated_at'))
  );
  return { firebaseKey, source, codigo, nome, gtin: text(patch.gtin), patch, status, categoryPath: path, supplier, stock, changedAt, hash: sha256(fingerprint) };
}

async function listBlingProducts() {
  const rows = [];
  for (let page = 1; page <= 1000; page++) {
    const query = new URLSearchParams({ pagina: String(page), limite: '100', criterio: '5', tipo: 'T' });
    const response = await apiFetch(`/produtos?${query}`, { headers: authHeaders() }, { label: `Listagem de produtos Bling página ${page}` });
    const data = (await response.json())?.data;
    const pageRows = Array.isArray(data) ? data : [];
    rows.push(...pageRows);
    if (pageRows.length < 100) break;
  }
  return rows;
}

function productIndexes(rows) {
  const byId = new Map();
  const byCode = new Map();
  const gtinBuckets = new Map();
  for (const row of rows) {
    if (row?.id === undefined || row?.id === null) continue;
    byId.set(String(row.id), row);
    if (text(row.codigo)) byCode.set(text(row.codigo), row);
    const gtin = text(row.gtin || row.ean);
    if (gtin) {
      if (!gtinBuckets.has(gtin)) gtinBuckets.set(gtin, []);
      gtinBuckets.get(gtin).push(row);
    }
  }
  const byGtin = new Map([...gtinBuckets].filter(([, values]) => values.length === 1).map(([key, values]) => [key, values[0]]));
  return { byId, byCode, byGtin };
}

function resolveExisting(product, previous, indexes) {
  const stateId = text(previous?.blingId);
  if (stateId && indexes.byId.has(stateId)) return { row: indexes.byId.get(stateId), matchedBy: 'state-id' };
  if (indexes.byCode.has(product.codigo)) return { row: indexes.byCode.get(product.codigo), matchedBy: 'codigo' };
  const previousCode = text(previous?.codigo);
  if (previousCode && indexes.byCode.has(previousCode)) return { row: indexes.byCode.get(previousCode), matchedBy: 'codigo-anterior' };
  if (product.gtin && indexes.byGtin.has(product.gtin)) return { row: indexes.byGtin.get(product.gtin), matchedBy: 'gtin' };
  return { row: null, matchedBy: '' };
}

async function patchProduct(id, patch) {
  const response = await apiFetch(`/produtos/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(patch)
  }, { label: `PATCH produto ${patch.codigo}` });
  const body = await response.json().catch(() => ({}));
  return body?.data?.id || id;
}

async function createProduct(product) {
  const payload = { ...product.patch, tipo: 'P', formato: 'S', situacao: product.status === 'E' ? 'I' : product.status };
  const response = await apiFetch('/produtos', {
    method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(payload)
  }, { label: `POST produto ${product.codigo}` });
  const body = await response.json().catch(() => ({}));
  const id = body?.data?.id;
  if (id === undefined || id === null) throw new Error(`Produto ${product.codigo}: Bling não retornou o ID.`);
  return id;
}

async function setProductStatus(id, status, codigo) {
  await apiFetch(`/produtos/${encodeURIComponent(id)}/situacoes`, {
    method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ situacao: status })
  }, { label: `Situação ${status} do produto ${codigo}` });
}

async function listCategories() {
  const map = new Map();
  for (let page = 1; page <= 1000; page++) {
    const response = await apiFetch(`/categorias/produtos?pagina=${page}&limite=100`, { headers: authHeaders() }, { label: `Categorias página ${page}` });
    const rows = (await response.json())?.data || [];
    for (const row of rows) {
      const parent = row?.categoriaPai?.id ?? 0;
      if (row?.id !== undefined && text(row.descricao)) map.set(`${parent}|${normalized(row.descricao)}`, row.id);
    }
    if (rows.length < 100) break;
  }
  return map;
}

async function ensureCategoryPath(path, categories, report) {
  let parentId = 0;
  for (const descricao of path) {
    const key = `${parentId}|${normalized(descricao)}`;
    let id = categories.get(key);
    if (id === undefined) {
      report.categoriesPlanned++;
      if (!APPLY) return null;
      const payload = { descricao };
      if (parentId) payload.categoriaPai = { id: parentId };
      const response = await apiFetch('/categorias/produtos', {
        method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(payload)
      }, { label: `Criar categoria ${descricao}` });
      id = (await response.json())?.data?.id;
      if (id === undefined || id === null) throw new Error(`Categoria ${descricao}: Bling não retornou ID.`);
      categories.set(key, id);
      report.categoriesCreated++;
    } else report.categoriesReused++;
    parentId = id;
  }
  return parentId || null;
}

async function listContacts() {
  const map = new Map();
  for (let page = 1; page <= 1000; page++) {
    const response = await apiFetch(`/contatos?pagina=${page}&limite=100`, { headers: authHeaders() }, { label: `Contatos página ${page}` });
    const rows = (await response.json())?.data || [];
    for (const row of rows) if (row?.id !== undefined && text(row.nome) && !map.has(normalized(row.nome))) map.set(normalized(row.nome), row.id);
    if (rows.length < 100) break;
  }
  return map;
}

async function ensureSupplier(supplier, contacts, report) {
  if (!supplier) return null;
  const key = normalized(supplier.nome);
  if (contacts.has(key)) {
    report.suppliersReused++;
    return contacts.get(key);
  }
  report.suppliersPlanned++;
  if (!APPLY) return null;
  const response = await apiFetch('/contatos', {
    method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ nome: supplier.nome, situacao: 'A' })
  }, { label: `Criar fornecedor ${supplier.nome}` });
  const id = (await response.json())?.data?.id;
  if (id === undefined || id === null) throw new Error(`Fornecedor ${supplier.nome}: Bling não retornou ID.`);
  contacts.set(key, id);
  report.suppliersCreated++;
  return id;
}

async function listSupplierLinks() {
  const map = new Map();
  for (let page = 1; page <= 1000; page++) {
    const response = await apiFetch(`/produtos/fornecedores?pagina=${page}&limite=100`, { headers: authHeaders() }, { label: `Produtos fornecedores página ${page}` });
    const rows = (await response.json())?.data || [];
    for (const row of rows) {
      if (row?.id !== undefined && row.produto?.id !== undefined && row.fornecedor?.id !== undefined) {
        map.set(`${row.produto.id}|${row.fornecedor.id}`, row.id);
      }
    }
    if (rows.length < 100) break;
  }
  return map;
}

async function upsertSupplierLink(productId, supplierId, supplier, links, report) {
  if (!productId || !supplierId || !supplier) return null;
  const key = `${productId}|${supplierId}`;
  const existingId = links.get(key);
  const payload = { produto: { id: productId }, fornecedor: { id: supplierId }, padrao: true };
  optional(payload, 'codigo', supplier.codigo);
  optional(payload, 'descricao', supplier.descricao);
  optional(payload, 'precoCusto', supplier.precoCusto);
  optional(payload, 'precoCompra', supplier.precoCompra);
  optional(payload, 'garantia', supplier.garantia);
  const endpoint = `/produtos/fornecedores${existingId ? `/${encodeURIComponent(existingId)}` : ''}`;
  const response = await apiFetch(endpoint, {
    method: existingId ? 'PUT' : 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(payload)
  }, { label: `${existingId ? 'Atualizar' : 'Criar'} vínculo de fornecedor` });
  const id = existingId || (await response.json().catch(() => ({})))?.data?.id;
  if (!id) throw new Error(`Vínculo de fornecedor do produto ${productId}: Bling não retornou ID.`);
  links.set(key, id);
  if (existingId) report.supplierLinksUpdated++; else report.supplierLinksCreated++;
  return id;
}

async function defaultDeposit() {
  const response = await apiFetch('/depositos?pagina=1&limite=100&situacao=1', { headers: authHeaders() }, { label: 'Depósitos do Bling' });
  const rows = (await response.json())?.data || [];
  const deposit = rows.find(row => row.padrao === true || text(row.padrao).toLowerCase() === 'true') || rows.find(row => normalized(row.descricao) === 'geral');
  if (!deposit?.id) throw new Error('Não foi encontrado depósito padrão ativo no Bling.');
  return deposit;
}

async function physicalBalances(productIds, depositId) {
  const balances = new Map();
  for (let start = 0; start < productIds.length; start += 100) {
    const query = new URLSearchParams();
    for (const id of productIds.slice(start, start + 100)) query.append('idsProdutos[]', id);
    const response = await apiFetch(`/estoques/saldos?${query}`, { headers: authHeaders() }, { label: 'Saldos de estoque' });
    const rows = (await response.json())?.data || [];
    for (const row of rows) {
      const productId = row?.produto?.id;
      if (productId === undefined || productId === null) continue;
      const deposit = (row.depositos || []).find(item => String(item.id) === String(depositId));
      balances.set(String(productId), deposit ? number(deposit.saldoFisico) : 0);
    }
  }
  return balances;
}

async function reconcileStock(productId, depositId, desired, current, codigo) {
  const difference = Math.round((desired - current) * 1000000) / 1000000;
  if (Math.abs(difference) < 0.000001) return false;
  await apiFetch('/estoques', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      deposito: { id: depositId }, produto: { id: productId },
      operacao: difference > 0 ? 'E' : 'S', quantidade: Math.abs(difference),
      observacoes: `Sincronização automática Firebase (produto ${codigo})`
    })
  }, { label: `Estoque do produto ${codigo}` });
  return true;
}

const report = {
  startedAt: new Date().toISOString(), mode: APPLY ? 'production' : 'dry-run', stockSync: SYNC_STOCK,
  firebaseProducts: 0, blingProducts: 0, selected: 0, created: 0, updated: 0, unchanged: 0,
  statusUpdated: 0, softDeleted: 0, restored: 0, codeChanges: 0, matchedByStateId: 0,
  categoriesPlanned: 0, categoriesCreated: 0, categoriesReused: 0,
  suppliersPlanned: 0, suppliersCreated: 0, suppliersReused: 0,
  supplierLinksCreated: 0, supplierLinksUpdated: 0,
  stockChecked: 0, stockUpdated: 0, stockUnchanged: 0,
  deferred: 0, invalid: [], conflicts: [], errors: []
};

try {
  const state = readState();
  const rawProducts = await firebaseProducts();
  const products = [];
  for (const [firebaseKey, source] of Object.entries(rawProducts)) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    try { products.push(productFromFirebase(firebaseKey, source)); }
    catch (error) { report.invalid.push({ firebaseKey, reason: error.message }); }
  }
  report.firebaseProducts = products.length;

  accessToken = await oauthToken();
  const blingRows = await listBlingProducts();
  report.blingProducts = blingRows.length;
  const indexes = productIndexes(blingRows);

  const deletedCandidates = Object.entries(state.products)
    .filter(([firebaseKey, entry]) => !rawProducts[firebaseKey] && entry?.blingId && entry?.status !== 'E')
    .map(([firebaseKey, entry]) => ({ firebaseKey, entry, kind: 'deleted' }));
  const productCandidates = products.map(product => ({ product, kind: 'product' }));
  const allWork = [...productCandidates, ...deletedCandidates];
  const selected = MAX_PRODUCTS > 0 ? allWork.slice(0, MAX_PRODUCTS) : allWork;
  report.selected = selected.length;
  report.deferred = allWork.length - selected.length;

  const selectedProducts = selected.filter(item => item.kind === 'product').map(item => item.product);
  const needCategories = selectedProducts.some(product => product.categoryPath.length);
  const needSuppliers = selectedProducts.some(product => product.supplier);
  const categories = needCategories ? await listCategories() : new Map();
  const contacts = needSuppliers ? await listContacts() : new Map();
  const supplierLinks = needSuppliers ? await listSupplierLinks() : new Map();

  const resolvedForStock = [];
  for (const item of selected) {
    if (item.kind === 'deleted') {
      const { firebaseKey, entry } = item;
      try {
        const row = indexes.byId.get(String(entry.blingId));
        if (!row) {
          report.conflicts.push({ firebaseKey, codigo: entry.codigo, reason: 'ID do Bling do produto removido não foi encontrado.' });
          continue;
        }
        if (APPLY) await setProductStatus(entry.blingId, SOFT_DELETE_STATUS, entry.codigo || firebaseKey);
        state.products[firebaseKey] = { ...entry, status: SOFT_DELETE_STATUS, deletedAt: new Date().toISOString(), syncedAt: new Date().toISOString() };
        report.softDeleted++;
      } catch (error) {
        report.errors.push({ firebaseKey, codigo: entry.codigo, reason: error.message });
      }
      continue;
    }

    const product = item.product;
    const previous = state.products[product.firebaseKey] || {};
    try {
      const resolved = resolveExisting(product, previous, indexes);
      let existing = resolved.row;
      if (resolved.matchedBy === 'state-id') report.matchedByStateId++;
      if (existing && indexes.byCode.has(product.codigo) && String(indexes.byCode.get(product.codigo).id) !== String(existing.id)) {
        report.conflicts.push({ firebaseKey: product.firebaseKey, codigo: product.codigo, reason: `Código já pertence ao produto Bling ${indexes.byCode.get(product.codigo).id}.` });
        continue;
      }

      const codeChanged = text(previous.codigo) !== product.codigo;
      const statusChanged = text(previous.status) !== product.status;
      const hashChanged = previous.hash !== product.hash;
      const previousSyncedAt = timestamp(previous.syncedAt);
      const dataChanged = !existing || (hashChanged && !(previousSyncedAt && product.changedAt && product.changedAt <= previousSyncedAt));
      const changed = dataChanged || codeChanged || statusChanged || !existing;
      if (!changed && !SYNC_STOCK) {
        if (APPLY && hashChanged) {
          state.products[product.firebaseKey] = { ...previous, hash: product.hash, codigo: product.codigo, status: product.status, migratedAt: new Date().toISOString() };
        }
        report.unchanged++;
        continue;
      }

      let categoryId = null;
      if (product.categoryPath.length) categoryId = await ensureCategoryPath(product.categoryPath, categories, report);
      const patch = structuredClone(product.patch);
      if (categoryId) patch.categoria = { id: categoryId };

      let id = existing?.id || null;
      const wasDeleted = text(previous.status) === 'E' || Boolean(previous.deletedAt);
      if (!id) {
        if (APPLY) id = await createProduct({ ...product, patch });
        else id = `novo:${product.firebaseKey}`;
        report.created++;
      } else if (dataChanged || codeChanged) {
        if (text(previous.codigo) && text(previous.codigo) !== product.codigo) report.codeChanges++;
        if (APPLY) await patchProduct(id, patch);
        report.updated++;
      }

      const currentStatus = text(existing?.situacao).toUpperCase();
      if (product.status !== currentStatus || wasDeleted) {
        if (APPLY && !String(id).startsWith('novo:')) await setProductStatus(id, product.status, product.codigo);
        report.statusUpdated++;
        if (wasDeleted && product.status !== 'E') report.restored++;
      }

      let supplierLinkId = previous.supplierLinkId;
      let supplierHash = previous.supplierHash;
      if (product.supplier) {
        const supplierId = await ensureSupplier(product.supplier, contacts, report);
        const nextSupplierHash = sha256(product.supplier);
        if (APPLY && supplierId && !String(id).startsWith('novo:') && (supplierHash !== nextSupplierHash || !supplierLinkId)) {
          supplierLinkId = await upsertSupplierLink(id, supplierId, product.supplier, supplierLinks, report);
        }
        supplierHash = nextSupplierHash;
      }

      if (APPLY && !String(id).startsWith('novo:')) {
        state.products[product.firebaseKey] = {
          ...previous, hash: product.hash, blingId: id, codigo: product.codigo, status: product.status,
          syncedAt: new Date().toISOString(), deletedAt: null, supplierHash, supplierLinkId
        };
        indexes.byId.set(String(id), { ...(existing || {}), id, codigo: product.codigo, situacao: product.status, gtin: product.gtin });
        indexes.byCode.set(product.codigo, indexes.byId.get(String(id)));
      }
      if (product.stock.present && SYNC_STOCK && product.status !== 'E' && !String(id).startsWith('novo:')) {
        resolvedForStock.push({ product, id });
      }
    } catch (error) {
      report.errors.push({ firebaseKey: product.firebaseKey, codigo: product.codigo, reason: error.message });
    }
  }

  if (SYNC_STOCK && resolvedForStock.length) {
    const deposit = await defaultDeposit();
    const balances = await physicalBalances([...new Set(resolvedForStock.map(item => String(item.id)))], deposit.id);
    for (const { product, id } of resolvedForStock) {
      report.stockChecked++;
      try {
        const current = balances.get(String(id)) ?? 0;
        if (APPLY) {
          const moved = await reconcileStock(id, deposit.id, product.stock.value, current, product.codigo);
          if (moved) report.stockUpdated++; else report.stockUnchanged++;
        } else if (Math.abs(product.stock.value - current) > 0.000001) report.stockUpdated++;
        else report.stockUnchanged++;
      } catch (error) {
        report.errors.push({ firebaseKey: product.firebaseKey, codigo: product.codigo, reason: error.message });
      }
    }
  }

  report.finishedAt = new Date().toISOString();
  if (APPLY) writeJson(STATE_FILE, state);
  writeJson(REPORT_FILE, report);
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length || report.conflicts.length) process.exitCode = 1;
} catch (error) {
  report.finishedAt = new Date().toISOString();
  report.errors.push({ reason: error.message });
  writeJson(REPORT_FILE, report);
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
